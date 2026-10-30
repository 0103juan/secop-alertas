import { expect, Page, test } from '@playwright/test';

async function signUp(page: Page): Promise<string> {
  const user = `e2e${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await page.goto('/registro');
  await page.getByLabel('Usuario').fill(user);
  await page.getByLabel('Correo').fill(`${user}@example.com`);
  await page.getByLabel('Contraseña').fill('una-clave-de-prueba-larga');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Mis alertas' })).toBeVisible();
  return user;
}

test('private pages send a visitor to sign in and back', async ({ page }) => {
  await page.goto('/alertas/nueva');
  await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible();
  await expect(page).toHaveURL(/next=%2Falertas%2Fnueva/);
});

test('the form explains what is wrong before and after the server answers', async ({ page }) => {
  await page.goto('/registro');
  await page.getByLabel('Contraseña').fill('corta');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Usa al menos 8 caracteres.')).toBeVisible(); // client-side, no request

  await page.getByLabel('Usuario').fill('alguien');
  await page.getByLabel('Correo').fill('alguien@example.com');
  await page.getByLabel('Contraseña').fill('password123'); // long enough, but on Django's common-password list
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('alert').first()).toBeVisible(); // the server's validator, under the field
});

test('a user creates an alert, sees its preview, pauses it and deletes it', async ({ page }) => {
  await signUp(page);
  await page.getByRole('link', { name: 'Crear la primera' }).click();

  await page.getByLabel('Nombre').fill('Puentes caros');
  await page.getByLabel('Valores').fill('pu'); // too short for the keyword index
  await page.getByRole('button', { name: 'Crear alerta' }).click();
  await expect(page.getByText('Cada palabra necesita al menos 3 letras.')).toBeVisible();

  await page.getByLabel('Valores').fill('puente');
  await page.getByRole('button', { name: 'Agregar regla' }).click();
  await page.getByLabel('Tipo').nth(1).selectOption('amount');
  await page.getByLabel('Desde (pesos)').fill('$ 100.000.000');
  await page.getByPlaceholder('tu@correo.com').fill('yo@example.com');
  await page.getByRole('button', { name: 'Crear alerta' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Puentes caros');
  await expect(page.locator('app-contract-card')).toHaveCount(2); // the two bridges above $ 100 million

  await page.reload(); // the session comes back from the HttpOnly cookie; the token was only in memory
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Puentes caros');

  await page.getByRole('button', { name: 'Pausar' }).click();
  await expect(page.getByText('Pausada')).toBeVisible();

  await page.getByRole('button', { name: 'Borrar' }).click();
  await page.getByRole('button', { name: 'Sí, borrar' }).click();
  await expect(page.getByRole('heading', { name: 'Mis alertas' })).toBeVisible();
  await expect(page.getByText('Todavía no tienes alertas')).toBeVisible();
});

test('signing out ends the session for good', async ({ page }) => {
  await signUp(page);
  await page.getByRole('button', { name: 'Salir' }).click();
  await page.goto('/alertas');
  await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible();
});
