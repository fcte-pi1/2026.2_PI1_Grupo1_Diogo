import { defineConfig, devices } from '@playwright/test';

// Testes ponta a ponta contra backend + simulador (RNF-45, RNF-53).
// Rodar com o ambiente de pé: `docker compose up` na raiz e `npm run test:e2e`.
export default defineConfig({
  testDir: 'testes/e2e',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
