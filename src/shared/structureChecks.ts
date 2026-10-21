/** Indigo 的未指定立體組態等警告不代表 RDKit 解析失敗。此處只攔截不支援的內容。 */
export function unsupportedCheck(check: Record<string, string>): boolean {
  return !!(check.query || check.rgroups || check.pseudoatoms);
}

/** 只辨識輸入格式中的不支援物件，不推斷化合物是否為鹽類或混合物。 */
export function unsupportedDrawing(ket: string): string | undefined {
  const visit = (value: unknown): string | undefined => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) { const error = visit(item); if (error) return error; }
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.type === 'arrow' || node.type === 'plus' || node.type === 'multi-tailed-arrow') {
      return '目前不支援反應箭頭或反應式，請在 Ketcher 中只保留要分析的結構。';
    }
    if (typeof node.type === 'string' && ['SRU', 'MUL', 'MON', 'COP', 'CRO', 'MOD', 'MER', 'GRA'].includes(node.type.toUpperCase())) {
      return '目前不支援聚合物或重複單元，請改用明確的單一結構。';
    }
    for (const item of Object.values(node)) { const error = visit(item); if (error) return error; }
  };
  try { return visit(JSON.parse(ket)); }
  catch { return '繪圖資料格式不正確，請重新取得結構。'; }
}
