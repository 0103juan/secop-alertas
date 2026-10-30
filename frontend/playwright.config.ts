import { defineConfig, devices } from '@playwright/test';

// End to end against the real stack: Django serves the built client and the API on one origin, over a Postgres
// loaded with the fixed demo contracts (manage.py seed_demo). Nothing is mocked.
const PORT = 8799;
const DATABASE_URL = process.env['E2E_DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5434/alertas_e2e';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false, // one database; the tests share it
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /responsive/ },
  ],
  webServer: {
    command:
      'uv run python manage.py migrate -v0 && uv run python manage.py seed_demo && ' +
      `uv run python manage.py runserver ${PORT} --noreload`,
    cwd: '..',
    url: `http://localhost:${PORT}/readyz`,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    // Spread process.env: webServer.env replaces the environment, and without PATH there is no uv.
    env: { ...(process.env as Record<string, string>), DEBUG: '1', DATABASE_URL, ANON_RATE: '1000/min' },
  },
});
