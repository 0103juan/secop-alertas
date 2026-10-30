import { expect, test } from '@playwright/test';

test('search finds contracts, keeps the query in the URL and opens one', async ({ page }) => {
  await page.goto('/contratos');
  await page.getByRole('searchbox').fill('puentes'); // plural: the search is Spanish full-text, so it finds "puente"
  await expect(page).toHaveURL(/q=puentes/);
  const cards = page.locator('app-contract-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText('puente');

  await page.getByRole('link', { name: 'Alcaldía de Ejemplo' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Alcaldía de Ejemplo');
  await expect(page.getByText(/DEMO\.\d{4}/)).toBeVisible(); // a SECOP-style id with dots resolves

  await page.goBack();
  await expect(page.getByRole('searchbox')).toHaveValue('puentes'); // the filter survives navigation
});

test('the value filter narrows the list', async ({ page }) => {
  await page.goto('/contratos?q=puente');
  await expect(page.locator('app-contract-card')).toHaveCount(3);
  await page.getByLabel('Valor').selectOption({ label: 'Desde $ 100 millones' });
  await expect(page.locator('app-contract-card')).toHaveCount(2);
});

test('the splitting reading shows the demo cluster with its contracts', async ({ page }) => {
  await page.goto('/lecturas/fraccionamiento');
  const cluster = page.locator('.cluster', { hasText: 'Constructora Demo SAS' });
  await expect(cluster).toContainText('en 3 contratos');
  await cluster.getByText('Ver los 3 contratos').click();
  await expect(cluster.getByRole('link')).toHaveCount(3);
});

test('the outlier reading puts the value far above its group first', async ({ page }) => {
  await page.goto('/lecturas/atipicos');
  await expect(page.locator('.item').first()).toContainText('equipos de cómputo');
});

test('an unknown route is a friendly 404 inside the app', async ({ page }) => {
  await page.goto('/no-existe');
  await expect(page.getByRole('heading', { name: 'Esta página no existe' })).toBeVisible();
});
