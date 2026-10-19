// 化學計算引擎的對外入口：多平台質譜碎片模擬路由。
// 來源：legacy/src/server/chemistryEngine.ts（照原樣搬移；不搬 processTofSimsAnalysis）
import type {
  AnalysisResult,
  FragmentCandidate,
  SignalItem,
  SimulationConfig,
  StructureItem,
  SweepResultItem
} from './types';
import type { CommonChemJson, RDKitDescriptors } from './rdkit/types';
import { getRDKit } from './rdkit/loader';
import { parseInputToMol } from './chem/inputParsing';
import { standardizeMolecule } from './chem/standardize';
import { calculateFormulaFromJson } from './chem/formula';
import { detectFunctionalGroups } from './rules/functionalGroups';
import { runTofSimsFragmentation } from './platforms/tofSims';
import { runLcMsMsFragmentation } from './platforms/lcMsMs';
import { runGcMsFragmentation } from './platforms/gcMs';
import { getProfileForConfig } from './platform/instrumentProfiles';

// 與舊版 chemistryEngine.ts 相同的重新匯出
export { getRDKit } from './rdkit/loader';
export type { RDKitLoaderOptions } from './rdkit/loader';
export { parseInputToMol } from './chem/inputParsing';
export { calculateFormulaFromJson } from './chem/formula';
export { molToSvgDataUri } from './chem/depiction';
export { detectFunctionalGroups } from './rules/functionalGroups';

// 前端需要的型別
export type {
  MassTechnique,
  PathwayStatus,
  SimulationConfig,
  FragmentCandidate,
  SweepResultItem,
  SignalItem,
  StructureItem,
  ParentMolecule,
  AnalysisResult,
  InputMode
} from './types';
export type { FunctionalGroupInfo } from './rules/functionalGroups';
export type { InstrumentProfile } from './platform/instrumentProfiles';
export { INSTRUMENT_PROFILES, getProfileForConfig } from './platform/instrumentProfiles';

export const SIMULATION_DISCLAIMER =
  '本工具為基於化學結構、官能基與質譜碎裂規則的候選碎片模擬器。實際 MS spectrum 會受到離子化方式、儀器結構、碰撞能量、source conditions、matrix、樣品狀態與其他實驗條件影響。模擬結果主要用於送測前的候選碎片篩選與實驗結果輔助判讀，所有數值為啟發式優先評分 (Heuristic Priority Score, 0-100)，不代表真實實驗峰強度或保證實際一定觀察到該離子。';

/** 三個平台引擎共同的回傳結構 */
interface PlatformRunResult {
  candidates: FragmentCandidate[];
  structures: StructureItem[];
  signals: SignalItem[];
  parameterContext: string;
  activeRegimeDescription?: string;
  sweepResults?: SweepResultItem[];
}

/**
 * Main Multi-Platform MS Fragment Simulator Router
 * Routes chemical structure through TOF-SIMS, LC-MS/MS, or GC-MS fragmentation engine.
 */
export async function runMultiPlatformAnalysis(
  rawInput: string,
  config?: Partial<SimulationConfig>
): Promise<AnalysisResult> {
  const RDKit = await getRDKit();
  const { mol: inputMol, format, error } = parseInputToMol(rawInput, RDKit);
  if (error || !inputMol || !inputMol.is_valid()) {
    throw new Error(error || '無效的化學結構式');
  }

  // Q14：移除抗衡離子並中和可中和的電荷，以中性母體分析
  const inputSmiles = inputMol.get_smiles();
  const standardized = standardizeMolecule(inputMol, RDKit);
  const mol = standardized.mol;
  if (mol !== inputMol) inputMol.delete();

  const parentSmiles = mol.get_smiles();
  const parentJson = JSON.parse(mol.get_json()) as CommonChemJson;
  const parentFormula = calculateFormulaFromJson(parentJson);
  const parentDesc = JSON.parse(mol.get_descriptors()) as RDKitDescriptors;
  const parentMass = Number(parentDesc.exactmw || parentDesc.amw || 0);

  // Detect functional groups & theoretical motifs
  const fg = detectFunctionalGroups(mol, RDKit);

  // Determine technique and final config
  const technique = config?.technique || 'TOF-SIMS';
  const profile = getProfileForConfig(technique);

  const finalConfig: SimulationConfig = {
    ...profile.defaultConfig,
    ...config,
    technique
  };

  let runResult: PlatformRunResult;

  // Route to the appropriate independent fragmentation engine
  switch (technique) {
    case 'LC-MS/MS':
      runResult = runLcMsMsFragmentation(mol, RDKit, finalConfig, fg);
      break;
    case 'GC-MS':
      runResult = runGcMsFragmentation(mol, RDKit, finalConfig, fg);
      break;
    case 'TOF-SIMS':
    default:
      runResult = runTofSimsFragmentation(mol, RDKit, finalConfig, fg);
      break;
  }

  const hasParams = Boolean(
    (technique === 'LC-MS/MS' && (finalConfig.collisionEnergy !== undefined || finalConfig.ionization)) ||
    (technique === 'GC-MS' && finalConfig.electronEnergy !== undefined) ||
    (technique === 'TOF-SIMS' && finalConfig.primaryIon && finalConfig.primaryIon !== 'Generic')
  );

  const disclaimerText = hasParams
    ? SIMULATION_DISCLAIMER
    : `${SIMULATION_DISCLAIMER} (未指定詳細儀器參數，以通用 ${technique} 候選碎片模型進行評估 / General fragmentation candidates)`;

  return {
    technique,
    simulationConfig: finalConfig,
    simulationModeLabel: finalConfig.simulationMode || 'General',
    parameterContext: runResult.parameterContext,
    activeRegimeDescription: runResult.activeRegimeDescription,
    disclaimer: disclaimerText,
    parent: {
      smiles: parentSmiles,
      input_smiles: inputSmiles,
      removed_components: standardized.removedComponents,
      standardization_note: standardized.note,
      formula: parentFormula,
      exact_mass: Number(parentMass.toFixed(4)),
      detected_format: format,
      detected_groups: fg.detectedGroups,
      negative_path_enabled: fg.negativePathEnabled,
      fragmentation_theories: fg.theories
    },
    signals: runResult.signals,
    structures: runResult.structures,
    candidates: runResult.candidates,
    sweepResults: runResult.sweepResults
  };
}
