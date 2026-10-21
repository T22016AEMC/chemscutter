import type { FragmentCandidate } from '../../engine/types';

export interface FormulaPart { raw: string; text: string; position: 'normal' | 'sub' | 'super' }
/** 保留原始字元；自由基點僅在顯示時改用圓點，不推斷或補上電荷。 */
export function formatIonFormula(formula: string): FormulaPart[] {
  const charge = formula.match(/(?:[+-]\.?|\.)(?=$|\s+\()/);
  const end = charge?.index ?? formula.length;
  const parts: FormulaPart[] = [];
  const body = formula.slice(0, end);
  for (const match of body.matchAll(/\d+|[^\d]+/g)) {
    const index = match.index;
    parts.push({ raw: match[0], text: match[0], position: /^\d+$/.test(match[0]) && index > 0 && /[A-Za-z)\]]/.test(body[index - 1]) ? 'sub' : 'normal' });
  }
  if (charge) {
    parts.push({ raw: charge[0], text: charge[0].replace('.', '•'), position: 'super' });
    const annotation = formula.slice(end + charge[0].length);
    if (annotation) parts.push({ raw: annotation, text: annotation, position: 'normal' });
  }
  return parts;
}
export const restoreFormula = (parts: FormulaPart[]) => parts.map((part) => part.raw).join('');
export type SortBy = 'mz-asc' | 'mz-desc' | 'score-desc' | 'score-asc';
export interface CandidateFilter { query: string; minScore: number; ionType: string; polarity: string; sort: SortBy }
export const defaultFilter: CandidateFilter = { query: '', minScore: 0, ionType: '', polarity: '', sort: 'score-desc' };
export function filterCandidates(candidates: readonly FragmentCandidate[], filter: CandidateFilter): FragmentCandidate[] {
  const query = filter.query.trim().toLocaleLowerCase();
  return candidates.filter((item) => (!query || [item.formula, item.ionType, item.sourceRule, item.explanation, item.mechanism, item.smiles, item.id].join(' ').toLocaleLowerCase().includes(query))
    && (item.heuristicScore === undefined ? filter.minScore === 0 : item.heuristicScore >= filter.minScore)
    && (!filter.ionType || item.ionType === filter.ionType) && (!filter.polarity || item.polarity === filter.polarity))
    .sort((a, b) => {
      if (filter.sort.startsWith('mz')) return (a.mz - b.mz) * (filter.sort === 'mz-asc' ? 1 : -1);
      if (a.heuristicScore === undefined) return b.heuristicScore === undefined ? 0 : 1;
      if (b.heuristicScore === undefined) return -1;
      return (a.heuristicScore - b.heuristicScore) * (filter.sort === 'score-asc' ? 1 : -1);
    });
}
export const groupPolarity = (items: readonly FragmentCandidate[]) => ({
  Positive: items.filter((item) => item.polarity === 'Positive'),
  Negative: items.filter((item) => item.polarity === 'Negative'),
});
export type MzRange = [number, number];
export function fullMzRange(items: readonly FragmentCandidate[]): MzRange {
  const values = items.map((item) => item.mz).filter(Number.isFinite);
  return [0, Math.max(1, ...values) * 1.05];
}
export function validRange(min: number, max: number): MzRange | null {
  return Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max > min ? [min, max] : null;
}
export const plotX = (mz: number, range: MzRange) => 55 + (mz - range[0]) / (range[1] - range[0]) * 790;
export const plotY = (score: number) => 225 - Math.max(0, Math.min(100, score)) * 1.8;
/** 標籤依分數選取，再以水平距離留白；只影響標籤，不合併任何候選。 */
export function peakLabels(items: readonly FragmentCandidate[], range: MzRange): Set<string> {
  const chosen: FragmentCandidate[] = [];
  for (const item of [...items].filter((item) => item.mz >= range[0] && item.mz <= range[1] && item.heuristicScore !== undefined)
    .sort((a, b) => b.heuristicScore! - a.heuristicScore!)) {
    if (chosen.every((other) => Math.abs(plotX(other.mz, range) - plotX(item.mz, range)) >= 125)) chosen.push(item);
    if (chosen.length === 5) break;
  }
  return new Set(chosen.map((item) => item.id));
}
