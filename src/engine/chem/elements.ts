// 原子序 → 元素符號對照表。
// 舊版在 commonFragmentation.ts（ATOMIC_SYMBOLS）與 ionStructure.ts（ATOMIC_NUMBER_TO_SYMBOL）
// 各有一份內容完全相同的表，此處合併為一份。查不到時的預設值兩處不同，由呼叫端各自處理。
export const ATOMIC_NUMBER_TO_SYMBOL: Record<number, string> = {
  1: 'H',
  2: 'He',
  3: 'Li',
  4: 'Be',
  5: 'B',
  6: 'C',
  7: 'N',
  8: 'O',
  9: 'F',
  10: 'Ne',
  11: 'Na',
  12: 'Mg',
  13: 'Al',
  14: 'Si',
  15: 'P',
  16: 'S',
  17: 'Cl',
  18: 'Ar',
  19: 'K',
  20: 'Ca',
  35: 'Br',
  53: 'I',
  55: 'Cs'
};
