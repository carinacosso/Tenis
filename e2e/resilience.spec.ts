import { expect, test } from '@playwright/test';

test('si la base de datos queda colgada, ofrece reabrir la app en vez de quedarse cargando', async ({
  page,
}) => {
  await page.clock.install();
  // Simula el problema de iPhone: la base nunca responde.
  await page.addInitScript(() => {
    const hung = () => ({}) as IDBOpenDBRequest;
    Object.defineProperty(window, 'indexedDB', {
      value: { open: hung, deleteDatabase: hung, cmp: () => 0, databases: async () => [] },
    });
  });
  await page.goto('/jugadores');
  await expect(page.getByText('Cargando…')).toBeVisible();
  await page.clock.fastForward(9000);
  await expect(page.getByText('Está tardando más de lo normal.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reabrir la app' })).toBeVisible();
});

test('un error no manejado se muestra en pantalla con su detalle', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Torneos' })).toBeVisible();
  await page.evaluate(() => {
    void Promise.reject(new Error('Prueba de error'));
  });
  await expect(page.getByText('Algo salió mal y no se pudo completar.')).toBeVisible();
  await expect(page.getByTestId('detalle-error')).toHaveText('Error: Prueba de error');
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByText('Algo salió mal')).toHaveCount(0);
});
