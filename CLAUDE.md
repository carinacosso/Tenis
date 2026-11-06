# CLAUDE.md — Torneos de Tenis

`docs/ESPECIFICACION.md` define **qué** construir. Este archivo registra **cómo** se está construyendo: arquitectura, decisiones y convenciones. Mantenerlo actualizado al cerrar cada fase o al tomar una decisión nueva.

## Estado

| Fase                                                                           | Estado    |
| ------------------------------------------------------------------------------ | --------- |
| 1. Base (arquitectura, repositorios, ABM jugadores, verify, hooks, CI, deploy) | ✅ Hecha  |
| 2. Primer torneo (inscripción, eliminación directa, puntuación, resultados)    | ✅ Hecha  |
| 3. Rotativos (Americano dobles/singles/mixto, Mexicano)                        | ✅ Hecha  |
| 4. Grupos + playoffs, liga, desempates                                         | ✅ Hecha  |
| 5. W.O./abandonos, consolación (canchas y horarios: descartado por el usuario) | ✅ Hecha  |
| 6. Compartir imagen, PDF, Excel, backup, historial, estadísticas               | Parcial   |
| 7. Instalación guiada, pulido, Lighthouse                                      | Pendiente |

## Forma de trabajo (de la especificación)

- Trabajar por fases y esperar confirmación del usuario al cerrar cada una.
- Consultar ante cualquier regla de negocio ambigua.
- Después de cada cambio: `npm run verify` hasta que pase (máx. 5 intentos sobre el mismo error; después, reportar).
- Al cerrar una fase: `npm run verify:full` en verde → commit (Conventional Commits) → push.
- **Prohibido**: modificar/saltear/borrar tests para que pasen, `any`, `@ts-ignore`, desactivar reglas de lint.
- Toda función nueva de `src/domain` va con sus tests.

## Arquitectura

```
src/
  domain/   Lógica de negocio pura (TS). Sin React, Dexie ni nada de UI. Testeada con Vitest.
  data/
    ports.ts        Interfaces de repositorios (PlayerRepository, SettingsRepository, Repositories).
    memory/         Implementación en memoria (tests).
    dexie/          Implementación IndexedDB (Dexie). Único lugar que conoce Dexie.
    repositories.contract.ts  Suite de contrato que toda implementación debe pasar.
  app/      Casos de uso / servicios (PlayerService, SettingsService). Orquestan dominio + repos.
  ui/       React: páginas, componentes, hooks. Solo habla con `Services` (vía useServices).
  main.tsx  Composición: elige Dexie + browserDeps. Único punto a cambiar para otro backend.
```

Reglas de dependencia (las controla ESLint con `no-restricted-imports`):

- `domain` no importa de `app`, `data`, `ui`, React ni Dexie.
- `ui` no importa Dexie ni `data/dexie`.

Decisiones clave:

- **Los resultados son la única fuente de verdad.** Tablas, avance de cuadro y estadísticas se calculan con funciones puras a partir de los partidos; no se guardan. Así el recálculo en cascada al corregir un resultado es recalcular.
- **Datos observables:** los repositorios exponen `observe…(listener) → unsubscribe`. Dexie usa `liveQuery`; un backend futuro usará realtime. La UI usa `useObservable`.
- **Preparado para multiusuario:** IDs UUID (`crypto.randomUUID`), `ownerId` (hoy `'local'`), `createdAt`/`updatedAt`/`deletedAt` en todas las entidades. Borrado lógico.
- **Determinismo:** reloj e ids se inyectan (`AppDeps`). El azar de los sorteos se inyectará como `rng` con semilla.
- **Esquema Dexie:** nunca modificar una `version(n)` existente; agregar una nueva con migración.
- Ajustes: una sola fila `{ key: 'app', value }`; al leer se completa con `DEFAULT_SETTINGS` (compatibilidad hacia adelante).

## Modelo de datos

Implementado: `Player`, `AppSettings` (fase 1); `Tournament`, `Entry`, `Match` con `SideSource`, `MatchResult` por sets y `ScoringConfig` (fase 2). Dexie: versión 2 agrega `tournaments`, `entries`, `matches`.

Fase 3: `FormatConfig` suma `americano` (variantes doubles/singles/mixed) y `mexicano`, con `rounds` (null = rotación completa); `Tournament.plannedRounds` se fija al generar; `Round` guarda quiénes descansan (Dexie versión 3, tabla `rounds`); `SideSource` suma `entries`; resultados `points` y `time` (por tiempo puede haber empate).

