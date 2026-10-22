# CheMScutter 計畫表（2026-10-22）

網站：https://t22016aemc.github.io/chemscutter/
程式碼：https://github.com/T22016AEMC/chemscutter

## 階段

已完成：
- 0 專案骨架、git、工作守則、舊碼放 legacy/
- 1a–1f 引擎重構：標準答案 591 個案例、共用模組、三平台引擎搬移與合併重複段落、移除新舊對照測試
- 1.5a 修正 m/z 43 乙醯基鎓誤套（Q15）、甲氧基與醚基判斷（Q5）
- 1.5b LC [M+Na]+ 納入胺甲酸酯；鹽類標準化（Q14）；帶電碎片以實際電荷計算（Q3）
- Q33 GC 中性單鍵碎片 structures 離子式修正（108 個案例，2026-10-21）
- 2a Web Worker 分析、RDKit WASM 資源路徑、首頁 SMILES 測試區與結果表格；移除舊版 README 的 AI Studio 連結（2026-10-21）
- 2b-1 Ketcher iframe、文字匯入、RDKit 驗證與多成分確認；上線問題 A、B 分別於 e750a47、0a97fd0 修正並部署驗證（2026-10-21）
- 測試產物忽略規則：9acd499；確認 test-results/ 沒有 Git 歷史，瀏覽器報告、截圖與快取不提交。
- 2b-2 PubChem 名稱查詢、最多五筆自行選擇、Ketcher 明確確認與模擬網路測試；保留文字直接分析及既有多成分確認（2026-10-21）。部署及正式站運作驗證結果見本階段回報。
- 2c 結果摘要、分頁候選表、排序篩選、SVG 分數圖與連動、縮放、完整詳情、可還原的離子式排版、Worker 可見列縮圖與程式圖示。欄位及效能紀錄見 docs/RESULTS_UI.md；部署驗證後回報並等待使用者確認。
- 2d 儀器參數表單、13 組範本、明確傳入表單預設、重新分析提示與參數快照、動態 Excel 匯出（D1 已處理，D2／D3 保留限制）。詳見 docs/PARAMETERS.md。
- 3 GitHub Pages 自動部署（提前執行），網站已上線

待做：
- 2e 依使用者實際操作意見修飾介面
- 4 圖片辨識（MolScribe），結果須經 Ketcher 讓使用者確認才計算；託管方式未定（Hugging Face 免費方案已不支援 Docker Spaces）
- 5 未來優化，依優先順序：Q32 永久帶電母體；使用者在畫面上驗證並處理需化學判斷的問題；RDKit 記憶體釋放（P1）；實測峰值上傳與候選比對；完整同位素分布；可分享結果的網址

目前停點：完成 2d 的檢查、推送、部署及正式站驗證後回報，等待使用者確認，不自行開始 2e。

## 環境
- Windows，Node.js v24，Git 2.56；gh CLI 已登入 T22016AEMC
- commit 作者信箱 t22016@aemc.com.tw（使用者確認公開）

## 技術紀錄
- 純前端靜態網站：React 19、Vite 8、TypeScript 7、Vitest 5、@rdkit/rdkit 2026.9.1（WASM）；無後端、無 AI API
- 推送 main 會自動執行 typecheck、test:clean、build，通過才部署（約 1 分鐘）；推送需使用者授權
- CI：checkout@v7、setup-node@v7（Node 24）、upload-pages-artifact@v5、deploy-pages@v5；若因 ubuntu-latest 轉 Ubuntu 26 出錯，改固定 runner 版本
- 首頁版本資訊由 scripts/build-info.mjs 注入（git 短雜湊、建置時間）
- RDKit MinimalLib 沒有 get_molformula() 與標準化方法；分子式由 get_json() 計算；鹽類標準化自行實作於 src/engine/chem/standardize.ts
- 標準答案 tests/golden/（591 個案例，由 npm run golden:generate 以新引擎產生，npm run golden:diff 檢查差異）；永久化學測試 tests/chemistry/；含 Worker 協定、輸入轉換、多成分確認、PubChem、結果顯示與繪圖測試共 1370 個
- 完成標準：npm run typecheck、npm run test:clean、npm run build 全部通過
- test:clean 會先刪除 Vitest 快取，因為 import.meta.glob 的檔案清單會被快取而造成測試假通過
- 2a 本機正式建置驗證：乙酸乙酯 CCOC(C)=O 三平台候選數依序為 TOF-SIMS 22、LC-MS/MS 13、GC-MS 11；空白、無效 SMILES 提示及錯誤後重試通過，瀏覽器無錯誤。推送後須在正式網址重做三平台運作驗證。
- 2b-1：子套件固定 Ketcher 三套件 3.18.0、React 18.3.1、events 3.3.0、Vite 8.3.4、TypeScript 7.0.2。CI 增加子套件 npm ci 與兩份 lockfile 快取；主站 typecheck、test:clean、build 順序維持不變，build 最後輸出子頁至 dist/ketcher/，仍部署同一份 Pages artifact。LICENSE、NOTICE 與第三方相依聲明隨子頁發布，不提交建置產物。主站 Vite 設定及相依版本不變。
- 2b-2 開工實測：PUG REST 名稱 CID 與 CID 屬性端點、瀏覽器跨來源 fetch 均成功；aspirin、IUPAC 名稱 2-acetyloxybenzoic acid、CAS 50-78-2 均得到 CID 2244，ethyl acetate 為 8857。myxalamid 以 name_type=word 回傳五筆；sodium benzoate（517055）的 SMILES 含多成分；中文阿斯匹靈及測試亂碼查無結果。使用 SMILES 欄位，沒有才退回 ConnectivitySMILES；不呼叫外部結構轉換服務。所有網路單元測試使用模擬 fetch。

## 引擎目錄
src/engine/：index.ts（入口 runMultiPlatformAnalysis）、types.ts、constants/masses.ts、rdkit/、chem/、rules/、platform/、platforms/（tofSims、lcMsMs、gcMs）、platforms/shared/、scoring/deduplicate
