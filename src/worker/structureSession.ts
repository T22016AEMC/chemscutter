import { getRDKit, type RDKitLoaderOptions } from '../engine/rdkit/loader';
import { prepareStructure, type PreparedStructure } from '../engine/chem/prepareStructure';
import { runMultiPlatformAnalysis } from '../engine';
import { techniques, type AnalysisResponse } from './protocol';
import type { MassTechnique } from '../engine/types';
import { InputValidationError, inputMessages } from '../shared/inputErrors';

export type StructureRequest =
  | { type: 'prepare'; id: number; input: string; source?: 'text' | 'drawing' }
  | { type: 'run-prepared'; id: number; preparationId: number; confirmed: boolean; technique: MassTechnique }
  | { type: 'invalidate'; id: number };
export type StructureResponse = AnalysisResponse | { type: 'prepared'; id: number; structure: PreparedStructure };

export function isStructureRequest(value: unknown): value is StructureRequest {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (!Number.isSafeInteger(r.id) || (r.id as number) <= 0) return false;
  return r.type === 'invalidate' || (r.type === 'prepare' && typeof r.input === 'string'
    && (r.source === undefined || r.source === 'text' || r.source === 'drawing'))
    || (r.type === 'run-prepared' && Number.isSafeInteger(r.preparationId) && (r.preparationId as number) > 0
      && typeof r.confirmed === 'boolean' && techniques.includes(r.technique as MassTechnique));
}

/** 準備與確認綁定同一份結構；多成分未確認時絕不呼叫分析引擎。 */
export function createStructureSession(analyze = runMultiPlatformAnalysis) {
  let pending: { id: number; structure: PreparedStructure; analysisInput: string } | null = null;
  return async (request: unknown, options?: RDKitLoaderOptions): Promise<StructureResponse | null> => {
    if (!isStructureRequest(request)) return { type: 'error', id: null, code: 'INVALID_REQUEST', message: '結構要求格式不正確。' };
    const { id } = request;
    if (request.type === 'invalidate') { pending = null; return null; }
    let loadingEngine = false;
    try {
      if (request.type === 'prepare') {
        pending = null;
        loadingEngine = true;
        const rdkit = await getRDKit(options);
        loadingEngine = false;
        const structure = prepareStructure(request.input, rdkit);
        // 文字路徑保留原輸入的解析行為；繪圖路徑維持既有的 Molfile → SMILES 轉換。
        pending = { id, structure, analysisInput: request.source === 'text' ? request.input : structure.inputSmiles };
        return { type: 'prepared', id, structure };
      }
      if (!pending || pending.id !== request.preparationId) throw new Error('結構已變更，請重新驗證文字或取得繪圖結構。');
      if (pending.structure.multipleComponents && !request.confirmed) throw new InputValidationError('MULTIPLE_COMPONENTS', '來源：確認流程；未呼叫分析引擎。');
      const input = pending.analysisInput;
      const result = await analyze(input, { technique: request.technique });
      return { type: 'result', id, result };
    } catch (error) {
      if (loadingEngine) return { type: 'error', id, code: 'ENGINE_LOAD_FAILED', message: '分析引擎載入失敗，請確認網路連線後再試。' };
      if (error instanceof InputValidationError) return { type: 'error', id, code: 'ANALYSIS_FAILED', category: error.category, message: error.message, details: error.details };
      return { type: 'error', id, code: 'ANALYSIS_FAILED', category: 'OTHER', message: inputMessages.OTHER,
        details: `來源：Worker 流程；RDKit 未提供額外訊息。\n${error instanceof Error ? error.message : String(error)}` };
    }
  };
}
