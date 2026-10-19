# CheMScutter

質譜候選碎片模擬器：輸入化學結構，預測其在 TOF-SIMS、LC-MS/MS、GC-MS 中可能出現的離子與碎片。

本專案是舊版（保留於 `legacy/` 供參考）的重建，採純前端架構：所有計算皆在瀏覽器內以 RDKit WASM 執行，部署於 GitHub Pages（路徑 `/chemscutter/`）。目前處於重建階段。

## 網站

https://t22016aemc.github.io/chemscutter/

推送到 `main` 會自動執行型別檢查、測試與建置，全部通過後部署到 GitHub Pages；任何一步失敗就不會更新網站。網站首頁底部顯示版本（git commit 短雜湊）與建置時間，可用來確認是否已更新到最新版本。

## 目錄結構

- `src/engine/`：化學計算引擎（純 TypeScript）
- `src/worker/`：Web Worker，於背景執行引擎
- `src/ui/`：React 介面元件
- `tests/`：Vitest 測試
- `legacy/`：舊版程式碼（唯讀參考）

## 本機開發

```bash
npm install        # 安裝套件
npm run dev        # 啟動開發伺服器
npm run typecheck  # 型別檢查
npm test           # 執行測試
npm run build      # 建置正式版本
npm run preview    # 預覽建置結果
```
