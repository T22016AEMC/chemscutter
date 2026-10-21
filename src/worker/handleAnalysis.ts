import { runMultiPlatformAnalysis } from '../engine';
import { getRDKit, type RDKitLoaderOptions } from '../engine/rdkit/loader';
import { isAnalysisRequest, type AnalysisResponse } from './protocol';

export async function handleAnalysisRequest(
  request: unknown,
  loaderOptions?: RDKitLoaderOptions
): Promise<AnalysisResponse> {
  if (!isAnalysisRequest(request)) {
    return { type: 'error', id: null, code: 'INVALID_REQUEST', message: '分析要求格式不正確。請重新整理頁面後再試。' };
  }
  const { id, smiles, technique } = request;
  if (!smiles.trim()) {
    return { type: 'error', id, code: 'EMPTY_INPUT', message: '請輸入 SMILES。' };
  }
  try {
    // 必須先設定 locateFile，因為引擎會沿用同一個 RDKit 實例。
    await getRDKit(loaderOptions);
  } catch {
    return { type: 'error', id, code: 'ENGINE_LOAD_FAILED', message: '分析引擎載入失敗，請確認網路連線後再試。' };
  }
  try {
    const result = await runMultiPlatformAnalysis(smiles, { technique });
    return { type: 'result', id, result };
  } catch (error) {
    return {
      type: 'error', id, code: 'ANALYSIS_FAILED',
      message: error instanceof Error ? error.message : '分析失敗，請檢查 SMILES 後再試。'
    };
  }
}
