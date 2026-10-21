import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  define: { global: 'globalThis' },
  resolve: { alias: [{ find: /^events$/, replacement: 'events/' }] },
  base: '/chemscutter/ketcher/',
  plugins: [react()],
  build: { outDir: '../../dist/ketcher', emptyOutDir: true }
});
