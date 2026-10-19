/// <reference types="vite/client" />
// 標準答案測試：新版引擎對每個案例的輸出，經正規化後必須與 tests/golden/ 完全相同。
// 此測試永久保留，不可 import legacy/。
import { describe, expect, it } from 'vitest';
import { runMultiPlatformAnalysis } from '../src/engine';
import { buildCases } from './fixtures/cases';
import { normalizeForCompare } from './fixtures/normalize';

const goldenFiles = import.meta.glob<{ default: unknown }>('./golden/*.json', { eager: true });

function loadGolden(id: string): unknown {
  const mod = goldenFiles[`./golden/${id}.json`];
  if (!mod) throw new Error(`找不到標準答案檔：${id}.json`);
  return mod.default;
}

const cases = buildCases();

describe('標準答案（golden master）', () => {
  it('案例清單與標準答案檔一一對應', () => {
    const goldenIds = Object.keys(goldenFiles)
      .map((p) => p.replace(/^\.\/golden\/(.*)\.json$/, '$1'))
      .filter((id) => id !== '_index')
      .sort();
    expect(goldenIds).toStrictEqual(cases.map((c) => c.id).sort());
  });

  it.each(cases.map((c) => [c.id, c]))('%s', async (_id, c) => {
    let result: unknown;
    try {
      result = await runMultiPlatformAnalysis(c.input, c.config);
    } catch (e) {
      result = { error: e instanceof Error ? e.message : String(e) };
    }
    expect(await normalizeForCompare(result)).toStrictEqual(loadGolden(c.id));
  });
});
