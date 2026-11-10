# Torneos de Tenis

App móvil (PWA) para organizar torneos de tenis amateur desde el celular. Funciona sin internet y guarda los datos en el propio dispositivo.

## Correr el proyecto

Requisitos: Node 22 o superior.

```bash
npm install
npm run dev          # http://localhost:5173
```

Scripts útiles:

| Script                | Qué hace                                 |
| --------------------- | ---------------------------------------- |
| `npm run verify`      | Tipos → lint → tests unitarios → build   |
| `npm run verify:full` | `verify` + tests end-to-end (Playwright) |
| `npm run test:watch`  | Tests unitarios en modo watch            |
| `npm run e2e`         | Solo los tests end-to-end                |
| `npm run format`      | Formatea el código con Prettier          |

La primera vez que corras los e2e en tu máquina: `npx playwright install chromium`.

## Probarla en el celular por WiFi

1. Conectá la compu y el celular a la misma red WiFi.
2. Corré `npm run dev:host` (equivale a `vite --host`).
3. En la consola aparece una dirección tipo `http://192.168.0.23:5173`. Abrila en el navegador del celular.

> Por WiFi local la app no se puede instalar ni usar sin conexión, porque eso requiere HTTPS. Para probar la instalación usá la versión publicada en Vercel.

## Despliegue

- Cada push a `main` publica automáticamente en Vercel (plan Hobby) con HTTPS.
- Vercel ejecuta `npm run build` y publica la carpeta `dist/`.
- `vercel.json` solo redirige todas las rutas a `/index.html` (navegación de la SPA).
- GitHub Actions (`.github/workflows/ci.yml`) corre `npm run verify:full` en cada push y PR.

## Instalar la app

Mientras la app se use desde el navegador aparece la tarjeta **Instalá la app** (en Torneos y en Ajustes):

- **Android (Chrome/Edge):** tocá **Instalar app** y confirmá. Se instala con un toque.
- **iPhone/iPad (Safari):** tocá **Instalar app** y seguí los pasos: botón **Compartir** (cuadrado con flecha) → **Agregar a inicio** → **Agregar**.
- **Otros navegadores:** menú ⋮ → **Instalar app** o **Agregar a la pantalla principal**.

Una vez instalada, la tarjeta desaparece. Conviene instalarla: abre más rápido, funciona sin internet y el navegador cuida mejor los datos (en Ajustes → Almacenamiento se ve si quedaron protegidos).

## Verificar la PWA

```bash
npm run build
npx vite preview --port 4173 &
npm run check:pwa        # criterios de instalación de Chrome + manifest + service worker
```

`check:pwa` usa el mismo chequeo que Chrome para ofrecer "Instalar app" (Lighthouse ya no incluye la auditoría PWA desde la versión 12). Para rendimiento y accesibilidad: `npx lighthouse http://localhost:4173 --form-factor=mobile`.

Resultado al cerrar la fase 7 (Lighthouse 12, celular): Rendimiento 98, Accesibilidad 100, Buenas prácticas 100, SEO 100. Los tests e2e verifican además que la app abre y guarda datos sin conexión.

## Migrar a otro hosting

La app es un sitio 100 % estático: cualquier hosting de archivos estáticos sirve. En todos los casos el build es `npm run build` y la carpeta a publicar es `dist`. Lo único a configurar es que todas las rutas devuelvan `index.html`:

- **Netlify:** crear `public/_redirects` con la línea `/*  /index.html  200`.
- **Cloudflare Pages:** framework "None", build `npm run build`, output `dist`. Cloudflare sirve `index.html` para rutas desconocidas por defecto en las SPA.
- **GitHub Pages:** publicar `dist` con una Action y copiar `index.html` como `404.html`. Si el sitio no está en la raíz del dominio, configurar `base` en `vite.config.ts` y `start_url`/`scope` del manifest.

Después, borrar `vercel.json` y desconectar el proyecto en Vercel.

## Estructura

Ver [`CLAUDE.md`](./CLAUDE.md) para la arquitectura, el modelo de datos y las decisiones tomadas, y [`docs/ESPECIFICACION.md`](./docs/ESPECIFICACION.md) para la especificación completa.
