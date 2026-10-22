# 儀器參數與 Excel 匯出（階段 2d）

表單讀取現有的 13 組 INSTRUMENT_PROFILES，不匯入 legacy。所有相關設定明確傳入 Worker，再交給既有引擎；引擎預設、型別、規則與 golden 均未修改。數值空白、超出範圍或不符合步進時顯示錯誤，不替換成其他值。

## 舊版參數對照

| 舊版操作 | 傳入 SimulationConfig 欄位 | 目前作用與保留差異 |
| --- | --- | --- |
| 技術卡片 | technique | 路由至三平台引擎；切換平台載入該平台的表單初始設定，不自動重算 |
| TOF 離子極性 | polarity | 控制候選極性；既有 Q24 的 structures 極性問題保留 |
| TOF 主要轟擊離子（全部九項） | primaryIon | 影響既有參數情境與評分／候選路徑；Generic 為通用設定 |
| TOF 離子束能量 | primaryIonEnergy | 2–60 keV、步進 1；影響既有能量區間，不保證每個數值都產生不同結果 |
| TOF 分析器 TOF／Hybrid Orbitrap-SIMS | analyzer（TOF／Orbitrap） | **僅記錄，不影響目前模擬**；不另推論解析度效果，列為 D3 |
| TOF 通用／儀器感知模式 | simulationMode | 隨 Generic／其他主要離子連動；此顯示標籤**僅記錄，不影響目前模擬** |
| LC Auto／ESI+／ESI-／APCI+／APCI- | ionization、polarity | 手動選帶 +／- 的方式時連動極性；Auto 保留當前極性；載入範本不覆寫其原本極性 |
| LC 分析器 | analyzer | QTOF、Orbitrap、Triple Quadrupole 走既有束流型判斷；Ion Trap 有低質量截止等差異。增加 Generic 選項以完整保存通用範本 |
| LC CID／HCD | fragmentationMethod | 依既有分析器判斷使用；前三種束流型分析器切換時不一定改變候選，表單明示 |
| LC 碰撞能量 | collisionEnergy、collisionEnergyUnit | 5–100 eV、步進 5；沿用引擎能量區間與評分 |
| LC 啟用碰撞能量梯度掃描 | collisionEnergyRange | 沒有停用方式，不提供開關；固定傳入 start 10、end 40、step 15，明示掃描 10／25／40 eV，保留 D2／Q20 |
| GC EI／CI | ionization | 使用既有 EI 或 CI 分支 |
| GC 電子能量 | electronEnergy | EI 時顯示，12–100 eV、步進 1；CI 時保留但不使用此數值 |
| GC 甲烷／異丁烷／氨氣 | reagentGas | CI 時顯示，使用既有反應氣分支；EI 時保留但不使用 |
| GC 單四極桿／TOF／Orbitrap | analyzer | **僅記錄，不影響目前模擬**，列為 D3 |
| GC 條件說明 | activeRegimeDescription（結果） | 只顯示引擎回傳文字，不採用舊版靜態說明 |
| 13 組預設配置範本 | 各 profile.defaultConfig | 五組 TOF、五組 LC、三組 GC；LC Generic 保留 Generic／CID／20 eV；QQQ 保留 ESI+／Both 並明示；前驅加合物有原值時完整保留 |
| 恢復預設值 | 表單完整設定 | TOF Both／Generic／25 keV／TOF／General；LC Auto／Both／QTOF／CID／25 eV；GC EI／70 eV／Quadrupole |

舊版載入範本會混入先前表單的額外欄位；新版從該平台初始設定套用範本，避免留下其他平台的參數。這只改介面傳入設定，不更改範本原值或引擎預設。兩種 GC 能量／反應氣設定均在快照保留，實際使用哪個由 EI／CI 決定。

## 結果快照與重新分析

- 表單與結果參數分離。變更任一參數或技術後顯示「參數已變更，結果尚未更新」，按「重新分析」才呼叫引擎。結果摘要與匯出始終讀取該次結果的 simulationConfig。
- 重新分析沿用已驗證的結構與多成分確認，不會因變更參數跳過尚未完成的多成分確認。修改結構仍撤銷舊準備及結果。
- 未新增 localStorage 儲存；重新整理恢復預設。沒有持久儲存結構或查詢資料，沒有 localStorage 的瀏覽器也可使用。
- PubChem CID／名稱另存於該次介面結果的來源快照，不增加引擎欄位。文字直接分析不附上另一個繪圖查詢的 CID；編輯查詢載入的繪圖後清除來源標示。

## Excel 套件比較與安全

