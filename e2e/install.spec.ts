import { expect, test } from '@playwright/test';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test.describe('instalación guiada', () => {
  test('sin aviso del navegador muestra los pasos generales', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Instalá la app' })).toBeVisible();
    await expect(page.getByText(/funciona sin internet/)).toBeVisible();
    await page.getByRole('button', { name: 'Instalar app' }).click();
    const dialog = page.getByRole('dialog', { name: 'Instalar la app' });
    await expect(dialog).toContainText('Instalar app');
    await dialog.getByRole('button', { name: 'Entendido' }).click();
    await expect(dialog).toBeHidden();
  });

  test('en Android/Chrome instala con un toque y después se oculta el botón', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Instalar app' })).toBeVisible();
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(event, {
        prompt: async () => {
          (window as unknown as { prompted: boolean }).prompted = true;
        },
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(event);
    });
    await page.getByRole('button', { name: 'Instalar app' }).click();
    await expect(page.getByRole('button', { name: 'Instalar app' })).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(
      true,
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test.describe('en iPhone', () => {
    test.use({ userAgent: IPHONE_UA });

    test('muestra los pasos con el botón Compartir', async ({ page }) => {
      await page.goto('/ajustes');
      await page.getByRole('button', { name: 'Instalar app' }).click();
      const dialog = page.getByRole('dialog', { name: 'Instalar en iPhone' });
      await expect(dialog).toContainText('Compartir');
      await expect(dialog).toContainText('Agregar a inicio');
    });
  });

  test('si ya está instalada no muestra el botón', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { value: true });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Torneos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Instalar app' })).toHaveCount(0);
  });
});

test.describe('sin internet', () => {
  test.use({ serviceWorkers: 'allow' });

  test('la app abre y guarda datos sin conexión', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // Recargar para que el service worker controle la página
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Torneos' })).toBeVisible();

    // Navegar a una pantalla que se carga aparte y cargar un jugador sin conexión
    await page.goto('/jugadores/nuevo');
    await page.getByLabel('Nombre', { exact: true }).fill('Offline');
    await page.getByLabel('Apellido').fill('Prueba');
    await page.getByRole('button', { name: '4ta', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar jugador' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Offline Prueba' })).toBeVisible();
    await page.goto('/torneos/nuevo');
    await expect(page.getByLabel('Nombre del torneo')).toBeVisible();
    await context.setOffline(false);
  });
});
