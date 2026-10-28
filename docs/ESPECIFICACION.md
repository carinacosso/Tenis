# Especificación: App de organización de torneos de tenis

Desarrollá una aplicación móvil (PWA instalable, mobile-first, en español rioplatense) para que UN organizador gestione torneos de tenis amateur desde su celular.

> En el futuro la app tendrá múltiples usuarios (ej.: un club) y seguimiento de resultados en vivo. La arquitectura debe quedar preparada para eso, pero esta versión es para un solo organizador y funciona 100% offline.

---

## 0. Forma de trabajo

- Antes de escribir código, presentá un plan de arquitectura y el modelo de datos, y esperá mi aprobación.
- Trabajá por fases (ver sección "Fases"). Al terminar cada fase, mostrame qué se hizo y cómo probarlo, y esperá confirmación antes de seguir.
- Consultame ante cualquier decisión de diseño o regla de negocio ambigua.
- Creá un archivo `CLAUDE.md` en la raíz con el contexto del proyecto, decisiones tomadas y convenciones, y mantenelo actualizado. Este archivo (`docs/ESPECIFICACION.md`) define QUÉ construir; `CLAUDE.md` registra CÓMO se está construyendo.

---

## 1. Stack

- React + Vite + TypeScript (modo strict) + Tailwind CSS
- PWA con funcionamiento 100% offline (vite-plugin-pwa)
- Persistencia local con IndexedDB (Dexie.js)
- Tests: Vitest (unitarios) y Playwright (end-to-end)
- ESLint + Prettier
- **IMPORTANTE:** toda la persistencia debe pasar por una capa de repositorios/servicios con interfaces, para poder reemplazar IndexedDB por un backend (Supabase o Firebase) en el futuro sin tocar la UI.
- La lógica de negocio va en `/domain`, sin dependencias de React, para poder testearla aislada.

---

## 2. Jugadores

- Base de jugadores reutilizable entre torneos: nombre, apellido, teléfono, sexo (opcional), nivel/categoría.
- Búsqueda, edición, historial de torneos jugados y estadísticas por jugador.

---

## 3. Inscripción por torneo

- Inscribir jugadores individuales o parejas (para dobles).
- Estado de pago (pagado / pendiente) y monto de inscripción.
- Cupo máximo y lista de espera con promoción automática al liberarse un lugar.
- Contador de inscriptos y validación de mínimos según el formato elegido.

---

## 4. Formatos de torneo

Al crear un torneo se elige formato, modalidad (singles/dobles) y categoría. Debe poder haber varios torneos o categorías activos a la vez. La app genera automáticamente todos los cruces según los inscriptos.

**a) Eliminación directa** (singles o dobles)
- Cabezas de serie opcionales, ubicadas según reglas estándar de cuadro.
- Sorteo aleatorio del resto.
- Byes automáticos cuando los inscriptos no son potencia de 2, asignados prioritariamente a los cabezas de serie.
- Cuadro de consolación opcional para los perdedores de primera ronda.

**b) Fase de grupos + playoffs** (singles o dobles)
- Configurar cantidad de grupos y clasificados por grupo.
- Distribución equilibrada (cabezas de serie en grupos distintos).
- Cuadro final armado automáticamente cruzando posiciones (1°A vs 2°B, etc.).

**c) Liga / Round robin**: todos contra todos, singles o dobles.

**d) Americano dobles**: parejas rotativas en cada ronda; cada jugador suma individualmente los puntos/games de su pareja. Minimizar repeticiones de compañero y de rival.

**e) Americano singles**: rotación de rivales con puntuación individual acumulada.

**f) Mexicano**: como el Americano, pero desde la ronda 2 los cruces se arman según el ranking parcial (1° y 4° vs 2° y 3°, etc.).

**g) Americano mixto**: parejas siempre hombre + mujer.

En todos los formatos rotativos: gestionar los jugadores que descansan cuando el número no cierra, con rotación justa de descansos.

