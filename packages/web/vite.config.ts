import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env['VITE_API_URL'] ?? 'http://localhost:4000',
        changeOrigin: true,
      },
      '/trpc': {
        target: process.env['VITE_API_URL'] ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
