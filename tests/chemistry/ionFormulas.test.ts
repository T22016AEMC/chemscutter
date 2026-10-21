/// <reference types="vite/client" />
// 離子式格式的化學正確性測試（永久保留）：掃描全部標準答案的 candidates、signals、structures，
// 離子式不得有重複或矛盾的電荷符號，且 charge 必須與離子式的電荷符號一致。
import { describe, expect, it } from 'vitest';

interface Item {
  id?: string;
  formula: string;
  charge?: number;
}
interface Golden {
  candidates?: Item[];
  signals?: Item[];
  structures?: Item[];
}
type Section = 'candidates' | 'signals' | 'structures';

const goldenFiles = import.meta.glob<{ default: Golden }>('../golden/*.json', { eager: true });
const cases = Object.entries(goldenFiles)
  .filter(([path]) => !path.endsWith('_index.json'))
  .map(([path, mod]) => ({ id: path.replace(/^.*\/(.*)\.json$/, '$1'), data: mod.default }));

/** 去掉同位素標註，例如 "C6H4BrCl+ (³⁷Cl)" → "C6H4BrCl+" */
const bareFormula = (formula: string) => formula.replace(/\s*\(.*\)\s*$/, '');

const BAD_PATTERNS = ['++', '--', '+-', '-+', '+.+', '-+.'];

/** 離子式結尾的電荷符號：+1、-1，沒有電荷符號為 0 */
function formulaSign(formula: string): number {
  const f = bareFormula(formula);
  if (/\+\.?$/.test(f)) return 1;
  if (/-\.?$/.test(f)) return -1;
  return 0;
}

/**
 * charge 與離子式是否一致：正負號必須相同；|charge| > 1 時，離子式結尾須帶有電荷倍數（如 "2+"）。
 * 註：離子式的電荷倍數直接接在元素計數後面（如 C7H6NO2+ 的 2 是 O 的數目），因此 |charge| = 1 時只比對正負號。
 */
function chargeConsistent(formula: string, charge: number): boolean {
  if (Math.sign(charge) !== formulaSign(formula)) return false;
  if (Math.abs(charge) > 1) return new RegExp(`${Math.abs(charge)}[+-]\\.?$`).test(bareFormula(formula));
  return true;
}

/** 回傳一個案例中所有違規項目的說明 */
function violations(data: Golden): string[] {
  const out: string[] = [];
  const sections: [Section, Item[]][] = [
    ['candidates', data.candidates ?? []],
    ['signals', data.signals ?? []],
    ['structures', data.structures ?? []]
  ];
  for (const [section, items] of sections) {
    for (const item of items) {
      const f = bareFormula(item.formula);
      const bad = BAD_PATTERNS.filter((p) => f.includes(p));
      if (bad.length > 0) out.push(`${section} ${item.id}: ${item.formula} 含 ${bad.join('、')}`);
      if (item.charge !== undefined && !chargeConsistent(item.formula, item.charge)) {
        out.push(`${section} ${item.id}: ${item.formula} 的 charge 為 ${item.charge}`);
      }
    }
  }
  return out;
}

describe('離子式電荷符號', () => {
  it('標準答案檔數量', () => {
    expect(cases.length).toBe(591);
  });

  it('判斷函式本身：重複符號與電荷倍數', () => {
    expect(chargeConsistent('C7H6NO2+', 1)).toBe(true);
    expect(chargeConsistent('C6H6+.', 1)).toBe(true);
    expect(chargeConsistent('HO-', -1)).toBe(true);
    expect(chargeConsistent('CH4', 0)).toBe(true);
    expect(chargeConsistent('CH4', 1)).toBe(false);
    expect(chargeConsistent('C6H5-', 1)).toBe(false);
    expect(chargeConsistent('C2H4N2+', 2)).toBe(true);
    expect(violations({ candidates: [{ id: 'a', formula: 'C6H6NO++.', charge: 1 }] })).toHaveLength(1);
    expect(violations({ structures: [{ id: 'GCMS_Frag_1', formula: 'CH4', charge: 1 }] })).toHaveLength(1);
    expect(violations({ structures: [{ id: 'GCMS_Frag_1', formula: 'CH4+.', charge: 1 }] })).toStrictEqual([]);
  });

  it.each(cases.map((c) => [c.id, c.data]))('%s', (_id, data) => {
    expect(violations(data)).toStrictEqual([]);
  });
});
