// 結構輸入解析：化合物名稱、Molfile、SMILES、官能基縮寫展開與 SMILES 語法修復。
// 來源：legacy commonFragmentation.ts
import type { JSMol, RDKitModule } from '../rdkit/types';

// 常見中英文化合物名稱對照表
export const COMMON_MOLECULES: Record<string, string> = {
  aspirin: 'CC(=O)Oc1ccccc1C(=O)O',
  'acetylsalicylic acid': 'CC(=O)Oc1ccccc1C(=O)O',
  '阿司匹靈': 'CC(=O)Oc1ccccc1C(=O)O',
  '乙醯水楊酸': 'CC(=O)Oc1ccccc1C(=O)O',
  caffeine: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C',
  '咖啡因': 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C',
  paracetamol: 'CC(=O)Nc1ccc(O)cc1',
  acetaminophen: 'CC(=O)Nc1ccc(O)cc1',
  '乙醯胺酚': 'CC(=O)Nc1ccc(O)cc1',
  '普拿疼': 'CC(=O)Nc1ccc(O)cc1',
  ibuprofen: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O',
  '布洛芬': 'CC(C)Cc1ccc(cc1)C(C)C(=O)O',
  benzene: 'c1ccccc1',
  '苯': 'c1ccccc1',
  toluene: 'Cc1ccccc1',
  '甲苯': 'Cc1ccccc1',
  phenol: 'Oc1ccccc1',
  '苯酚': 'Oc1ccccc1',
  'benzoic acid': 'c1ccccc1C(=O)O',
  '苯甲酸': 'c1ccccc1C(=O)O',
  ethanol: 'CCO',
  '乙醇': 'CCO',
  methanol: 'CO',
  '甲醇': 'CO',
  'acetic acid': 'CC(=O)O',
  '乙酸': 'CC(=O)O',
  acetone: 'CC(=O)C',
  '丙酮': 'CC(=O)C',
  'ethyl acetate': 'CCOC(=O)C',
  '乙酸乙酯': 'CCOC(=O)C',
  glucose: 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O',
  '葡萄糖': 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O',
  nicotine: 'CN1CCC[C@H]1c1cccnc1',
  '尼古丁': 'CN1CCC[C@H]1c1cccnc1',
  chlorobenzene: 'Clc1ccccc1',
  '氯苯': 'Clc1ccccc1',
  bromobenzene: 'Brc1ccccc1',
  '溴苯': 'Brc1ccccc1',
  nitrobenzene: '[O-][N+](=O)c1ccccc1',
  '硝基苯': '[O-][N+](=O)c1ccccc1',
  acetonitrile: 'CC#N',
  '乙腈': 'CC#N'
};

export const ABBREV_REPLACEMENTS: [RegExp, string][] = [
  [/Ph-?/g, 'c1ccccc1'],
  [/-?Ph/g, 'c1ccccc1'],
  [/Bn-?/g, 'Cc1ccccc1'],
  [/-?Bn/g, 'Cc1ccccc1'],
  [/t-?Bu-?/g, 'C(C)(C)C'],
  [/-?t-?Bu/g, 'C(C)(C)C'],
  [/MeO-?/g, 'COc1'],
  [/-?OMe/g, 'OC'],
  [/-?OAc/g, 'OC(=O)C'],
  [/AcO-?/g, 'CC(=O)O'],
  [/-?COOH/g, 'C(=O)O'],
  [/HOOC-?/g, 'OC(=O)'],
  [/-?CHO/g, 'C=O'],
  [/-?NO2/g, '[N+](=O)[O-]'],
  [/O2N-?/g, '[O-][N+](=O)']
];

export function expandChemicalAbbreviations(s: string): string {
  let res = s;
  for (const [pattern, replacement] of ABBREV_REPLACEMENTS) {
    res = res.replace(pattern, replacement);
  }
  return res;
}

export function balanceParentheses(s: string): string {
  let openCount = 0;
  const balanced: string[] = [];
  for (const c of s) {
    if (c === '(') {
      openCount++;
      balanced.push(c);
    } else if (c === ')') {
      if (openCount > 0) {
        openCount--;
        balanced.push(c);
      }
    } else {
      balanced.push(c);
    }
  }
  while (openCount > 0) {
    balanced.push(')');
    openCount--;
  }
  return balanced.join('');
}

