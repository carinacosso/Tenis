import { type Page, expect, test } from '@playwright/test';

async function createPlayer(
  page: Page,
  data: { firstName: string; lastName: string; phone: string; level: string; sex?: string },
) {
  await page.goto('/jugadores/nuevo');
  await page.getByLabel('Nombre', { exact: true }).fill(data.firstName);
  await page.getByLabel('Apellido').fill(data.lastName);
  await page.getByLabel('Teléfono').fill(data.phone);
  await page.getByRole('button', { name: data.level, exact: true }).click();
  if (data.sex) await page.getByRole('button', { name: data.sex, exact: true }).click();
  await page.getByRole('button', { name: 'Guardar jugador' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: `${data.firstName} ${data.lastName}` }),
  ).toBeVisible();
}

test.describe('Jugadores', () => {
  test('alta, búsqueda, edición y baja de un jugador', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Jugadores' }).click();
    await expect(page.getByText('Todavía no cargaste jugadores')).toBeVisible();

    await createPlayer(page, {
      firstName: 'Ana',
      lastName: 'Gómez',
      phone: '11 5555 1234',
      level: '3ra',
      sex: 'Mujer',
    });
    await expect(page.getByText('1155551234')).toBeVisible();
    await expect(page.getByText('Mujer')).toBeVisible();

    await createPlayer(page, {
      firstName: 'José',
      lastName: 'Núñez',
      phone: '11 4444 0000',
      level: '5ta',
    });

    // Búsqueda sin tildes
    await page.goto('/jugadores');
    await expect(page.getByText('2 jugadores')).toBeVisible();
    await page.getByLabel('Buscar jugador').fill('nunez');
    const list = page.getByRole('list', { name: 'Lista de jugadores' });
    await expect(list.getByRole('link')).toHaveCount(1);
    await expect(list).toContainText('José Núñez');

    // Edición
    await list.getByRole('link', { name: /José Núñez/ }).click();
    await page.getByRole('link', { name: 'Editar' }).click();
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('José');
    await page.getByLabel('Nombre', { exact: true }).fill('José Luis');
    await page.getByRole('button', { name: '4ta', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'José Luis Núñez' })).toBeVisible();
    await expect(page.getByText('4ta')).toBeVisible();

    // Persistencia tras recargar
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'José Luis Núñez' })).toBeVisible();

    // Baja con confirmación: cancelar no borra
    await page.getByRole('button', { name: 'Eliminar jugador' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Eliminar jugador' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sí, eliminar' }).click();
    await expect(page).toHaveURL(/\/jugadores$/);
    await expect(page.getByText('1 jugador', { exact: true })).toBeVisible();
    await expect(page.getByText('José Luis Núñez')).toHaveCount(0);
  });

  test('muestra errores de validación y no guarda', async ({ page }) => {
    await page.goto('/jugadores/nuevo');
    await page.getByRole('button', { name: 'Guardar jugador' }).click();
    await expect(page.getByText('Ingresá el nombre.')).toBeVisible();
    await expect(page.getByText('Ingresá el apellido.')).toBeVisible();
    await expect(page.getByText('Ingresá el teléfono.')).toBeVisible();
    await expect(page.getByText('Elegí un nivel.')).toBeVisible();

    await page.getByLabel('Teléfono').fill('abc');
    await page.getByRole('button', { name: 'Guardar jugador' }).click();
    await expect(page.getByText('El teléfono no es válido.')).toBeVisible();
    await expect(page).toHaveURL(/\/jugadores\/nuevo$/);
  });

  test('avisa si el jugador parece repetido', async ({ page }) => {
    await createPlayer(page, {
      firstName: 'Ana',
      lastName: 'Gómez',
      phone: '1155551234',
      level: '3ra',
    });
    await page.goto('/jugadores/nuevo');
    await page.getByLabel('Nombre', { exact: true }).fill('ana');
    await page.getByLabel('Apellido').fill('gomez');
    await page.getByLabel('Teléfono').fill('1199998888');
    await page.getByRole('button', { name: '3ra', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar jugador' }).click();

    const dialog = page.getByRole('alertdialog', { name: '¿Jugador repetido?' });
    await expect(dialog).toContainText('Ana Gómez');
    await dialog.getByRole('button', { name: 'Guardar igual' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'ana gomez' })).toBeVisible();

    await page.goto('/jugadores');
    await expect(page.getByText('2 jugadores')).toBeVisible();
  });
});

test.describe('Ajustes', () => {
  test('agrega un nivel y lo usa al cargar un jugador', async ({ page }) => {
    await page.goto('/ajustes');
    await page.getByLabel('Nuevo nivel').fill('Damas B');
    await page.getByRole('button', { name: 'Agregar nivel' }).click();
    await expect(page.getByRole('list', { name: 'Niveles' })).toContainText('Damas B');

    await page.getByLabel('Nuevo nivel').fill('damas b');
    await page.getByRole('button', { name: 'Agregar nivel' }).click();
    await expect(page.getByText('Ese nivel ya existe.')).toBeVisible();

    await createPlayer(page, {
      firstName: 'Laura',
      lastName: 'Sosa',
      phone: '1166667777',
      level: 'Damas B',
    });

    // No se puede quitar un nivel en uso
    await page.goto('/ajustes');
    await page.getByRole('button', { name: 'Quitar Damas B' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sí, quitar' }).click();
    await expect(page.getByText('No se puede quitar: 1 jugador tiene ese nivel.')).toBeVisible();
  });

  test('cambia a modo oscuro y lo recuerda', async ({ page }) => {
    await page.goto('/ajustes');
    await page.getByRole('button', { name: 'Oscuro' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('button', { name: 'Claro' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });
});
