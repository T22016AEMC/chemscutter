// 去重排序後的候選轉成圖譜 signals（重複段落 N）。
import type { FragmentCandidate, SignalItem } from '../../types';

export interface SignalLabels {
  /** 母體相關訊號（parentStructureId 為 'Parent'）的 type 文字 */
  precursorType: string;
  /** 其餘訊號 type 的前綴，後接「(結構 id)」 */
  fragmentTypePrefix: string;
}

export function buildSignals(finalCandidates: FragmentCandidate[], labels: SignalLabels): SignalItem[] {
  return finalCandidates.map((c) => ({
    id: c.id,
    type:
      c.parentStructureId === 'Parent'
        ? labels.precursorType
        : `${labels.fragmentTypePrefix} (${c.parentStructureId || c.id})`,
    // GC-MS 舊版此欄寫死 'Positive'；GC-MS 的候選 polarity 全部是 'Positive'，因此改用 c.polarity 結果相同
    mode: c.polarity,
    adduct: c.ionType,
    formula: c.formula,
    neutralFormula: c.neutralFormula,
    smiles: c.smiles,
    canonicalSmiles: c.canonicalSmiles,
    mz: c.mz,
    neutralExactMass: c.neutralExactMass,
    ionExactMass: c.ionExactMass,
    charge: c.charge,
    relative_intensity: c.heuristicScore,
    heuristicScore: c.heuristicScore,
    priority: c.priority,
    confidence: c.confidence,
    mechanism: c.mechanism,
    fragmentationPathway: c.fragmentationPathway,
    pathwayStatus: c.pathwayStatus,
    neutralLoss: c.neutralLoss,
    neutralLossMass: c.neutralLossMass,
    massBalanceVerified: c.massBalanceVerified,
    parentStructureId: c.parentStructureId,
    sourceRule: c.sourceRule,
    parameterContext: c.parameterContext
  }));
}
