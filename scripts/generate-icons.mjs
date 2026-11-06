// Genera los íconos PNG de la PWA a partir de public/favicon.svg.
// Uso: node scripts/generate-icons.mjs  (requiere Playwright con Chromium)
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const maskableSvg = svg.replace('rx="112"', 'rx="0"');

const targets = [
  { file: 'pwa-192.png', size: 192, source: svg, padding: 0 },
  { file: 'pwa-512.png', size: 512, source: svg, padding: 0 },
  { file: 'apple-touch-icon.png', size: 180, source: maskableSvg, padding: 0 },
  // Maskable: el contenido dentro de la zona segura (80 %) y fondo a sangre.
  { file: 'pwa-512-maskable.png', size: 512, source: maskableSvg, padding: 0.1 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, source, padding } of targets) {
  const inner = size * (1 - padding * 2);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:#14532d;display:grid;place-items:center;width:${size}px;height:${size}px">
       <div style="width:${inner}px;height:${inner}px">${source.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
     </body>`,
  );
  await page.screenshot({ path: `public/${file}`, omitBackground: false });
  console.log(`public/${file}`);
}
await browser.close();
