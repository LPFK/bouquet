import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any static host or subfolder.
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: true,
  },
});
