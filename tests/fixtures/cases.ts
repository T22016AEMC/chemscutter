// 共用測試案例：標準答案產生腳本（scripts/golden/）與對照測試（tests/parity/）共用同一份清單。
// 注意：修改這份清單會改變標準答案的案例集合，必須依指令進行。
import type { MassTechnique, SimulationConfig } from '../../src/engine/types';

export const MOLECULES: Record<string, string> = {
  aspirin: 'CC(=O)Oc1ccccc1C(=O)O',
  salicylic_acid: 'OC(=O)c1ccccc1O',
  caffeine: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C',
  ibuprofen: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O',
  acetaminophen: 'CC(=O)Nc1ccc(O)cc1',
  toluene: 'Cc1ccccc1',
  hexan_2_one: 'CCCCC(C)=O',
  butyrophenone: 'CCCC(=O)c1ccccc1',
  methyl_benzoate: 'COC(=O)c1ccccc1',
  bromochlorobenzene: 'Clc1ccc(Br)cc1',
  fluorobenzoic_acid: 'OC(=O)c1ccc(F)cc1',
  nitrobenzene: '[O-][N+](=O)c1ccccc1',
  benzonitrile: 'N#Cc1ccccc1',
  ethanol: 'CCO',
  benzenesulfonic_acid: 'OS(=O)(=O)c1ccccc1',
  dimethylbenzylamine: 'CN(C)Cc1ccccc1',
  glucose: 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O',
};

/**
 * 乙酸乙酯 CCOC(C)=O 的 Molfile，由 RDKit get_molblock() 產生後固定為字面值，
 * 避免案例清單依賴 RDKit 載入。tests/fixtures/cases.test.ts 會確認 RDKit 仍產生相同內容。
 */
export const ETHYL_ACETATE_SMILES = 'CCOC(C)=O';
export const ETHYL_ACETATE_MOLBLOCK = [
  '',
  '     RDKit          2D',
  '',
  '  6  5  0  0  0  0  0  0  0  0999 V2000',
  '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '    1.2990    0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '    2.5981   -0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
  '    3.8971    0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '    5.1962   -0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
  '    3.8971    2.2500    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
  '  1  2  1  0',
  '  2  3  1  0',
  '  3  4  1  0',
  '  4  5  1  0',
  '  4  6  2  0',
  'M  END',
  '',
].join('\n');

/** 全部 20 種輸入：17 個分子 + 名稱、Molfile、無效輸入 */
export const INPUTS: [string, string][] = [
  ...Object.entries(MOLECULES),
  ['name_aspirin', 'aspirin'],
  ['molfile_ethyl_acetate', ETHYL_ACETATE_MOLBLOCK],
  ['invalid_input', 'not_a_molecule_xyz'],
];

export const TECHNIQUES: MassTechnique[] = ['TOF-SIMS', 'LC-MS/MS', 'GC-MS'];

// 檔名不可含「/」，案例 ID 中以 LC-MS-MS 表示 LC-MS/MS
export const techniqueId = (t: MassTechnique) => t.replace('/', '-');

// 舊版介面切換技術時送出的基礎 config（legacy/src/App.tsx handleTechniqueChange）
export const UI_BASE: Record<MassTechnique, SimulationConfig> = {
  'TOF-SIMS': {
    technique: 'TOF-SIMS',
    polarity: 'Both',
    primaryIon: 'Generic',
    primaryIonEnergy: 25,
    analyzer: 'TOF',
    simulationMode: 'General',
  },
  'LC-MS/MS': {
    technique: 'LC-MS/MS',
    polarity: 'Both',
    ionization: 'Auto',
    analyzer: 'QTOF',
    fragmentationMethod: 'CID',
    collisionEnergy: 25,
    simulationMode: 'General',
  },
  'GC-MS': {
    technique: 'GC-MS',
    polarity: 'Positive',
    ionization: 'EI',
    electronEnergy: 70,
    analyzer: 'Quadrupole',
    simulationMode: 'Instrument-aware',
  },
};