---

## 5. Puntuación configurable (por torneo)

- Sets a 4 o 6 juegos; cantidad de sets (1, 2 de 3, 3 de 5).
- Tie-break sí/no y a cuántos puntos.
- Super tie-break (a 10) en lugar del set decisivo.
- Punto de oro (sin ventaja).
- Americano/Mexicano: partido a puntos fijos (16, 21, 24, 32 o personalizado) o por tiempo.
- Validar que los resultados cargados sean coherentes con la configuración.

---

## 6. Programación y carga de resultados

- Definir cantidad de canchas y asignar partidos a cancha y horario.
- Vista "Ronda actual" con partidos en juego, pendientes y terminados.
- Carga rápida de resultados desde el celular (botones grandes, mínimo tipeo).
- Registrar W.O., abandono y retiro por lesión, con sus efectos en tablas y cuadro.
- Avance automático del cuadro y recálculo de tablas.
- Poder editar o corregir un resultado ya cargado, con recálculo en cascada.

---

## 7. Clasificación y resultados

- Tablas de posiciones con desempate configurable en orden de prioridad: partidos ganados, diferencia de sets, diferencia de games, enfrentamiento directo, sorteo.
- Cuadro visual de eliminación, navegable en pantalla chica.
- Pantalla final: campeón, subcampeón, podio y estadísticas del torneo.

---

## 8. Salida, datos y protección de la información

- Compartir cuadro, tabla o resultado final como imagen (Web Share API, apto WhatsApp).
- Exportar a PDF y a Excel.
- Historial de torneos finalizados.
- **Backup completo:** exportar e importar todos los datos en un archivo JSON.
- **Recordatorio de backup:** aviso periódico (configurable; por defecto, al finalizar cada torneo y si pasaron más de 7 días desde el último backup) con botón "Descargar backup" que genere el JSON. Mostrar en Ajustes la fecha del último backup.
- **Almacenamiento persistente:** solicitar `navigator.storage.persist()` al iniciar, para reducir el riesgo de que el navegador borre los datos. Mostrar en Ajustes si el almacenamiento quedó como persistente.

---

## 9. UX

- Diseño mobile-first, botones grandes, alto contraste para uso al aire libre.
- Modo claro/oscuro.
- Confirmación antes de acciones destructivas.
- **Instalación guiada:**
  - Botón visible "Instalar app" mientras la app se use desde el navegador (no instalada).
  - En Android/Chrome: usar el evento `beforeinstallprompt` para instalar con un toque.
  - En iPhone/Safari: mostrar instrucciones paso a paso (botón compartir → "Agregar a pantalla de inicio").
  - Detectar si ya está instalada (modo standalone) y ocultar el botón.
  - Explicar brevemente por qué conviene instalarla: funciona sin internet y protege los datos guardados.

---

## 10. Calidad y loop de verificación

### Herramientas
- TypeScript en modo strict
- ESLint + Prettier
- Vitest para tests unitarios (lógica de `/domain`)
- Playwright para tests end-to-end en viewport de celular (390x844)

### Script único
Creá en `package.json` el script `npm run verify` que ejecute en orden y se detenga ante el primer error:
1. `tsc --noEmit` (tipos)
2. `eslint .` (lint)
3. `vitest run` (unitarios)
4. `vite build` (compilación)

Y `npm run verify:full` = verify + tests e2e de Playwright.

### Loop obligatorio
Después de cada cambio de código:
1. Ejecutá `npm run verify`.
2. Si falla, analizá el error, corregí la causa y volvé a ejecutar.
3. Repetí hasta que pase todo en verde.
4. Si después de 5 intentos sobre el mismo error no se resuelve, detenete y reportame: el error, qué intentaste y tu hipótesis.

