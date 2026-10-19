import { describe, expect, it } from 'vitest';
import { getRDKit } from '../../src/engine/rdkit/loader';
import { buildGoldenCases, ETHYL_ACETATE_MOLBLOCK, ETHYL_ACETATE_SMILES, INPUTS } from './cases';

describe('共用測試案例', () => {
  it('Molfile 字面值與 RDKit get_molblock() 產生的內容相同', async () => {
    const RDKit = await getRDKit();
    const mol = RDKit.get_mol(ETHYL_ACETATE_SMILES);
    expect(mol).not.toBeNull();
    try {
      expect(mol!.get_molblock()).toBe(ETHYL_ACETATE_MOLBLOCK);
    } finally {
      mol!.delete();
    }
  });

  it('標準答案案例：20 種輸入、共 591 個，ID 不重複', () => {
    const golden = buildGoldenCases();
    expect(INPUTS).toHaveLength(20);
    expect(golden).toHaveLength(591);
    expect(new Set(golden.map((c) => c.id)).size).toBe(591);
  });
});
