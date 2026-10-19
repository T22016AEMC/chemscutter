// 儀器預設設定（profile）。
// 來源：legacy instrumentProfiles.ts
import type { MassTechnique, SimulationConfig } from '../types';

export interface InstrumentProfile {
  id: string;
  technique: MassTechnique;
  name: string;
  description: string;
  defaultConfig: Partial<SimulationConfig>;
}

export const INSTRUMENT_PROFILES: InstrumentProfile[] = [
  // TOF-SIMS Profiles
  {
    id: 'tof-sims-generic',
    technique: 'TOF-SIMS',
    name: 'TOF-SIMS Generic (通用表面分析)',
    description: '標準表面質譜二次離子裂解模型，預設採用雙極性分析與通用團簇離子轟擊。',
    defaultConfig: {
      technique: 'TOF-SIMS',
      polarity: 'Both',
      primaryIon: 'Generic',
      primaryIonEnergy: 25,
      analyzer: 'TOF',
      simulationMode: 'General'
    }
  },
  {
    id: 'tof-sims-bi1',
    technique: 'TOF-SIMS',
    name: 'TOF-SIMS Bi⁺ (25-30 keV)',
    description: '液態金屬離子槍單原子鉍束 (LMIG Bi⁺)，高空間解析度，小碎片產率高。',
    defaultConfig: {
      technique: 'TOF-SIMS',
      polarity: 'Both',
      primaryIon: 'Bi+',
      primaryIonEnergy: 30,
      analyzer: 'TOF',
      simulationMode: 'Instrument-aware'
    }
  },
  {
    id: 'tof-sims-bi3',
    technique: 'TOF-SIMS',
    name: 'TOF-SIMS Bi₃⁺ (25-30 keV)',
    description: '三原子鉍團簇離子源 (Bi₃⁺/Bi₃⁺⁺)，兼具高二次分子離子發射產率與低次級損傷。',
    defaultConfig: {
      technique: 'TOF-SIMS',
      polarity: 'Both',
      primaryIon: 'Bi3+',
      primaryIonEnergy: 30,
      analyzer: 'TOF',
      simulationMode: 'Instrument-aware'
    }
  },
  {
    id: 'tof-sims-au',
    technique: 'TOF-SIMS',
    name: 'TOF-SIMS Au⁺ / Au₃⁺',
    description: '黃金金屬團簇離子槍，適於有機薄膜與大分子二次離子發射。',
    defaultConfig: {
      technique: 'TOF-SIMS',
      polarity: 'Both',
      primaryIon: 'Au+',
      primaryIonEnergy: 20,
      analyzer: 'TOF',
      simulationMode: 'Instrument-aware'
    }
  },
  {
    id: 'tof-sims-c60',
    technique: 'TOF-SIMS',
    name: 'TOF-SIMS C₆₀⁺ Fullerene (10-40 keV)',
    description: '巴克球碳六十多原子團簇，分子碰撞深度小，分子離子完整保留率極高。',
    defaultConfig: {
      technique: 'TOF-SIMS',
      polarity: 'Both',
      primaryIon: 'C60+',
      primaryIonEnergy: 20,
      analyzer: 'TOF',
      simulationMode: 'Instrument-aware'
    }
  },

  // LC-MS/MS Profiles
  {
    id: 'lcms-generic',
    technique: 'LC-MS/MS',
    name: 'LC-MS/MS Generic (通用液相串聯質譜)',
    description: '通用 ESI/APCI 串聯質譜碎裂模型，適用於常見藥物與有機分子預測。',
    defaultConfig: {
      technique: 'LC-MS/MS',
      polarity: 'Both',
      ionization: 'Auto',
      analyzer: 'Generic',
      fragmentationMethod: 'CID',
      collisionEnergy: 20,
      simulationMode: 'General'
    }
  },
  {
    id: 'lcms-esi-pos-qtof',
    technique: 'LC-MS/MS',
    name: 'LC-MS/MS ESI⁺ QTOF',
    description: '電噴灑正離子化 (ESI⁺) 搭配高解析四極桿飛行時間 (Q-TOF)，碰撞誘導解離 (CID)。',
    defaultConfig: {
      technique: 'LC-MS/MS',
      polarity: 'Positive',
      ionization: 'ESI+',
      analyzer: 'QTOF',
      fragmentationMethod: 'CID',
      collisionEnergy: 25,
      precursorAdduct: '[M+H]+',
      simulationMode: 'Instrument-aware'
    }
  },
  {
    id: 'lcms-esi-neg-qtof',
    technique: 'LC-MS/MS',
    name: 'LC-MS/MS ESI⁻ QTOF',
    description: '電噴灑負離子化 (ESI⁻) 搭配 Q-TOF，專注於去質子化 [M-H]⁻ 與酸根中性丟失。',
    defaultConfig: {
      technique: 'LC-MS/MS',
      polarity: 'Negative',
      ionization: 'ESI-',
      analyzer: 'QTOF',
      fragmentationMethod: 'CID',
      collisionEnergy: 25,
      precursorAdduct: '[M-H]-',
      simulationMode: 'Instrument-aware'
    }
  },
  {
    id: 'lcms-orbitrap-hcd',
    technique: 'LC-MS/MS',
    name: 'LC-MS/MS Orbitrap HCD',
    description: '高能碰撞解離 (Higher-energy C-trap Dissociation, HCD) 超高質量解析度。',
    defaultConfig: {
      technique: 'LC-MS/MS',
      polarity: 'Positive',
      ionization: 'ESI+',
      analyzer: 'Orbitrap',
      fragmentationMethod: 'HCD',
      collisionEnergy: 30,
      simulationMode: 'Instrument-aware'
    }
  },
  {
    id: 'lcms-triple-quad-cid',
    technique: 'LC-MS/MS',
    name: 'LC-MS/MS Triple Quadrupole (QQQ) CID',
    description: '三重四極桿多重反應監測 (MRM) 定量常用環境，低碰撞能產物離子。',
    defaultConfig: {
      technique: 'LC-MS/MS',
      polarity: 'Both',
      ionization: 'ESI+',
      analyzer: 'Triple Quadrupole',
      fragmentationMethod: 'CID',
      collisionEnergy: 20,
      simulationMode: 'Instrument-aware'
    }
  },

  // GC-MS Profiles
  {
    id: 'gcms-ei-70ev',
    technique: 'GC-MS',
    name: 'GC-MS EI (70 eV, 標準電子撞擊)',
    description: 'NIST/Wiley 標準氣相層析質譜條件 (70 eV 自由基陽離子 M⁺˙ 與特徵重排)。',
    defaultConfig: {
      technique: 'GC-MS',
      polarity: 'Positive',
      ionization: 'EI',
      electronEnergy: 70,
      analyzer: 'Quadrupole',
      simulationMode: 'Instrument-aware'
    }
  },
  {
    id: 'gcms-ei-custom',
    technique: 'GC-MS',
    name: 'GC-MS EI (自訂電子能量 15-100 eV)',
    description: '低電子能量 (如 15-30 eV) 軟電離或高能自由基劇烈碎裂。',
    defaultConfig: {
      technique: 'GC-MS',
      polarity: 'Positive',
      ionization: 'EI',
      electronEnergy: 30,
      analyzer: 'Quadrupole',
      simulationMode: 'Instrument-aware'
    }
  },
  {
    id: 'gcms-ci-generic',
    technique: 'GC-MS',
    name: 'GC-MS CI Generic (化學游離法)',
    description: '軟電離氣相質子轉移反應 (反應氣甲烷/異丁烷/氨)，准分子離子 [M+H]⁺ 為主。',
    defaultConfig: {
      technique: 'GC-MS',
      polarity: 'Positive',
      ionization: 'CI',
      analyzer: 'Quadrupole',
      reagentGas: 'Methane',
      simulationMode: 'Instrument-aware'
    }
  }
];

export function getProfileForConfig(technique: MassTechnique): InstrumentProfile {
  const found = INSTRUMENT_PROFILES.find((p) => p.technique === technique);
  return found || INSTRUMENT_PROFILES[0];
}