Al cerrar cada fase:
1. Ejecutá `npm run verify:full`.
2. Solo con todo en verde, hacé commit con mensaje descriptivo (ej: `feat(fase-2): eliminación directa y carga de resultados`) y push.
3. Mostrame un resumen: qué se hizo, tests agregados, resultado de la verificación y cómo probarlo.

### Reglas del loop
- PROHIBIDO modificar, saltear (`.skip`) o borrar un test para que pase. Si un test parece incorrecto, consultame.
- PROHIBIDO usar `any`, `@ts-ignore` o desactivar reglas de lint para esquivar errores.
- Cada funcionalidad nueva de `/domain` debe venir con sus tests antes de darla por terminada.
- Tests unitarios obligatorios para: generación de cuadros y byes, ubicación de cabezas de serie, rotaciones de Americano/Mexicano (sin repetir compañero/rival cuando sea posible), descansos, cálculo de tablas y desempates, validación de resultados, recálculo en cascada al corregir un resultado, exportación/importación del backup JSON.
- Tests e2e para los flujos principales: crear torneo → inscribir → generar cruces → cargar resultados → ver campeón; y backup → borrar datos → restaurar.

### Automatización
- Configurá hooks de Claude Code en `.claude/settings.json`:
  - PostToolUse (al editar archivos): ejecutar eslint y tsc sobre lo modificado.
  - Stop (al terminar una tarea): ejecutar `npm run verify`.
- Creá un workflow de GitHub Actions (`.github/workflows/ci.yml`) que ejecute `npm run verify:full` en cada push y pull request.

---

## 11. Git y despliegue

### Git
- Repositorio en GitHub, rama principal `main`.
- Commits con convención Conventional Commits (feat, fix, test, refactor, docs).
- Commit y push solo cuando `npm run verify:full` pase en verde (ver sección 10).
- Archivo `.gitignore` adecuado para Node/Vite.

### Despliegue (Vercel – plan Hobby)
- Deploy automático en Vercel desde la rama `main`.
- Cada push a `main` publica la versión de producción con HTTPS (requerido para instalar la PWA).
- Agregar `vercel.json` con rewrite de todas las rutas a `/index.html` (necesario para la navegación de la SPA).
- **PORTABILIDAD OBLIGATORIA:** la app debe ser un sitio 100% estático (salida de `vite build` en `/dist`). PROHIBIDO usar funciones serverless, Edge Functions, Vercel KV/Postgres/Blob o cualquier servicio exclusivo de Vercel. Debe poder migrarse a Cloudflare Pages, Netlify o GitHub Pages solo cambiando la configuración de deploy.
- Documentar en el `README.md`: cómo correr el proyecto local, cómo probarlo en el celular por red WiFi (`vite --host`), cómo se despliega, cómo instalar la app en Android e iPhone, y los pasos para migrar a otro hosting.

### PWA instalable
- `manifest.webmanifest` con nombre, íconos (192 y 512 px), color de tema y modo standalone.
- Service worker (vite-plugin-pwa) con estrategia offline-first y aviso de "Nueva versión disponible" para actualizar.
- Verificar con Lighthouse que la PWA cumpla los criterios de instalabilidad al cerrar la fase 7.

---

## Fases

1. **Base:** arquitectura, modelo de datos, capa de repositorios, ABM de jugadores. Configuración de Git, `npm run verify`, hooks de Claude Code, GitHub Actions y primer deploy en Vercel.
2. **Primer torneo:** inscripción + eliminación directa + puntuación configurable + carga de resultados.
3. **Rotativos:** Americano dobles, Americano singles, Mexicano, Americano mixto.
4. **Grupos y liga:** grupos + playoffs, round robin y desempates.
5. **Gestión en cancha:** canchas/horarios, W.O./abandonos, cuadro de consolación.
6. **Salida y datos:** compartir imagen, PDF, Excel, backup JSON con recordatorio, almacenamiento persistente, historial y estadísticas.
7. **Cierre:** instalación guiada, pulido de UX, PWA instalable verificada con Lighthouse y pruebas finales en celular.
