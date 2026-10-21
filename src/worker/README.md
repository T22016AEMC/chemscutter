# src/worker/

Web Worker，負責在背景執行緒呼叫 `src/engine/`，避免計算阻塞介面。

- `client.ts`：由介面建立 Vite module Worker。
- `protocol.ts`：要求包含編號、SMILES 與平台；回應帶回同一編號與結果或錯誤。
- `analysis.worker.ts`：透過 Vite 的 WASM 資源網址與 loader 的 `locateFile` 初始化 RDKit，支援 `/chemscutter/` 部署路徑。
- `handleAnalysis.ts`：驗證訊息並呼叫引擎；使用現有平台預設，不修改化學規則。
