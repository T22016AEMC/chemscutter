/// <reference types="vite/client" />
import { beforeAll, describe, expect, it } from 'vitest';
import { getRDKit } from '../../src/engine/rdkit/loader';
import type { RDKitModule } from '../../src/engine/rdkit/types';
import { prepareStructure } from '../../src/engine/chem/prepareStructure';
import { parseInputToMol } from '../../src/engine/chem/inputParsing';
import { InputValidationError } from '../../src/shared/inputErrors';
import { unsupportedCheck } from '../../src/shared/structureChecks';
import { createStructureSession } from '../../src/worker/structureSession';
import originalMolfile from './problem-a-ketcher-v3000.mol?raw';

let rdkit: RDKitModule;
beforeAll(async () => { rdkit = await getRDKit(); });
const reported = 'O=C(C=C)OC(CC12)C(C2)C(C1C1)C=C1';

describe('問題 A：繪圖器預檢與 RDKit 解析分開處理', () => {
  it('Indigo 未指定立體組態的警告不會阻止交給 RDKit 驗證', () => {
    expect(unsupportedCheck({ stereo: 'Structure contains stereocenters with undefined stereo configuration: (5,7,8,10,11)' })).toBe(false);
    expect(unsupportedCheck({ query: 'Structure contains query features' })).toBe(true);
  });

  it('實際 Ketcher V3000 匯出與原始 SMILES 得到相同 RDKit 結構', () => {
    expect(originalMolfile).toContain('V3000');
    expect(prepareStructure(originalMolfile, rdkit).inputSmiles).toBe(prepareStructure(reported, rdkit).inputSmiles);
  });

  // 只驗證解析往返，不替使用者判斷化學正確性；名稱來源記錄於問題調查文件。
  it.each([
    ['問題 A', reported], ['norbornane', 'C1CC2CCC1C2'],
    ['adamantane', 'C1C2CC3CC1CC(C2)C3'], ['camphor', 'CC1(C)C2CCC1(C)C(=O)C2'],
    ['cubane', 'C12C3C4C1C5C2C3C45'], ['稠環', 'c1ccc2ccccc2c1'],
    ['含 @', 'N[C@@H](Cc1ccccc1)C(O)=O']
  ])('%s 的直接 SMILES 與 V2000／V3000 兩條轉換路徑一致', (_name, smiles) => {
    const mol = rdkit.get_mol(smiles)!;
    expect(mol?.is_valid()).toBe(true);
    try {
      const canonical = mol.get_smiles();
      expect(prepareStructure(smiles, rdkit).inputSmiles).toBe(canonical);
      for (const block of [mol.get_molblock(), mol.get_v3Kmolblock()]) {
        expect(prepareStructure(block, rdkit).inputSmiles).toBe(canonical);
      }
    } finally { mol.delete(); }
  });

  it('既有 SMILES 語法修復行為不變', () => {
    const parsed = parseInputToMol('CC(O', rdkit);
    try { expect(prepareStructure('CC(O', rdkit).inputSmiles).toBe(parsed.mol!.get_smiles()); }
    finally { parsed.mol?.delete(); }
  });
});

describe('輸入錯誤分類與 RDKit 原始訊息', () => {
  it.each([
    ['', 'EMPTY_INPUT', '尚未執行'], ['not_a_molecule_xyz', 'UNPARSABLE', 'SMILES Parse Error'],
    ['C(C)(C)(C)(C)C', 'SANITIZATION_FAILED', 'Explicit valence'],
    ['*', 'UNSUPPORTED_CONTENT', 'RDKit'], ['CC>>CO', 'UNSUPPORTED_CONTENT', '反應式']
  ])('%s 以 %s 分類，附上來源與原始訊息', (input, category, details) => {
    try { prepareStructure(input, rdkit); throw new Error('應拒絕輸入'); }
    catch (error) {
      expect(error).toBeInstanceOf(InputValidationError);
      expect(error).toMatchObject({ category, details: expect.stringContaining(details) });
    }
  });

  it('Worker 將分類與原始訊息傳給介面', async () => {
    expect(await createStructureSession()({ type: 'prepare', id: 1, input: 'not_a_molecule_xyz' })).toMatchObject({
      type: 'error', category: 'UNPARSABLE', details: expect.stringContaining('SMILES Parse Error')
    });
  });
});
