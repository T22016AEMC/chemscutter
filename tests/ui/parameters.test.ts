import { describe, expect, it, vi } from 'vitest';
import { INSTRUMENT_PROFILES } from '../../src/engine/platform/instrumentProfiles';
import { defaultConfig, isFormConfig, loadProfile, parameterRows, parametersChanged, recordOnly, selectIonization, toDraft, toEngineConfig, validateParameters } from '../../src/shared/parameters';
import { createStructureSession, isStructureRequest } from '../../src/worker/structureSession';
import { runMultiPlatformAnalysis } from '../../src/engine';
import type { MassTechnique } from '../../src/engine/types';

describe('儀器參數與舊版範本', () => {
  it.each(['TOF-SIMS', 'LC-MS/MS', 'GC-MS'] as MassTechnique[])('%s 起始值與恢復預設值均通過範圍、步進及 Worker 驗證', (technique) => {
    const config = defaultConfig(technique);
    expect(validateParameters(toDraft(config))).toEqual({});
    expect(toEngineConfig(toDraft(config))).toEqual(config);
    expect(isFormConfig(config, technique)).toBe(true);
  });
  it.each(INSTRUMENT_PROFILES)('$id 範本完整保留原值且能通過驗證', (profile) => {
    const draft = loadProfile(profile.id);
    expect(validateParameters(draft)).toEqual({});
    const config = toEngineConfig(draft);
    expect(config).toMatchObject(profile.defaultConfig);
    expect(isFormConfig(config, profile.technique)).toBe(true);
  });
  it('範本總數為 13；LC 通用範本保留 Generic／CID／20，初始值為 QTOF／CID／25', () => {
    expect(INSTRUMENT_PROFILES).toHaveLength(13);
    expect(toEngineConfig(loadProfile('lcms-generic'))).toMatchObject({ analyzer: 'Generic', fragmentationMethod: 'CID', collisionEnergy: 20 });
    expect(defaultConfig('LC-MS/MS')).toMatchObject({ analyzer: 'QTOF', fragmentationMethod: 'CID', collisionEnergy: 25, collisionEnergyRange: { start: 10, end: 40, step: 15 } });
  });
  it.each(['', ' ', '1', '61', '2.5', 'NaN', 'Infinity'])('TOF 不接受空白、超範圍、非整數：%s', (value) => {
    const draft = { ...toDraft(defaultConfig('TOF-SIMS')), primaryIonEnergy: value };
    expect(validateParameters(draft).primaryIonEnergy).toBeTruthy();
    expect(() => toEngineConfig(draft)).toThrow('儀器參數');
  });
  it('LC 步進為 5，EI 步進為 1，CI 不驗證隱藏的 EI 欄位', () => {
    expect(validateParameters({ ...toDraft(defaultConfig('LC-MS/MS')), collisionEnergy: '26' }).collisionEnergy).toContain('步進');
    expect(validateParameters({ ...toDraft(defaultConfig('GC-MS')), electronEnergy: '71' })).toEqual({});
    expect(validateParameters({ ...toDraft(defaultConfig('GC-MS')), electronEnergy: '11' }).electronEnergy).toBeTruthy();
    expect(validateParameters({ ...loadProfile('gcms-ci-generic'), electronEnergy: '' })).toEqual({});
  });
  it('QQQ 範本不偷偷重設 Both；手動選擇游離方式才連動極性', () => {
    const draft = loadProfile('lcms-triple-quad-cid');
    expect(draft).toMatchObject({ ionization: 'ESI+', polarity: 'Both' });
    expect(selectIonization(draft, 'ESI+').polarity).toBe('Positive');
    expect(selectIonization(draft, 'APCI-').polarity).toBe('Negative');
    expect(selectIonization(draft, 'Auto').polarity).toBe('Both');
  });
  it('只有參數或技術變更才標示舊結果；恢復原值清除提示且不修改快照', () => {
    const config = defaultConfig('TOF-SIMS');
    expect(parametersChanged(toDraft(config), config)).toBe(false);
    expect(parametersChanged({ ...toDraft(config), primaryIonEnergy: '26' }, config)).toBe(true);
    expect(parametersChanged({ ...toDraft(config), primaryIonEnergy: '' }, config)).toBe(true);
    expect(parametersChanged(toDraft(defaultConfig('GC-MS')), config)).toBe(true);
    expect(config.primaryIonEnergy).toBe(25);
  });
  it.each(['TOF-SIMS', 'GC-MS'] as MassTechnique[])('%s 結果與 Excel 共用的分析器標示包含僅記錄說明', (technique) => {
    expect(parameterRows(defaultConfig(technique)).find(([label]) => label === '分析器')?.[1]).toContain(recordOnly);
    if (technique === 'TOF-SIMS') expect(parameterRows(defaultConfig(technique)).find(([label]) => label === '模擬模式')?.[1]).toContain(recordOnly);
  });
});

describe('完整參數透過 Worker 送入既有引擎', () => {
  it.each(['TOF-SIMS', 'LC-MS/MS', 'GC-MS'] as MassTechnique[])('%s 送出的設定與表單完全相同', async (technique) => {
    const config = defaultConfig(technique);
    const result = await runMultiPlatformAnalysis('CCOC(C)=O', config);
    expect(result.candidates).toHaveLength({ 'TOF-SIMS': 22, 'LC-MS/MS': 13, 'GC-MS': 11 }[technique]);
    const analyze = vi.fn<typeof runMultiPlatformAnalysis>().mockResolvedValue(result);
    const session = createStructureSession(analyze);
    await session({ type: 'prepare', id: 1, input: 'CCOC(C)=O', source: 'text' });
    const response = await session({ type: 'run-prepared', id: 2, preparationId: 1, confirmed: false, technique, config });
    expect(response?.type).toBe('result');
    expect(analyze).toHaveBeenCalledExactlyOnceWith('CCOC(C)=O', config);
  });
  it('拒絕技術不符、額外參數及不完整／不合範圍設定', () => {
    const config = defaultConfig('TOF-SIMS');
    const request = { type: 'run-prepared', id: 2, preparationId: 1, confirmed: false, technique: 'TOF-SIMS', config };
    expect(isStructureRequest(request)).toBe(true);
    for (const invalid of [{ ...config, technique: 'GC-MS' }, { ...config, primaryIonEnergy: 80 }, { ...config, primaryIonEnergy: '25' }, { ...config, customParameters: {} }, {}]) expect(isStructureRequest({ ...request, config: invalid })).toBe(false);
  });
});
