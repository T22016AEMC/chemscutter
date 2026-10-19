// 分子標準化（Q14：鹽類與帶電輸入）的化學正確性測試（永久保留）。
import { beforeAll, describe, expect, it } from 'vitest';
import { runMultiPlatformAnalysis } from '../../src/engine';
import { standardizeMolecule } from '../../src/engine/chem/standardize';
import { getRDKit } from '../../src/engine/rdkit/loader';
import type { RDKitModule } from '../../src/engine/rdkit/types';
import { TECHNIQUES } from '../fixtures/cases';

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

/** 標準化後的 SMILES 與說明 */
function standardize(smiles: string) {
  const mol = RDKit.get_mol(smiles);
  if (!mol) throw new Error(`無法解析：${smiles}`);
  const result = standardizeMolecule(mol, RDKit);
  const out = { smiles: result.mol.get_smiles(), removed: result.removedComponents, note: result.note, same: result.mol === mol };
  if (result.mol !== mol) result.mol.delete();
  mol.delete();
  return out;
}

const canonical = (smiles: string) => {
  const m = RDKit.get_mol(smiles)!;
  const s = m.get_smiles();
  m.delete();
  return s;
};

describe('分子標準化', () => {
  describe.each(TECHNIQUES.map((t) => [t]))('sodium_benzoate（%s 預設）', (technique) => {
    it('以苯甲酸 C7H6O2 分析，移除 Na，且除 [M+Na]+ 類加合物外沒有含 Na 的離子式', async () => {
      const result = await runMultiPlatformAnalysis('[Na+].[O-]C(=O)c1ccccc1', { technique });
      expect(result.parent.formula).toBe('C7H6O2');
      expect(result.parent.removed_components).toContain('[Na+]');
      expect(result.parent.standardization_note).toBeTruthy();
      const naIons = (result.candidates ?? []).filter((c) => /Na/.test(c.formula) && !/Na\]/.test(c.ionType));
      expect(naIons.map((c) => `${c.ionType} ${c.formula}`)).toStrictEqual([]);
    });
  });

  it('nitrobenzene：硝基不被改動，無 standardization_note', async () => {
    const s = standardize('[O-][N+](=O)c1ccccc1');
    expect(s.same).toBe(true);
    expect(s.smiles).toBe(canonical('[O-][N+](=O)c1ccccc1'));
    expect(s.note).toBeUndefined();

    const result = await runMultiPlatformAnalysis('[O-][N+](=O)c1ccccc1', { technique: 'TOF-SIMS' });
    expect(result.parent.smiles).toBe(result.parent.input_smiles);
    expect(result.parent.removed_components).toStrictEqual([]);
    expect(result.parent.standardization_note).toBeUndefined();
  });

  it('tetramethylammonium：永久正電荷保持帶電、不出錯', async () => {
    const s = standardize('C[N+](C)(C)C');
    expect(s.same).toBe(true);
    expect(s.smiles).toBe('C[N+](C)(C)C');

    for (const technique of TECHNIQUES) {
      const result = await runMultiPlatformAnalysis('C[N+](C)(C)C', { technique });
      expect(result.parent.smiles).toBe('C[N+](C)(C)C');
      expect((result.candidates ?? []).length).toBeGreaterThan(0);
    }
  });

  it('兩性離子甘胺酸 [NH3+]CC([O-])=O 中和為 NCC(O)=O', () => {
    const s = standardize('[NH3+]CC([O-])=O');
    expect(s.smiles).toBe(canonical('NCC(O)=O'));
    expect(s.removed).toStrictEqual([]);
    expect(s.note).toBeTruthy();
  });
});
