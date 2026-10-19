import { describe, expect, it } from 'vitest';
import initRDKitModule from '@rdkit/rdkit';

// 煙霧測試用的簡易元素表（僅涵蓋阿斯匹靈所需元素）
const SYMBOLS: Record<number, string> = { 1: 'H', 6: 'C', 8: 'O' };

interface RdkitJsonAtom {
  z?: number;
  impHs?: number;
}

interface RdkitJson {
  defaults: { atom: { z: number; impHs: number } };
  molecules: { atoms: RdkitJsonAtom[] }[];
}

// 由 RDKit JSON 統計原子數並以 Hill 順序（C、H、其餘依字母）組成分子式
function formulaFromJson(json: RdkitJson): string {
  const counts: Record<string, number> = {};
  for (const atom of json.molecules[0].atoms) {
    const z = atom.z ?? json.defaults.atom.z;
    const impHs = atom.impHs ?? json.defaults.atom.impHs;
    const sym = SYMBOLS[z] ?? `Z${z}`;
    counts[sym] = (counts[sym] ?? 0) + 1;
    if (impHs > 0) counts.H = (counts.H ?? 0) + impHs;
  }
  const order = ['C', 'H', ...Object.keys(counts).filter((s) => s !== 'C' && s !== 'H').sort()];
  return order
    .filter((s) => counts[s])
    .map((s) => s + (counts[s] > 1 ? counts[s] : ''))
    .join('');
}

// 確認 RDKit WASM 能在 Node 測試環境載入並運作
describe('RDKit WASM 煙霧測試', () => {
  it('解析阿斯匹靈並取得分子式與單同位素質量', async () => {
    const RDKit = await initRDKitModule();
    const mol = RDKit.get_mol('CC(=O)Oc1ccccc1C(=O)O');
    expect(mol).not.toBeNull();
    try {
      expect(mol!.is_valid()).toBe(true);
      expect(formulaFromJson(JSON.parse(mol!.get_json()) as RdkitJson)).toBe('C9H8O4');
      const descriptors = JSON.parse(mol!.get_descriptors()) as Record<string, number>;
      expect(Math.abs(descriptors.exactmw - 180.0423)).toBeLessThan(0.0005);
    } finally {
      mol!.delete();
    }
  });
});
