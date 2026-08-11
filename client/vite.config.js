import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import seoHtml from './plugins/seoHtml';

export default defineConfig(({ mode }) => ({
  // `''` prefix: the plugin runs in Node at build time, so it reads the raw file
  // rather than the VITE_-only subset that gets inlined into the bundle.
  plugins: [react(), seoHtml(loadEnv(mode, process.cwd(), ''))],
  server: { port: 5173, open: false },
  build: {
    // Split the heavy, rarely-changing libraries out of the app bundle so a code
    // change doesn't invalidate the vendor chunk in the browser cache.
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'state-vendor': ['@reduxjs/toolkit', 'react-redux', 'axios'],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
}));
