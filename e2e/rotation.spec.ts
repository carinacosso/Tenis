import { type Page, expect, test } from '@playwright/test';
import { createPlayer } from './helpers';

const NAMES = [
  ['Ana', 'Alonso', '1ra'],
  ['Bruno', 'Benítez', '2da'],
  ['Carla', 'Castro', '3ra'],
  ['Diego', 'Díaz', '4ta'],
  ['Eva', 'Espinoza', '5ta'],
] as const;

async function setupTournament(page: Page, format: string, rounds: string, players: number) {
  for (const [i, [firstName, lastName, level]] of NAMES.slice(0, players).entries()) {
    await createPlayer(page, { firstName, lastName, phone: `11 5000 000${i}`, level });
  }
  await page.goto('/torneos/nuevo');
  await page.getByLabel('Nombre del torneo').fill('Rotativo');
  await page.getByLabel('Categoría').fill('Libre');
  await page.getByRole('button', { name: format, exact: true }).click();
  await page.getByLabel('Cantidad de rondas').fill(rounds);
  await page.getByRole('button', { name: 'A 16', exact: true }).click();
  await page.getByRole('button', { name: 'Crear torneo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Rotativo' })).toBeVisible();
  await expect(page.getByText(`Libre · Dobles · ${format}`)).toBeVisible();

  await page.getByRole('link', { name: 'Inscribir' }).click();
  for (const [firstName, lastName] of NAMES.slice(0, players)) {
    await page
      .getByRole('list', { name: 'Jugadores disponibles' })
      .getByRole('button', { name: new RegExp(`${firstName} ${lastName}`) })
      .click();
  }
  await expect(page.getByText(`${players} / 16 jugadores`)).toBeVisible();
  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page.getByRole('link', { name: 'Cabezas de serie' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Generar cruces' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Generar cruces' }).click();
  await expect(page.getByRole('tab', { name: 'Rondas', selected: true })).toBeVisible();
}

/** Carga 16-x en todos los partidos pendientes de la ronda visible. */
async function playVisibleRound(page: Page, loserPoints: number[]) {
  for (const points of loserPoints) {
    await page
      .getByRole('link', { name: /Cargar resultado/ })
      .first()
      .click();
    await page.getByRole('region', { name: 'Resultado' }).getByRole('button').first().click();
    await page.getByRole('button', { name: String(points), exact: true }).click();
    await page.getByRole('button', { name: 'Guardar resultado' }).click();
    await expect(page.getByRole('tab', { name: 'Rondas' })).toBeVisible();
  }
}