Archivos de dominio: `player.ts`, `settings.ts`, `tournament.ts`, `registration.ts` (inscripción, lista de espera, pagos, cabezas), `match.ts` (Match, Round, SideSource), `knockout.ts` (sorteo, resolución, cascada, podio), `rotation.ts` (Americano y Mexicano), `rotationStandings.ts` (ranking y avance de rondas), `scoring.ts` (configuración y validación de resultados), `random.ts` (rng con semilla).

Fase 4: `FormatConfig` suma `groups` (`groupCount`, `qualifiersPerGroup`) y `league` (`doubleRound`); `Tournament.tiebreakOrder` (opcional, por defecto ganados → sets → games → directo); `Match.stage` (`group` | `playoff`) y `Match.groupId`; entidad `Group` (Dexie versión 4, tabla `groups`; la liga es un único grupo "Liga"). Dominio: `standings.ts` (tablas por sets con desempate configurable y mini tabla para el directo) y `groups.ts` (reparto en zigzag, fixture con el círculo, tablas por grupo y armado del cuadro final).

Fase 5: `MatchResult.outcome` (`normal` | `walkover` | `retired` | `injury`; a puntos solo `normal` | `walkover`); `SetsResult.autoWalkoverFrom` marca los W.O. puestos por una lesión; formato `knockout` con `consolation?: boolean`; `Match.stage` suma `consolation`. Dominio: `scoring.ts` (`walkoverSets`, `buildWalkover`, `checkRetiredSets`, `effectiveSets`) y `consolation.ts` (quiénes entran y sorteo). Sin cambios de esquema Dexie.

Fase 6 (parcial, a pedido del usuario: solo almacenamiento persistente, historial y estadísticas): `domain/playerHistory.ts` calcula, para un jugador, sus torneos (puesto en cada uno según el formato) y estadísticas; `PlayerService.history`. `app/storageService.ts` envuelve `navigator.storage` (inyectado en `AppDeps.storage`); se pide al iniciar (`main.tsx`) y el estado se ve en Ajustes. Pendiente de la fase 6: compartir imagen, PDF, Excel, backup JSON y recordatorio.

Algoritmo de rotación (`rotation.ts`): descansa primero quien menos descansó; en dobles con N múltiplo de 4 se alterna el método del círculo (compañeros sin repetir garantizado) con búsqueda local, y en el resto se usa búsqueda local con costo = 10·(compañeros repetidos)² + (rivales repetidos)². Se generan varias planificaciones completas y se elige la de menor costo. Singles usa el círculo (cada rival una vez). Mixto: parejas hombre+mujer, rotación de compañeras como punto de partida.

Planificado / pendiente de completar en fases siguientes:

- **Tournament** (= una categoría; decisión del usuario: _una categoría por torneo_):
  `name, date, venue?, category, modality: singles|doubles, format: FormatConfig, scoring: ScoringConfig, tiebreakOrder[], maxEntries, entryFee (por jugador), courts[], status: draft|registration|in_progress|finished`.
- **Entry** (inscripción): `tournamentId, playerIds: [id] | [id,id], status: confirmed|waitlist|withdrawn, waitlistOrder?, seed?, payments: { playerId, status: paid|pending, amount }[]`. En formatos rotativos la inscripción es individual aunque se juegue en dobles.
- **Stage** (fase): `knockout | groups | round_robin | rotation | consolation`, con `groups?`.
- **Round**: `stageId, number, name, restingPlayerIds[]`.
- **Match**: `stageId, roundId, groupId?, bracketPosition?, sideA/sideB: SideSource` (inscripción, ganador/perdedor de otro partido, posición de grupo, jugadores directos o bye), `status, courtId?, scheduledAt?, result?`.
- **MatchResult**: `outcome: normal|walkover|retired|injury, sets[{a,b,tiebreak?}], points?{a,b}, winner`.
- **ScoringConfig**: por sets (`gamesPerSet 4|6, bestOf 1|3|5, tiebreak, decidingSet full|superTiebreak10, goldenPoint`) | por puntos (`target`) | por tiempo (`minutes`).
- **Backup JSON**: `{ app, schemaVersion, exportedAt, data }`, validado con zod al importar.

## Reglas de negocio decididas

