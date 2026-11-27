import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: { port: 5173 },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        studio: resolve(__dirname, 'studio/index.html'),
        notes: resolve(__dirname, 'notes/index.html'),
        gate: resolve(__dirname, 'gate.html')
      }
    }
  }
});
