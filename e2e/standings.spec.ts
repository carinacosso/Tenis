import { type Page, expect, test } from '@playwright/test';
import { createPlayer } from './helpers';

const NAMES = [
  ['Ana', 'Alonso'],
  ['Bruno', 'Benítez'],
  ['Carla', 'Castro'],
  ['Diego', 'Díaz'],
  ['Eva', 'Espinoza'],
  ['Fede', 'Fernández'],
] as const;

async function setup(page: Page, format: string, players: number, configure?: () => Promise<void>) {
  for (const [i, [firstName, lastName]] of NAMES.slice(0, players).entries()) {
    await createPlayer(page, { firstName, lastName, phone: `11 6000 000${i}`, level: '4ta' });
  }
  await page.goto('/torneos/nuevo');
  await page.getByLabel('Nombre del torneo').fill('Tabla');
  await page.getByLabel('Categoría').fill('4ta');
  await page.getByRole('button', { name: format, exact: true }).click();
  await page.getByRole('button', { name: '1 set', exact: true }).click();
  await configure?.();
  await page.getByRole('button', { name: 'Crear torneo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tabla' })).toBeVisible();
  await page.getByRole('link', { name: 'Inscribir' }).click();
  for (const [firstName, lastName] of NAMES.slice(0, players)) {
    await page
      .getByRole('list', { name: 'Jugadores disponibles' })
      .getByRole('button', { name: new RegExp(`${firstName} ${lastName}`) })
      .click();
  }
  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page.getByTestId('contador-inscriptos')).toHaveText(`${players} / 16 jugadores`);
  await page.getByRole('button', { name: 'Generar cruces' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Generar cruces' }).click();
  await expect(page.getByRole('tab', { name: 'Partidos', selected: true })).toBeVisible();
}

/** Carga 6-2 para el lado de arriba en todos los partidos listos, hasta que no quede ninguno. */
async function playAllReady(page: Page, expected: number) {
  for (let i = 0; i < expected; i++) {
    await page.getByRole('tab', { name: 'Partidos' }).click();
    await page
      .getByRole('link', { name: /Cargar resultado/ })
      .first()
      .click();
    const set = page.getByRole('region', { name: 'Set 1' });
    await set.getByRole('button').first().click();
    await set.getByRole('button', { name: '6-2' }).click();
    await page.getByRole('button', { name: 'Guardar resultado' }).click();
    await expect(page.getByRole('tab', { name: 'Partidos' })).toBeVisible();
  }
}

test('grupos + playoffs: tablas, cuadro final automático y campeón', async ({ page }) => {
  await setup(page, 'Grupos + playoffs', 6, async () => {
    await page.getByLabel('Cantidad de grupos').fill('2');
    await page.getByRole('button', { name: '1', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Orden de desempate' })).toBeVisible();
  });

  // Todos los partidos de grupo se pueden jugar desde el principio (2 grupos de 3 → 6)
  await expect(page.getByRole('heading', { name: 'Para jugar (6)' })).toBeVisible();
  await expect(page.getByText(/Grupo A · Fecha 1/).first()).toBeVisible();

  await page.getByRole('tab', { name: 'Grupos' }).click();
  await expect(page.getByRole('table', { name: 'Tabla del Grupo A' }).getByRole('row')).toHaveCount(
    4,
  );
  await expect(page.getByRole('table', { name: 'Tabla del Grupo B' }).getByRole('row')).toHaveCount(
    4,
  );

  await page.getByRole('tab', { name: 'Cuadro' }).click();
  await expect(page.getByText('Todavía no hay cuadro final')).toBeVisible();

  // 2 grupos de 3 → 6 partidos de grupo; al terminar se arma la final
  await playAllReady(page, 6);
  await page.getByRole('tab', { name: 'Cuadro' }).click();
  await expect(page.getByRole('tab', { name: 'Final' })).toBeVisible();

  await page.getByRole('tab', { name: 'Grupos' }).click();
  await expect(
    page.getByRole('table', { name: 'Tabla del Grupo A' }).getByText('(clasifica)'),
  ).toHaveCount(1);

  await playAllReady(page, 1);
  await expect(page.getByTestId('campeon')).toBeVisible();
  await expect(page.getByText('Finalizado')).toBeVisible();
});

test('liga: tabla de posiciones y campeón', async ({ page }) => {
  await setup(page, 'Liga', 4, async () => {
    await expect(page.getByRole('button', { name: 'Solo ida' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  await expect(page.getByRole('tab', { name: 'Cuadro' })).toHaveCount(0);
  await expect(page.getByText(/^Fecha 1$/).first()).toBeVisible();

  await page.getByRole('tab', { name: 'Tabla' }).click();
  const table = page.getByRole('table', { name: 'Tabla de posiciones' });
  await expect(table.getByRole('row')).toHaveCount(5);
  await expect(page.getByText(/Desempate: partidos ganados/)).toBeVisible();

  await playAllReady(page, 6);
  await expect(page.getByTestId('campeon')).toBeVisible();
  await page.getByRole('tab', { name: 'Tabla' }).click();
  const leader = await table.getByRole('row').nth(1).getByRole('cell').nth(1).textContent();
  await expect(page.getByTestId('campeon')).toHaveText(`🏆 ${leader ?? ''}`);
});
