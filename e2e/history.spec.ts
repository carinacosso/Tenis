import { expect, test } from '@playwright/test';
import { createPlayer } from './helpers';

test('historial y estadísticas del jugador después de un torneo', async ({ page }) => {
  await createPlayer(page, {
    firstName: 'Ana',
    lastName: 'Alonso',
    phone: '1170000000',
    level: '4ta',
  });
  await createPlayer(page, {
    firstName: 'Bruno',
    lastName: 'Benítez',
    phone: '1170000001',
    level: '4ta',
  });

  // Sin torneos todavía
  await expect(page.getByText('Todavía no jugó torneos.', { exact: false })).toBeVisible();

  await page.goto('/torneos/nuevo');
  await page.getByLabel('Nombre del torneo').fill('Final del sábado');
  await page.getByLabel('Categoría').fill('4ta');
  await page.getByRole('button', { name: '1 set', exact: true }).click();
  await page.getByRole('button', { name: 'Crear torneo' }).click();
  await page.getByRole('link', { name: 'Inscribir' }).click();
  for (const name of ['Ana Alonso', 'Bruno Benítez']) {
    await page
      .getByRole('list', { name: 'Jugadores disponibles' })
      .getByRole('button', { name: new RegExp(name) })
      .click();
  }
  await page.getByRole('button', { name: 'Volver' }).click();
  await page.getByRole('button', { name: 'Generar cruces' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Generar cruces' }).click();

  // Gana Ana 6-3
  await page.getByRole('link', { name: /Cargar resultado/ }).click();
  const set = page.getByRole('region', { name: 'Set 1' });
  await set.getByRole('button', { name: 'Ana Alonso' }).click();
  await set.getByRole('button', { name: '6-3' }).click();
  await page.getByRole('button', { name: 'Guardar resultado' }).click();
  await expect(page.getByTestId('campeon')).toHaveText('🏆 Ana Alonso');

  // Ficha de Ana: título y estadísticas
  await page.getByRole('link', { name: 'Jugadores' }).click();
  await page.getByRole('link', { name: /Ana Alonso/ }).click();
  const stats = page.getByTestId('estadisticas');
  await expect(stats).toContainText('1Torneos');
  await expect(stats).toContainText('1Títulos');
  await expect(stats).toContainText('100 %Efectividad');
  await expect(page.getByText('Sets 1-0 · Games 6-3')).toBeVisible();
  const history = page.getByRole('list', { name: 'Historial de torneos' });
  await expect(history).toContainText('Final del sábado');
  await expect(history).toContainText('Campeón');

  // Ficha de Bruno: subcampeón
  await page.getByRole('link', { name: 'Jugadores' }).click();
  await page.getByRole('link', { name: /Bruno Benítez/ }).click();
  await expect(page.getByRole('list', { name: 'Historial de torneos' })).toContainText(
    'Subcampeón',
  );
  await expect(page.getByTestId('estadisticas')).toContainText('0 %Efectividad');

  // Desde el historial se vuelve al torneo
  await page.getByRole('list', { name: 'Historial de torneos' }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Final del sábado' })).toBeVisible();
});

test('Ajustes muestra si los datos están protegidos', async ({ page }) => {
  await page.goto('/ajustes');
  await expect(page.getByRole('heading', { name: 'Almacenamiento' })).toBeVisible();
  await expect(page.getByTestId('estado-almacenamiento')).toHaveText(
    /Datos protegidos|Datos sin proteger|Protección no disponible/,
  );
});

test('Ajustes muestra la versión con su fecha', async ({ page }) => {
  await page.goto('/ajustes');
  await expect(page.getByTestId('version')).toHaveText(
    /^Versión 0\.2\.0 · del \d{2}\/\d{2}\/\d{4} a las \d{2}:\d{2}$/,
  );
});
