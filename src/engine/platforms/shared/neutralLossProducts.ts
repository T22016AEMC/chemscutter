// 中性丟失（分子圖反應產物）的 structures 項目與 candidate 建立（重複段落 K，部分合併）。
// 三個平台的迴圈本體（過濾條件、帶電／中性產物分支、EI／CI 分支、LC-MS/MS 二階脫除）差異很大，
// 依可讀性原則保留在各平台檔；此處只提供確實相同的部分。
import type { NeutralLossResult } from '../../rules/neutralLosses';
import type { FragmentCandidate, PathwayStatus, StructureItem } from '../../types';
import type { PlatformContext, PlatformOutput } from './context';
import type { FragmentIon } from './singleBondProducts';

/** `${prefix}${lossType}_${目前 structures 數量}`；須在加入該產物的 structures 項目之前取得 */
export function neutralLossStructId(out: PlatformOutput, prefix: string, nl: NeutralLossResult): string {
  return `${prefix}${nl.lossType}_${out.structures.length}`;
}

export interface NeutralLossStructureSpec {
  name: string;
  /** relative_intensity 與 heuristicScore */
  score: number;
  mode: string;
  fragmentationPathway: string;
  /** 省略時為 nl.residualFormula */
  formula?: string;
  /** 省略時為 nl.charge */
  charge?: number;
}

/** 中性丟失產物的 structures 項目（以 nl.residualSmiles 去重，由呼叫端使用 addStructureOnce 加入） */
export function neutralLossStructure(
  nl: NeutralLossResult,
  structId: string,
  spec: NeutralLossStructureSpec
): StructureItem {
  return {
    id: structId,
    name: spec.name,
    formula: spec.formula ?? nl.residualFormula,
    neutralFormula: nl.residualNeutralFormula,
    smiles: nl.residualSmiles,
    canonicalSmiles: nl.residualSmiles,
    exact_mass: nl.isChargedProduct ? nl.residualIonExactMass : nl.residualExactMass,
    neutralExactMass: nl.residualExactMass,
    ionExactMass: nl.residualIonExactMass,
    mz: nl.residualMz,
    charge: spec.charge ?? nl.charge,
    image: nl.residualImage,
    relative_intensity: spec.score,
    heuristicScore: spec.score,
    priority: nl.priority,
    confidence: nl.confidence,
    mode: spec.mode,
    mechanism: nl.mechanism,
    fragmentationPathway: spec.fragmentationPathway,
    pathwayStatus: nl.pathwayStatus,
    neutralLoss: nl.neutralFormula,
    neutralLossMass: nl.neutralExactMass,
    massBalanceVerified: nl.massBalanceVerified
  };
}

interface NeutralLossCandidateCommonSpec {
  idSuffix: string;
  precursorMz: number;
  ionType: string;
  mechanism: string;
  fragmentationPathway: string;
  priority: 'High' | 'Medium' | 'Low';
  sourceRule: string;
  heuristicScore: number;
  explanation: string;
}

export interface ChargedResidualSpec extends NeutralLossCandidateCommonSpec {
  charge: number;
}

/** 分子圖反應直接產生的帶電產物（如醯基鎓）本身作為正離子 candidate */
export function chargedResidualCandidate(
  ctx: PlatformContext,
  nl: NeutralLossResult,
  structId: string,
  spec: ChargedResidualSpec
): FragmentCandidate {
  return {
    id: `${structId}${spec.idSuffix}`,
    technique: ctx.technique,
    polarity: 'Positive',
    precursorMz: spec.precursorMz,
    mz: nl.residualMz,
    formula: nl.residualFormula,
    neutralFormula: nl.residualNeutralFormula,
    smiles: nl.residualSmiles,
    canonicalSmiles: nl.residualSmiles,
    exactMass: nl.residualIonExactMass,
    neutralExactMass: nl.residualExactMass,
    ionExactMass: nl.residualIonExactMass,
    charge: spec.charge,
    ionType: spec.ionType,
    mechanism: spec.mechanism,
    fragmentationPathway: spec.fragmentationPathway,
    pathwayStatus: nl.pathwayStatus,
    neutralLoss: nl.neutralFormula,
    neutralLossMass: nl.neutralExactMass,
    massBalanceError: nl.massBalanceError,
    massBalanceVerified: nl.massBalanceVerified,
    parentStructureId: structId,
    priority: spec.priority,
    confidence: nl.confidence,
    sourceRule: spec.sourceRule,
    heuristicScore: spec.heuristicScore,
    image: nl.residualImage,
    explanation: spec.explanation,
    parameterContext: ctx.parameterContext
  };
}

/** 以中性產物本身作為自由基陽離子（GC-MS EI）；formula 與 mass 由平台決定 */
export function residualAsRadicalIon(nl: NeutralLossResult, formula: string, mass: number): FragmentIon {
  return {
    mz: mass,
    ionExactMass: mass,
    formula,
    neutralFormula: nl.residualNeutralFormula,
    smiles: nl.residualSmiles,
    canonicalSmiles: nl.residualSmiles,
    image: nl.residualImage
  };
}

export interface ResidualIonSpec extends NeutralLossCandidateCommonSpec {
  polarity: 'Positive' | 'Negative';
  pathwayStatus: PathwayStatus;
}

/** 由中性產物推導的離子（[M-NL+H]+、[M-NL-H]-、EI 自由基陽離子）candidate；charge 依極性 */
export function residualIonCandidate(
  ctx: PlatformContext,
  nl: NeutralLossResult,
  structId: string,
  ion: FragmentIon,
  spec: ResidualIonSpec
): FragmentCandidate {
  return {
    id: `${structId}${spec.idSuffix}`,
    technique: ctx.technique,
    polarity: spec.polarity,
    precursorMz: spec.precursorMz,
    mz: ion.mz,
    formula: ion.formula,
    neutralFormula: ion.neutralFormula,
    smiles: ion.smiles,
    canonicalSmiles: ion.canonicalSmiles,
    exactMass: nl.residualExactMass,
    neutralExactMass: nl.residualExactMass,
    ionExactMass: ion.ionExactMass,
    charge: spec.polarity === 'Negative' ? -1 : 1,
    ionType: spec.ionType,
    mechanism: spec.mechanism,
    fragmentationPathway: spec.fragmentationPathway,
    pathwayStatus: spec.pathwayStatus,
    neutralLoss: nl.neutralFormula,
    neutralLossMass: nl.neutralExactMass,
    massBalanceError: nl.massBalanceError,
    massBalanceVerified: nl.massBalanceVerified,
    parentStructureId: structId,
    priority: spec.priority,
    confidence: nl.confidence,
    sourceRule: spec.sourceRule,
    heuristicScore: spec.heuristicScore,
    image: ion.image,
    explanation: spec.explanation,
    parameterContext: ctx.parameterContext
  };
}