test('Americano dobles con descansos: rondas, ranking y campeón', async ({ page }) => {
  await setupTournament(page, 'Americano dobles', '2', 5);

  // 5 jugadores → 1 partido por ronda y 1 descansa
  const round1 = page.getByRole('list', { name: 'Ronda 1' });
  await expect(round1.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByText(/Descansan:/)).toBeVisible();
  await expect(page.getByText('Ronda 1 de 2')).toBeVisible();

  // Validación: sin elegir quién ganó no guarda
  await page
    .getByRole('link', { name: /Cargar resultado/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Guardar resultado' }).click();
  await expect(page.getByRole('alert')).toHaveText('Completá el resultado.');
  await page.getByRole('button', { name: 'Volver' }).click();

  await playVisibleRound(page, [10]);
  await expect(page.getByRole('tab', { name: 'Ronda 1 ✓' })).toBeVisible();
  await page.getByRole('tab', { name: 'Ronda 2' }).click();
  await playVisibleRound(page, [12]);

  await expect(page.getByTestId('campeon')).toBeVisible();
  await expect(page.getByText('Finalizado')).toBeVisible();

  await page.getByRole('tab', { name: 'Ranking' }).click();
  const table = page.getByRole('table', { name: 'Ranking' });
  await expect(table.getByRole('row')).toHaveCount(6);
  await expect(page.getByText(/Incluye puntos por descanso/)).toBeVisible();
});

test('Mexicano: primera ronda por nivel y siguientes según el ranking', async ({ page }) => {
  await setupTournament(page, 'Mexicano', '2', 4);

  // Ronda 1 por nivel: 1ra y 4ta vs 2da y 3ra
  const round1 = page.getByRole('list', { name: 'Ronda 1' });
  await expect(round1).toContainText('Ana Alonso / Diego Díaz');
  await expect(round1).toContainText('Bruno Benítez / Carla Castro');

  await expect(page.getByRole('button', { name: 'Generar ronda 2' })).toBeDisabled();
  await expect(page.getByText('Terminá de cargar los resultados de la ronda 1.')).toBeVisible();

  // Gana la pareja de abajo (Bruno/Carla) 16-5
  await page.getByRole('link', { name: /Cargar resultado/ }).click();
  await page.getByRole('region', { name: 'Resultado' }).getByRole('button').nth(1).click();
  await page.getByRole('button', { name: '5', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar resultado' }).click();

  await page.getByRole('button', { name: 'Generar ronda 2' }).click();
  await expect(page.getByRole('tab', { name: 'Ronda 2', selected: true })).toBeVisible();
  // Ranking: Bruno y Carla (16) arriba, Ana y Diego (5) abajo → 1° y 4° vs 2° y 3°
  const round2 = page.getByRole('list', { name: 'Ronda 2' });
  await expect(round2.getByRole('listitem')).toHaveCount(1);
  await expect(round2).not.toContainText('Bruno Benítez / Carla Castro');

  // Se puede rearmar la ronda mientras no tenga resultados
  await page.getByRole('button', { name: 'Rearmar ronda 2' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sí, borrar ronda' }).click();
  await expect(page.getByRole('tab', { name: 'Ronda 2' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Generar ronda 2' }).click();

  await playVisibleRound(page, [3]);
  await expect(page.getByTestId('campeon')).toBeVisible();
});

test('Americano dobles a 4 games: se carga 4-2 y el ranking cuenta games', async ({ page }) => {
  for (const [i, [firstName, lastName, level]] of NAMES.slice(0, 4).entries()) {
    await createPlayer(page, { firstName, lastName, phone: `11 5100 000${i}`, level });
  }
  await page.goto('/torneos/nuevo');
  await page.getByLabel('Nombre del torneo').fill('Games');
  await page.getByLabel('Categoría').fill('Libre');
  await page.getByRole('button', { name: 'Americano dobles', exact: true }).click();
  await expect(page.getByRole('button', { name: 'A 3 games', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'A 4 games', exact: true }).click();
  await page.getByLabel('Cantidad de rondas').fill('1');
  await page.getByRole('button', { name: 'Crear torneo' }).click();
  await expect(page.getByText('Partidos a 4 games')).toBeVisible();

  await page.getByRole('link', { name: 'Inscribir' }).click();
  for (const [firstName, lastName] of NAMES.slice(0, 4)) {
    await page
      .getByRole('list', { name: 'Jugadores disponibles' })
      .getByRole('button', { name: new RegExp(`${firstName} ${lastName}`) })
      .click();
  }
  await page.getByRole('button', { name: 'Volver' }).click();
  await page.getByRole('button', { name: 'Generar cruces' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Generar cruces' }).click();

  await page.getByRole('link', { name: /Cargar resultado/ }).click();
  const region = page.getByRole('region', { name: 'Resultado' });
  await expect(region).toContainText('¿Quién llegó a 4 games?');
  await region.getByRole('button').first().click();
  await expect(region.getByRole('button', { name: '4', exact: true })).toHaveCount(0);
  await region.getByRole('button', { name: '2', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar resultado' }).click();

  await expect(page.getByTestId('campeon')).toBeVisible();
  await page.getByRole('tab', { name: 'Ranking' }).click();
  const table = page.getByRole('table', { name: 'Ranking' });
  await expect(table.getByRole('columnheader', { name: 'Games' })).toBeVisible();
  await expect(table.getByRole('row').nth(1)).toContainText('4');
  await expect(page.getByText('Orden: games, partidos ganados')).toBeVisible();
});
