import type { MassTechnique } from '../engine/types';
import { INSTRUMENT_PROFILES } from '../engine/platform/instrumentProfiles';
import { analyzers, configLabels, defaultConfig, energyRules, loadProfile, primaryIons, recordOnly, selectIonization, toDraft, validateParameters, type ParameterDraft } from '../shared/parameters';

export default function ParameterForm({ draft, onChange, disabled }: { draft: ParameterDraft; onChange: (value: ParameterDraft) => void; disabled: boolean }) {
  const errors = validateParameters(draft);
  const update = (next: Partial<ParameterDraft>) => onChange({ ...draft, ...next });
  const choice = (key: keyof ParameterDraft, label: string, options: (string | [string, string])[]) => <label>{label}<select value={String(draft[key] || '')} onChange={(e) => key === 'ionization' ? onChange(selectIonization(draft, e.target.value)) : key === 'primaryIon' ? update({ primaryIon: e.target.value, simulationMode: e.target.value === 'Generic' ? 'General' : 'Instrument-aware' }) : update({ [key]: e.target.value })}>{options.map((item) => { const [value, text] = typeof item === 'string' ? [item, item] : item; return <option key={value} value={value}>{text}</option>; })}</select></label>;
  const energy = (key: keyof typeof energyRules) => <label>{configLabels[key]}<input type="number" {...energyRules[key]} value={draft[key]} aria-invalid={!!errors[key]} aria-describedby={`${key}-help`} onChange={(e) => update({ [key]: e.target.value })} /><small id={`${key}-help`}>{errors[key] || `${energyRules[key].min}–${energyRules[key].max}；步進 ${energyRules[key].step}`}</small></label>;
  return <fieldset className="parameters" disabled={disabled}>
    <legend>儀器參數</legend>
    <div className="technique-cards" aria-label="分析平台">{(['TOF-SIMS', 'LC-MS/MS', 'GC-MS'] as MassTechnique[]).map((technique) => <button key={technique} type="button" aria-pressed={draft.technique === technique} onClick={() => onChange(toDraft(defaultConfig(technique)))}>{technique}</button>)}</div>
    <label>預設配置範本<select value="" onChange={(e) => { if (e.target.value) onChange(loadProfile(e.target.value)); }}><option value="">載入範本…</option>{INSTRUMENT_PROFILES.filter((p) => p.technique === draft.technique).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <div className="parameter-grid">
      {draft.technique === 'TOF-SIMS' && <>
        {choice('polarity', '離子極性', [['Both', '雙極性'], ['Positive', '僅正離子'], ['Negative', '僅負離子']])}
        {choice('primaryIon', '主要轟擊離子', primaryIons)}{energy('primaryIonEnergy')}
      </>}
      {draft.technique === 'LC-MS/MS' && <>
        {choice('ionization', '游離方式', [['Auto', 'Auto（自動）'], 'ESI+', 'ESI-', 'APCI+', 'APCI-'])}
        <p>目前極性：{{ Both: '雙極性', Positive: '僅正離子', Negative: '僅負離子' }[draft.polarity || 'Both']}。選擇帶 +／- 的游離方式時會連動極性。</p>
      </>}
      {draft.technique === 'GC-MS' && choice('ionization', '游離方式', ['EI', 'CI'])}
      {choice('analyzer', '分析器', analyzers[draft.technique].map((value): [string, string] => [value, value === 'Orbitrap' && draft.technique === 'TOF-SIMS' ? 'Hybrid Orbitrap-SIMS' : value === 'QTOF' ? 'Q-TOF' : value === 'Quadrupole' ? '單四極桿' : value === 'Generic' ? 'Generic（通用範本）' : value]))}
      {draft.technique !== 'LC-MS/MS' && <p>{recordOnly}（分析器{draft.technique === 'TOF-SIMS' ? '，含 Hybrid Orbitrap-SIMS' : ''}）。</p>}
      {draft.technique === 'LC-MS/MS' && <>
        {choice('fragmentationMethod', '碎裂方法', ['CID', 'HCD'])}{energy('collisionEnergy')}
        <p>固定執行碰撞能量掃描（10／25／40 eV）。</p>
        <p>Q-TOF、Orbitrap、Triple Quadrupole 下，切換 CID／HCD 不一定改變候選。</p>
        {draft.analyzer === 'Triple Quadrupole' && draft.ionization === 'ESI+' && draft.polarity === 'Both' && <p>QQQ 範本沿用 ESI+ 搭配雙極性（Both），保留原設定；手動切換游離方式時才連動極性。</p>}
        {draft.precursorAdduct && <p>範本前驅加合物：{draft.precursorAdduct}。</p>}
      </>}
      {draft.technique === 'GC-MS' && (draft.ionization === 'EI' ? energy('electronEnergy') : choice('reagentGas', '反應氣', [['Methane', '甲烷'], ['Isobutane', '異丁烷'], ['Ammonia', '氨氣']]))}
    </div>
    {draft.technique === 'TOF-SIMS' && <p>模式：{draft.simulationMode === 'General' ? '通用' : '儀器感知'}（{recordOnly}）；由主要轟擊離子連動。</p>}
    {draft.technique === 'GC-MS' && <p>條件說明請見分析結果中的引擎回傳文字。</p>}
    <button type="button" onClick={() => onChange(toDraft(defaultConfig(draft.technique)))}>恢復預設值</button>
    {!!Object.keys(errors).length && <p role="alert">儀器參數尚未通過驗證，請修正標示的欄位後再分析。</p>}
  </fieldset>;
}
