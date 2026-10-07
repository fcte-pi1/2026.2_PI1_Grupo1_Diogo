import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: ['testes/unit/**/*.test.{ts,tsx}', 'testes/componentes/**/*.test.{ts,tsx}'],
      setupFiles: ['testes/setup.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        reporter: ['text', 'html'],
        // RNF-47: cobertura mínima de 70 % em dominio/ e formatacao/.
        thresholds: {
          'src/dominio/**': { lines: 70, functions: 70, branches: 70, statements: 70 },
          'src/formatacao/**': { lines: 70, functions: 70, branches: 70, statements: 70 },
        },
      },
    },
  }),
);
