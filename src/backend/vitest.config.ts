import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['testes/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // PostgreSQL real via Testcontainers: requer Docker no host (não roda dentro do container).
        test: {
          name: 'integracao',
          include: ['testes/integracao/**/*.test.ts'],
          environment: 'node',
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts'],
      reporter: ['text', 'html'],
      // RNF-53: cobertura mínima de 80 % nos módulos de validação e derivação.
      thresholds: {
        'src/dominio/**': { lines: 80, functions: 80, branches: 80, statements: 80 },
      },
    },
  },
});
