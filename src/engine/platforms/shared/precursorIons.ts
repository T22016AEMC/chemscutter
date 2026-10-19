// 前驅離子與加合物的 candidate 建立（重複段落 C～G）：
// [M+H]+、[M-H]-、[M+Na]+、[M+K]+、[M+Cs]+、[M+NH4]+、[M+HCOO]-、M+.、CI 反應氣加合物。
// 觸發條件、分數、優先度與說明文字由各平台決定，這裡只負責組出欄位一致的 candidate。
import type { FragmentCandidate, PathwayStatus } from '../../types';
import type { PlatformContext } from './context';

/** 前驅離子本身的資料（DerivedIonRepresentation 即符合此介面） */
export interface PrecursorIon {
  mz: number;
  ionExactMass: number;
  formula: string;
  smiles: string;
  canonicalSmiles: string;
  image: string;
}

/**
 * 以母分子本身作為離子的結構與圖（M+.、CI 反應氣加合物這類沒有獨立離子分子圖的情況）。
 * mass 由平台算好後傳入，同時作為 m/z 與離子精確質量。
 */
export function parentAsIon(ctx: PlatformContext, formula: string, mass: number): PrecursorIon {
  return {
    mz: mass,
    ionExactMass: mass,
    formula,
    smiles: ctx.parentSmiles,
    canonicalSmiles: ctx.parentSmiles,
    image: ctx.parentImg
  };
}

export interface PrecursorCandidateSpec {
  id: string;
  polarity: 'Positive' | 'Negative';
  ionType: string;
  mechanism: string;
  fragmentationPathway: string;
  /** 省略時為 'Verified Graph Product' */
  pathwayStatus?: PathwayStatus;
  priority: 'High' | 'Medium' | 'Low';
  confidence: 'High' | 'Medium' | 'Low';
  sourceRule: string;
  heuristicScore: number;
  explanation: string;
}

/**
 * 前驅離子 candidate：precursorMz 與 mz 皆為該離子 m/z，中性質量與分子式為母分子，
 * parentStructureId 為 'Parent'。charge 依極性（正 1、負 -1），與舊版各處寫死的值一致。
 */
export function precursorCandidate(
  ctx: PlatformContext,
  ion: PrecursorIon,
  spec: PrecursorCandidateSpec
): FragmentCandidate {
  return {
    id: spec.id,
    technique: ctx.technique,
    polarity: spec.polarity,
    precursorMz: ion.mz,
    mz: ion.mz,
    formula: ion.formula,
    neutralFormula: ctx.parentFormula,
    smiles: ion.smiles,
    canonicalSmiles: ion.canonicalSmiles,
    exactMass: ctx.parentMass,
    neutralExactMass: ctx.parentMass,
    ionExactMass: ion.ionExactMass,
    charge: spec.polarity === 'Negative' ? -1 : 1,
    ionType: spec.ionType,
    mechanism: spec.mechanism,
    fragmentationPathway: spec.fragmentationPathway,
    pathwayStatus: spec.pathwayStatus ?? 'Verified Graph Product',
    massBalanceVerified: true,
    parentStructureId: 'Parent',
    priority: spec.priority,
    confidence: spec.confidence,
    sourceRule: spec.sourceRule,
    heuristicScore: spec.heuristicScore,
    image: ion.image,
    explanation: spec.explanation,
    parameterContext: ctx.parameterContext
  };
}
