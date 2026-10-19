// 非環單鍵斷裂的迴圈骨架與產物建立（重複段落 L）。
// 各平台提供：略過條件、分數公式、要產生哪些產物（直接異裂陽離子、[Frag+H]+、[Frag]+.、[Frag-H]-）與文字。
import type { MassBalanceVerification } from '../../chem/massBalance';
import { analyzeRDKitMolStoichiometry, type MolGraphStoichiometry } from '../../chem/stoichiometry';
import type { JSMol, RDKitModule } from '../../rdkit/types';
import { generateSingleBondFragments, type CleavedFragment } from '../../rules/singleBondCleavage';
import type { FragmentCandidate, PathwayStatus, StructureItem } from '../../types';
import { verifyAgainstParent, type PlatformContext } from './context';

/** 迴圈中目前處理的碎片 */
export interface FragmentVisit {
  frag: CleavedFragment;
  /** `${idPrefix}${counter}`，作為 structures id 與 candidate id 前綴 */
  fragId: string;
  /** 從 1 起算，被略過的碎片不計數 */
  counter: number;
  /** 碎片（H 轉移產物）的化學計量 */
  stoich: MolGraphStoichiometry;
  /** 碎片分子圖的淨電荷；不為 0 時碎片本身就是離子（例如硝基斷裂後保留 N+ 的一側） */
  charge: number;
  /** 碎片（H 轉移產物）相對母分子的質量平衡 */
  mb: MassBalanceVerification;
}

/**
 * 依序走訪所有非環單鍵斷裂碎片。skip 為 true 的碎片直接略過（不計數）。
 */
export function forEachSingleBondFragment(
  ctx: PlatformContext,
  mol: JSMol,
  RDKit: RDKitModule,
  opts: { idPrefix: string; skip: (frag: CleavedFragment) => boolean },
  visit: (v: FragmentVisit) => void
): void {
  const cleavedFragments = generateSingleBondFragments(mol, RDKit);
  let counter = 1;

  for (const frag of cleavedFragments) {
    if (opts.skip(frag)) {
      continue;
    }
    const fragId = `${opts.idPrefix}${counter}`;
    const fragStoich = analyzeRDKitMolStoichiometry(frag.mol, false);
    const mb = verifyAgainstParent(ctx, fragStoich.atomCounts, frag.exactMass);
    visit({ frag, fragId, counter, stoich: fragStoich, charge: fragStoich.netCharge, mb });
    counter++;
  }
}

export interface FragmentStructureSpec {
  name: string;
  /** relative_intensity 與 heuristicScore */
  score: number;
  priority: 'High' | 'Medium' | 'Low';
  mode: string;
  mechanism: string;
  /**
   * 碎片以離子形式呈現時提供（GC-MS EI 的自由基陽離子、本身帶電的碎片）；省略則為中性碎片。
   * mass 為離子精確質量；mz 省略時與 mass 相同（電荷絕對值為 1）
   */
  ion?: { mass: number; mz?: number; charge: number };
}

/** 碎片的 structures 項目（以 frag.smiles 去重，由呼叫端使用 addStructureOnce 加入） */
export function fragmentStructure(v: FragmentVisit, spec: FragmentStructureSpec): StructureItem {
  const { frag, fragId, mb } = v;
  return {
    id: fragId,
    name: spec.name,
    formula: frag.formula,
    neutralFormula: frag.formula,
    smiles: frag.smiles,
    canonicalSmiles: frag.smiles,
    exact_mass: frag.exactMass,
    neutralExactMass: frag.exactMass,
    ionExactMass: spec.ion ? spec.ion.mass : frag.exactMass,
    mz: spec.ion ? spec.ion.mz ?? spec.ion.mass : frag.exactMass,
    charge: spec.ion ? spec.ion.charge : 0,
    image: frag.image,
    relative_intensity: spec.score,
    heuristicScore: spec.score,
    priority: spec.priority,
    confidence: 'High',
    mode: spec.mode,
    mechanism: spec.mechanism,
    fragmentationPathway: frag.bondDescription,
    pathwayStatus: 'Verified Graph Product',
    neutralLoss: mb.neutralLossFormula,
    neutralLossMass: mb.neutralLossMass,
    massBalanceVerified: mb.verified
  };
}

