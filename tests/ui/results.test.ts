/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import type { AnalysisResult, FragmentCandidate } from '../../src/engine/types';
import { defaultFilter, filterCandidates, toggleIonType, formatIonFormula, restoreFormula, groupPolarity, fullMzRange, validRange, plotX, plotY, peakLabels } from '../../src/ui/results/model';
const golden = import.meta.glob<string>('../golden/*.json', { eager: true, query: '?raw', import: 'default' });
const sample = (options: Partial<FragmentCandidate> = {}): FragmentCandidate => ({ id: 'a', technique: 'TOF-SIMS', polarity: 'Positive', mz: 10, formula: 'CH4+.', smiles: '[CH4+]', exactMass: 16, neutralExactMass: 16, ionExactMass: 16, charge: 1, ionType: 'M+.', mechanism: '測試機制', confidence: 'High', priority: 'High', sourceRule: 'test_rule', heuristicScore: 80, ...options });
describe('離子式只改顯示，保留來源', () => {
  it('元素數字下標、電荷及自由基點上標，中性不補符號', () => {
    expect(formatIonFormula('CH4+.')).toEqual([{ raw: 'CH', text: 'CH', position: 'normal' }, { raw: '4', text: '4', position: 'sub' }, { raw: '+.', text: '+•', position: 'super' }]);
    expect(formatIonFormula('Cl-').at(-1)).toMatchObject({ text: '-', position: 'super' });
    expect(formatIonFormula('H2O').some((part) => part.position === 'super')).toBe(false);
    expect(formatIonFormula('35Cl-')[0]).toMatchObject({ raw: '35', position: 'normal' });
    expect(formatIonFormula('C5H10NO2S- (³⁴S)').at(-2)).toMatchObject({ raw: '-', position: 'super' });
    expect(formatIonFormula('CH3.').at(-1)).toMatchObject({ raw: '.', text: '•', position: 'super' });
  });
  it('全部 591 個 golden 中候選、訊號、結構與母分子式均可逐字還原', () => {
    let cases = 0, formulas = 0;
    for (const [file, text] of Object.entries(golden)) {
      if (file.endsWith('_index.json')) continue;
      const result = JSON.parse(text) as AnalysisResult;
      cases++;
      for (const formula of [result.parent?.formula, ...(result.candidates || []).flatMap((item) => [item.formula, item.neutralFormula]), ...(result.signals || []).map((item) => item.formula), ...(result.structures || []).map((item) => item.formula)].filter((value): value is string => typeof value === 'string')) {
        expect(restoreFormula(formatIonFormula(formula))).toBe(formula); formulas++;
      }
    }
    expect(cases).toBe(591); expect(formulas).toBeGreaterThan(10_000);
  });
});
describe('候選排序、篩選與極性', () => {
  const items = Object.freeze([Object.freeze(sample()), Object.freeze(sample({ id: 'b', mz: 30, heuristicScore: 20, polarity: 'Negative', ionType: '[M-H]-', sourceRule: 'another', explanation: '脫去水分子' })), Object.freeze(sample({ id: 'c', mz: 20, heuristicScore: undefined }))]);
  it.each([['mz-asc', ['a', 'c', 'b']], ['mz-desc', ['b', 'c', 'a']], ['score-desc', ['a', 'b', 'c']], ['score-asc', ['b', 'a', 'c']]] as const)('%s 排序不修改原資料，未提供分數放末尾', (sort, ids) => {
    expect(filterCandidates(items, { ...defaultFilter, sort }).map((item) => item.id)).toEqual(ids);
    expect(items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
  it('搜尋涵蓋離子式、說明、來源規則；忽略大小寫', () => {
    expect(filterCandidates(items, { ...defaultFilter, query: 'TEST_RULE' })).toHaveLength(2);
    expect(filterCandidates(items, { ...defaultFilter, query: '水分子' }).map((item) => item.id)).toEqual(['b']);
    expect(filterCandidates(items, { ...defaultFilter, query: '查無資料' })).toEqual([]);
  });
  it('分數、極性、離子類型可同時篩選，沒有分數不當成數值', () => {
    expect(filterCandidates(items, { ...defaultFilter, minScore: 50 }).map((item) => item.id)).toEqual(['a']);
    expect(filterCandidates(items, { ...defaultFilter, minScore: 10, polarity: 'Negative', ionTypes: ['[M-H]-'] }).map((item) => item.id)).toEqual(['b']);
    expect(groupPolarity(items).Positive).toHaveLength(2);
    expect(groupPolarity(items).Negative).toHaveLength(1);
  });
  it('離子類型多選、全選、清除與其他條件共同作用', () => {
    const all = ['M+.', '[M-H]-'];
    expect(filterCandidates(items, { ...defaultFilter, ionTypes: all })).toHaveLength(3);
    expect(filterCandidates(items, { ...defaultFilter, ionTypes: [] })).toEqual([]);
    expect(toggleIonType(null, 'M+.', all)).toEqual(['[M-H]-']);
    expect(toggleIonType([], 'M+.', all)).toEqual(['M+.']);
    expect(filterCandidates(items, { ...defaultFilter, ionTypes: all, minScore: 10, polarity: 'Negative', query: '水' }).map((item) => item.id)).toEqual(['b']);
    expect(filterCandidates(items, { ...defaultFilter, ionTypes: null })).toHaveLength(3);
  });
  it('500 筆可排序並分成 25 頁，保留全部候選而不改引擎輸入', () => {
    const large = Array.from({ length: 500 }, (_, index) => sample({ id: String(index), mz: 500 - index }));
    const sorted = filterCandidates(large, { ...defaultFilter, sort: 'mz-asc' });
    expect(sorted.length).toBe(500); expect(sorted.slice(480, 500)).toHaveLength(20);
    expect(sorted[0].mz).toBe(1); expect(large[0].mz).toBe(500);
  });
});
describe('圖表座標與範圍', () => {
  it('空圖及單一質量都具有非零範圍', () => {
    expect(fullMzRange([])).toEqual([0, 1.05]); expect(fullMzRange([sample({ mz: 100 })])).toEqual([0, 105]);
  });
  it('縮放拒絕反向、相同、負值及非有限數值', () => {
    for (const values of [[1, 1], [10, 5], [-1, 10], [NaN, 20], [1, Infinity]]) expect(validRange(values[0], values[1])).toBeNull();
    expect(validRange(20, 80)).toEqual([20, 80]);
  });
  it('座標正確投影，棒高固定 0–100；縮放後不合併棒', () => {
    expect(plotX(20, [20, 80])).toBe(55); expect(plotX(80, [20, 80])).toBe(845);
    expect(plotY(0)).toBe(225); expect(plotY(100)).toBe(45);
    expect(plotY(-1)).toBe(225); expect(plotY(120)).toBe(45);
  });
  it('標籤選高分且保持間隔，最多五個；範圍外不標示', () => {
    const values = [sample({ id: 'a', mz: 30, heuristicScore: 99 }), sample({ id: 'b', mz: 31, heuristicScore: 90 }), sample({ id: 'c', mz: 80, heuristicScore: 50 })];
    expect([...peakLabels(values, [0, 100])]).toEqual(['a', 'c']);
    expect([...peakLabels(values, [70, 100])]).toEqual(['c']);
    expect(peakLabels(Array.from({ length: 100 }, (_, index) => sample({ id: String(index), mz: index })), [0, 100]).size).toBeLessThanOrEqual(5);
  });
});
