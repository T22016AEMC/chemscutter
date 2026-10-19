import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages 子路徑部署：https://<user>.github.io/chemscutter/
export default defineConfig({
  base: '/chemscutter/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['legacy/**', 'node_modules/**', 'dist/**'],
    testTimeout: 30000,
  },
});