// 參數變化案例：以介面基礎 config 套用表單（legacy/src/components/TechniqueParamForm.tsx）實際會做的變更
// TOF-SIMS 改主要離子時，表單會同時把 simulationMode 設為 Instrument-aware
// LC-MS/MS 改游離方式時，表單會依 +/- 結尾同時設定 polarity
export const PARAM_VARIANTS: { technique: MassTechnique; suffix: string; config: SimulationConfig }[] = [
  {
    technique: 'TOF-SIMS',
    suffix: 'Bi3+_30keV',
    config: { ...UI_BASE['TOF-SIMS'], primaryIon: 'Bi3+', simulationMode: 'Instrument-aware', primaryIonEnergy: 30 },
  },
  {
    technique: 'TOF-SIMS',
    suffix: 'C60+_20keV',
    config: { ...UI_BASE['TOF-SIMS'], primaryIon: 'C60+', simulationMode: 'Instrument-aware', primaryIonEnergy: 20 },
  },
  {
    technique: 'TOF-SIMS',
    suffix: 'Cs+_negative',
    config: { ...UI_BASE['TOF-SIMS'], primaryIon: 'Cs+', simulationMode: 'Instrument-aware', polarity: 'Negative' },
  },
  {
    technique: 'LC-MS/MS',
    suffix: 'ESI+_CE10',
    config: { ...UI_BASE['LC-MS/MS'], ionization: 'ESI+', polarity: 'Positive', collisionEnergy: 10 },
  },
  {
    technique: 'LC-MS/MS',
    suffix: 'ESI-_CE40',
    config: { ...UI_BASE['LC-MS/MS'], ionization: 'ESI-', polarity: 'Negative', collisionEnergy: 40 },
  },
  {
    technique: 'LC-MS/MS',
    suffix: 'APCI+',
    config: { ...UI_BASE['LC-MS/MS'], ionization: 'APCI+', polarity: 'Positive' },
  },
  {
    technique: 'LC-MS/MS',
    suffix: 'CEsweep_10-40_step15',
    config: { ...UI_BASE['LC-MS/MS'], collisionEnergyRange: { start: 10, end: 40, step: 15 } },
  },
  {
    technique: 'GC-MS',
    suffix: 'EI_70eV',
    config: { ...UI_BASE['GC-MS'], ionization: 'EI', electronEnergy: 70 },
  },
  {
    technique: 'GC-MS',
    suffix: 'EI_20eV',
    config: { ...UI_BASE['GC-MS'], ionization: 'EI', electronEnergy: 20 },
  },
  {
    technique: 'GC-MS',
    suffix: 'CI_methane',
    config: { ...UI_BASE['GC-MS'], ionization: 'CI', reagentGas: 'Methane' },
  },
  {
    technique: 'GC-MS',
    suffix: 'CI_ammonia',
    config: { ...UI_BASE['GC-MS'], ionization: 'CI', reagentGas: 'Ammonia' },
  },
];

export const PARAM_MOLECULES = ['aspirin', 'butyrophenone', 'bromochlorobenzene'];

export interface Case {
  id: string;
  /** INPUTS 中的輸入名稱 */
  inputName: string;
  input: string;
  config: Partial<SimulationConfig>;
}

/** 全部 93 個案例：20 種輸入 × 3 平台預設參數，加上 3 個分子 × 11 組參數 */
export function buildCases(): Case[] {
  const cases: Case[] = [];
  for (const [name, input] of INPUTS) {
    for (const technique of TECHNIQUES) {
      cases.push({ id: `${name}__${techniqueId(technique)}__default`, inputName: name, input, config: { technique } });
    }
  }
  for (const name of PARAM_MOLECULES) {
    for (const v of PARAM_VARIANTS) {
      cases.push({
        id: `${name}__${techniqueId(v.technique)}__${v.suffix}`,
        inputName: name,
        input: MOLECULES[name],
        config: v.config,
      });
    }
  }
  return cases;
}
