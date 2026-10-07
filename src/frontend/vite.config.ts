import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Em desenvolvimento, /api, /ws e /health são encaminhados ao backend (sem CORS).
// No Docker, VITE_PROXY_TARGET aponta para o serviço `backend`; fora dele, para localhost.
const alvo = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8080';
const usarPolling = process.env.CHOKIDAR_USEPOLLING === 'true';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Tipos do protocolo publicados pelo backend (arquitetura do frontend, §5.1).
      '@protocolo': fileURLToPath(new URL('../backend/protocolo/tipos.ts', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    watch: usarPolling ? { usePolling: true, interval: 300 } : undefined,
    // Permite servir ../backend/protocolo.
    fs: { allow: ['..'] },
    proxy: {
      '/api': { target: alvo, changeOrigin: true },
      '/health': { target: alvo, changeOrigin: true },
      '/ws': { target: alvo.replace(/^http/, 'ws'), ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
