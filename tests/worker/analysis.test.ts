import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAnalysisRequest } from '../../src/worker/handleAnalysis';
import { isAnalysisRequest, techniques } from '../../src/worker/protocol';
import * as loader from '../../src/engine/rdkit/loader';

const request = { type: 'analyze', id: 7, smiles: 'CCOC(C)=O', technique: 'TOF-SIMS' };
afterEach(() => vi.restoreAllMocks());

describe('Worker 訊息協定', () => {
  it.each([null, {}, { ...request, type: 'other' }, { ...request, id: NaN },
    { ...request, smiles: 123 }, { ...request, technique: 'unknown' }])('拒絕不完整或無效的要求：%j', async (value) => {
    expect(isAnalysisRequest(value)).toBe(false);
    expect(await handleAnalysisRequest(value)).toMatchObject({ type: 'error', id: null, code: 'INVALID_REQUEST' });
  });

  it.each(techniques)('%s 回傳相同要求編號、平台與可傳遞的結果', async (technique) => {
    const response = await handleAnalysisRequest({ ...request, technique });
    expect(response.type).toBe('result');
    expect(response.id).toBe(7);
    if (response.type !== 'result') throw new Error(response.message);
    expect(response.result.technique).toBe(technique);
    expect(response.result.candidates!.length).toBeGreaterThan(0);
    expect(response.result.candidates!.every((candidate) => Number.isFinite(candidate.mz))).toBe(true);
    expect(structuredClone(response)).toStrictEqual(response);
  });

  it('空白輸入不載入引擎', async () => {
    const init = vi.spyOn(loader, 'getRDKit');
    expect(await handleAnalysisRequest({ ...request, smiles: '  ' })).toMatchObject({
      type: 'error', id: 7, code: 'EMPTY_INPUT', message: '請輸入 SMILES。'
    });
    expect(init).not.toHaveBeenCalled();
  });

  it('無效 SMILES 回傳提示，之後仍可分析有效輸入', async () => {
    expect(await handleAnalysisRequest({ ...request, smiles: 'not_a_molecule_xyz' })).toMatchObject({
      type: 'error', id: 7, code: 'ANALYSIS_FAILED', message: expect.stringContaining('無法辨識化學結構式')
    });
    expect(await handleAnalysisRequest({ ...request, id: 8 })).toMatchObject({ type: 'result', id: 8 });
  });

  it('載入失敗回傳可供介面重試的錯誤', async () => {
    vi.spyOn(loader, 'getRDKit').mockRejectedValueOnce(new Error('WASM unavailable'));
    expect(await handleAnalysisRequest(request)).toEqual({
      type: 'error', id: 7, code: 'ENGINE_LOAD_FAILED', message: '分析引擎載入失敗，請確認網路連線後再試。'
    });
  });
});
