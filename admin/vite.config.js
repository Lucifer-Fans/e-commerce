import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174, open: false },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // MUI is large and stable — keeping it separate protects the browser cache.
          'mui-vendor': ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'],
          'data-vendor': ['@mui/x-data-grid', '@mui/x-charts'],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
});
