import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Em desenvolvimento, as chamadas para /api vão para o backend.
    proxy: { '/api': process.env.API_URL || 'http://localhost:3001' },
  },
});
