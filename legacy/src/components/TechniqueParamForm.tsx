import React from 'react';
import { MassTechnique, SimulationConfig } from '../types';
import { INSTRUMENT_PROFILES } from '../server/fragmentation/instrumentProfiles';
import { Info } from 'lucide-react';

interface Props {
  technique: MassTechnique;
  onTechniqueChange: (tech: MassTechnique) => void;
  config: SimulationConfig;
  onConfigChange: (newConfig: SimulationConfig) => void;
  disabled?: boolean;
}

export const TechniqueParamForm: React.FC<Props> = ({
  technique,
  onTechniqueChange,
  config,
  onConfigChange,
  disabled = false
}) => {
  const currentProfiles = INSTRUMENT_PROFILES.filter((p) => p.technique === technique);

  const handleProfileSelect = (profileId: string) => {
    const prof = INSTRUMENT_PROFILES.find((p) => p.id === profileId);
    if (prof) {
      onConfigChange({
        ...config,
        ...prof.defaultConfig,
        technique
      });
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
      {/* Step 1: Select MS Technique */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-blue-600 text-white text-xs flex items-center justify-center font-bold">
              1
            </span>
            選擇質譜分析技術 (Select MS Technique)
          </label>
          <span className="text-xs text-slate-500">獨立碎裂規則與反應路徑引擎</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* TOF-SIMS */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onTechniqueChange('TOF-SIMS');
            }}
            className={`p-3.5 rounded-xl text-left border-2 transition relative ${
              technique === 'TOF-SIMS'
                ? 'border-blue-600 bg-blue-50/60 text-blue-950 shadow-2xs'
                : 'border-slate-200 hover:border-slate-300 bg-slate-50/40 text-slate-700'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold text-sm">TOF-SIMS</span>
              <span className="text-[11px] font-medium text-blue-700">Surface analysis · 二次離子質譜</span>
            </div>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              表面二次離子碰撞級聯、正/負雙極性離子發射、團簇溫和濺射 vs 單原子深層裂解。
            </p>
          </button>

          {/* LC-MS/MS */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onTechniqueChange('LC-MS/MS');
            }}
            className={`p-3.5 rounded-xl text-left border-2 transition relative ${
              technique === 'LC-MS/MS'
                ? 'border-indigo-600 bg-indigo-50/60 text-indigo-950 shadow-2xs'
                : 'border-slate-200 hover:border-slate-300 bg-slate-50/40 text-slate-700'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold text-sm">LC-MS/MS</span>
              <span className="text-[11px] font-medium text-indigo-700">ESI/APCI + CID/HCD 串聯質譜</span>
            </div>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              偶數電子准分子離子 [M+H]⁺/[M-H]⁻、移動質子電荷導向異裂、碰撞能梯度與二階脫除。
            </p>
          </button>

          {/* GC-MS */}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onTechniqueChange('GC-MS');
            }}
            className={`p-3.5 rounded-xl text-left border-2 transition relative ${
              technique === 'GC-MS'
                ? 'border-emerald-600 bg-emerald-50/60 text-emerald-950 shadow-2xs'
                : 'border-slate-200 hover:border-slate-300 bg-slate-50/40 text-slate-700'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold text-sm">GC-MS</span>
              <span className="text-[11px] font-medium text-emerald-700">EI / CI 氣相層析質譜</span>
            </div>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              EI 奇數電子自由基陽離子 M⁺•、α-均裂、McLafferty 六元環重排、Tropylium 與 CI 反應氣加合。
            </p>
          </button>
        </div>
      </div>

      {/* Step 2: Instrument & Simulation Parameters */}
      <div className="pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-slate-800 text-white text-xs flex items-center justify-center font-bold">
              2
            </span>
            儀器與模擬參數設定 ({technique} Parameters — 直接控制可開啟之反應路徑)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">預設配置範本:</span>
            <select
              aria-label="預設配置範本"
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1 bg-slate-50 text-slate-700 font-medium"
              onChange={(e) => handleProfileSelect(e.target.value)}
              value=""
            >
              <option value="" disabled>
                載入預設儀器條件...
              </option>
              {currentProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic Form based on Technique */}
        {technique === 'TOF-SIMS' && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50/80 p-3.5 rounded-lg border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">離子極性 (Ion Polarity)</label>
              <select
                aria-label="離子極性"
                value={config.polarity || 'Both'}
                onChange={(e) => onConfigChange({ ...config, polarity: e.target.value as any })}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
              >
                <option value="Both">雙極性 (Positive & Negative)</option>
                <option value="Positive">正離子模式 (Positive only)</option>
                <option value="Negative">負離子模式 (Negative only)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">主要轟擊離子 (Primary Ion)</label>
              <select
                aria-label="主要轟擊離子"
                value={config.primaryIon || 'Generic'}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    primaryIon: e.target.value,
                    simulationMode: e.target.value === 'Generic' ? 'General' : 'Instrument-aware'
                  })
                }
                className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
              >
                <option value="Generic">Generic (通用表面碰撞模型)</option>
                <option value="Bi+">Bi⁺ (單原子液態金屬槍 — 深層裂解)</option>
                <option value="Bi3+">Bi₃⁺ (三原子鉍團簇 — 平衡產率)</option>
                <option value="Au+">Au⁺ (單原子金離子槍)</option>
                <option value="Au3+">Au₃⁺ (金團簇離子槍)</option>
                <option value="C60+">C₆₀⁺ (巴克球團簇 — 溫和保留母離子)</option>
                <option value="Ar Cluster">Ar Cluster (氣體團簇 GCIB — 極溫和)</option>
                <option value="Cs+">Cs⁺ (活性銫源 — 強化負離子與 [M+Cs]⁺)</option>
                <option value="O2+">O₂⁺ (活性氧源 — 強化正二次離子)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">離子束能量 (Energy, keV)</label>
              <input
                type="number"
                min="2"
                max="60"
                step="5"
                value={config.primaryIonEnergy || 25}
                onChange={(e) =>
                  onConfigChange({ ...config, primaryIonEnergy: parseFloat(e.target.value) || 25 })
                }
                className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">分析器與模式 (Analyzer)</label>
              <select
                aria-label="質量分析器"
                value={config.analyzer || 'TOF'}
                onChange={(e) => onConfigChange({ ...config, analyzer: e.target.value })}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
              >
                <option value="TOF">TOF (Time-of-Flight 飛行時間)</option>
                <option value="Orbitrap">Hybrid Orbitrap-SIMS</option>
              </select>
            </div>
          </div>
        )}

        {technique === 'LC-MS/MS' && (
          <div className="space-y-3 bg-slate-50/80 p-3.5 rounded-lg border border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">游離方式 (Ionization)</label>
                <select
                  aria-label="游離方式"
                  value={config.ionization || 'Auto'}
                  onChange={(e) => {
                    const val = e.target.value;
                    const newPol = val.endsWith('+')
                      ? 'Positive'
                      : val.endsWith('-')
                      ? 'Negative'
                      : config.polarity || 'Both';
                    onConfigChange({ ...config, ionization: val, polarity: newPol });
                  }}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
                >
                  <option value="Auto">Auto (依官能基自動判斷正/負模式)</option>
                  <option value="ESI+">ESI⁺ (液相電噴灑正離子 — 含鹼金屬加合)</option>
                  <option value="ESI-">ESI⁻ (液相電噴灑負離子 — 去質子化)</option>
                  <option value="APCI+">APCI⁺ (氣相大氣壓化學游離+ — 抑制 Na⁺ 加合)</option>
                  <option value="APCI-">APCI⁻ (氣相大氣壓化學游離-)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">質量分析器 (Analyzer)</label>
                <select
                  aria-label="分析器"
                  value={config.analyzer || 'QTOF'}
                  onChange={(e) => onConfigChange({ ...config, analyzer: e.target.value })}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
                >
                  <option value="QTOF">Q-TOF (束流型 CID — 無低質量截止)</option>
                  <option value="Orbitrap">Orbitrap (高解析 HCD — 支援多步裂解)</option>
                  <option value="Triple Quadrupole">Triple Quadrupole (QQQ 串聯四極桿)</option>
                  <option value="Ion Trap">Ion Trap (共振激發 — 具 1/3 低質量截止 LMCO)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">碎裂方法 (Fragmentation)</label>
                <select
                  aria-label="碎裂方法"
                  value={config.fragmentationMethod || 'CID'}
                  onChange={(e) => onConfigChange({ ...config, fragmentationMethod: e.target.value })}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
                >
                  <option value="CID">CID (碰撞誘導解離)</option>
                  <option value="HCD">HCD (高能 C-trap 碰撞解離)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">碰撞能量 (CE, eV)</label>
                <input
                  type="number"
                  min="5"
                  max="100"
                  step="5"
                  value={config.collisionEnergy !== undefined ? config.collisionEnergy : 25}
                  onChange={(e) =>
                    onConfigChange({ ...config, collisionEnergy: parseFloat(e.target.value) || 25 })
                  }
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
                />
              </div>
            </div>

            {/* CE Energy Sweep Toggle */}
            <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-200/60 text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={Boolean(config.collisionEnergyRange)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      onConfigChange({
                        ...config,
                        collisionEnergyRange: { start: 10, end: 40, step: 10 }
                      });
                    } else {
                      const copy = { ...config };
                      delete copy.collisionEnergyRange;
                      onConfigChange(copy);
                    }
                  }}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>啟用碰撞能量梯度掃描 (CE Sweep: 10 ~ 40 eV) — 比較低能、中能與高能下之主導產物離子</span>
              </label>
            </div>
          </div>
        )}

        {technique === 'GC-MS' && (
          <div className="space-y-3 bg-slate-50/80 p-3.5 rounded-lg border border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">游離方式 (Ionization)</label>
                <select
                  aria-label="游離方式"
                  value={config.ionization || 'EI'}
                  onChange={(e) => onConfigChange({ ...config, ionization: e.target.value })}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
                >
                  <option value="EI">EI (電子撞擊游離 — 奇數電子自由基 M⁺•)</option>
                  <option value="CI">CI (化學游離軟電離 — 質子轉移與反應氣加合)</option>
                </select>
              </div>

              {config.ionization === 'CI' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">CI 反應氣 (Reagent Gas)</label>
                  <select
                    aria-label="CI 反應氣"
                    value={config.reagentGas || 'Methane'}
                    onChange={(e) => onConfigChange({ ...config, reagentGas: e.target.value })}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
                  >
                    <option value="Methane">甲烷 (CH₄ — 產生 [M+H]⁺、[M+C₂H₅]⁺ 與異裂脫除)</option>
                    <option value="Isobutane">異丁烷 (i-C₄H₁₀ — 產生 [M+H]⁺ 與 [M+C₄H₉]⁺)</option>
                    <option value="Ammonia">氨氣 (NH₃ — 極溫和，主導 [M+H]⁺ 與 [M+NH₄]⁺)</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">電子撞擊能量 (EE, eV)</label>
                  <input
                    type="number"
                    min="12"
                    max="100"
                    step="5"
                    value={config.electronEnergy !== undefined ? config.electronEnergy : 70}
                    onChange={(e) =>
                      onConfigChange({ ...config, electronEnergy: parseFloat(e.target.value) || 70 })
                    }
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">質量分析器 (Analyzer)</label>
                <select
                  aria-label="分析器"
                  value={config.analyzer || 'Quadrupole'}
                  onChange={(e) => onConfigChange({ ...config, analyzer: e.target.value })}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
                >
                  <option value="Quadrupole">單四極桿 (GC-Quadrupole)</option>
                  <option value="TOF">高解析飛行時間 (GC-QTOF / GC-TOF)</option>
                  <option value="Orbitrap">GC-Orbitrap</option>
                </select>
              </div>

              <div className="flex flex-col justify-end">
                <div className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200 leading-tight">
                  {config.ionization === 'CI'
                    ? `CI 模式 (${config.reagentGas || 'Methane'})：抑制自由基開環，突顯准分子確認峰`
                    : (config.electronEnergy ?? 70) < 30
                    ? `低能軟電離 EI (${config.electronEnergy} eV)：保留 M⁺•，抑制二階脫乙炔開環`
                    : '標準 70 eV EI：完整開啟 α-裂解、McLafferty 與二階芳環開環'}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-500">
          <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>
            調整上方離子源、碰撞能量 (CE)、分析器 (如 Ion Trap 低質量截止) 或電子能量 (EE) 將直接改變可發生的化學斷裂路徑。
          </span>
        </div>
      </div>
    </div>
  );
};
