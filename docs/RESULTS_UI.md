# 階段 2c 結果畫面

## 使用的資料

所有資料只讀；不修改 AnalysisResult 型別、引擎輸出或化學規則。

| 範圍 | 使用欄位 | 用途 |
| --- | --- | --- |
| AnalysisResult | technique、simulationConfig、simulationModeLabel、parameterContext、activeRegimeDescription、disclaimer | 結果標題、此次分析的參數快照與引擎說明 |
| parent | smiles、input_smiles、formula、exact_mass、standardization_note、removed_components | 標準化後母分子摘要；2d 匯出同時保存輸入 SMILES |
| candidates | id、technique、polarity、mz、formula、ionType、heuristicScore、confidence、priority、sourceRule | 表格、篩選、排序、分組、棒狀圖及連動 |
| candidates | explanation、mechanism、fragmentationPathway、pathwayStatus | 說明及詳情；不據此新增信心理由 |
| candidates | neutralFormula、exactMass、neutralExactMass、ionExactMass、charge、precursorMz | 詳情中的既有質量與電荷；只展示 ionExactMass / abs(charge)，不重算化學質量 |
| candidates | massBalanceError、massBalanceVerified、neutralLoss、neutralLossMass、parameterContext | 原始質量平衡、中性丟失與參數情境 |
| candidates | smiles、canonicalSmiles、parentStructureId | Worker 結構繪圖、文字詳情及關聯結構名稱 |
| structures | id、name | 依 parentStructureId 找關聯名稱，不依公式或質量猜測關聯 |
| sweepResults | parameterValue、parameterLabel、regimeSummary、topCandidates 的全部欄位 | CE／EE 掃描的可展開表格 |

未使用：signals（不重複建立另一份候選）、candidates.image（改以可見列的原有 SMILES 在 Worker 繪圖）、structures 除 id／name 外的欄位、parent.detected_format／compound_name／original_image／detected_groups／negative_path_enabled／fragmentation_theories。沒有要求引擎增加任何欄位。

## 顯示決定

- 表格每頁二十筆，只有頁面上實際可見的縮圖才啟動繪圖請求；結果卸載時結束繪圖 Worker。相同 SMILES 在此次結果內共用圖片，分頁不重新分析。
- 圖表以 SVG 自行實作，不新增套件；正、負離子上下分圖，以標題及實線／虛線區分。使用藍色與橙色，選取以黑色粗線、圓點及表格外框標示。
- 棒高使用既有 heuristicScore；缺少分數時表格標示未提供，圖表不補上數值。固定 0–100 分數軸，明示「分數為啟發式可信度，不是訊號強度」。
- 最高分的標籤最多五個，依圖表水平距離留白；標籤顯示 m/z，滑鼠／鍵盤焦點提示保留離子式與分數。不合併相同 m/z 的候選；重疊棒仍可透過表格或鍵盤個別選取。
- 詳情顯示「引擎未提供獨立信心理由」，列出既有說明、機制與途徑狀態。質量平衡的 true／false／缺值分別顯示，不重新驗證，也不把缺值當成失敗。
- 表格 m/z 四位小數；詳情的質量、電荷及 m/z 保留 JavaScript 數值的原始文字精度。
- 離子式分段保存 raw；顯示下標、電荷上標及自由基圓點，還原 raw 必須與原始字串逐字相同。保留同位素與其他註記，不推斷 Q7 的多電荷歧義。
- LC 直接顯示引擎既有 CE 掃描；不修 D2 或 Q20，不把掃描誤稱為每個 CE 重新碎裂，不用掃描的相對可能性取代主表分數。
- 圖示由唯讀參考檔複製至 public，保留原檔；沒有引入舊版程式碼。發布圖示沿用部署 base。

## 運作與效能驗證方式

- 純函式測試涵蓋排序、組合篩選、極性、座標、範圍與標籤間距。所有 591 個 golden 的母分子、候選、訊號及結構式均檢查格式化後可逐字還原。
- 瀏覽器效能頁使用正式壓縮建置的相同 ResultsView，載入候選最多的 methionine／TOF-SIMS／Bi3+ 30 keV golden（59 筆），並複製為五百筆獨立識別碼的合成資料。合成資料僅測效能，不視為化學結果，不寫入 golden。
- 最後三次量測中位數：59 筆 React 提交約 6 ms、提交至兩個動畫影格約 21 ms；500 筆約 8 ms／30 ms。兩種資料量的表格均只掛載二十列；500 筆為二十五頁。數值不含分析引擎與縮圖 WASM 首次下載；瀏覽器暖機及系統負載會造成波動，原始量測另存於驗證產物。
- 首次互動的比較指標為「導覽起至可操作的直接分析按鈕出現後兩個動畫影格」，使用本機相同瀏覽器、無節流、交錯測試修改前後各三次；不是 Lighthouse TTI 或 INP。中位數約 99 ms → 99 ms，差異在量測波動內。
- 主頁 JS 約 242 kB → 258 kB（gzip 約 77 kB → 82 kB）；繪圖 Worker 約 65 kB，只有可見結構需要時才建立，RDKit WASM 沿用同一個 Vite 資源網址。
- 390px iframe 視窗中，內容視寬與頁面寬度均為 375px（扣除瀏覽器捲軸），表格在寬 317px 的容器內捲動，未溢出整頁。截圖、測試頁與原始量測保存在已忽略的 test-results/，不提交。

2c 已完成部署及正式站三平台驗證；驗證結果另於該階段回報列出。

## 階段 2d

- 儀器參數表單獨立於結果；舊結果保留該次 simulationConfig，參數改變只顯示待重新分析提示。摘要與 Excel 共用中文參數標籤及「僅記錄，不影響目前模擬」說明，不增加引擎欄位。
- 新增延後載入的 Excel 匯出，預設全部候選，可選目前篩選結果；保存原始離子式、數值精度、母分子、參數與既有掃描。完整對照與安全處理見 docs/PARAMETERS.md。
- 2d 主頁 JS 約 267.64 kB（gzip 85.34 kB），相較 2c 約增加 9.36 kB（gzip 2.99 kB）；Excel 匯出 chunk 約 72.82 kB（gzip 21.13 kB），不在首頁首次載入。

## 階段 2e-1

- 離子類型改為原生核取方塊多選，預設全部；可全選或清除，已選類型以文字列出。與文字、最低分數、極性共同篩選，同步更新排序、分頁及棒狀圖，不重新執行引擎。
- 匯出勾選以候選 id 保存，排序、分頁與篩選不重設；重新分析後全選。畫面列出已勾選及被篩選隱藏的筆數；選取目前篩選結果會取代舊勾選。Excel 只匯出勾選項目，參數工作表記錄匯出及分析總筆數。
- Excel 固定保存 SMILES 與缺少結構的原因，另可選擇延後載入的 PNG 圖片匯出，預設關閉；尺寸及 200 筆量測見 docs/PARAMETERS.md。
