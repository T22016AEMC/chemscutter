# CheMScutter 工作守則

## 專案簡介
CheMScutter 是質譜候選碎片模擬器：輸入化學結構，預測其在 TOF-SIMS、LC-MS/MS、GC-MS 中可能出現的離子與碎片。本專案為舊版的重建，舊版程式碼在 legacy/ 供參考。

## 分工
- 規劃與指令由規劃者提供；你負責實作。
- 化學正確性由使用者驗證；你負責確保程式能正確運作、測試通過。

## 架構原則
- 純前端：所有計算在瀏覽器執行，部署在 GitHub Pages（base 路徑 /chemscutter/）。不得加入後端伺服器。
- 不得加入任何 AI／LLM API（Gemini、OpenAI、Anthropic 等）或需要 API key 的服務。
- src/engine/ 是純 TypeScript，不可 import React、DOM API 或 window；必須能在 Node（Vitest）與 Web Worker 中執行。
- src/ui/ 負責介面；引擎透過 src/worker/ 在背景執行緒呼叫。
- 化學計算一律使用 RDKit（@rdkit/rdkit WASM）。

## legacy/ 規則
- legacy/ 為唯讀參考：不得修改、不得從 src/ import 其中任何檔案。
- legacy/app.py、legacy/analyze.py 是更早期的廢棄版本，忽略即可。
- 例外：scripts/golden/ 內的腳本可以 import legacy/ 的引擎，用來產生標準答案。src/ 與 tests/ 仍不得 import legacy/。

## 化學規則的修改限制（重要）
- 不得自行新增、刪除或修改碎裂規則、離子類型、評分權重或質量常數，除非指令明確要求。
- 從 legacy 搬移邏輯時，行為必須與原版一致；若發現原版疑似有化學錯誤，記錄下來回報，不要自行修正。
- 碎片必須透過 RDKit 分子圖操作產生，禁止用字串替換 SMILES 或拼接分子式。
- 精確質量常數（原子、電子、質子、加合物）集中定義在一個檔案，其他地方一律引用。
- tests/golden/ 內的標準答案檔不得手動修改，也不得重新產生，除非指令明確要求。

## 程式風格
- 介面文字使用台灣繁體中文與台灣用語（例如「程式」「資料」「檔案」「介面」）。
- 程式碼註解使用繁體中文；變數與函式名稱使用英文。
- TypeScript strict 模式。與 RDKit 互動處可使用型別定義包裝，避免散落的 any。

## 完成標準
每次修改後必須執行並全部通過：
1. npm run typecheck
2. npm test
3. npm run build

## 提交
- 小步提交，commit 訊息使用繁體中文，說明做了什麼。
- 未經指示不得推送到遠端。

## 不確定時
先停下來問，不要猜。尤其是牽涉化學邏輯、新增套件、改變架構的決定。
