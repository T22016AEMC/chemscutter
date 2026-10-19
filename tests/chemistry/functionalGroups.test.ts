// 官能基偵測的化學正確性測試（永久保留）。
// 這些測試描述「應該如此」的化學判斷，不依賴標準答案檔；標準答案只記錄目前輸出。
import { beforeAll, describe, expect, it } from 'vitest';
import { runMultiPlatformAnalysis } from '../../src/engine';
import { parseInputToMol } from '../../src/engine/chem/inputParsing';
import { getRDKit } from '../../src/engine/rdkit/loader';
import type { RDKitModule } from '../../src/engine/rdkit/types';
import { detectFunctionalGroups, type FunctionalGroupInfo } from '../../src/engine/rules/functionalGroups';
import { EXTRA_MOLECULES, MOLECULES } from '../fixtures/cases';

// 額外分子名稱（測試規格使用的名稱）→ SMILES
const SMILES: Record<string, string> = {
  ...MOLECULES,
  ...EXTRA_MOLECULES,
  ethyl_acetate: 'CCOC(C)=O'
};

let RDKit: RDKitModule;
beforeAll(async () => {
  RDKit = await getRDKit();
});

function groupsOf(name: string): FunctionalGroupInfo {
  const smiles = SMILES[name];
  if (!smiles) throw new Error(`未定義的分子：${name}`);
  const { mol } = parseInputToMol(smiles, RDKit);
  if (!mol) throw new Error(`無法解析：${name}`);
  try {
    return detectFunctionalGroups(mol, RDKit);
  } finally {
    mol.delete();
  }
}

type BooleanFlag = {
  [K in keyof FunctionalGroupInfo]: FunctionalGroupInfo[K] extends boolean ? K : never;
}[keyof FunctionalGroupInfo];

function expectFlag(flag: BooleanFlag, trueNames: string[], falseNames: string[]) {
  describe(flag, () => {
    it.each(trueNames.map((n) => [n]))(`${flag} = true：%s`, (name) => {
      expect(groupsOf(name)[flag]).toBe(true);
    });
    it.each(falseNames.map((n) => [n]))(`${flag} = false：%s`, (name) => {
      expect(groupsOf(name)[flag]).toBe(false);
    });
  });
}

describe('官能基偵測', () => {
  // Q15：乙醯基（CH3-C=O）
  expectFlag(
    'hasAcetylGroup',
    ['hexan_2_one', 'aspirin', 'acetaminophen', 'acetophenone', 'acetic_acid', 'n_methylacetamide'],
    ['cyclohexanone', 'testosterone', 'methyl_hexanoate', 'methyl_benzoate', 'butyrophenone']
  );

  // Q15：乙酸酯（CH3-C(=O)-O-C）
  expectFlag(
    'hasAcetate',
    ['aspirin', 'ethyl_acetate'],
    ['methyl_benzoate', 'methyl_hexanoate', 'diethyl_carbonate']
  );
});

describe('乙醯基鎓離子 C2H3O+ 的產生（TOF-SIMS 預設）', () => {
  async function ionFormulas(name: string): Promise<string[]> {
    const result = await runMultiPlatformAnalysis(SMILES[name], { technique: 'TOF-SIMS' });
    return (result.candidates ?? []).map((c) => c.formula);
  }

  it.each([['cyclohexanone'], ['testosterone'], ['methyl_hexanoate']])('%s 沒有 C2H3O+', async (name) => {
    expect(await ionFormulas(name)).not.toContain('C2H3O+');
  });

  it.each([['hexan_2_one'], ['aspirin']])('%s 有 C2H3O+', async (name) => {
    expect(await ionFormulas(name)).toContain('C2H3O+');
  });
});
