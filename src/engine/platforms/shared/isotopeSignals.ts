// 同位素 M+2 特徵訊號轉成 candidate（重複段落 M）。
import { generateIsotopeCandidates } from '../../chem/isotopes';
import type { FunctionalGroupInfo } from '../../rules/functionalGroups';
import type { PlatformContext, PlatformOutput } from './context';

export interface IsotopeSignalOptions {
  /** 傳給 generateIsotopeCandidates 的極性模式 */
  mode: 'Positive' | 'Negative' | 'Both';
  /** 目前開啟的極性；關閉的極性其同位素訊號會被略過 */
  enabled: { positive: boolean; negative: boolean };
  idPrefix: string;
  sourceRule: string;
}

export function addIsotopeSignals(
  out: PlatformOutput,
  ctx: PlatformContext,
  fg: FunctionalGroupInfo,
  opts: IsotopeSignalOptions
): void {
  const isotopes = generateIsotopeCandidates(ctx.parentFormula, ctx.parentMass, opts.mode, fg);
  for (const iso of isotopes) {
    if (iso.mode === 'Positive' && !opts.enabled.positive) continue;
    if (iso.mode === 'Negative' && !opts.enabled.negative) continue;
    out.candidates.push({
      id: `${opts.idPrefix}${iso.formula}`,
      technique: ctx.technique,
      polarity: iso.mode,
      precursorMz: ctx.parentMass,
      mz: iso.mz,
      formula: iso.formula,
      neutralFormula: ctx.parentFormula,
      smiles: ctx.parentSmiles,
      canonicalSmiles: ctx.parentSmiles,
      exactMass: ctx.parentMass,
      neutralExactMass: ctx.parentMass,
      ionExactMass: iso.mz,
      charge: iso.mode === 'Negative' ? -1 : 1,
      ionType: iso.adduct,
      mechanism: iso.mechanism,
      fragmentationPathway: 'Natural Isotope Abundance Pattern (M+2)',
      pathwayStatus: 'Verified Graph Product',
      massBalanceVerified: true,
      parentStructureId: 'Parent',
      priority: iso.priority,
      confidence: iso.confidence,
      sourceRule: opts.sourceRule,
      heuristicScore: iso.relative_intensity,
      image: ctx.parentImg,
      explanation: iso.mechanism,
      parameterContext: ctx.parameterContext
    });
  }
}
