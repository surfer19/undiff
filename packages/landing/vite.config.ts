import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    server: {
      port: 3000,
    },
    build: {
      outDir: 'dist',
    },
    plugins: [
      {
        name: 'html-env-replace',
        transformIndexHtml(html) {
          return html
            .replace(/__VITE_SUPABASE_URL__/g, env.VITE_SUPABASE_URL || '')
            .replace(/__VITE_SUPABASE_ANON_KEY__/g, env.VITE_SUPABASE_ANON_KEY || '');
        },
      },
    ],
  };
});