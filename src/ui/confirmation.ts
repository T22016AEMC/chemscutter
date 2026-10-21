import type { PreparedStructure } from '../engine/chem/prepareStructure';

export function confirmationLines(structure: PreparedStructure): string[] {
  if (!structure.multipleComponents) return [];
  return [
    structure.standardization_note || '既有標準化流程未提供額外說明。',
    `被移除的成分：${structure.removed_components.join('、') || '無'}`,
    `保留成分 SMILES：${structure.retainedSmiles}`,
    '只會分析保留的成分。',
    '若要分析另一個成分，請回到 Ketcher 刪除其他成分後，再取得結構。'
  ];
}
