import { describe, expect, it } from 'vitest';
import { getRDKit } from '../../src/engine/rdkit/loader';
import { buildCases, buildExtraCases, buildGapCases, buildGoldenCases, ETHYL_ACETATE_MOLBLOCK, ETHYL_ACETATE_SMILES, INPUTS } from './cases';

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

  it('標準答案完整清單：93 + 462 + 36 = 591 個，ID 不重複，且前 93 個與 buildCases() 相同', () => {
    const golden = buildGoldenCases();
    expect(buildExtraCases()).toHaveLength(462);
    expect(buildGapCases()).toHaveLength(36);
    expect(golden).toHaveLength(591);
    expect(new Set(golden.map((c) => c.id)).size).toBe(591);
    expect(golden.slice(0, 93)).toStrictEqual(buildCases());
  });
});
