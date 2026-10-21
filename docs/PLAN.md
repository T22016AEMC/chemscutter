# CheMScutter 計畫表（2026-10-20）

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
- 3 GitHub Pages 自動部署（提前執行），網站已上線

待做：
- 2b-1 上線修正：A 已於 e750a47 部署，移除 Indigo 未指定立體組態的誤攔截，補錯誤分類、原始訊息與橋環／稠環往返測試。B 新增不依賴 Ketcher 的文字直接分析、RDKit 小結構圖與欄位錯誤，保留所有路徑的多成分明確確認；A、B 各自提交並部署，完成後仍等待使用者確認，不開始 2b-2。
- 2b 結構輸入：2b-1 已實作 Ketcher 延後載入 iframe、SMILES／Molfile 同步、RDKit 輸入驗證與多成分明確確認（2026-10-21）；子套件 React 18 與主站 React 19 隔離。本機繪圖器匯入與縮放通過；完成檢查後推送，再驗證正式網站。2b-2 PubChem 名稱查詢須待使用者確認，不得自行開始。
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
- 標準答案 tests/golden/（591 個案例，由 npm run golden:generate 以新引擎產生，npm run golden:diff 檢查差異）；永久化學測試 tests/chemistry/；含 Worker 協定、輸入轉換與多成分確認測試共 1291 個
- 完成標準：npm run typecheck、npm run test:clean、npm run build 全部通過
- test:clean 會先刪除 Vitest 快取，因為 import.meta.glob 的檔案清單會被快取而造成測試假通過
- 2a 本機正式建置驗證：乙酸乙酯 CCOC(C)=O 三平台候選數依序為 TOF-SIMS 22、LC-MS/MS 13、GC-MS 11；空白、無效 SMILES 提示及錯誤後重試通過，瀏覽器無錯誤。推送後須在正式網址重做三平台運作驗證。
- 2b-1：子套件固定 Ketcher 三套件 3.18.0、React 18.3.1、events 3.3.0、Vite 8.3.4、TypeScript 7.0.2。CI 增加子套件 npm ci 與兩份 lockfile 快取；主站 typecheck、test:clean、build 順序維持不變，build 最後輸出子頁至 dist/ketcher/，仍部署同一份 Pages artifact。LICENSE、NOTICE 與第三方相依聲明隨子頁發布，不提交建置產物。主站 Vite 設定及相依版本不變。

## 引擎目錄
src/engine/：index.ts（入口 runMultiPlatformAnalysis）、types.ts、constants/masses.ts、rdkit/、chem/、rules/、platform/、platforms/（tofSims、lcMsMs、gcMs）、platforms/shared/、scoring/deduplicate
