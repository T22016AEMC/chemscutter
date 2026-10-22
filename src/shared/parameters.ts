import type { MassTechnique, SimulationConfig } from '../engine/types';
import { INSTRUMENT_PROFILES } from '../engine/platform/instrumentProfiles';

export const recordOnly = '僅記錄，不影響目前模擬';
export const primaryIons = ['Generic', 'Bi+', 'Bi3+', 'Au+', 'Au3+', 'C60+', 'Ar Cluster', 'Cs+', 'O2+'];
export const analyzers: Record<MassTechnique, string[]> = {
  'TOF-SIMS': ['TOF', 'Orbitrap'],
  'LC-MS/MS': ['QTOF', 'Orbitrap', 'Triple Quadrupole', 'Ion Trap', 'Generic'],
  'GC-MS': ['Quadrupole', 'TOF', 'Orbitrap'],
};
export const configLabels: Record<string, string> = { technique: '平台', analyzer: '分析器', polarity: '極性', ionization: '游離方式', fragmentationMethod: '碎裂方法', collisionEnergy: '碰撞能量（eV）', collisionEnergyUnit: '碰撞能量單位', collisionEnergyRange: '碰撞能量掃描範圍', electronEnergy: '電子能量（eV）', primaryIon: '主要轟擊離子', primaryIonEnergy: '離子束能量（keV）', simulationMode: '模擬模式', isolationWindow: '隔離窗', precursorAdduct: '前驅加合物', sourceTemperature: '離子源溫度', sourceVoltage: '離子源電壓', reagentGas: '反應氣', customParameters: '其他參數' };
const valueLabels: Record<string, string> = { Both: '雙極性', Positive: '僅正離子', Negative: '僅負離子', General: '通用模式', 'Instrument-aware': '儀器感知模式', Auto: '自動', QTOF: 'Q-TOF', Quadrupole: '單四極桿', Methane: '甲烷', Isobutane: '異丁烷', Ammonia: '氨氣' };

export function defaultConfig(technique: MassTechnique): SimulationConfig {
  if (technique === 'TOF-SIMS') return { technique, polarity: 'Both', primaryIon: 'Generic', primaryIonEnergy: 25, analyzer: 'TOF', simulationMode: 'General' };
  if (technique === 'LC-MS/MS') return { technique, polarity: 'Both', ionization: 'Auto', analyzer: 'QTOF', fragmentationMethod: 'CID', collisionEnergy: 25, collisionEnergyUnit: 'eV', collisionEnergyRange: { start: 10, end: 40, step: 15 }, simulationMode: 'General' };
  return { technique, polarity: 'Positive', ionization: 'EI', electronEnergy: 70, reagentGas: 'Methane', analyzer: 'Quadrupole', simulationMode: 'Instrument-aware' };
}

