import { defineConfig, devices } from '@playwright/test';

const PORTA = Number(process.env['E2E_PORTA'] ?? 5173);
/** Para apontar os testes para um painel já publicado (ex.: o build servido pelo backend). */
const URL_EXTERNA = process.env['E2E_URL'];
const URL_BASE = URL_EXTERNA ?? `http://localhost:${PORTA}`;

/**
 * E2E do painel: o navegador roda o painel de verdade, e o backend é simulado na rede
 * (`page.route` para HTTP e `page.routeWebSocket` para o /ws/painel). Os arquivos são
 * `*.e2e.ts`, para o Vitest não os executar como testes unitários.
 */
export default defineConfig({
  testDir: './testes/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: URL_BASE,
    locale: 'pt-BR',
    // As datas do histórico são exibidas no horário local: fixar o fuso deixa o teste estável.
    timezoneId: 'America/Sao_Paulo',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(URL_EXTERNA === undefined && {
    webServer: {
      command: `npm run dev -- --port ${PORTA} --strictPort`,
      url: URL_BASE,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  }),
});
