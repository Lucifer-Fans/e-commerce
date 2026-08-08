import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
});
