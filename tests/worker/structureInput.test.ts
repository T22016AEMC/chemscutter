import { beforeAll, describe, expect, it, vi } from 'vitest';
import { getRDKit } from '../../src/engine/rdkit/loader';
import type { RDKitModule } from '../../src/engine/rdkit/types';
import { prepareStructure } from '../../src/engine/chem/prepareStructure';
import { runMultiPlatformAnalysis } from '../../src/engine';
import { createStructureSession, isStructureRequest } from '../../src/worker/structureSession';
import { FRAME_CHANNEL, fromExpectedWindow, isFrameRequest, isFrameResponse } from '../../src/shared/ketcherProtocol';
import { unsupportedDrawing } from '../../src/shared/structureChecks';
import { confirmationLines } from '../../src/ui/confirmation';
import { techniques } from '../../src/worker/protocol';
import * as loader from '../../src/engine/rdkit/loader';

let rdkit: RDKitModule;
beforeAll(async () => { rdkit = await getRDKit(); });
const smiles = 'CCOC(C)=O';

describe('結構輸入轉換與既有引擎相容', () => {
  it('SMILES 與 Molfile 轉換成相同結構，單一成分沒有多成分確認', () => {
    const first = prepareStructure(smiles, rdkit);
    const second = prepareStructure(first.retainedMolfile, rdkit);
    expect(second.inputSmiles).toBe(first.inputSmiles);
    expect(second.retainedSmiles).toBe(first.retainedSmiles);
    expect(first.multipleComponents).toBe(false);
    expect(confirmationLines(first)).toEqual([]);
    expect(first.retainedImage).toContain('data:image/svg+xml');
  });

  it.each(['', '  ', 'not_a_molecule_xyz', 'C(C)(C)(C)(C)C', '*', '[C,N]'])(
    '空白、無效、價鍵或查詢輸入不會進入分析：%s', (input) => {
      expect(() => prepareStructure(input, rdkit)).toThrow();
    });

  it('沿用既有標準化，完整顯示移除成分、保留成分及說明', () => {
    const result = prepareStructure('O=C([O-])c1ccccc1.[Na+]', rdkit);
    expect(result.multipleComponents).toBe(true);
    expect(result.removed_components).toEqual(['[Na+]']);
    expect(result.retainedSmiles).toBe('O=C(O)c1ccccc1');
    expect(confirmationLines(result)).toEqual([
      result.standardization_note, '被移除的成分：[Na+]', '保留成分 SMILES：O=C(O)c1ccccc1',
      '只會分析保留的成分。', '若要分析另一個成分，請回到 Ketcher 刪除其他成分後，再取得結構。'
    ]);
  });

  it.each(techniques)('%s 經 Molfile 匯出與準備後，完整結果與 2a SMILES 輸入一致', async (technique) => {
    const mol = rdkit.get_mol(smiles)!;
    const molfile = mol.get_molblock();
    mol.delete();
    const session = createStructureSession();
    await session({ type: 'prepare', id: 1, input: molfile });
    const response = await session({ type: 'run-prepared', id: 2, preparationId: 1, confirmed: false, technique });
    expect(response).toEqual({ type: 'result', id: 2, result: await runMultiPlatformAnalysis(smiles, { technique }) });
  });
});

