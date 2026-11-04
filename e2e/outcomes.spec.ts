import { type Page, expect, test } from '@playwright/test';
import { createPlayer } from './helpers';

const NAMES = [
  ['Ana', 'Alonso'],
  ['Bruno', 'Benítez'],
  ['Carla', 'Castro'],
  ['Diego', 'Díaz'],
] as const;

async function setup(page: Page, format: string, configure?: () => Promise<void>) {
  for (const [i, [firstName, lastName]] of NAMES.entries()) {
    await createPlayer(page, { firstName, lastName, phone: `11 7000 000${i}`, level: '4ta' });
  }
  await page.goto('/torneos/nuevo');
  await page.getByLabel('Nombre del torneo').fill('Copa');
  await page.getByLabel('Categoría').fill('4ta');
  await page.getByRole('button', { name: format, exact: true }).click();
  await page.getByRole('button', { name: '1 set', exact: true }).click();
  await configure?.();
  await page.getByRole('button', { name: 'Crear torneo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Copa' })).toBeVisible();
  await page.getByRole('link', { name: 'Inscribir' }).click();
  for (const [firstName, lastName] of NAMES) {
    await page
      .getByRole('list', { name: 'Jugadores disponibles' })
      .getByRole('button', { name: new RegExp(`${firstName} ${lastName}`) })
      .click();
  }
  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page.getByTestId('contador-inscriptos')).toHaveText('4 / 16 jugadores');
  await page.getByRole('button', { name: 'Generar cruces' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Generar cruces' }).click();
  await expect(page.getByRole('tab', { name: 'Partidos', selected: true })).toBeVisible();
}

async function openFirstReady(page: Page) {
  await page.getByRole('tab', { name: 'Partidos' }).click();
  await page
    .getByRole('link', { name: /Cargar resultado/ })
    .first()
    .click();
}

async function saveNormal(page: Page) {
  const set = page.getByRole('region', { name: 'Set 1' });
  await set.getByRole('button').first().click();
  await set.getByRole('button', { name: '6-2' }).click();
  await page.getByRole('button', { name: 'Guardar resultado' }).click();
  await expect(page.getByRole('tab', { name: 'Partidos' })).toBeVisible();
}

test('eliminación directa con consolación, W.O. y abandono', async ({ page }) => {
  await setup(page, 'Eliminación directa', async () => {
    await page
      .getByRole('group', { name: 'Cuadro de consolación' })
      .getByRole('button', { name: 'Sí' })
      .click();
  });

  // Semifinales normales: los dos perdedores van a la consolación
  await openFirstReady(page);
  await saveNormal(page);
  await openFirstReady(page);
  await saveNormal(page);

  await page.getByRole('tab', { name: 'Cuadro' }).click();
  await page.getByRole('tab', { name: 'Consolación' }).click();
  await expect(page.getByRole('list', { name: 'Final' }).getByRole('listitem')).toHaveCount(1);

  // Final de consolación por W.O.
  await page.getByRole('list', { name: 'Final' }).getByRole('link').click();
  await page.getByRole('button', { name: 'W.O.', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar resultado' }).click();
  await expect(page.getByRole('alert')).toHaveText('Elegí quién no se presentó.');
  await page
    .getByRole('region', { name: '¿Quién no se presentó?' })
    .getByRole('button')
    .first()
    .click();
  await page.getByRole('button', { name: 'Guardar resultado' }).click();
  await expect(page.getByText('W.O.', { exact: true }).first()).toBeVisible();

  // Final principal: abandono en el primer set (3-1), abandona el de abajo
  await openFirstReady(page);
  await page.getByRole('button', { name: 'Abandono', exact: true }).click();
  await page.getByRole('region', { name: '¿Quién abandonó?' }).getByRole('button').nth(1).click();
  await page.getByRole('button', { name: 'Agregar set' }).click();
  for (let i = 0; i < 3; i++)
    await page
      .getByRole('button', { name: /^Sumar a Set 1, / })
      .first()
      .click();
  await page
    .getByRole('button', { name: /^Sumar a Set 1, / })
    .nth(1)
    .click();
  await page.getByRole('button', { name: 'Guardar resultado' }).click();

  await expect(page.getByTestId('campeon')).toBeVisible();
  await expect(page.getByText('Finalizado')).toBeVisible();
  await expect(page.getByText('Consolación', { exact: true })).toBeVisible();
});

test('liga: el retiro por lesión le da W.O. a los rivales que le quedaban', async ({ page }) => {
  await setup(page, 'Liga');
  await expect(page.getByRole('heading', { name: 'Para jugar (6)' })).toBeVisible();

  await openFirstReady(page);
  await page.getByRole('button', { name: 'Lesión', exact: true }).click();
  await expect(
    page.getByText('Por la lesión, pierde por W.O. los partidos que le quedan en la fase.'),
  ).toBeVisible();
  await page.getByRole('region', { name: '¿Quién abandonó?' }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Guardar resultado' }).click();

  // El lesionado tenía 3 partidos: 1 por lesión + 2 W.O. automáticos → quedan 3 para jugar
  await expect(page.getByRole('heading', { name: 'Para jugar (3)' })).toBeVisible();
  await expect(page.getByText('W.O.', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Lesión', { exact: true })).toHaveCount(1);
});
