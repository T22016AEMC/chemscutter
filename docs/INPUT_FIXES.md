# 2b-1 上線後輸入問題調查

## 問題 A：未指定立體組態被誤判為解析錯誤

重現版本：b93ae88。原始輸入為 `O=C(C=C)OC(CC12)C(C2)C(C1C1)C=C1`。

| 步驟 | 實際輸入與結果 | RDKit 原始錯誤 |
| --- | --- | --- |
| 直接解析 | 原始 SMILES；RDKit 2026.09.1 成功，15 原子 | 空字串 |
| Ketcher 匯入及匯出 | 正常繪圖；匯出 V3000，15 原子、17 鍵；完整原文存於 tests/worker/problem-a-ketcher-v3000.mol | 尚未呼叫 RDKit |
| RDKit 解析匯出物 | 上述 Molfile 原文；成功，canonical SMILES 與直接解析相同 | 空字串 |

兩條解析結果皆為 `C=CC(=O)OC1CC2CC1C1C=CCC21`。

原介面其實在匯出前就被 Indigo 的檢查攔下，尚未送至 RDKit。Structure Check 原文是 `Structure contains stereocenters with undefined stereo configuration: (5,7,8,10,11)`；程式以 `check.valence || check.stereo` 將所有非空訊息視為致命錯誤，混淆未指定組態警告與解析失敗。

實際解析呼叫為 `get_mol(input)`，沒有傳入 options；SMILES 文字解析仍呼叫原本的 parseInputToMol，不變更其縮寫及語法修復行為。對應 MinimalLib 預設為 sanitize=true、assignStereo=true；removeHs 在 SMILES 為 true、Molfile 為 false，Molfile strictParsing=false；其餘立體感知設定不變。另以明確設定 sanitize=true、removeHs=false、assignStereo=true 解析匯出 Molfile，亦成功。預設值來源為 [RDKit MinimalLib common.h](https://github.com/rdkit/rdkit/blob/master/Code/MinimalLib/common.h)。沒有以關閉消毒、忽略立體化學或改變分子圖來繞過失敗。

修正範圍是輸入轉換：Indigo 只檢查不支援的 query、rgroups、pseudoatoms，以及繪圖格式中的反應／聚合物；有效性交給既有 RDKit 解析。RDKit 的 rdApp.error／rdApp.warning 在同步輸入處理期間擷取原文，透過 Worker 提供可展開的技術細節，用完即釋放擷取器。不支援內容、空白、解析失敗、價鍵／消毒失敗、多成分待確認與其他錯誤分開顯示；原始訊息沒有內容時明確註記，不捏造原因。

回歸案例的名稱對照僅用於運作測試，非化學正確性判斷：[norbornane](https://pubchem.ncbi.nlm.nih.gov/compound/9233)、[adamantane](https://pubchem.ncbi.nlm.nih.gov/compound/9238)、[cubane](https://pubchem.ncbi.nlm.nih.gov/compound/136090)、[camphor](https://pubchem.ncbi.nlm.nih.gov/compound/Camphor)；另有稠環及既有含 @ 的 phenylalanine 輸入。

使用者同意的驗證順序：A 單獨部署時先驗證繪圖路徑及 RDKit 直接解析；B 新增直接分析按鈕並單獨部署後，再補齊正式站兩條介面路徑。

## 問題 B：文字輸入可直接分析

文字直接分析不建立 iframe，使用同一個 Worker 準備及確認協定，成功後顯示 RDKit 產生的 img data URL；原始文字保留給既有引擎，避免改變 SMILES 解析與格式回報行為。單一成分直接分析，多成分先顯示既有標準化說明、移除成分與保留結構，未確認不呼叫引擎。來源可能認錯的 PubChem 名稱查詢與圖片辨識仍須先在 Ketcher 確認，本次不實作。

Ketcher 與文字路徑的錯誤及預覽分開，繪圖內容改變不會影響使用文字的待確認輸入。文字改變會撤銷先前結果及準備。另修正同步狀態：Ketcher setMolecule 透過 runAsyncAction 吞掉匯入例外後發出 FAILURE，須監聽此事件，不能只看 Promise 完成或畫布仍有內容；因此無效文字不能誤認為成功載入前一份結構。
