/// <reference types="vite/client" />
import { describe, expect, it, vi } from 'vitest';
import { createStructureSession, isStructureRequest } from '../../src/worker/structureSession';
import { runMultiPlatformAnalysis } from '../../src/engine';
import { techniques } from '../../src/worker/protocol';
import { prepareStructure } from '../../src/engine/chem/prepareStructure';
import { getRDKit } from '../../src/engine/rdkit/loader';
import originalMolfile from './problem-a-ketcher-v3000.mol?raw';

const reported = 'O=C(C=C)OC(CC12)C(C2)C(C1C1)C=C1';
describe('問題 B：文字直接分析，不依賴 iframe', () => {
  it.each(techniques)('%s：乙酸乙酯、橋環及 Molfile 完整結果與原始引擎相同', async (technique) => {
    for (const input of ['CCOC(C)=O', reported, originalMolfile]) {
      const session = createStructureSession();
      const prepared = await session({ type: 'prepare', id: 1, input, source: 'text' });
      expect(prepared).toMatchObject({ type: 'prepared', structure: { multipleComponents: false } });
      if (prepared?.type !== 'prepared') throw new Error('準備失敗');
      expect(decodeURIComponent(prepared.structure.retainedImage)).toContain('<svg');
      const result = await session({ type: 'run-prepared', id: 2, preparationId: 1, confirmed: false, technique });
      expect(result).toEqual({ type: 'result', id: 2, result: await runMultiPlatformAnalysis(input, { technique }) });
    }
  });

  it.each([['', 'EMPTY_INPUT'], ['not_a_molecule_xyz', 'UNPARSABLE'], ['C(C)(C)(C)(C)C', 'SANITIZATION_FAILED']])(
    '直接輸入 %s 失敗時不會呼叫引擎，且回傳明確分類', async (input, category) => {
      const analyze = vi.fn<typeof runMultiPlatformAnalysis>();
      const session = createStructureSession(analyze);
      expect(await session({ type: 'prepare', id: 1, input, source: 'text' })).toMatchObject({ type: 'error', category });
      await session({ type: 'run-prepared', id: 2, preparationId: 1, confirmed: true, technique: 'TOF-SIMS' });
      expect(analyze).not.toHaveBeenCalled();
    });

  it('多成分顯示既有說明及移除成分，未確認不呼叫引擎，確認後保留原始輸入', async () => {
    const input = '[Na+].[O-]C(=O)c1ccccc1';
    const analyze = vi.fn<typeof runMultiPlatformAnalysis>().mockResolvedValue(await runMultiPlatformAnalysis(input, { technique: 'GC-MS' }));
    const session = createStructureSession(analyze);
    const response = await session({ type: 'prepare', id: 1, input, source: 'text' });
    expect(response).toMatchObject({ type: 'prepared', structure: {
      multipleComponents: true, removed_components: ['[Na+]'], retainedSmiles: 'O=C(O)c1ccccc1',
      standardization_note: expect.stringContaining('[Na+]')
    } });
    expect(analyze).not.toHaveBeenCalled();
    const request = { type: 'run-prepared', id: 2, preparationId: 1, confirmed: false, technique: 'GC-MS' };
    expect(await session(request)).toMatchObject({ type: 'error', category: 'MULTIPLE_COMPONENTS' });
    expect(analyze).not.toHaveBeenCalled();
    await session({ ...request, confirmed: true });
    expect(analyze).toHaveBeenCalledExactlyOnceWith(input, { technique: 'GC-MS' });
  });

  it('來源欄位拒絕不合法資料', () => {
    expect(isStructureRequest({ type: 'prepare', id: 1, input: 'CCO', source: 'text' })).toBe(true);
    expect(isStructureRequest({ type: 'prepare', id: 1, input: 'CCO', source: 'other' })).toBe(false);
  });

  it('直接路徑不改變既有的語法修復及回傳格式', async () => {
    const session = createStructureSession();
    await session({ type: 'prepare', id: 1, input: 'CC(O', source: 'text' });
    expect(await session({ type: 'run-prepared', id: 2, preparationId: 1, confirmed: false, technique: 'GC-MS' }))
      .toEqual({ type: 'result', id: 2, result: await runMultiPlatformAnalysis('CC(O', { technique: 'GC-MS' }) });
  });

  it.each(['M  STY  1   1 SRU', 'M  V30 1 SRU 0 ATOMS=(2 1 2)'])('聚合物格式標記 %s 不送進解析或引擎', async (input) => {
    const rdkit = await getRDKit();
    expect(() => prepareStructure(input, rdkit)).toThrow('不支援的內容');
  });
});