export function fixUnclosedRings(s: string): string {
  const tokens: { char: string; idx: number }[] = [];
  let inBracket = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '[') inBracket = true;
    else if (c === ']') inBracket = false;
    else if (!inBracket && c >= '0' && c <= '9') {
      tokens.push({ char: c, idx: i });
    }
  }

  const counts: Record<string, number> = {};
  for (const t of tokens) {
    counts[t.char] = (counts[t.char] || 0) + 1;
  }

  const badDigits = new Set(Object.keys(counts).filter((d) => counts[d] % 2 !== 0));
  if (badDigits.size === 0) return s;

  const seen: Record<string, number> = {};
  for (const d of badDigits) seen[d] = 0;

  const chars = s.split('');
  const removeIndices = new Set<number>();
  for (const t of tokens) {
    if (badDigits.has(t.char)) {
      seen[t.char]++;
      if (counts[t.char] === 1 || seen[t.char] > Math.floor(counts[t.char] / 2) * 2) {
        removeIndices.add(t.idx);
      }
    }
  }
  return chars.filter((_, idx) => !removeIndices.has(idx)).join('');
}

export function fixTrivalentOxygen(s: string): string {
  return s.replace(/([A-Za-z\)])O([1-9])([A-Za-z])/g, '$1O$3').replace(/=O[1-9]/g, '=O');
}

export function repairSmilesSyntax(s: string, RDKit: RDKitModule): { mol: JSMol | null; smiles: string } {
  let cand = (s || '').trim();
  if (!cand) return { mol: null, smiles: cand };

  let mol = RDKit.get_mol(cand);
  if (mol && mol.is_valid()) return { mol, smiles: cand };

  cand = fixTrivalentOxygen(cand);
  mol = RDKit.get_mol(cand);
  if (mol && mol.is_valid()) return { mol, smiles: cand };

  cand = balanceParentheses(cand);
  mol = RDKit.get_mol(cand);
  if (mol && mol.is_valid()) return { mol, smiles: cand };

  cand = fixUnclosedRings(cand);
  mol = RDKit.get_mol(cand);
  if (mol && mol.is_valid()) return { mol, smiles: cand };

  return { mol: null, smiles: cand };
}

export function normalizeMolblock(text: string): string {
  const lines = text.split(/\r?\n/);
  let vIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('V2000') || lines[i].includes('V3000')) {
      vIdx = i;
      break;
    }
  }
  if (vIdx !== -1 && vIdx !== 3) {
    const countsAndRest = lines.slice(vIdx);
    const header = ['ChemStructure', '  ChemDraw/ChemDoodle', ''];
    return [...header, ...countsAndRest].join('\n');
  }
  return text;
}

export interface ParsedInput {
  mol: JSMol | null;
  format: string;
  error?: string;
}

export function parseInputToMol(rawInput: string, RDKit: RDKitModule): ParsedInput {
  let text = (rawInput || '').trim();
  if (!text) {
    return { mol: null, format: 'Unknown', error: '請輸入化學結構式' };
  }

  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      // 舊版直接對欄位呼叫 .trim()；欄位不是字串時會拋錯並由 catch 忽略，這裡保留相同行為
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed.smiles) text = (parsed.smiles as string).trim();
      else if (parsed.input) text = (parsed.input as string).trim();
      else if (parsed.molblock) text = (parsed.molblock as string).trim();
    } catch {
      // ignore
    }
  }

  const lower = text.toLowerCase();
  if (COMMON_MOLECULES[lower]) {
    const smiles = COMMON_MOLECULES[lower];
    const mol = RDKit.get_mol(smiles);
    if (mol && mol.is_valid()) {
      return { mol, format: `常見化合物名稱 (${text})` };
    }
  }

  if (text.includes('M  END') || text.includes('V2000') || text.includes('V3000')) {
    const normalized = normalizeMolblock(text);
    const mol = RDKit.get_mol(normalized);
    if (mol && mol.is_valid()) {
      return { mol, format: 'ChemDraw/ChemDoodle Molfile (V2000/V3000)' };
    }
  }

  let mol = RDKit.get_mol(text);
  if (mol && mol.is_valid()) {
    return { mol, format: 'SMILES' };
  }

  const expanded = expandChemicalAbbreviations(text);
  if (expanded !== text) {
    mol = RDKit.get_mol(expanded);
    if (mol && mol.is_valid()) {
      return { mol, format: 'SMILES (已展開官能基縮寫)' };
    }
  }

  const repairRes = repairSmilesSyntax(text, RDKit);
  if (repairRes.mol && repairRes.mol.is_valid()) {
    return { mol: repairRes.mol, format: 'SMILES (語法自動修復)' };
  }

  if (expanded !== text) {
    const repairExpanded = repairSmilesSyntax(expanded, RDKit);
    if (repairExpanded.mol && repairExpanded.mol.is_valid()) {
      return { mol: repairExpanded.mol, format: 'SMILES (語法自動修復)' };
    }
  }

  return {
    mol: null,
    format: 'Unknown',
    error: `無法辨識化學結構式「${text.slice(0, 60)}」。請確認為有效的 SMILES、ChemDraw 結構或清晰結構式截圖。`
  };
}
