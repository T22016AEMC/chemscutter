# CAS 後備查詢重現（2026-10-22）

輸入：33791-58-1。以實際 PUG REST GET 回應確認：

| 端點（相對於 https://pubchem.ncbi.nlm.nih.gov/rest/pug/） | HTTP | 回應 |
| --- | --- | --- |
| compound/name/33791-58-1/cids/JSON?name_type=complete | 404 | PUGREST.NotFound；No CID found |
| compound/name/33791-58-1/cids/JSON?name_type=word | 404 | PUGREST.NotFound；No CID found |
| compound/name/33791-58-1/cids/JSON | 404 | PUGREST.NotFound；No CID found |
| substance/name/33791-58-1/sids/JSON | 200 | IdentifierList.SID，共 34 筆 |
| substance/name/33791-58-1/cids/JSON | 200 | InformationList.Information，各列含 SID 與可選的 CID 陣列 |

有關聯化合物的物質紀錄去重後為八個 CID：12577030、44607779、57978540、3037072、66648380、73748545、57165775、39850。部分物質紀錄沒有 CID，不能當成可分析的化合物；不推論各筆的化學等同性。

根本原因：原用戶端只查 compound 名稱索引，遇到 404 就結束；官網可找到的 substance 紀錄不代表 compound/name 能以同一個名稱找到 CID。修正為只有化合物查無時才查 substance/name 的關聯 CID，沿用既有屬性取得、使用者選取及 Ketcher 確認流程。格式錯誤、網路錯誤、限流及逾時不改查其他方式。