type EnergyKey = 'primaryIonEnergy' | 'collisionEnergy' | 'electronEnergy';
export type ParameterDraft = Omit<SimulationConfig, EnergyKey> & Record<EnergyKey, string>;
export function toDraft(config: SimulationConfig): ParameterDraft {
  return { ...config, primaryIonEnergy: String(config.primaryIonEnergy ?? 25), collisionEnergy: String(config.collisionEnergy ?? 25), electronEnergy: String(config.electronEnergy ?? 70) };
}
export function loadProfile(id: string): ParameterDraft {
  const profile = INSTRUMENT_PROFILES.find((item) => item.id === id);
  if (!profile) throw new Error('找不到預設配置範本。');
  return toDraft({ ...defaultConfig(profile.technique), ...profile.defaultConfig, technique: profile.technique });
}
export function selectIonization(draft: ParameterDraft, ionization: string): ParameterDraft {
  return { ...draft, ionization, polarity: ionization.endsWith('+') ? 'Positive' : ionization.endsWith('-') ? 'Negative' : draft.polarity };
}
export const energyRules: Record<EnergyKey, { min: number; max: number; step: number }> = {
  primaryIonEnergy: { min: 2, max: 60, step: 1 }, collisionEnergy: { min: 5, max: 100, step: 5 }, electronEnergy: { min: 12, max: 100, step: 1 },
};
export function validateParameters(draft: ParameterDraft): Partial<Record<EnergyKey, string>> {
  const key: EnergyKey | undefined = draft.technique === 'TOF-SIMS' ? 'primaryIonEnergy' : draft.technique === 'LC-MS/MS' ? 'collisionEnergy' : draft.ionization === 'EI' ? 'electronEnergy' : undefined;
  if (!key) return {};
  const raw = draft[key];
  const value = Number(raw);
  const { min, max, step } = energyRules[key];
  if (!raw.trim()) return { [key]: `請填寫${configLabels[key]}。` };
  if (!Number.isFinite(value) || value < min || value > max) return { [key]: `請輸入 ${min}–${max} 範圍內的數值。` };
  if (!Number.isInteger((value - min) / step)) return { [key]: `請以 ${step} 為步進輸入數值（${min}–${max}）。` };
  return {};
}
export function toEngineConfig(draft: ParameterDraft): SimulationConfig {
  if (Object.keys(validateParameters(draft)).length) throw new Error('儀器參數尚未通過驗證，請修正標示的欄位。');
  const { primaryIonEnergy, collisionEnergy, electronEnergy, ...rest } = draft;
  if (draft.technique === 'TOF-SIMS') return { ...rest, primaryIonEnergy: Number(primaryIonEnergy) };
  if (draft.technique === 'LC-MS/MS') return { ...rest, collisionEnergy: Number(collisionEnergy) };
  return { ...rest, electronEnergy: Number(electronEnergy) };
}
export function parametersChanged(draft: ParameterDraft, previous: SimulationConfig): boolean {
  if (Object.keys(validateParameters(draft)).length) return true;
  return JSON.stringify(toEngineConfig(draft)) !== JSON.stringify(toEngineConfig(toDraft(previous)));
}
export function parameterRows(config: SimulationConfig): [string, string | number][] {
  return Object.entries(config).map(([key, value]) => {
    let text: string | number = typeof value === 'number' ? value : typeof value === 'object' ? JSON.stringify(value) : valueLabels[String(value)] || String(value);
    if (key === 'analyzer' && config.technique === 'TOF-SIMS' && value === 'Orbitrap') text = 'Hybrid Orbitrap-SIMS';
    if ((key === 'analyzer' && config.technique !== 'LC-MS/MS') || (key === 'simulationMode' && config.technique === 'TOF-SIMS')) text = `${text}（${recordOnly}）`;
    return [configLabels[key] || key, text];
  });
}

/** Worker 僅接收表單能產生的完整設定，不接受任意自訂欄位。 */
export function isFormConfig(value: unknown, technique: MassTechnique): value is SimulationConfig {
  if (!value || typeof value !== 'object') return false;
  const c = value as SimulationConfig;
  if (c.technique !== technique || !['Both', 'Positive', 'Negative'].includes(c.polarity || '') || !analyzers[technique].includes(c.analyzer || '') || !['General', 'Instrument-aware'].includes(c.simulationMode || '')) return false;
  const allowed = ['technique', 'polarity', 'analyzer', 'simulationMode', ...(technique === 'TOF-SIMS' ? ['primaryIon', 'primaryIonEnergy'] : technique === 'LC-MS/MS' ? ['ionization', 'fragmentationMethod', 'collisionEnergy', 'collisionEnergyUnit', 'collisionEnergyRange', 'precursorAdduct'] : ['ionization', 'electronEnergy', 'reagentGas'])];
  if (Object.keys(c).some((key) => !allowed.includes(key))) return false;
  if (technique === 'TOF-SIMS' && (!primaryIons.includes(c.primaryIon || '') || typeof c.primaryIonEnergy !== 'number')) return false;
  if (technique === 'LC-MS/MS' && (!['Auto', 'ESI+', 'ESI-', 'APCI+', 'APCI-'].includes(c.ionization || '') || !['CID', 'HCD'].includes(c.fragmentationMethod || '') || typeof c.collisionEnergy !== 'number' || c.collisionEnergyUnit !== 'eV' || c.collisionEnergyRange?.start !== 10 || c.collisionEnergyRange.end !== 40 || c.collisionEnergyRange.step !== 15 || (c.precursorAdduct !== undefined && !['[M+H]+', '[M-H]-'].includes(c.precursorAdduct)))) return false;
  if (technique === 'GC-MS' && (!['EI', 'CI'].includes(c.ionization || '') || typeof c.electronEnergy !== 'number' || !['Methane', 'Isobutane', 'Ammonia'].includes(c.reagentGas || ''))) return false;
  return Object.keys(validateParameters(toDraft(c))).length === 0;
}
