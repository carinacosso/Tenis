# CLAUDE.md — Torneos de Tenis

`docs/ESPECIFICACION.md` define **qué** construir. Este archivo registra **cómo** se está construyendo: arquitectura, decisiones y convenciones. Mantenerlo actualizado al cerrar cada fase o al tomar una decisión nueva.

## Estado

| Fase                                                                           | Estado    |
| ------------------------------------------------------------------------------ | --------- |
| 1. Base (arquitectura, repositorios, ABM jugadores, verify, hooks, CI, deploy) | ✅ Hecha  |
| 2. Primer torneo (inscripción, eliminación directa, puntuación, resultados)    | Pendiente |
| 3. Rotativos (Americano dobles/singles/mixto, Mexicano)                        | Pendiente |
| 4. Grupos + playoffs, liga, desempates                                         | Pendiente |
| 5. Canchas/horarios, W.O./abandonos, consolación                               | Pendiente |
| 6. Compartir imagen, PDF, Excel, backup, historial, estadísticas               | Pendiente |
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

Archivos de dominio: `player.ts`, `settings.ts`, `tournament.ts`, `registration.ts` (inscripción, lista de espera, pagos, cabezas), `knockout.ts` (sorteo, resolución, cascada, podio), `scoring.ts` (configuración y validación de resultados), `random.ts` (rng con semilla).

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

| Tema                                                | Decisión                                                                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Torneo vs categoría                                 | Una categoría por torneo.                                                                                                                                           |
| Corregir un resultado que ya hizo avanzar el cuadro | Avisar qué partidos posteriores se ven afectados y pedir confirmación antes de borrarlos. En Mexicano se recalcula el ranking pero no se rearman rondas ya jugadas. |
| W.O. en tablas                                      | Cuenta como 6-0 6-0 (sets y games del formato) para el ganador.                                                                                                     |
| Americano/Mexicano "a 21"                           | Gana el primero que llega a 21 (no es un total repartido).                                                                                                          |
| Nivel del jugador                                   | Lista configurable en Ajustes (por defecto 1ra…7ma, Principiante). No se puede quitar un nivel asignado a jugadores activos.                                        |
| Lista de espera                                     | Promoción automática mientras no se hayan generado los cruces. Después, los reemplazos son manuales.                                                                |
| Monto de inscripción                                | Individual (por jugador). En dobles, cada jugador tiene su propio estado de pago.                                                                                   |
| Datos obligatorios del jugador                      | Nombre, apellido, teléfono y nivel. Sexo y notas, opcionales (sexo será obligatorio para Americano mixto).                                                          |
| Jugador repetido                                    | Se avisa si coincide nombre+apellido (sin tildes) o teléfono; se puede guardar igual.                                                                               |
| Borrar jugador                                      | Borrado lógico (se conserva para historial).                                                                                                                        |

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
