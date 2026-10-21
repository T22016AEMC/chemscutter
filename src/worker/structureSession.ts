import { getRDKit, type RDKitLoaderOptions } from '../engine/rdkit/loader';
import { prepareStructure, type PreparedStructure } from '../engine/chem/prepareStructure';
import { runMultiPlatformAnalysis } from '../engine';
import { techniques, type AnalysisResponse } from './protocol';
import type { MassTechnique } from '../engine/types';

export type StructureRequest =
  | { type: 'prepare'; id: number; input: string }
  | { type: 'run-prepared'; id: number; preparationId: number; confirmed: boolean; technique: MassTechnique }
  | { type: 'invalidate'; id: number };
export type StructureResponse = AnalysisResponse | { type: 'prepared'; id: number; structure: PreparedStructure };

export function isStructureRequest(value: unknown): value is StructureRequest {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (!Number.isSafeInteger(r.id) || (r.id as number) <= 0) return false;
  return r.type === 'invalidate' || (r.type === 'prepare' && typeof r.input === 'string')
    || (r.type === 'run-prepared' && Number.isSafeInteger(r.preparationId) && (r.preparationId as number) > 0
      && typeof r.confirmed === 'boolean' && techniques.includes(r.technique as MassTechnique));
}

/** 準備與確認綁定同一份結構；多成分未確認時絕不呼叫分析引擎。 */
export function createStructureSession(analyze = runMultiPlatformAnalysis) {
  let pending: { id: number; structure: PreparedStructure } | null = null;
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
        pending = { id, structure };
        return { type: 'prepared', id, structure };
      }
      if (!pending || pending.id !== request.preparationId) throw new Error('結構已變更，請重新從 Ketcher 取得結構。');
      if (pending.structure.multipleComponents && !request.confirmed) throw new Error('請先確認保留成分；只會分析保留的成分。');
      const input = pending.structure.inputSmiles;
      const result = await analyze(input, { technique: request.technique });
      return { type: 'result', id, result };
    } catch (error) {
      if (loadingEngine) return { type: 'error', id, code: 'ENGINE_LOAD_FAILED', message: '分析引擎載入失敗，請確認網路連線後再試。' };
      return { type: 'error', id, code: 'ANALYSIS_FAILED', message: error instanceof Error ? error.message : '結構處理失敗，請重新取得結構。' };
    }
  };
}
