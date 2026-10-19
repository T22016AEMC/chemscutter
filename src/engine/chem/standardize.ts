// 分析前的分子標準化（Q14）：移除抗衡離子、以加減 H 中和可中和的電荷。
// RDKit MinimalLib（@rdkit/rdkit）沒有提供 fragment parent／charge parent／uncharger，
// 因此在 CommonChem JSON 分子圖上自行實作，中和規則仿照 RDKit 的 Uncharger：
// 1. 帶 H 的正電原子（如 NH3+）移除 H 與正電荷
// 2. 不帶 H 的正電荷（如四級銨、硝基 N+）無法以 H 中和，保留等量的負電荷與之平衡
//    （優先保留與這類正電原子相鄰的負電原子，例如硝基的 O-），因此硝基等淨電荷為 0 的電荷分離結構不會被改動
// 3. 其餘負電原子加 H 中和（如 COO- → COOH）
// 無法中和的永久電荷（如四級銨單獨存在）保留原樣（Q32，之後處理）。
import type { CommonChemAtom, CommonChemBond, CommonChemJson, JSMol, RDKitModule } from '../rdkit/types';

export interface StandardizationResult {
  /** 標準化後的分子；未做任何改動時就是傳入的分子物件本身 */
  mol: JSMol;
  /** 被移除的成分（抗衡離子等）的 SMILES */
  removedComponents: string[];
  /** 是否中和了電荷 */
  neutralized: boolean;
  /** 繁體中文說明；未做任何改動時為 undefined */
  note?: string;
}

const atomicNumber = (a: CommonChemAtom) => (a.z !== undefined ? a.z : 6);

/** 將分子圖拆成不相連的成分，回傳每個成分的原子索引（依最小索引排序） */
function connectedComponents(atoms: CommonChemAtom[], bonds: CommonChemBond[]): number[][] {
  const adj: number[][] = atoms.map(() => []);
  for (const b of bonds) {
    adj[b.atoms[0]].push(b.atoms[1]);
    adj[b.atoms[1]].push(b.atoms[0]);
  }
  const seen = new Array<boolean>(atoms.length).fill(false);
  const comps: number[][] = [];
  for (let start = 0; start < atoms.length; start++) {
    if (seen[start]) continue;
    const comp: number[] = [];
    const queue = [start];
    seen[start] = true;
    while (queue.length > 0) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const n of adj[cur]) {
        if (!seen[n]) {
          seen[n] = true;
          queue.push(n);
        }
      }
    }
    comps.push(comp.sort((x, y) => x - y));
  }
  return comps;
}

/** 依原子索引子集合建立新的 CommonChem JSON（保留原子與鍵的所有欄位） */
function subsetJson(json: CommonChemJson, keep: number[], atoms: CommonChemAtom[], bonds: CommonChemBond[]) {
  const oldToNew = new Map<number, number>();
  keep.forEach((oldIdx, newIdx) => oldToNew.set(oldIdx, newIdx));
  return {
    rdkitjson: json.rdkitjson,
    defaults: json.defaults,
    molecules: [
      {
        atoms: keep.map((i) => ({ ...atoms[i] })),
        bonds: bonds
          .filter((b) => oldToNew.has(b.atoms[0]) && oldToNew.has(b.atoms[1]))
          .map((b) => ({ ...b, atoms: [oldToNew.get(b.atoms[0])!, oldToNew.get(b.atoms[1])!] as [number, number] }))
      }
    ]
  };
}

/**
 * 以加減 H 中和電荷（就地修改傳入的原子陣列），回傳是否有任何改動。
 */
