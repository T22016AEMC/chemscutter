# 修正決定紀錄（2026-10-20）

記錄已知問題的修正方式與使用者確認的化學判斷。

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
- 階段 2b-1 採獨立子套件與 iframe：Ketcher 3.18.0 的 Miew 相依只宣告支援 React 18，故子套件固定使用 React 18.3.1 與三個 Ketcher 3.18.0 套件，維持自己的 lockfile；主站保留 React 19，不加 overrides。建置產物應由 CI 產生到 dist/ketcher/，不提交預先建置的二進位檔，以保留可重現建置與來源可追溯性。
- Ketcher iframe 保留官方英文介面；主站操作、確認與錯誤訊息採台灣繁體中文。日後若要將繪圖器繁中化，須另行評估翻譯維護成本。
- 多成分輸入不新增鹽類或混合物判斷，沿用既有標準化流程。分析前必須顯示 standardization_note、removed_components、保留成分的結構與 SMILES，說明「只會分析保留的成分」，取得明確確認後才分析。單一成分不增加此確認；若要分析另一成分，回 Ketcher 刪除其他成分後重新取得結構。此規則適用於所有輸入方式。
- 2b-1 相容性檢查（2026-10-21）：子套件以 TypeScript 7.0.2 型別檢查及 Vite 8.3.4 建置通過；本機瀏覽器初始化失敗，錯誤為 EventEmitter is not a constructor。Vite 將 ketcher-core 使用的 events 外部化；依停止條件暫停，尚未加入瀏覽器 events 實作或調整 CI，未推送。
- 使用者核准僅在子套件加入 events 3.3.0（固定版本及 lockfile），並以 Vite 別名 events → events/ 供應瀏覽器 EventEmitter；主站不加別名、overrides 或降版。安裝前已查核 npm：維護者為 gozala、goto-bus-stop、defunctzombie，官方說明確認用於瀏覽器及 Browserify；2026-10-12 至 2026-10-18 下載量為 56,745,375，授權 MIT。
- 加入 events 後子套件型別檢查與正式建置通過，events 外部化警告消失；瀏覽器接著因 Ketcher 寫入 global.currentState 而出現 ReferenceError: global is not defined，畫面仍空白。依停止條件再次暫停，尚未加入 global 相容設定或其他補丁。此輪建置未再報告 buffer、process、util 外部化；後續執行路徑因初始化失敗而尚無法驗證，不宣稱已排除所有相容性問題。
- Ketcher 來源映射中的 global 用途包括 currentState、localStorage、FileReader、ActiveXObject 與 Blob。經使用者核准，僅在子套件使用 Vite define 將 global 對應 globalThis，不新增套件。正式建置的本機瀏覽器已能匯入 SMILES／Molfile、顯示結構與縮放，無 console 錯誤或警告；沒有再加入 Node 補丁。若後續出現其他 Node 環境缺失，停止補丁並評估官方預建 standalone，不自行切換。
- 子頁產物約 30.752 MB（十進位）：主 chunk 28.845 MB，另外兩個動態 chunk 約 1.221 MB、0.425 MB，lodash 約 0.079 MB，CSS 約 0.181 MB。最大來源為 standalone 內嵌 Worker 的 Base64 約 21.158 MB，其中含二次編碼的 Indigo WASM（原始 11.803 MB）；這些是同一份資料的不同表示大小，不可相加。未輸出獨立字型或 WASM 檔案，未做資源縮減。若未來要評估改用套件的 binaryWasm 入口減少 Base64 膨脹，須另行驗證功能與資源路徑，本階段不變更。
- 2b-1 確認邊界：iframe 只在開啟繪圖區後建立，雙向 postMessage 檢查 origin、source 與型別。文字先同步到 Ketcher；使用者取得結構後，Worker 以 RDKit 轉換 Molfile、呼叫既有標準化並保存準備編號。多成分必須帶明確確認才能分析，編輯會撤銷舊準備；單一成分直接沿用分析流程。保留成分以 RDKit 產生的圖片顯示，不插入 HTML。三平台單元測試逐欄比較轉換後完整結果與 2a 相同 SMILES 的結果。
- 子套件建置後附上固定官方版本的 LICENSE、NOTICE，以及 lockfile 正式相依的授權原文與聲明；這些文字隨同一份 GitHub Pages artifact 發布。CI 只增加子套件安裝與建置，不改變部署架構。
- 階段 2a：首頁以 module Worker 呼叫 runMultiPlatformAnalysis；RDKit WASM 由 Vite 匯入資源網址並透過 locateFile 載入，沿用 /chemscutter/ base。介面顯示既有參數，D1、D2 留待後續階段處理；不新增套件。
- 標準答案換行固定為 LF：.gitattributes 僅對 tests/golden/ 設定 text eol=lf，避免 Windows 檢出為 CRLF 造成逐位元組差異；golden:diff 比對腳本保持不變。
- 純前端靜態網站，無後端、無 AI API；結構輸入用 Ketcher、名稱查詢用 PubChem；圖片辨識延後到階段 4
- 介面台灣繁體中文；實驗室使用，先全公開測試
- 部署（階段 3）提前於階段 2 執行，讓每次推送都能在正式網址驗證（使用者 2026-10-20 前一日要求先上線）
- 化學正確性由使用者驗證；開發者只做運作驗證；有疑問先問使用者
