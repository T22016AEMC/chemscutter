import { describe, expect, it } from 'vitest';
import { getRDKit } from '../../src/engine/rdkit/loader';
import { buildCases, ETHYL_ACETATE_MOLBLOCK, ETHYL_ACETATE_SMILES, INPUTS } from './cases';

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

  it('案例數量與 ID 不重複', () => {
    const cases = buildCases();
    expect(INPUTS).toHaveLength(20);
    expect(cases).toHaveLength(93);
    expect(new Set(cases.map((c) => c.id)).size).toBe(93);
  });
});
