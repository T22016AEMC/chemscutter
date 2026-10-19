import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { getBuildInfo } from './scripts/build-info.mjs';

const buildInfo = getBuildInfo();

// GitHub Pages 子路徑部署：https://<user>.github.io/chemscutter/
export default defineConfig({
  base: '/chemscutter/',
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(buildInfo.buildTime),
    __GIT_COMMIT__: JSON.stringify(buildInfo.commit),
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['legacy/**', 'node_modules/**', 'dist/**'],
    testTimeout: 30000,
    // 精簡輸出：通過的測試只顯示點，失敗項目與最後摘要照常顯示
    reporters: ['dot'],
    coverage: {
      provider: 'v8',
      // 只統計引擎本身；legacy/ 與測試檔不列入
      include: ['src/engine/**/*.ts'],
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: 'coverage',
    },
  },
});
