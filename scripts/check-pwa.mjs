// Verifica que la PWA cumpla los criterios de instalación de Chrome.
// Uso: npm run build && npx vite preview --port 4173 &  →  node scripts/check-pwa.mjs [url]
// Usa el mismo chequeo que Chrome para decidir si ofrece "Instalar app"
// (Page.getInstallabilityErrors) y revisa el manifest.
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url);
await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
});
await page.reload();

const cdp = await page.context().newCDPSession(page);
const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
const { errors: manifestErrors, url: manifestUrl } = await cdp.send('Page.getAppManifest');
const manifest = await (await fetch(new URL(manifestUrl, url))).json();
const controlled = await page.evaluate(() => navigator.serviceWorker.controller !== null);
await browser.close();

const checks = [
  [
    'Manifest sin errores',
    manifestErrors.length === 0,
    manifestErrors.map((e) => e.message).join('; '),
  ],
  ['Nombre y nombre corto', Boolean(manifest.name && manifest.short_name), ''],
  ['Modo standalone', manifest.display === 'standalone', manifest.display],
  ['Color de tema', Boolean(manifest.theme_color), manifest.theme_color],
  ['Ícono 192 px', manifest.icons.some((i) => i.sizes === '192x192'), ''],
  ['Ícono 512 px', manifest.icons.some((i) => i.sizes === '512x512'), ''],
  ['Ícono maskable', manifest.icons.some((i) => i.purpose === 'maskable'), ''],
  ['Service worker controla la página', controlled, ''],
  [
    'Chrome la considera instalable',
    installabilityErrors.length === 0,
    installabilityErrors.map((e) => e.errorId).join(', '),
  ],
];
for (const [name, ok, detail] of checks)
  console.log(`${ok ? '✓' : '✗'} ${name}${detail && !ok ? ` (${detail})` : ''}`);
const failed = checks.filter(([, ok]) => !ok).length;
console.log(failed === 0 ? '\nLa PWA es instalable.' : `\n${failed} chequeo(s) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
