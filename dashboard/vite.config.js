import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    react(),

    legacy({
      targets: [
        'iOS >= 10',
        'Safari >= 10',
      ],

      // Добавляет полифиллы для старого Safari
      modernPolyfills: true,

      additionalLegacyPolyfills: [
        'regenerator-runtime/runtime',
      ],
    }),
  ],

  build: {
    target: 'es2015',
    sourcemap: false,
  },

  server: {
    port: 5173,

    proxy: {
      '/api': 'http://127.0.0.1:3847',
      '/backend-api': {
        target: 'http://127.0.0.1:3847',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/backend-api/, '/api'),
      },
      '/ws': {
        target: 'ws://127.0.0.1:3847',
        ws: true,
      },
    },
  },
});