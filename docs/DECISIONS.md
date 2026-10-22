# 修正決定紀錄（2026-10-20）

記錄已知問題的修正方式與使用者確認的化學判斷。

## 2e-1 結果篩選與匯出
- 離子類型使用原生核取方塊多選；匯出勾選以候選 id 保存，與詳情選取分開，篩選不隱性取消匯出項目。新分析重設全選，明示被篩選隱藏的勾選數。Excel 只含已勾選候選；原有參數、掃描能量與說明照實保存，掃描候選表也只列勾選的編號。
- 沿用 write-excel-file 4.1.1 的原生圖片功能，不新增或更換套件；SMILES 固定輸出，可選 PNG 延後載入。200 筆含圖約 1.76 MB，相較不含圖約 15.6 KB，因此預設不含圖；詳見 docs/PARAMETERS.md。
- 所謂 Excel 含其他平台資料為使用者誤會，無缺陷；不為此變更匯出內容。

## Q15 m/z 43 乙醯基鎓（已修正）
- 只在分子確實有 CH3-C(=O)- 時產生（SMARTS [CH3][CX3]=O），三平台統一；hasAcetate 收緊為 [CH3][CX3](=O)[OX2][#6]。
- 理由：環酮等沒有現成的 CH3-C=O 可切；m/z 43 的 C3H7+（43.0542）與 C2H3O+（43.0178）在高解析下可區分，誤標會讓使用者誤判樣品含乙醯基。原則：寧可漏報、不要誤報；日後依實測圖譜可再放寬。使用者原本不確定，接受規劃者建議。
- 結果：73/591 案例改變。移除 butyrophenone、cyclohexanone、testosterone、methyl_hexanoate 等的 m/z 43；新增 acetaminophen、n_methylacetamide 的 m/z 43。

## Q5 甲氧基與醚基（已修正）
- hasMethoxy：[CH3][OX2][#6]；hasEther：[#6;!$([#6]=[O,S,N])][OX2][#6;!$([#6]=[O,S,N])]；兩者獨立判斷。
- 結果：85/591 案例改變，多為標籤修正。

## LC [M+Na]+ 納入胺甲酸酯（已修正）
- 胺甲酸酯羰基氧可配位 Na+；ethyl_phenylcarbamate 恢復 [M+Na]+ 188.0682。醯胺是否納入列為 Q34。

## Q14 鹽類（已修正）
- 預設以中性母體分析。保留重原子最多的含碳成分，其餘視為抗衡離子移除；仿 RDKit Uncharger 中和；硝基與四級銨保留。
- 代價：不模擬鹽類特有離子（Na+、[M-H+2Na]+ 團簇）。
- parent 新增 input_smiles、removed_components、standardization_note。
- 結果：只有 sodium_benzoate 實質改變。

## Q3 帶電碎片（已修正）
- 碎片淨電荷不為 0 時，本身即為 [Frag]+ 或 [Frag]- 偶電子離子，以實際電荷計算離子式與 m/z，不再衍生 [Frag+H]+、[Frag]+.、[Frag-H]-。
- 結果：nitrobenzene 得到 C6H6NO+ 108.0444 與 HO- 17.0033；tetramethylammonium 得到 C3H10N+ 60.0808。
- 永久測試：全部標準答案的離子式不得有重複或矛盾的電荷符號，charge 須與離子式一致。

## Q33 GC 中性單鍵碎片離子式（已修正，2026-10-21）
- structures 的 formula 使用中性式加上 "+."，與既有自由基陽離子候選一致；本身帶電碎片的處理不變。
- 結果：108/591 個案例改變，全部是 GC-MS，僅 496 筆 structures.formula 補上 "+."；質量、電荷、分數與 candidates 均不變。
- 移除 LEGACY-QUIRK 註解與離子式測試的 Q33 豁免；每個差異均核對為上述 formula 變動。

## 重構原則
- 重構期間行為零改變，由 591 個標準答案把關；平台間「複製後各自演變的不一致」以明確參數保留並標註 LEGACY-QUIRK，修正階段才移除（先重構、後改行為）。
- 刻意的平台差異（各平台的分數、啟用條件、說明文字）保留。

## 延後
- Q32 永久帶電母體仍產生 [M+H]+
- Q34 LC [M+Na]+ 是否納入醯胺

## 架構與流程決定
- 2e-1 PubChem CAS 後備查詢：compound/name 回查無結果時，自動改用 substance/name/{name}/cids/JSON，將物質紀錄的 CID 去重後列出前五筆，始終由使用者選取並在 Ketcher 確認。兩種方式共用 500ms 間隔、二十秒總逾時、限流冷卻與記憶體快取，不改查詢結構的資料傳送範圍。進階關鍵字選項保留供英文名稱使用，CAS 不需手動切換。
- 2d：表單採舊版介面初始值，完整相關設定經 Worker 傳入既有引擎；只改表單預設，沒有修改引擎預設。13 組範本保留原值，包含 LC Generic／CID／20 eV、QQQ 的 ESI+／Both；手動切換游離方式才連動極性。數值步進為 TOF／EI 1、LC 5，起始值及全部範本均納入驗證。
- 使用者核准的例外：TOF／GC 分析器、TOF 通用／儀器感知標籤與 Hybrid Orbitrap-SIMS 皆以「僅記錄，不影響目前模擬」明示並納入結果與 Excel，列為 D3。LC 不放 CE 掃描開關，明示固定 10／25／40 eV；CID／HCD 在 QTOF、Orbitrap、QQQ 不一定改變候選。GC 條件文字以引擎回傳為準。
- 表單變更不自動分析，保留結果參數快照，顯示待重新分析提示。重新分析仍沿用已驗證及已確認的結構；結構改變則撤銷準備。未新增可選的 localStorage 記錄，減少狀態同步及資料保存範圍。
- Excel 採固定 write-excel-file 4.1.1（MIT），以動態模組匯入 universal 入口；read-excel-file 9.3.12 僅供測試讀回。選擇理由為相依較少、維護較新且安裝後 npm audit 零漏洞，避開 npm xlsx 舊版安全問題及 ExcelJS 較重相依。三工作表保存引擎原值，所有文字明確用字串儲存格，不建立公式。比較、參數對照與匯出細節見 docs/PARAMETERS.md。
- 2e-1 使用者決定取消圖片辨識（原階段 4），連帶不再需要後端與託管方案；取消 CFM-ID 對照，原因為需後端、授權不明、不適用 TOF-SIMS。取消項目不列為後續待辦。
- 2c 結果顯示只讀既有 AnalysisResult：以分頁候選表及自製 SVG 分數圖提供篩選、排序、縮放與選取連動，不新增套件，不修改引擎型別、化學邏輯或標準答案。縮圖透過延後建立的繪圖 Worker 呼叫既有 depiction，只為可見列繪製，使用 img data URL。欄位盤點、顯示取捨與量測方式見 docs/RESULTS_UI.md。
- 使用者確認：沒有獨立信心理由時明示「引擎未提供獨立信心理由」，僅列原始 explanation、mechanism、pathwayStatus；質量詳情列既有中性／離子質量、電荷及 m/z，只展示離子質量除以電荷絕對值，不重新計算化學質量。離子式顯示 +• 等排版，但保留各段原字串，以逐字還原驗證，不修改資料。
- 2c 效能驗證採 59 筆最大 golden 及 500 筆合成候選，表格每頁二十筆。LC／GC 的能量掃描直接顯示既有資料，保留 D2／Q20 行為並在畫面說明限制；信心、質量平衡及途徑標示不作二次化學判定。
- 2b-2 PubChem（2026-10-21）：使用瀏覽器直接 GET `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{encodedName}/cids/JSON?name_type=complete`，或由使用者明確選擇 `name_type=word` 名稱關鍵字模式；再用 `/rest/pug/compound/cid/{cids}/property/Title,IUPACName,MolecularFormula,SMILES,ConnectivitySMILES/JSON` 取得前五筆屬性。完整模式不暗中放寬成關鍵字，清單無論一筆或多筆都須自行選擇。正式名稱顯示 IUPACName，Title 為摘要名稱，連結由驗證過的 CID 組成固定 PubChem 網域。
- 依實際回應優先取 SMILES，缺少才退回 ConnectivitySMILES；例如 CID 5950 的 SMILES 含 `@@`，ConnectivitySMILES 不含立體標記。端點與兩種欄位語意已對照 [PubChem 官方說明](https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest)。實測 CORS 標頭為 `Access-Control-Allow-Origin: *`，本機瀏覽器跨來源 fetch 成功取得 CID 2244；不加後端、代理或套件。
- 名稱查詢只傳使用者輸入名稱，後續屬性查詢只傳 PubChem 回傳的 CID，不傳使用者繪圖、SMILES 或 Molfile。請求不帶認證、不送 referrer、不接受重新導向，使用 cache: no-store；資料僅以 React 文字顯示，不插入 HTML。查詢快取最多二十筆，只存在目前頁面的記憶體，不使用持久儲存。頁面清楚提示「請輸入英文名稱或 CAS 號」、資料來源及資料傳送範圍。
- 查詢到的結構只載入 Ketcher，不覆寫自行貼入的文字欄位，不送入 Worker。使用者須確認繪圖並按「從 Ketcher 取得結構並分析」，才能進入既有 RDKit 驗證與分析流程；多成分仍需第二次明確確認。重新選擇（包含相同 CID）會撤銷先前的分析準備並重新載圖。
- 依 [PubChem 請求限制](https://pubchem.ncbi.nlm.nih.gov/docs/dynamic-request-throttling) 保守限制請求至少間隔 500ms，同一時間只允許一筆名稱查詢，總逾時二十秒並用 AbortController 中止。HTTP 429／503 顯示暫時限流並至少冷卻三十秒，有可讀取的 Retry-After 則遵守較長時間；不自動重試。查無結果、格式異常、網路／離線與逾時分別顯示中文訊息。
- 2b-1 問題 B（使用者決定）：自行貼上的 SMILES／Molfile 可經 RDKit 驗證後直接分析，不必載入 Ketcher；以 Worker 產生的小結構圖顯示實際分析內容。Ketcher 為選用繪圖器，使用繪圖區內容的按鈕與文字直接分析分開標示。先在 Ketcher 確認才計算的要求，只適用於 PubChem 名稱查詢，因為查詢結果可能不是使用者想要的結構。所有路徑仍共用既有標準化與多成分明確確認，不更改化學規則。
- 直接分析保存原始文字送入既有引擎，保留 SMILES 縮寫／修復及格式回報行為；繪圖路徑維持原本 Molfile 轉 SMILES 的行為。兩者的驗證結果與錯誤狀態分開，文字分析不會被繪圖器載入或同步失敗阻擋。Ketcher 的 setMolecule 可能吞掉例外並發出 FAILURE，因此同步必須同時檢查該事件，失敗不得標為已同步。
- 2b-1 問題 A：Indigo 的未指定立體組態警告不作為 RDKit 解析失敗。輸入轉換僅攔截不支援的繪圖內容，再以既有 RDKit 解析、消毒及標準化流程驗證；不更改 SMILES 解析行為或化學規則。錯誤分為空白、無法解析、價鍵／消毒失敗、不支援內容、多成分及其他，附來源與原始訊息；重現輸入與證據見 docs/INPUT_FIXES.md。
- 階段 2b-1 採獨立子套件與 iframe：Ketcher 3.18.0 的 Miew 相依只宣告支援 React 18，故子套件固定使用 React 18.3.1 與三個 Ketcher 3.18.0 套件，維持自己的 lockfile；主站保留 React 19，不加 overrides。建置產物應由 CI 產生到 dist/ketcher/，不提交預先建置的二進位檔，以保留可重現建置與來源可追溯性。
- Ketcher iframe 保留官方英文介面；主站操作、確認與錯誤訊息採台灣繁體中文。日後若要將繪圖器繁中化，須另行評估翻譯維護成本。
- 多成分輸入不新增鹽類或混合物判斷，沿用既有標準化流程。分析前必須顯示 standardization_note、removed_components、保留成分的結構與 SMILES，說明「只會分析保留的成分」，取得明確確認後才分析。單一成分不增加此確認；若要分析另一成分，回 Ketcher 刪除其他成分後重新取得結構。此規則適用於所有輸入方式。
- 2b-1 相容性檢查（2026-10-21）：子套件以 TypeScript 7.0.2 型別檢查及 Vite 8.3.4 建置通過；本機瀏覽器初始化失敗，錯誤為 EventEmitter is not a constructor。Vite 將 ketcher-core 使用的 events 外部化；依停止條件暫停，尚未加入瀏覽器 events 實作或調整 CI，未推送。
- 使用者核准僅在子套件加入 events 3.3.0（固定版本及 lockfile），並以 Vite 別名 events → events/ 供應瀏覽器 EventEmitter；主站不加別名、overrides 或降版。安裝前已查核 npm：維護者為 gozala、goto-bus-stop、defunctzombie，官方說明確認用於瀏覽器及 Browserify；2026-10-12 至 2026-10-18 下載量為 56,745,375，授權 MIT。
- 加入 events 後子套件型別檢查與正式建置通過，events 外部化警告消失；瀏覽器接著因 Ketcher 寫入 global.currentState 而出現 ReferenceError: global is not defined，畫面仍空白。依停止條件再次暫停，尚未加入 global 相容設定或其他補丁。此輪建置未再報告 buffer、process、util 外部化；後續執行路徑因初始化失敗而尚無法驗證，不宣稱已排除所有相容性問題。
- Ketcher 來源映射中的 global 用途包括 currentState、localStorage、FileReader、ActiveXObject 與 Blob。經使用者核准，僅在子套件使用 Vite define 將 global 對應 globalThis，不新增套件。正式建置的本機瀏覽器已能匯入 SMILES／Molfile、顯示結構與縮放，無 console 錯誤或警告；沒有再加入 Node 補丁。若後續出現其他 Node 環境缺失，停止補丁並評估官方預建 standalone，不自行切換。
- 子頁產物約 30.752 MB（十進位）：主 chunk 28.845 MB，另外兩個動態 chunk 約 1.221 MB、0.425 MB，lodash 約 0.079 MB，CSS 約 0.181 MB。最大來源為 standalone 內嵌 Worker 的 Base64 約 21.158 MB，其中含二次編碼的 Indigo WASM（原始 11.803 MB）；這些是同一份資料的不同表示大小，不可相加。未輸出獨立字型或 WASM 檔案，未做資源縮減。若未來要評估改用套件的 binaryWasm 入口減少 Base64 膨脹，須另行驗證功能與資源路徑，本階段不變更。
- 2b-1 繪圖路徑的確認邊界（B 之後文字可直接分析）：iframe 只在開啟繪圖區後建立，雙向 postMessage 檢查 origin、source 與型別。繪圖區已開啟時文字會同步到 Ketcher；使用者取得繪圖結構後，Worker 以 RDKit 轉換 Molfile、呼叫既有標準化並保存準備編號。所有路徑的多成分都必須帶明確確認才能分析，修改輸入會撤銷相對應的舊準備；單一成分直接沿用分析流程。保留成分以 RDKit 產生的圖片顯示，不插入 HTML。三平台單元測試逐欄比較轉換後完整結果與 2a 相同 SMILES 的結果。
- 子套件建置後附上固定官方版本的 LICENSE、NOTICE，以及 lockfile 正式相依的授權原文與聲明；這些文字隨同一份 GitHub Pages artifact 發布。CI 只增加子套件安裝與建置，不改變部署架構。
- 階段 2a：首頁以 module Worker 呼叫 runMultiPlatformAnalysis；RDKit WASM 由 Vite 匯入資源網址並透過 locateFile 載入，沿用 /chemscutter/ base。介面顯示既有參數，D1、D2 留待後續階段處理；不新增套件。
- 標準答案換行固定為 LF：.gitattributes 僅對 tests/golden/ 設定 text eol=lf，避免 Windows 檢出為 CRLF 造成逐位元組差異；golden:diff 比對腳本保持不變。
- 純前端靜態網站，無後端、無 AI API；結構輸入用 Ketcher、名稱查詢用 PubChem。
- 介面台灣繁體中文；實驗室使用，先全公開測試
- 部署（階段 3）提前於階段 2 執行，讓每次推送都能在正式網址驗證（使用者 2026-10-20 前一日要求先上線）
- 化學正確性由使用者驗證；開發者只做運作驗證；有疑問先問使用者