describe('多成分確認邊界', () => {
  it('WASM 載入失敗回傳中文提示與可重新建立 Worker 的錯誤碼', async () => {
    const init = vi.spyOn(loader, 'getRDKit').mockRejectedValueOnce(new Error('WASM unavailable'));
    try {
      expect(await createStructureSession()({ type: 'prepare', id: 1, input: smiles })).toMatchObject({
        type: 'error', code: 'ENGINE_LOAD_FAILED', message: '分析引擎載入失敗，請確認網路連線後再試。'
      });
    } finally { init.mockRestore(); }
  });
  it('未準備、未確認、舊準備及編輯後的結構不會送進引擎', async () => {
    const analyze = vi.fn<typeof runMultiPlatformAnalysis>();
    const session = createStructureSession(analyze);
    const run = { type: 'run-prepared', id: 2, preparationId: 1, confirmed: false, technique: 'TOF-SIMS' };
    expect(await session(run)).toMatchObject({ type: 'error' });
    await session({ type: 'prepare', id: 1, input: 'CCO.O' });
    expect(analyze).not.toHaveBeenCalled();
    expect(await session(run)).toMatchObject({ type: 'error', message: expect.stringContaining('請先確認') });
    expect(analyze).not.toHaveBeenCalled();
    analyze.mockResolvedValueOnce(await runMultiPlatformAnalysis('CCO.O', { technique: 'TOF-SIMS' }));
    await session({ ...run, confirmed: true });
    expect(analyze).toHaveBeenCalledExactlyOnceWith('CCO.O', { technique: 'TOF-SIMS' });
    await session({ type: 'invalidate', id: 3 });
    expect(await session({ ...run, confirmed: true })).toMatchObject({ type: 'error' });
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('無效的新輸入會撤銷先前的準備', async () => {
    const analyze = vi.fn<typeof runMultiPlatformAnalysis>();
    const session = createStructureSession(analyze);
    await session({ type: 'prepare', id: 1, input: smiles });
    await session({ type: 'prepare', id: 2, input: '' });
    expect(await session({ type: 'run-prepared', id: 3, preparationId: 1, confirmed: true, technique: 'GC-MS' })).toMatchObject({ type: 'error' });
    expect(analyze).not.toHaveBeenCalled();
  });
});

describe('iframe 與 Worker 訊息協定', () => {
  const request = { channel: FRAME_CHANNEL, type: 'load', id: 1, input: smiles };
  it('同時驗證 origin 與 source，拒絕其他視窗與未建立的 iframe', () => {
    const frame = {}, other = {};
    expect(fromExpectedWindow({ origin: 'https://example.test', source: frame }, 'https://example.test', frame)).toBe(true);
    expect(fromExpectedWindow({ origin: 'https://evil.test', source: frame }, 'https://example.test', frame)).toBe(false);
    expect(fromExpectedWindow({ origin: 'https://example.test', source: other }, 'https://example.test', frame)).toBe(false);
    expect(fromExpectedWindow({ origin: 'https://example.test', source: null }, 'https://example.test', null)).toBe(false);
  });
  it('接受完整訊息並拒絕錯誤頻道、編號與欄位', () => {
    expect(isFrameRequest(request)).toBe(true);
    for (const bad of [null, {}, { ...request, channel: 'other' }, { ...request, id: 0 }, { ...request, input: {} }]) expect(isFrameRequest(bad)).toBe(false);
    expect(isFrameResponse({ channel: FRAME_CHANNEL, type: 'ready' })).toBe(true);
    expect(isFrameResponse({ channel: FRAME_CHANNEL, type: 'structure', id: 1, structure: { molfile: '', smiles: '', ket: '{}' } })).toBe(true);
    expect(isFrameResponse({ channel: FRAME_CHANNEL, type: 'structure', id: 1, structure: {} })).toBe(false);
    expect(isStructureRequest({ type: 'prepare', id: 1, input: '' })).toBe(true);
    expect(isStructureRequest({ type: 'run-prepared', id: 2, preparationId: 1, confirmed: 'yes', technique: 'GC-MS' })).toBe(false);
    expect(isStructureRequest({ type: 'analyze', id: 1, smiles, technique: 'GC-MS' })).toBe(false);
  });
  it.each(['arrow', 'plus', 'multi-tailed-arrow', 'SRU', 'MUL'])('拒絕不支援的繪圖物件 %s', (type) => {
    expect(unsupportedDrawing(JSON.stringify({ root: { nodes: [{ type }] } }))).toBeTruthy();
  });
  it('普通分子不被誤判，無效 KET 被拒絕', () => {
    expect(unsupportedDrawing('{"root":{"nodes":[{"type":"molecule"}]}}')).toBeUndefined();
    expect(unsupportedDrawing('broken')).toBeTruthy();
  });
});
