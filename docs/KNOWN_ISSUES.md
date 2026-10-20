# 已知問題清單（2026-10-20）

修正規則：每個編號單獨處理、單獨提交；以 npm run golden:generate 重新產生標準答案、npm run golden:diff 檢查變動，並說明哪些案例改變。程式中以 // LEGACY-QUIRK(Qxx) 標註刻意保留的舊行為，搜尋該字串即可找到；只有指令明確指定該編號時才能修改。
嚴重度：★★★ 產生錯誤或不存在的候選／錯誤 m/z；★★ 標籤、欄位或說明錯誤；★ 邊界情況或影響極小

## 已修正或移除
- Q3 帶電碎片以實際電荷計算離子式與 m/z（3655482）
- Q5 甲氧基與醚基判斷（394e802）
- Q13 [C5H5]+ 死程式碼已移除（SMILES 無效），待以正確結構重新實作
- Q14 鹽類標準化（83f79c4）
- Q15 乙醯基鎓只在有 CH3-C(=O)- 時產生（4189b07）
- LC [M+Na]+ 螯合條件納入胺甲酸酯（4226010）

## 未處理
- Q1 ★★ 質量守恆檢查未計入氫轉移：失去自由基類中性物產生的 [Frag+H]+、[Frag-H]-、[Frag]+. 誤差約一個 H
- Q2 ★★ 鹵素陰離子重複列出（35Cl- 與 Cl-、79Br- 與 Br- 同 m/z）
- Q4 ★★ 自由基永遠偵測不到（程式讀 a.radical，RDKit JSON 欄位是 nRad）
- Q6 ★ 未知元素處理不一致
- Q7 ★ 多電荷離子式歧義（電荷倍數接在元素計數後）；目前全部單電荷
- Q8 ★ 空分子式回傳 "H"
- Q9 ★★ 去質子化可能產生中性結構卻標為已驗證（TOF 中性丟失負離子）[LEGACY-QUIRK]
- Q10 ★ McLafferty 結果 charge 與 isChargedProduct 矛盾；機制說明夾日文
- Q11 ★★ 同位素候選過於簡化（Cl 與 Br 共存無組合峰）；之後以完整同位素分布取代
- Q12 ★ 質量常數數值不一致（質子 1.007276 vs 1.00727647 等），影響在 4 位小數以下
- Q16 ★★ GC 中性丟失 structures 以字串拼接分子式、charge 固定 1 [LEGACY-QUIRK]
- Q17 ★★ LC [M+formate]- 條件永遠不成立（名稱應為 [M+HCOO]-）
- Q18 ★★ 寫死的質量平衡誤差（LC 二階產物、GC [C4H3]+ 等）[LEGACY-QUIRK，程式中標為 Q30]
- Q19 ★★ precursorMz 語意不一致 [LEGACY-QUIRK]
- Q20 ★★ LC CE 掃描只重新計分，沒有每個 CE 重新碎裂
- Q21 ★ TOF Cs+ 負離子模式不產生 [M+Cs]+，需確認是否刻意
- Q22 ★ 母分子質量兩套來源
- Q23 ★ LC 沒有苯基陽離子 m/z 77，但註解寫有
- Q24 ★★ TOF structures mode 不看使用者極性 [LEGACY-QUIRK]
- Q26 ★ [Frag-H]- confidence TOF High、LC Medium [LEGACY-QUIRK]
- Q27 ★ 同位素預設極性與 sourceRule 名稱不一致 [LEGACY-QUIRK]
- Q28 ★ 參數掃描 priority 門檻 LC 與 GC 不同 [LEGACY-QUIRK]
- Q29 ★ 中性丟失帶電產物 id 後綴三平台不同 [LEGACY-QUIRK]
- Q31 ★ GC 中性丟失帶電產物 charge 固定 1 [LEGACY-QUIRK]
- Q32 ★★★ 永久帶電母體（四級銨）仍產生 [M+H]+，需改前驅離子整體邏輯
- Q33 ★ GC 中性單鍵碎片 structures 的 formula 與 charge 不一致（structures 是自由基陽離子 charge 1，formula 卻是中性式）。決定：formula 改為「中性式 + "+."」，與 candidates 一致；影響 108 個 GC 案例。[LEGACY-QUIRK(Q33)] 排入 2a 開頭。
- Q34 ★ LC [M+Na]+ 條件是否也納入醯胺，待審查

## 程式品質
- P1 RDKit 分子物件大量未呼叫 .delete()（SMARTS 查詢、離子推導、子圖建構、被拒絕產物等），瀏覽器長時間使用會累積記憶體
- P2 evaluateTofSimsRegime 的 fg 參數未使用
- P3 中性丟失 structId 依賴 structures 目前數量，必須在加入該產物前取得

## 設計問題
- D1 引擎預設參數與舊版介面預設不同（LC-MS/MS 引擎 Generic CE 20，舊版介面 QTOF、CID、CE 25），2d 統一
- D2 LC-MS/MS 未指定範圍也一律跑 CE 掃描 {10, 40, 15}；舊版介面間隔固定 10
