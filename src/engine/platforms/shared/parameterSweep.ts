// 參數掃描骨架（重複段落 O）：對每個參數值重新評分既有候選，取前 4 名。
// 評分規則（含所有分數運算）由平台以 score 回呼提供；此處只做過濾、分級、排序與擷取。
// 注意：掃描只重新評分「目前設定下已產生的候選」，不會在各參數值重新執行碎裂。
import type { FragmentCandidate, SweepResultItem } from '../../types';

export interface ParameterSweepRules {
  /** 掃描的參數值（例如 CE 或電子能量，單位 eV） */
  points: number[];
  label: (value: number) => string;
  regimeSummary: (value: number) => string;
  /** 回傳該候選在此參數值下的分數 */
  score: (candidate: FragmentCandidate, value: number) => number;
  /** 分數「大於」high 為 High、「大於」medium 為 Medium，其餘為 Low */
  priorityThresholds: { high: number; medium: number };
}

type Likelihood = 'Dominant' | 'Prominent' | 'Trace' | 'Unfavored';

export function buildParameterSweep(
  finalCandidates: FragmentCandidate[],
  rules: ParameterSweepRules
): SweepResultItem[] {
  const sweepList: SweepResultItem[] = [];
  const { high, medium } = rules.priorityThresholds;

  for (const value of rules.points) {
    const topList = finalCandidates
      // 同位素訊號不列入
      .filter((c) => !c.ionType.includes('³⁷Cl') && !c.ionType.includes('⁸¹Br'))
      .map((c) => {
        const energyScore = rules.score(c, value);

        let likelihood: Likelihood = 'Prominent';
        if (energyScore >= 80) likelihood = 'Dominant';
        else if (energyScore >= 55) likelihood = 'Prominent';
        else if (energyScore >= 35) likelihood = 'Trace';
        else likelihood = 'Unfavored';

        return {
          id: c.id,
          ionType: c.ionType,
          formula: c.formula,
          mz: c.mz,
          priority: (energyScore > high ? 'High' : energyScore > medium ? 'Medium' : 'Low') as 'High' | 'Medium' | 'Low',
          likelihood,
          score: energyScore
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(({ id, ionType, formula, mz, priority, likelihood }) => ({
        id,
        ionType,
        formula,
        mz,
        priority,
        likelihood
      }));

    sweepList.push({
      parameterValue: value,
      parameterLabel: rules.label(value),
      regimeSummary: rules.regimeSummary(value),
      topCandidates: topList
    });
  }

  return sweepList;
}
