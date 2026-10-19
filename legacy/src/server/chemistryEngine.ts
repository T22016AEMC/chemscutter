import { SimulationConfig, AnalysisResult } from '../types';
import { getRDKit, parseInputToMol, calculateFormulaFromJson, molToSvgDataUri } from './fragmentation/commonFragmentation';
import { detectFunctionalGroups } from './fragmentation/functionalGroupRules';
import { runTofSimsFragmentation } from './fragmentation/tofSimsFragmentation';
import { runLcMsMsFragmentation } from './fragmentation/lcMsMsFragmentation';
import { runGcMsFragmentation } from './fragmentation/gcMsFragmentation';
import { getProfileForConfig } from './fragmentation/instrumentProfiles';

export { getRDKit, parseInputToMol, calculateFormulaFromJson, molToSvgDataUri } from './fragmentation/commonFragmentation';
export { detectFunctionalGroups } from './fragmentation/functionalGroupRules';

export const SIMULATION_DISCLAIMER =
  '本工具為基於化學結構、官能基與質譜碎裂規則的候選碎片模擬器。實際 MS spectrum 會受到離子化方式、儀器結構、碰撞能量、source conditions、matrix、樣品狀態與其他實驗條件影響。模擬結果主要用於送測前的候選碎片篩選與實驗結果輔助判讀，所有數值為啟發式優先評分 (Heuristic Priority Score, 0-100)，不代表真實實驗峰強度或保證實際一定觀察到該離子。';

/**
 * Main Multi-Platform MS Fragment Simulator Router
 * Routes chemical structure through TOF-SIMS, LC-MS/MS, or GC-MS fragmentation engine.
 */
export async function runMultiPlatformAnalysis(
  rawInput: string,
  config?: Partial<SimulationConfig>
): Promise<AnalysisResult> {
  const RDKit = await getRDKit();
  const { mol, format, error } = parseInputToMol(rawInput, RDKit);
  if (error || !mol || !mol.is_valid()) {
    throw new Error(error || '無效的化學結構式');
  }

  const parentSmiles = mol.get_smiles();
  const parentJson = JSON.parse(mol.get_json());
  const parentFormula = calculateFormulaFromJson(parentJson);
  const parentDesc = JSON.parse(mol.get_descriptors());
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

  let runResult: {
    candidates: any[];
    structures: any[];
    signals: any[];
    parameterContext: string;
    activeRegimeDescription?: string;
    sweepResults?: any[];
  };

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

/**
 * Backward compatibility wrapper for existing TOF-SIMS calls
 */
export async function processTofSimsAnalysis(rawInput: string): Promise<any> {
  return await runMultiPlatformAnalysis(rawInput, { technique: 'TOF-SIMS' });
}