2026-10-22 查詢 npm 官方資料；以下大小為套件解壓大小，**不是瀏覽器下載量**。

| 選項 | 授權／維護 | 大小與安全比較 | 決定 |
| --- | --- | --- | --- |
| write-excel-file 4.1.1 | MIT；2026-06 更新 | 約 1.81 MB；執行期只相依 fflate；安裝後 npm audit 零漏洞 | 採用固定版本；universal 入口可在瀏覽器及 Node 產生相同 Blob，適合三張純資料工作表 |
| ExcelJS 4.4.0 | MIT；npm 最後更新 2024-12 | 約 21.83 MB；包含 archiver、tmp、uuid 等較多相依，官方問題追蹤仍有相依安全更新請求 | 不採用，不為簡單匯出加入較重功能或 overrides |
| npm xlsx 0.18.5／官方新版 SheetJS | Apache-2.0；官方已轉移新版發行來源 | npm 舊版約 7.50 MB，過時且有未修補的 prototype pollution／ReDoS 公告；官方新版需從官方 CDN 固定來源，並另行驗證 | 不使用有已知漏洞的 npm 舊版；本需求採正常 npm 發行且較少相依的寫檔套件 |

官方參考：[write-excel-file](https://github.com/catamphetamine/write-excel-file)、[ExcelJS](https://github.com/exceljs/exceljs)、[ExcelJS 相依更新問題](https://github.com/exceljs/exceljs/issues/3055)、[SheetJS 安裝說明](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)、[SheetJS prototype pollution 公告](https://cdn.sheetjs.com/advisories/CVE-2023-30533)、[SheetJS ReDoS 公告](https://cdn.sheetjs.com/advisories/CVE-2024-22363)。

- read-excel-file 9.3.12（MIT）僅為開發測試相依，用於讀回實際產生的檔案；不進入網站建置。兩套件固定版本並提交 lockfile，根套件 npm audit 為零漏洞。
- 隨站台發布 public/excel-licenses.txt，包含 write-excel-file 4.1.1 與執行期 fflate 0.8.3 的原始 MIT 授權聲明。
- 匯出模組只在按下匯出時動態載入，首頁不預載。三工作表為「候選清單」「母分子」「參數」；2e-1 起僅匯出已勾選候選，預設全選，可用目前篩選結果取代勾選；零筆時介面停用並說明原因。參數頁保存匯出筆數及分析總數。
- 離子式使用引擎原始字串。m/z 與分數使用數值儲存格，保留完整原值、顯示四位小數；所有文字明確使用 String 型別，不產生公式，包含 =、+、-、@ 開頭的字串與 PubChem 名稱。
- 母分子列輸入／標準化 SMILES、分子式、原有質量與標準化資訊，來源為未編輯的 PubChem 結構時附 CID。參數列中文標籤、實際設定、僅記錄限制、既有 CE／EE 掃描、網站 commit、ISO 匯出時間及分數聲明。
- 檔名為 CheMScutter_平台_分子式_本地日期時間.xlsx，移除檔案系統不合法字元；LC-MS/MS 中的斜線以底線取代。
- 單元測試讀回三張工作表、欄位、數值型別與完整精度、危險開頭字串、篩選範圍、多成分資訊與檔名。實際建置大小與正式站下載驗證另於階段回報記錄。

## 2e-1 結構匯出

- 固定輸出 SMILES 純文字欄，使用既有 canonicalSmiles 或 smiles；兩者皆缺少時留空，結構備註明示引擎未提供，不推測結構。
- write-excel-file 4.1.1 原生支援 images，沿用現有套件，不更換相依。圖片嵌入檔案的繪圖層並錨定儲存格，不是外部圖片連結，也不是 Excel 新式儲存格圖片型別。
- 含圖匯出另外動態載入模組，以現有 RDKit 繪圖 Worker 產生 SVG，再由瀏覽器 canvas 轉為白底 PNG；原始 360×240、顯示 180×120 像素、96 dpi、列高 96 點。相同 SMILES 共用繪圖結果，完成或失敗均終止 Worker。
- 「包含結構圖」預設關閉。以候選最多的 methionine golden 循環為 200 筆獨立編號合成資料，僅供檔案大小測試：不含圖 15,588 位元組，含圖 1,755,898 位元組，200 張 PNG，全流程約 2.14 秒（本機瀏覽器、無節流，非效能保證）。保留小型純文字匯出的預設，避免不必要的檔案與繪圖成本。
- 圖片無法產生時保留既有 SMILES 與原因；Worker 中斷或逾時則匯出失敗，不悄悄輸出不完整圖片。所有文字仍明確指定 String，不新增公式。