function neutralizeAtoms(atoms: CommonChemAtom[], bonds: CommonChemBond[]): boolean {
  let changed = false;
  const neighbors: number[][] = atoms.map(() => []);
  for (const b of bonds) {
    neighbors[b.atoms[0]].push(b.atoms[1]);
    neighbors[b.atoms[1]].push(b.atoms[0]);
  }

  // 1. 帶 H 的正電原子：移除 H 與正電荷；不帶 H 的正電荷無法中和，記錄下來
  let fixedPositive = 0;
  const fixedPositiveAtoms = new Set<number>();
  atoms.forEach((a, i) => {
    let chg = a.chg || 0;
    while (chg > 0 && (a.impHs || 0) > 0) {
      a.impHs = (a.impHs || 0) - 1;
      chg -= 1;
      changed = true;
    }
    a.chg = chg;
    if (chg > 0) {
      fixedPositive += chg;
      fixedPositiveAtoms.add(i);
    }
  });

  // 2. 負電原子：保留與無法中和的正電荷等量的負電荷（優先保留相鄰者），其餘加 H 中和
  const negatives = atoms
    .map((a, i) => ({ i, chg: a.chg || 0 }))
    .filter((x) => x.chg < 0)
    .sort((x, y) => {
      const xa = neighbors[x.i].some((n) => fixedPositiveAtoms.has(n)) ? 0 : 1;
      const ya = neighbors[y.i].some((n) => fixedPositiveAtoms.has(n)) ? 0 : 1;
      return xa - ya || x.i - y.i;
    });
  let keepNegative = fixedPositive;
  for (const { i } of negatives) {
    const a = atoms[i];
    let chg = a.chg || 0;
    while (chg < 0) {
      if (keepNegative > 0) {
        keepNegative -= 1;
        chg += 1;
        continue;
      }
      a.impHs = (a.impHs || 0) + 1;
      a.chg = (a.chg || 0) + 1;
      chg += 1;
      changed = true;
    }
  }

  // 清掉歸零的電荷欄位，讓 JSON 與未帶電原子一致
  for (const a of atoms) {
    if (a.chg === 0) delete a.chg;
  }
  return changed;
}

/**
 * 標準化分子：保留最大的有機成分（重原子最多，同數時取碳數多者；沒有含碳成分時取最大成分），
 * 移除其餘成分，並中和可中和的電荷。
 */
export function standardizeMolecule(mol: JSMol, RDKit: RDKitModule): StandardizationResult {
  const json = JSON.parse(mol.get_json()) as CommonChemJson;
  const atoms = json.molecules?.[0]?.atoms || [];
  const bonds = json.molecules?.[0]?.bonds || [];

  // --- 成分拆分 ---
  const comps = connectedComponents(atoms, bonds);
  const heavy = (c: number[]) => c.filter((i) => atomicNumber(atoms[i]) !== 1).length;
  const carbons = (c: number[]) => c.filter((i) => atomicNumber(atoms[i]) === 6).length;
  const organic = comps.filter((c) => carbons(c) > 0);
  const pool = organic.length > 0 ? organic : comps;
  let main = pool[0];
  for (const c of pool) {
    if (heavy(c) > heavy(main) || (heavy(c) === heavy(main) && carbons(c) > carbons(main))) main = c;
  }

  const removedComponents: string[] = [];
  for (const c of comps) {
    if (c === main) continue;
    const m = RDKit.get_mol(JSON.stringify(subsetJson(json, c, atoms, bonds)));
    if (m) {
      removedComponents.push(m.get_smiles());
      m.delete();
    }
  }

  // --- 中和（在主成分的副本上進行）---
  const mainJson = subsetJson(json, main, atoms, bonds);
  const neutralized = neutralizeAtoms(mainJson.molecules[0].atoms, mainJson.molecules[0].bonds);

  if (removedComponents.length === 0 && !neutralized) {
    return { mol, removedComponents, neutralized: false };
  }

  const stdMol = RDKit.get_mol(JSON.stringify(mainJson));
  if (!stdMol || !stdMol.is_valid()) {
    // 標準化失敗時退回原分子，不中斷分析
    stdMol?.delete();
    return { mol, removedComponents: [], neutralized: false };
  }

  const parts: string[] = [];
  if (removedComponents.length > 0) parts.push(`已移除抗衡離子 ${removedComponents.join('、')}`);
  parts.push(neutralized ? '並中和為中性母體分析' : '以最大有機成分分析');
  const note = removedComponents.length > 0 ? parts.join('，') : '已將帶電結構中和為中性母體分析';

  return { mol: stdMol, removedComponents, neutralized, note };
}
