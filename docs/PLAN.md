# CheMScutter 計畫表（2026-10-20）

網站：https://t22016aemc.github.io/chemscutter/
程式碼：https://github.com/T22016AEMC/chemscutter

## 階段

已完成：
- 0 專案骨架、git、工作守則、舊碼放 legacy/
- 1a–1f 引擎重構：標準答案 591 個案例、共用模組、三平台引擎搬移與合併重複段落、移除新舊對照測試
- 1.5a 修正 m/z 43 乙醯基鎓誤套（Q15）、甲氧基與醚基判斷（Q5）
- 1.5b LC [M+Na]+ 納入胺甲酸酯；鹽類標準化（Q14）；帶電碎片以實際電荷計算（Q3）
- 3 GitHub Pages 自動部署（提前執行），網站已上線，目前只有「重建中」首頁

待做：
- 2a 引擎在瀏覽器 Web Worker 執行，在正式網址驗證 RDKit WASM 可載入；首頁加 SMILES 測試區（輸入 SMILES、選平台、顯示候選碎片純文字表格）；順手修 Q33；移除 legacy/README.md 中的 AI Studio 連結
- 2b 結構輸入：Ketcher 繪圖器、SMILES／Molfile 貼上、PubChem 名稱查詢（Ketcher 與 Vite／React 版本相容性是主要風險，需放慢檢查）
- 2c 結果畫面：質譜圖、候選表、篩選排序、結構圖；加入程式圖示（legacy/public/chemscutter_icon.jpg）
- 2d 儀器參數表單、Excel 匯出、預設值統一（D1）
- 2e 依使用者實際操作意見修飾介面
- 4 圖片辨識（MolScribe），結果須經 Ketcher 讓使用者確認才計算；託管方式未定（Hugging Face 免費方案已不支援 Docker Spaces）
- 5 未來優化，依優先順序：Q32 永久帶電母體；使用者在畫面上驗證並處理需化學判斷的問題；RDKit 記憶體釋放（P1）；實測峰值上傳與候選比對；完整同位素分布；CFM-ID 對照（授權待確認）；可分享結果的網址

## 環境
- Windows，Node.js v24，Git 2.56；gh CLI 已登入 T22016AEMC
- commit 作者信箱 t22016@aemc.com.tw（使用者確認公開）

## 技術紀錄
- 純前端靜態網站：React 19、Vite 8、TypeScript 7、Vitest 5、@rdkit/rdkit 2026.9.1（WASM）；無後端、無 AI API
- 推送 main 會自動執行 typecheck、test:clean、build，通過才部署（約 1 分鐘）；推送需使用者授權
- CI：checkout@v7、setup-node@v7（Node 24）、upload-pages-artifact@v5、deploy-pages@v5；若因 ubuntu-latest 轉 Ubuntu 26 出錯，改固定 runner 版本
- 首頁版本資訊由 scripts/build-info.mjs 注入（git 短雜湊、建置時間）
- RDKit MinimalLib 沒有 get_molformula() 與標準化方法；分子式由 get_json() 計算；鹽類標準化自行實作於 src/engine/chem/standardize.ts
- 標準答案 tests/golden/（591 個案例，由 npm run golden:generate 以新引擎產生，npm run golden:diff 檢查差異）；永久化學測試 tests/chemistry/；測試共 1230 個
- 完成標準：npm run typecheck、npm run test:clean、npm run build 全部通過
- test:clean 會先刪除 Vitest 快取，因為 import.meta.glob 的檔案清單會被快取而造成測試假通過

## 引擎目錄
src/engine/：index.ts（入口 runMultiPlatformAnalysis）、types.ts、constants/masses.ts、rdkit/、chem/、rules/、platform/、platforms/（tofSims、lcMsMs、gcMs）、platforms/shared/、scoring/deduplicate
