// 三個平台引擎共用的母分子資訊、輸出容器與母分子 structures 項目。
import { molToSvgDataUri } from '../../chem/depiction';
import { analyzeRDKitMolStoichiometry, type MolGraphStoichiometry } from '../../chem/stoichiometry';
import type { JSMol } from '../../rdkit/types';
import type { FragmentCandidate, MassTechnique, StructureItem } from '../../types';

/** 母分子的 SMILES、化學計量、中性分子式、中性精確質量與結構圖（重複段落 A） */
export interface ParentContext {
  parentSmiles: string;
  parentStoich: MolGraphStoichiometry;
  parentFormula: string;
  parentMass: number;
  parentImg: string;
}

export function buildParentContext(mol: JSMol): ParentContext {
  const parentSmiles = mol.get_smiles();
  const parentStoich = analyzeRDKitMolStoichiometry(mol, false);
  const parentFormula = parentStoich.neutralFormula;
  const parentMass = parentStoich.neutralExactMass;
  const parentImg = molToSvgDataUri(mol, 300, 240);
  return { parentSmiles, parentStoich, parentFormula, parentMass, parentImg };
}

/** 建立 candidate 時需要的共同資訊：母分子 + 平台名稱 + 參數說明文字 */
export interface PlatformContext extends ParentContext {
  technique: MassTechnique;
  parameterContext: string;
}

/** 平台引擎累積中的輸出：候選、結構清單，以及已加入結構的去重鍵 */
export interface PlatformOutput {
  candidates: FragmentCandidate[];
  structures: StructureItem[];
  seenStructureKeys: Set<string>;
}

export function createPlatformOutput(): PlatformOutput {
  return { candidates: [], structures: [], seenStructureKeys: new Set<string>() };
}

/** 以 key（通常是 SMILES）去重，第一次出現時才加入 structures */
export function addStructureOnce(out: PlatformOutput, key: string, item: StructureItem): void {
  if (!out.seenStructureKeys.has(key)) {
    out.seenStructureKeys.add(key);
    out.structures.push(item);
  }
}

export interface ParentStructureSpec {
  name: string;
  mode: string;
  mechanism: string;
  fragmentationPathway: string;
  /** 母體以離子形式呈現時（GC-MS EI 的 M⁺•）提供；省略則為中性母分子 */
  ion?: { formula: string; mass: number; charge: number };
}

/** 母分子的 structures 項目（重複段落 B） */
export function buildParentStructure(parent: ParentContext, spec: ParentStructureSpec): StructureItem {
  const { parentSmiles, parentFormula, parentMass, parentImg } = parent;
  return {
    id: 'Parent',
    name: spec.name,
    formula: spec.ion ? spec.ion.formula : parentFormula,
    neutralFormula: parentFormula,
    smiles: parentSmiles,
    canonicalSmiles: parentSmiles,
    exact_mass: parentMass,
    neutralExactMass: parentMass,
    ionExactMass: spec.ion ? spec.ion.mass : parentMass,
    mz: spec.ion ? spec.ion.mass : parentMass,
    charge: spec.ion ? spec.ion.charge : 0,
    image: parentImg,
    relative_intensity: 100.0,
    heuristicScore: 100.0,
    priority: 'High',
    confidence: 'High',
    mode: spec.mode,
    mechanism: spec.mechanism,
    fragmentationPathway: spec.fragmentationPathway,
    pathwayStatus: 'Verified Graph Product',
    massBalanceVerified: true
  };
}