// ---------------------------------------------------------------------------
// 直接異裂陽離子（不加 H，正電荷留在斷鍵碳上）
// ---------------------------------------------------------------------------

export interface DirectCationAnalysis {
  stoich: MolGraphStoichiometry;
  mb: MassBalanceVerification;
}

export function analyzeDirectCation(ctx: PlatformContext, cationMol: JSMol): DirectCationAnalysis {
  const stoich = analyzeRDKitMolStoichiometry(cationMol, false);
  const mb = verifyAgainstParent(ctx, stoich.atomCounts, stoich.neutralExactMass);
  return { stoich, mb };
}

export interface DirectCationSpec {
  idSuffix: string;
  precursorMz: number;
  mechanism: string;
  fragmentationPathway: string;
  neutralLoss: string;
  priority: 'High' | 'Medium' | 'Low';
  sourceRule: string;
  heuristicScore: number;
  explanation: string;
}

export function directCationCandidate(
  ctx: PlatformContext,
  v: FragmentVisit,
  cat: DirectCationAnalysis,
  spec: DirectCationSpec
): FragmentCandidate {
  const { frag, fragId } = v;
  return {
    id: `${fragId}${spec.idSuffix}`,
    technique: ctx.technique,
    polarity: 'Positive',
    precursorMz: spec.precursorMz,
    mz: cat.stoich.mz,
    formula: cat.stoich.ionicFormula,
    neutralFormula: cat.stoich.neutralFormula,
    smiles: frag.directCationSmiles || frag.smiles,
    canonicalSmiles: frag.directCationSmiles || frag.smiles,
    exactMass: cat.stoich.neutralExactMass,
    neutralExactMass: cat.stoich.neutralExactMass,
    ionExactMass: cat.stoich.ionExactMass,
    charge: 1,
    ionType: `[${cat.stoich.neutralFormula}]+`,
    mechanism: spec.mechanism,
    fragmentationPathway: spec.fragmentationPathway,
    pathwayStatus: 'Verified Graph Product',
    neutralLoss: spec.neutralLoss,
    neutralLossMass: cat.mb.neutralLossMass,
    massBalanceError: cat.mb.deltaMass,
    massBalanceVerified: cat.mb.verified,
    parentStructureId: fragId,
    priority: spec.priority,
    confidence: 'High',
    sourceRule: spec.sourceRule,
    heuristicScore: spec.heuristicScore,
    image: frag.directCationImage || frag.image,
    explanation: spec.explanation,
    parameterContext: ctx.parameterContext
  };
}

// ---------------------------------------------------------------------------
// 碎片離子：[Frag+H]+、[Frag-H]-（由中性碎片推導的離子）與 [Frag]+.（自由基）
// ---------------------------------------------------------------------------

/** 碎片離子資料（DerivedIonRepresentation 即符合此介面） */
export interface FragmentIon {
  mz: number;
  ionExactMass: number;
  formula: string;
  neutralFormula: string;
  smiles: string;
  canonicalSmiles: string;
  image: string;
}

/** 以中性碎片本身作為自由基陽離子（沒有獨立的離子分子圖）；formula 與 mass 由平台決定 */
export function fragmentAsRadicalIon(frag: CleavedFragment, formula: string, mass: number): FragmentIon {
  return {
    mz: mass,
    ionExactMass: mass,
    formula,
    neutralFormula: frag.formula,
    smiles: frag.smiles,
    canonicalSmiles: frag.smiles,
    image: frag.image
  };
}

