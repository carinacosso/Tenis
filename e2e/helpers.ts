import { type Page, expect } from '@playwright/test';

export interface PlayerData {
  firstName: string;
  lastName: string;
  phone: string;
  level: string;
  sex?: string;
}

export async function createPlayer(page: Page, data: PlayerData) {
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
