/// <reference types="vite/client" />

// 建置時由 vite.config.ts 的 define 注入
declare const __BUILD_TIME__: string;
declare const __GIT_COMMIT__: string;