| Tema                                                | Decisión                                                                                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Torneo vs categoría                                 | Una categoría por torneo.                                                                                                                                                                              |
| Corregir un resultado que ya hizo avanzar el cuadro | Avisar qué partidos posteriores se ven afectados y pedir confirmación antes de borrarlos. En Mexicano se recalcula el ranking pero no se rearman rondas ya jugadas.                                    |
| W.O. en tablas                                      | Cuenta como 6-0 6-0 (sets y games del formato) para el ganador.                                                                                                                                        |
| Americano/Mexicano "a 21"                           | Gana el primero que llega a 21 (no es un total repartido).                                                                                                                                             |
| Nivel del jugador                                   | Lista configurable en Ajustes (por defecto 1ra…7ma, Principiante). No se puede quitar un nivel asignado a jugadores activos.                                                                           |
| Lista de espera                                     | Promoción automática mientras no se hayan generado los cruces. Después, los reemplazos son manuales.                                                                                                   |
| Monto de inscripción                                | Individual (por jugador). En dobles, cada jugador tiene su propio estado de pago.                                                                                                                      |
| Datos obligatorios del jugador                      | Nombre, apellido y nivel. Teléfono (si se carga, se valida), sexo y notas, opcionales (el sexo es obligatorio para el Americano mixto).                                                                |
| Jugador repetido                                    | Se avisa si coincide nombre+apellido (sin tildes) o teléfono; se puede guardar igual.                                                                                                                  |
| Borrar jugador                                      | Borrado lógico (se conserva para historial).                                                                                                                                                           |
| Categoría del torneo                                | Texto libre, con accesos rápidos a la lista de niveles.                                                                                                                                                |
| Cabezas de serie                                    | Opcionales, hasta la mitad del cuadro. Ubicación ITF/ATP: 1 arriba, 2 abajo, 3-4 (arriba del 2.º cuarto / abajo del 3.º), 5-8, 9-16… se sortean dentro de su grupo.                                    |
| Byes                                                | Primero enfrente de los cabezas en orden; el resto según el orden estándar de posiciones (nunca bye contra bye).                                                                                       |
| Tercer puesto                                       | No se juega: los dos perdedores de semifinal comparten el tercer lugar en el podio.                                                                                                                    |
| Tie-break                                           | Se juega con iguales en `gamesPerSet` (6-6 o 4-4). El marcador del tie-break es opcional y se carga solo el puntaje del que perdió. Sin tie-break: ventaja hasta 2 games.                              |
| Super tie-break                                     | Reemplaza al set decisivo; a 10 por 2.                                                                                                                                                                 |
| Bajas después del sorteo                            | No se permiten (llegan W.O./abandono en la fase 5). Se puede "Deshacer sorteo" solo si no hay resultados cargados.                                                                                     |
| Cambios después del sorteo                          | Nombre, fecha, lugar, categoría, cupo y monto se pueden editar; modalidad, formato y puntuación no.                                                                                                    |
| Corrección de resultados                            | Si cambia el ganador y hay partidos posteriores con resultado, se listan y se pide confirmación antes de borrarlos. Si solo cambia el marcador, se guarda directo.                                     |
| Descansos en rotativos                              | El que descansa suma el promedio de puntos por jugador de esa ronda (se acredita cuando la ronda está completa). No cuenta como partido jugado ni ganado. Descansa primero quien menos descansó.       |
| Rondas del Americano                                | Configurables al crear el torneo; por defecto, rotación completa (todos juegan con todos una vez).                                                                                                     |
| Ranking de rotativos                                | Puntos totales → partidos ganados → diferencia de puntos → sorteo (estable por torneo).                                                                                                                |
| Mexicano, ronda 1                                   | Por nivel del jugador (orden de la lista de niveles), al azar dentro del mismo nivel. Desde la ronda 2, por ranking: 1° y 4° vs 2° y 3°. Cada ronda se genera con un botón cuando termina la anterior. |

Otras decisiones de la fase 3:

- En los rotativos la inscripción es individual; la modalidad la fija el formato (Americano singles → singles, el resto → dobles).
- Rotativos: partidos a puntos (16, 21, 24, 32 u otro) o por tiempo. Por tiempo se cargan los puntos de cada lado y se permite el empate (cuenta como partido jugado, no ganado).
- Americano: se generan todas las rondas al sortear. Mexicano: la ronda 1 al sortear, el resto con el botón "Generar ronda N" cuando la anterior está completa; la última ronda se puede "Rearmar" mientras no tenga resultados.
- Americano mixto: todos los inscriptos necesitan sexo cargado; mínimo 2 hombres y 2 mujeres. Si sobran de un sexo, descansan por turnos.
- Podio de rotativos: los 3 primeros del ranking.

Decisiones de la fase 4:

- Tablas: el orden de desempate se configura por torneo; el sorteo siempre va al final (estable por torneo). Con 3 o más empatados, el enfrentamiento directo es una mini tabla (ganados entre ellos) y si sigue el empate se pasa al siguiente criterio.
- El super tie-break cuenta como set y como 1 game para el que lo gana (no suma sus puntos como games).
- Grupos: los cabezas de serie (hasta 2 por grupo) se reparten en zigzag; el resto, sorteado. Cada grupo debe tener más jugadores que clasificados. Clasifica una cantidad fija por grupo (sin mejores terceros).
- Cuadro final: se arma solo al terminar la fase de grupos. Los 1° son cabezas (comparados entre grupos por promedio de ganados, sets y games por partido); los byes van a los mejores; el resto se ubica para que los del mismo grupo se crucen lo más tarde posible y el mejor enfrente al 1° más débil. Con 2 grupos: 1°A vs 2°B y 1°B vs 2°A.
- Si se corrige un resultado de grupo y cambian los clasificados, el cuadro final se rearma; si ya tenía resultados, se pide confirmación antes de borrarlos.
- Liga: solo ida o ida y vuelta (configurable). Termina al jugarse todos los partidos; podio = 3 primeros de la tabla.
- Grupos y liga se juegan por sets; la modalidad (singles/dobles) es libre.

Decisiones de la fase 5:

- Canchas y horarios: descartado por el usuario (no se implementa).
- W.O.: se guarda como 6-0 6-0 (10-0 si el set es super tie-break) para el ganador. A puntos: puntaje máximo contra 0. Por tiempo no hay W.O. (se carga el puntaje).
- Abandono y lesión: se guardan los sets jugados (el último puede quedar a medias). En las tablas se completa el partido a favor del rival (6-3 2-1 abandona → 6-3 6-1).
- Lesión en grupos o liga: el lesionado pierde por W.O. los partidos de esa fase que le quedaban (automático). Si después se corrige ese resultado, se sacan esos W.O. automáticos.
- Consolación (opcional en eliminación directa): entran los que pierden su primer partido jugado (incluye a quien tuvo bye y perdió en 2.ª ronda). No entran los que lo perdieron por W.O. o lesión. Se sortea sola cuando todos jugaron su primer partido; si una corrección cambia quiénes entran, se vuelve a sortear (con confirmación si ya tenía resultados). El torneo termina cuando se juegan la final principal y la de consolación.

Decisiones de la fase 6 (parcial):

- Estadísticas del jugador: solo inscripciones confirmadas en torneos con cruces generados. Los W.O. no cuentan como partido jugado; los abandonos sí (ganado o perdido) y suman solo los sets terminados y los games jugados.
- Títulos: campeón en cuadros, 1.º en ligas y rotativos terminados. Podios: campeón, subcampeón y semifinalistas en cuadros; top 3 en tablas terminadas.
- Almacenamiento persistente: se pide al abrir la app; si ya estaba concedido no se vuelve a pedir. En Ajustes se muestra el estado y, si no está protegido, un botón para volver a pedirlo.

## Convenciones

- Código e identificadores en inglés; todo texto visible en español rioplatense (vos, "cargá", "elegí").
- TypeScript strict + `noUncheckedIndexedAccess`. Sin `!` (non-null assertion): ESLint lo prohíbe.
- Validaciones devuelven `ValidationResult<T, Campo>`; los errores son mensajes listos para mostrar.
- UI mobile-first: alto mínimo de botones 48–56 px, fuente base 17 px, alto contraste; modo oscuro con clase `dark` en `<html>`.
- Acciones destructivas siempre con `ConfirmDialog`.
- Tests unitarios junto al código (`*.test.ts`); e2e en `e2e/` con viewport 390×844.
- Formato con Prettier (`npm run format`) antes de commitear.
- Commits: Conventional Commits; al cerrar fase `feat(fase-N): …`.

## Herramientas

- `npm run verify` = `tsc --noEmit` → `eslint .` → `vitest run` → `vite build`.
- `npm run verify:full` = verify + Playwright.
- Hooks en `.claude/settings.json`: PostToolUse (eslint + tsc del archivo editado) y Stop (`npm run verify`, bloquea hasta 5 intentos).
- CI: `.github/workflows/ci.yml` corre `verify:full` en cada push y PR.
- Íconos PWA: `node scripts/generate-icons.mjs` los regenera desde `public/favicon.svg`.
- Playwright fijado en 1.63.0 (coincide con el Chromium preinstalado del entorno de desarrollo).
- TypeScript fijado en ~6.0 (typescript-eslint todavía no soporta 7).

## Deploy

Vercel (Hobby), deploy automático desde `main`. Sitio 100 % estático (`dist/`), `vercel.json` solo con rewrite SPA. Nada exclusivo de Vercel.
