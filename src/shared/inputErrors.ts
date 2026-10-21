export const inputCategories = ['EMPTY_INPUT', 'UNPARSABLE', 'SANITIZATION_FAILED', 'UNSUPPORTED_CONTENT', 'MULTIPLE_COMPONENTS', 'OTHER'] as const;
export type InputCategory = typeof inputCategories[number];
export const inputMessages: Record<InputCategory, string> = {
  EMPTY_INPUT: '空白輸入：請先繪圖或貼上 SMILES／Molfile。',
  UNPARSABLE: '無法解析：請檢查 SMILES／Molfile 的格式與內容。',
  SANITIZATION_FAILED: '價鍵／消毒失敗：RDKit 無法完成結構檢查，請檢查價鍵與芳香性等內容。',
  UNSUPPORTED_CONTENT: '不支援的內容：請移除反應箭頭、R 基團、查詢原子或聚合物，改用明確結構。',
  MULTIPLE_COMPONENTS: '多成分輸入：請先確認保留成分；只會分析保留的成分。',
  OTHER: '其他錯誤：結構處理未完成，請查看技術細節後再試。'
};

export class InputValidationError extends Error {
  constructor(public readonly category: InputCategory, public readonly details: string) {
    super(inputMessages[category]);
  }
}

export function isInputCategory(value: unknown): value is InputCategory {
  return inputCategories.some((category) => category === value);
}
