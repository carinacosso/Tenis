import { type Page, expect, test } from '@playwright/test';
import { createPlayer } from './helpers';

const PLAYERS = [
  ['Ana', 'Alonso'],
  ['Bruno', 'Benítez'],
  ['Carla', 'Castro'],
  ['Diego', 'Díaz'],
  ['Eva', 'Espinoza'],
] as const;

async function createPlayers(page: Page) {
  for (const [i, [firstName, lastName]] of PLAYERS.entries()) {
    await createPlayer(page, { firstName, lastName, phone: `11 4000 000${i}`, level: '4ta' });
  }
}

async function createTournament(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Nuevo' }).click();
  await page.getByLabel('Nombre del torneo').fill('Apertura');
  await page
    .getByLabel('Niveles sugeridos')
    .getByRole('button', { name: '4ta', exact: true })
    .click();
  await page.getByRole('button', { name: '1 set', exact: true }).click();
  await page.getByLabel('Cupo máximo').fill('4');
  await page.getByLabel('Inscripción por jugador ($)').fill('1000');
  await page.getByRole('button', { name: 'Crear torneo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Apertura' })).toBeVisible();
}

/** Carga 6-2 para el lado de arriba en el primer partido listo de la pestaña Partidos. */
async function playNextMatch(page: Page) {
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

test('crear torneo → inscribir → generar cruces → cargar resultados → campeón', async ({
  page,
}) => {
  await createPlayers(page);
  await createTournament(page);

  // Inscripción: 4 de cupo, la 5.ª va a lista de espera
  await page.getByRole('link', { name: 'Inscribir' }).click();
  for (const [firstName, lastName] of PLAYERS) {
    await page
      .getByRole('list', { name: 'Jugadores disponibles' })
      .getByRole('button', { name: new RegExp(`${firstName} ${lastName}`) })
      .click();
    await expect(page.getByText(new RegExp(`${firstName} ${lastName}`)).last()).toBeVisible();
  }
  await expect(page.getByText(/cupo completo/)).toBeVisible();
  await page.getByRole('button', { name: 'Volver' }).click();

  await expect(page.getByTestId('contador-inscriptos')).toHaveText('4 / 4 jugadores');
  const waitlist = page.getByRole('list', { name: 'Lista de espera' });
  await expect(waitlist).toContainText('Eva Espinoza');

  // Baja con promoción automática de la lista de espera
  await page.getByRole('button', { name: 'Dar de baja a Diego Díaz' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sí, dar de baja' }).click();
  await expect(page.getByText('Eva Espinoza pasó a confirmado')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Inscriptos confirmados' })).toContainText(
    'Eva Espinoza',
  );
  await expect(page.getByTestId('contador-inscriptos')).toHaveText('4 / 4 jugadores');

  // Pago
  await page.getByRole('button', { name: 'Pago de Ana Alonso: pendiente' }).click();
  await expect(page.getByRole('button', { name: 'Pago de Ana Alonso: pagado' })).toBeVisible();
  await expect(page.getByText('Cobrado $ 1.000 · Pendiente $ 3.000')).toBeVisible();

  // Cabezas de serie: Ana (1) y Carla (2) → no se cruzan antes de la final
  await page.getByRole('link', { name: 'Cabezas de serie' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cabezas de serie' })).toBeVisible();
  await page.getByRole('button', { name: /Ana Alonso/ }).click();
  await page.getByRole('button', { name: /Carla Castro/ }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(
    page.getByRole('list', { name: 'Inscriptos confirmados' }).getByText('[1]'),
  ).toBeVisible();

  // Generar cruces
  await page.getByRole('button', { name: 'Generar cruces' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Generar cruces' }).click();
  await expect(page.getByRole('heading', { name: 'Para jugar (2)' })).toBeVisible();

  await page.getByRole('tab', { name: 'Cuadro' }).click();
  const semis = page.getByRole('list', { name: 'Semifinal' });
  await expect(semis.getByRole('listitem').first()).toContainText('Ana Alonso');
  await expect(semis.getByRole('listitem').last()).toContainText('Carla Castro');

  // Validación: sin elegir resultado no guarda
  await page.getByRole('tab', { name: 'Partidos' }).click();
  await page
    .getByRole('link', { name: /Cargar resultado/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Guardar resultado' }).click();
  await expect(page.getByRole('alert')).toHaveText('Completá todos los sets.');
  await page.getByRole('button', { name: 'Volver' }).click();

  // Resultados: semifinales y final
  await playNextMatch(page);
  await playNextMatch(page);
  await playNextMatch(page);

  await expect(page.getByTestId('campeon')).toHaveText('🏆 Ana Alonso');
  await expect(page.getByText('Finalizado')).toBeVisible();

  // Corrección con recálculo en cascada: Ana pierde la semifinal
  await page.getByRole('tab', { name: 'Cuadro' }).click();
  await page.getByRole('tab', { name: 'Semifinal' }).click();
  await page.getByRole('list', { name: 'Semifinal' }).getByRole('link').first().click();
  const set = page.getByRole('region', { name: 'Set 1' });
  await set.getByRole('button').nth(1).click();
  await set.getByRole('button', { name: '6-4' }).click();
  await page.getByRole('button', { name: 'Guardar resultado' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Esto cambia partidos ya jugados' });
  await expect(dialog).toContainText('Final');
  await dialog.getByRole('button', { name: 'Sí, guardar y borrar' }).click();

  await expect(page.getByTestId('campeon')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Para jugar (1)' })).toBeVisible();
  await playNextMatch(page);
  await expect(page.getByTestId('campeon')).toBeVisible();
  await expect(page.getByTestId('campeon')).not.toHaveText('🏆 Ana Alonso');

  // Persistencia tras recargar y en el listado
  await page.reload();
  await expect(page.getByTestId('campeon')).toBeVisible();
  await page.getByRole('link', { name: 'Torneos' }).click();
  await expect(page.getByRole('heading', { name: 'Finalizados' })).toBeVisible();
});

test('valida los datos al crear un torneo', async ({ page }) => {
  await page.goto('/torneos/nuevo');
  await page.getByLabel('Cupo máximo').fill('1');
  await page.getByRole('button', { name: 'Crear torneo' }).click();
  await expect(page.getByText('Ingresá el nombre del torneo.')).toBeVisible();
  await expect(page.getByText('Ingresá la categoría.')).toBeVisible();
  await expect(page.getByText('El cupo mínimo es 2.')).toBeVisible();
});
