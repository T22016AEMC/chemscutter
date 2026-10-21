import type { AnalysisResult, MassTechnique } from '../engine/types';
import type { InputCategory } from '../shared/inputErrors';

export const techniques: readonly MassTechnique[] = ['TOF-SIMS', 'LC-MS/MS', 'GC-MS'];

export interface AnalysisRequest {
  type: 'analyze';
  id: number;
  smiles: string;
  technique: MassTechnique;
}

export type AnalysisResponse =
  | { type: 'result'; id: number; result: AnalysisResult }
  | {
      type: 'error';
      id: number | null;
      code: 'INVALID_REQUEST' | 'EMPTY_INPUT' | 'ENGINE_LOAD_FAILED' | 'ANALYSIS_FAILED';
      message: string;
      category?: InputCategory;
      details?: string;
    };

export function isAnalysisRequest(value: unknown): value is AnalysisRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  return request.type === 'analyze'
    && typeof request.id === 'number' && Number.isSafeInteger(request.id) && request.id > 0
    && typeof request.smiles === 'string'
    && techniques.some((technique) => technique === request.technique);
}
