import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { workingApiPlugin } from './server/api';

export default defineConfig({
  plugins: [react(), workingApiPlugin()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('/three/') ? 'three' : undefined),
      },
    },
    chunkSizeWarningLimit: 650,
  },
});
