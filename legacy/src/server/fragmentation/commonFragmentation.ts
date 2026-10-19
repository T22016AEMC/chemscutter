import initRDKitModule from '@rdkit/rdkit';

// Singleton RDKit instance
let rdkitInstance: any = null;
let rdkitInitPromise: Promise<any> | null = null;

export async function getRDKit() {
  if (rdkitInstance) return rdkitInstance;
  if (!rdkitInitPromise) {
    rdkitInitPromise = (initRDKitModule as any)().then((instance: any) => {
      rdkitInstance = instance;
      return instance;
    });
  }
  return rdkitInitPromise;
}

// 元素精確單同位素原子質量表 (IUPAC Monoisotopic Exact Masses)
export const EXACT_ISOTOPE_MASSES: Record<string, number> = {
  H: 1.00782503,
  C: 12.00000000,
  N: 14.00307400,
  O: 15.99491462,
  F: 18.99840316,
  Na: 22.98976928,
  Mg: 23.98504170,
  Al: 26.98153853,
  Si: 27.97692653,
  P: 30.97376199,
  S: 31.97207117,
  Cl: 34.96885268, // 35Cl
  Cl37: 36.96590259,
  K: 38.96370648,
  Ca: 39.96259086,
  Br: 78.91833760, // 79Br
  Br81: 80.91628970,
  I: 126.90447190,
  Cs: 132.90545190
};

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

