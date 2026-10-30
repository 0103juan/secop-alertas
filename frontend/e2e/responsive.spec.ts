import { expect, test } from '@playwright/test';

for (const path of ['/contratos', '/lecturas/fraccionamiento', '/lecturas/atipicos', '/registro']) {
  test(`${path} fits a phone without sideways scrolling`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
