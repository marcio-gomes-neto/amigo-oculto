import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Usa a mesma porta da API configurada em backend/.env (PORT), para não precisar configurar duas vezes.
  const backendEnv = loadEnv(mode, fileURLToPath(new URL('../backend', import.meta.url)), '');
  const apiUrl = process.env.API_URL || `http://localhost:${backendEnv.PORT || 3001}`;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // `npm start` abre o navegador automaticamente.
      open: process.env.OPEN_BROWSER === 'true',
      // Em desenvolvimento, as chamadas para /api vão para o backend.
      proxy: { '/api': apiUrl },
    },
  };
});
