// 特徵診斷離子（重複段落 H、I、J，以及 TOF-SIMS 乙酸根／甲酸根、GC-MS [C4H3]+）：
// 由帶電 SMILES 建立的真實離子 → 質量平衡 → structures 項目（第一次出現時）與 candidate。
// 觸發條件、分數、優先度、precursorMz 與文字由各平台決定。
import type { DerivedIonRepresentation } from '../../chem/ionDerivation';
import type { MassBalanceVerification } from '../../chem/massBalance';
import { addStructureOnce, type PlatformContext, type PlatformOutput } from './context';

/** 診斷離子用到的質量平衡欄位（一般為 verifyAgainstParent 的結果） */
export type DiagnosticMassBalance = Pick<
  MassBalanceVerification,
  'neutralLossFormula' | 'neutralLossMass' | 'deltaMass' | 'verified'
>;

export interface DiagnosticIonSpec {
  /** structures 與 candidate 共用的 id */
  id: string;
  polarity: 'Positive' | 'Negative';
  ionType: string;
  precursorMz: number;
  candidate: {
    mechanism: string;
    fragmentationPathway: string;
    priority: 'High' | 'Medium' | 'Low';
    sourceRule: string;
    heuristicScore: number;
    explanation: string;
  };
  /** 省略時只建立 candidate：不加入 structures，candidate 也不設 parentStructureId */
  structure?: {
    name: string;
    mechanism: string;
    fragmentationPathway: string;
    priority: 'High' | 'Medium' | 'Low';
    /** relative_intensity 與 heuristicScore */
    score: number;
  };
}

/** 加入一個診斷離子：structures（以離子 canonical SMILES 去重）在前，candidate 在後。confidence 皆為 High */
export function addDiagnosticIon(
  out: PlatformOutput,
  ctx: PlatformContext,
  ion: DerivedIonRepresentation,
  mb: DiagnosticMassBalance,
  spec: DiagnosticIonSpec
): void {
  const charge = spec.polarity === 'Negative' ? -1 : 1;

  if (spec.structure) {
    addStructureOnce(out, ion.canonicalSmiles, {
      id: spec.id,
      name: spec.structure.name,
      formula: ion.formula,
      neutralFormula: ion.neutralFormula,
      smiles: ion.smiles,
      canonicalSmiles: ion.canonicalSmiles,
      exact_mass: ion.ionExactMass,
      neutralExactMass: ion.neutralExactMass,
      ionExactMass: ion.ionExactMass,
      mz: ion.mz,
      charge,
      ionType: spec.ionType,
      image: ion.image,
      relative_intensity: spec.structure.score,
      heuristicScore: spec.structure.score,
      priority: spec.structure.priority,
      confidence: 'High',
      mode: spec.polarity,
      mechanism: spec.structure.mechanism,
      fragmentationPathway: spec.structure.fragmentationPathway,
      pathwayStatus: 'Verified Graph Product',
      neutralLoss: mb.neutralLossFormula,
      neutralLossMass: mb.neutralLossMass,
      massBalanceVerified: mb.verified
    });
  }

  out.candidates.push({
    id: spec.id,
    technique: ctx.technique,
    polarity: spec.polarity,
    precursorMz: spec.precursorMz,
    mz: ion.mz,
    formula: ion.formula,
    neutralFormula: ion.neutralFormula,
    smiles: ion.smiles,
    canonicalSmiles: ion.canonicalSmiles,
    exactMass: ion.ionExactMass,
    neutralExactMass: ion.neutralExactMass,
    ionExactMass: ion.ionExactMass,
    charge,
    ionType: spec.ionType,
    mechanism: spec.candidate.mechanism,
    fragmentationPathway: spec.candidate.fragmentationPathway,
    pathwayStatus: 'Verified Graph Product',
    neutralLoss: mb.neutralLossFormula,
    neutralLossMass: mb.neutralLossMass,
    massBalanceError: mb.deltaMass,
    massBalanceVerified: mb.verified,
    ...(spec.structure ? { parentStructureId: spec.id } : {}),
    priority: spec.candidate.priority,
    confidence: 'High',
    sourceRule: spec.candidate.sourceRule,
    heuristicScore: spec.candidate.heuristicScore,
    image: ion.image,
    explanation: spec.candidate.explanation,
    parameterContext: ctx.parameterContext
  });
}