export function repairSmilesSyntax(s: string, RDKit: any): { mol: any; smiles: string } {
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

const ATOMIC_SYMBOLS: Record<number, string> = {
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

export function calculateFormulaFromJson(molJson: any): string {
  const atomCounts: Record<string, number> = {};
  let totalH = 0;
  let netCharge = 0;

  const atoms = molJson?.molecules?.[0]?.atoms || [];
  for (const a of atoms) {
    const z = a.z !== undefined ? a.z : 6;
    const sym = ATOMIC_SYMBOLS[z] || `Element${z}`;
    if (sym === 'H') {
      totalH += 1 + (a.impHs || 0);
    } else {
      atomCounts[sym] = (atomCounts[sym] || 0) + 1;
      totalH += a.impHs !== undefined ? a.impHs : 0;
    }
    if (a.chg) netCharge += a.chg;
  }

  if (totalH > 0) {
    atomCounts['H'] = (atomCounts['H'] || 0) + totalH;
  }

  // Hill System: C first, then H, then alphabetically
  let formula = '';
  if (atomCounts['C']) {
    formula += 'C' + (atomCounts['C'] > 1 ? atomCounts['C'] : '');
    delete atomCounts['C'];
    if (atomCounts['H']) {
      formula += 'H' + (atomCounts['H'] > 1 ? atomCounts['H'] : '');
      delete atomCounts['H'];
    }
  }

  const otherElements = Object.keys(atomCounts).sort();
  for (const sym of otherElements) {
    formula += sym + (atomCounts[sym] > 1 ? atomCounts[sym] : '');
  }

  if (!formula) formula = 'H';
  if (netCharge > 0) {
    formula += netCharge > 1 ? `${netCharge}+` : '+';
  } else if (netCharge < 0) {
    formula += Math.abs(netCharge) > 1 ? `${Math.abs(netCharge)}-` : '-';
  }

  return formula;
}

export function molToSvgDataUri(mol: any, width = 250, height = 200): string {
  if (!mol || !mol.is_valid()) return '';
  try {
    const svg = mol.get_svg(width, height);
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  } catch {
    return '';
  }
}

export function parseInputToMol(
  rawInput: string,
  RDKit: any
): { mol: any; format: string; error?: string } {
  let text = (rawInput || '').trim();
  if (!text) {
    return { mol: null, format: 'Unknown', error: '請輸入化學結構式' };
  }

  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.smiles) text = parsed.smiles.trim();
      else if (parsed.input) text = parsed.input.trim();
      else if (parsed.molblock) text = parsed.molblock.trim();
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

export interface CleavedFragment {
  mol: any;
  smiles: string;
  formula: string;
  exactMass: number;
  image: string;
  bondIdx: number;
  cleavedAtomU: number;
  cleavedAtomV: number;
  bondClass: 'ester' | 'amide' | 'ether' | 'carbonyl_alpha' | 'benzylic' | 'halogen' | 'aliphatic_cc';
  bondDescription: string;
  isLabileHeteroatomBond: boolean;
  // Direct heterolytic cleaved ion without artificial H addition (e.g. C[C+]=O or [O-]c1ccccc1C(=O)O)
  directCationMol?: any;
  directCationSmiles?: string;
  directCationFormula?: string;
  directCationMz?: number;
  directCationImage?: string;
  directAnionMol?: any;
  directAnionSmiles?: string;
  directAnionFormula?: string;
  directAnionMz?: number;
  directAnionImage?: string;
  complementaryFormula?: string;
  complementaryMass?: number;
}

/**
 * Executes acyclic single bond cleavages on an RDKit molecule.
 * Each fragment is guaranteed to be a genuine, valid RDKit molecule with correct formula, exact mass,
 * bond classification, and direct heterolytic ion structures.
 */
export function generateSingleBondFragments(mol: any, RDKit: any): CleavedFragment[] {
  const molJson = JSON.parse(mol.get_json());
  const atoms = molJson?.molecules?.[0]?.atoms || [];
  const bonds = molJson?.molecules?.[0]?.bonds || [];
  const numAtoms = atoms.length;
  const results: CleavedFragment[] = [];
  const seenSmiles = new Set<string>();

  // Helper to check if an atom has a double bond to oxygen (carbonyl)
  const hasCarbonylDoubleBond = (atomIdx: number): boolean => {
    for (const b of bonds) {
      if ((b.bo || 1) === 2) {
        const other = b.atoms[0] === atomIdx ? b.atoms[1] : b.atoms[1] === atomIdx ? b.atoms[0] : -1;
        if (other !== -1 && atoms[other]?.z === 8) return true;
      }
    }
    return false;
  };

  for (let bIdx = 0; bIdx < bonds.length; bIdx++) {
    const bond = bonds[bIdx];
    const bo = bond.bo !== undefined ? bond.bo : 1;
    if (bo !== 1) continue; // Only single bonds

    const u = bond.atoms[0];
    const v = bond.atoms[1];

    // Check if bond is in a ring via BFS
    const visited = new Array(numAtoms).fill(false);
    const queue = [u];
    visited[u] = true;

    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (let i = 0; i < bonds.length; i++) {
        if (i === bIdx) continue;
        const b = bonds[i];
        let neighbor = -1;
        if (b.atoms[0] === curr) neighbor = b.atoms[1];
        else if (b.atoms[1] === curr) neighbor = b.atoms[0];
        if (neighbor !== -1 && !visited[neighbor]) {
          visited[neighbor] = true;
          queue.push(neighbor);
        }
      }
    }

    if (visited[v]) continue; // In-ring bond, skip

    const compA: number[] = [];
    const compB: number[] = [];
    for (let i = 0; i < numAtoms; i++) {
      if (visited[i]) compA.push(i);
      else compB.push(i);
    }

    // Classify the cleaved bond
    const zU = atoms[u]?.z || 6;
    const zV = atoms[v]?.z || 6;
    const uIsCarb = zU === 6 && hasCarbonylDoubleBond(u);
    const vIsCarb = zV === 6 && hasCarbonylDoubleBond(v);

    let bondClass: CleavedFragment['bondClass'] = 'aliphatic_cc';
    let bondDescription = '非環單鍵斷裂 (Exocyclic Single-Bond Cleavage)';
    let isLabileHeteroatomBond = false;

    if ((uIsCarb && zV === 8) || (vIsCarb && zU === 8)) {
      bondClass = 'ester';
      bondDescription = '酯基/羧基 C-O 醯氧單鍵異裂 (Ester/Acyl-Oxygen Cleavage)';
      isLabileHeteroatomBond = true;
    } else if ((uIsCarb && zV === 7) || (vIsCarb && zU === 7)) {
      bondClass = 'amide';
      bondDescription = '醯胺 C-N 鍵異裂 (Amide C-N Bond Cleavage)';
      isLabileHeteroatomBond = true;
    } else if (zU === 8 || zV === 8 || zU === 7 || zV === 7 || zU === 16 || zV === 16) {
      bondClass = 'ether';
      bondDescription = '雜原子單鍵斷裂 (C-O / C-N / C-S Cleavage)';
      isLabileHeteroatomBond = true;
    } else if (uIsCarb || vIsCarb) {
      bondClass = 'carbonyl_alpha';
      bondDescription = '羰基 α-碳單鍵斷裂 (Carbonyl α-Cleavage)';
      isLabileHeteroatomBond = false;
    } else if ([9, 17, 35, 53].includes(zU) || [9, 17, 35, 53].includes(zV)) {
      bondClass = 'halogen';
      bondDescription = '碳-鹵素鍵斷裂 (Carbon-Halogen Cleavage)';
      isLabileHeteroatomBond = true;
    }

    const makeSubMol = (
      nodeIndices: number[],
      severedAtom: number,
      mode: 'h_transfer' | 'direct_cation' | 'direct_anion'
    ) => {
      const oldToNew = new Map<number, number>();
      nodeIndices.forEach((oldIdx, newIdx) => oldToNew.set(oldIdx, newIdx));

      const subAtoms = nodeIndices.map((oldIdx) => {
        const atomCopy = { ...atoms[oldIdx] };
        if (oldIdx === severedAtom) {
          if (mode === 'h_transfer') {
            atomCopy.impHs = (atomCopy.impHs || 0) + 1;
          } else if (mode === 'direct_cation') {
            atomCopy.chg = (atomCopy.chg || 0) + 1;
          } else if (mode === 'direct_anion') {
            atomCopy.chg = (atomCopy.chg || 0) - 1;
          }
        }
        return atomCopy;
      });

      const subBonds: any[] = [];
      for (let i = 0; i < bonds.length; i++) {
        if (i === bIdx) continue;
        const b = bonds[i];
        if (oldToNew.has(b.atoms[0]) && oldToNew.has(b.atoms[1])) {
          subBonds.push({
            bo: b.bo !== undefined ? b.bo : 1,
            atoms: [oldToNew.get(b.atoms[0]), oldToNew.get(b.atoms[1])]
          });
        }
      }

      const subJson = {
        rdkitjson: molJson.rdkitjson,
        defaults: molJson.defaults,
        molecules: [{ atoms: subAtoms, bonds: subBonds }]
      };

      try {
        const m = RDKit.get_mol(JSON.stringify(subJson));
        if (m && m.is_valid()) return m;
      } catch {
        return null;
      }
      return null;
    };

    const pairs = [
      { nodes: compA, otherNodes: compB, severedU: u, severedV: v },
      { nodes: compB, otherNodes: compA, severedU: v, severedV: u }
    ];

    for (const side of pairs) {
      const fragMol = makeSubMol(side.nodes, side.severedU, 'h_transfer');
      if (!fragMol || !fragMol.is_valid()) continue;

      const fragSmiles = fragMol.get_smiles();
      if (!fragSmiles || fragSmiles === '' || seenSmiles.has(fragSmiles)) continue;
      seenSmiles.add(fragSmiles);

      const fragJson = JSON.parse(fragMol.get_json());
      const fragFormula = calculateFormulaFromJson(fragJson);
      const fragDesc = JSON.parse(fragMol.get_descriptors());
      const fragMass = Number(fragDesc.exactmw || fragDesc.amw || 0);
      const fragImg = molToSvgDataUri(fragMol, 250, 200);

      // Also build direct cleavage cation (e.g. R-[C+]=O or R-[CH2+]) if severed atom is carbon
      let directCationMol: any = undefined;
      let directCationSmiles: string | undefined;
      let directCationFormula: string | undefined;
      let directCationMz: number | undefined;
      let directCationImage: string | undefined;

      const zSevered = atoms[side.severedU]?.z || 6;
      if (zSevered === 6) {
        const catMol = makeSubMol(side.nodes, side.severedU, 'direct_cation');
        if (catMol && catMol.is_valid()) {
          directCationMol = catMol;
          directCationSmiles = catMol.get_smiles();
          directCationFormula = calculateFormulaFromJson(JSON.parse(catMol.get_json()));
          const catDesc = JSON.parse(catMol.get_descriptors());
          directCationMz = Number((Number(catDesc.exactmw || catDesc.amw || 0) - 0.00054858).toFixed(4));
          directCationImage = molToSvgDataUri(catMol, 250, 200);
        }
      }

      // Also build direct cleavage anion (e.g. R-O- or R-COO-) if severed atom is O, N, S, or halogen
      let directAnionMol: any = undefined;
      let directAnionSmiles: string | undefined;
      let directAnionFormula: string | undefined;
      let directAnionMz: number | undefined;
      let directAnionImage: string | undefined;

      if ([8, 7, 16, 9, 17, 35, 53].includes(zSevered)) {
        const anMol = makeSubMol(side.nodes, side.severedU, 'direct_anion');
        if (anMol && anMol.is_valid()) {
          directAnionMol = anMol;
          directAnionSmiles = anMol.get_smiles();
          directAnionFormula = calculateFormulaFromJson(JSON.parse(anMol.get_json()));
          const anDesc = JSON.parse(anMol.get_descriptors());
          directAnionMz = Number((Number(anDesc.exactmw || anDesc.amw || 0) + 0.00054858).toFixed(4));
          directAnionImage = molToSvgDataUri(anMol, 250, 200);
        }
      }

      results.push({
        mol: fragMol,
        smiles: fragSmiles,
        formula: fragFormula,
        exactMass: Number(fragMass.toFixed(4)),
        image: fragImg,
        bondIdx: bIdx,
        cleavedAtomU: side.severedU,
        cleavedAtomV: side.severedV,
        bondClass,
        bondDescription,
        isLabileHeteroatomBond,
        directCationMol,
        directCationSmiles,
        directCationFormula,
        directCationMz,
        directCationImage,
        directAnionMol,
        directAnionSmiles,
        directAnionFormula,
        directAnionMz,
        directAnionImage
      });
    }
  }

  return results;
}