export interface FragmentIonSpec {
  idSuffix: string;
  polarity: 'Positive' | 'Negative';
  ionType: string;
  precursorMz: number;
  mechanism: string;
  fragmentationPathway: string;
  /** 省略時為 'Verified Graph Product' */
  pathwayStatus?: PathwayStatus;
  priority: 'High' | 'Medium' | 'Low';
  confidence: 'High' | 'Medium' | 'Low';
  sourceRule: string;
  heuristicScore: number;
  explanation: string;
  /** 省略時依極性為 1 或 -1 */
  charge?: number;
}

/** 碎片離子 candidate：中性質量為碎片質量，質量平衡沿用中性碎片的結果，charge 依極性 */
export function fragmentIonCandidate(
  ctx: PlatformContext,
  v: FragmentVisit,
  ion: FragmentIon,
  spec: FragmentIonSpec
): FragmentCandidate {
  const { frag, fragId, mb } = v;
  return {
    id: `${fragId}${spec.idSuffix}`,
    technique: ctx.technique,
    polarity: spec.polarity,
    precursorMz: spec.precursorMz,
    mz: ion.mz,
    formula: ion.formula,
    neutralFormula: ion.neutralFormula,
    smiles: ion.smiles,
    canonicalSmiles: ion.canonicalSmiles,
    exactMass: frag.exactMass,
    neutralExactMass: frag.exactMass,
    ionExactMass: ion.ionExactMass,
    charge: spec.charge ?? (spec.polarity === 'Negative' ? -1 : 1),
    ionType: spec.ionType,
    mechanism: spec.mechanism,
    fragmentationPathway: spec.fragmentationPathway,
    pathwayStatus: spec.pathwayStatus ?? 'Verified Graph Product',
    neutralLoss: mb.neutralLossFormula,
    neutralLossMass: mb.neutralLossMass,
    massBalanceError: mb.deltaMass,
    massBalanceVerified: mb.verified,
    parentStructureId: fragId,
    priority: spec.priority,
    confidence: spec.confidence,
    sourceRule: spec.sourceRule,
    heuristicScore: spec.heuristicScore,
    image: ion.image,
    explanation: spec.explanation,
    parameterContext: ctx.parameterContext
  };
}

// ---------------------------------------------------------------------------
// 本身帶形式電荷的碎片（例如硝基斷裂後保留 N+ 的一側、[OH-]）
// ---------------------------------------------------------------------------

/** 帶電碎片的 structures 用離子資訊（實際電荷、離子精確質量與 m/z） */
export function chargedFragmentIonInfo(v: FragmentVisit): { mass: number; mz: number; charge: number } {
  return { mass: v.stoich.ionExactMass, mz: v.stoich.mz, charge: v.charge };
}

export type ChargedFragmentSpec = Omit<FragmentIonSpec, 'idSuffix' | 'polarity' | 'ionType' | 'charge' | 'pathwayStatus'>;

/**
 * 帶電碎片本身作為偶電子離子的 candidate：離子式由元素計數加實際電荷產生，
 * m/z = (原子質量總和 − 電荷 × 電子質量) / |電荷|，ionType 為 [Frag]+ 或 [Frag]-。
 * 呼叫端須先確認該極性已啟用。
 */
export function chargedFragmentCandidate(
  ctx: PlatformContext,
  v: FragmentVisit,
  spec: ChargedFragmentSpec
): FragmentCandidate {
  const positive = v.charge > 0;
  const ion: FragmentIon = {
    mz: v.stoich.mz,
    ionExactMass: v.stoich.ionExactMass,
    formula: v.stoich.ionicFormula,
    neutralFormula: v.stoich.neutralFormula,
    smiles: v.frag.smiles,
    canonicalSmiles: v.frag.smiles,
    image: v.frag.image
  };
  return fragmentIonCandidate(ctx, v, ion, {
    ...spec,
    idSuffix: positive ? '_ion_pos' : '_ion_neg',
    polarity: positive ? 'Positive' : 'Negative',
    ionType: positive ? '[Frag]+' : '[Frag]-',
    charge: v.charge
  });
}
