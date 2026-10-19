// 擴充對照測試：額外分子 × 全部 config，舊版與新版 runMultiPlatformAnalysis 的輸出經正規化後必須完全相同。
// 暫時例外：tests/parity/ 可以 import legacy/，階段 1 結束時會刪除。
import { describe, expect, it } from 'vitest';
import { runMultiPlatformAnalysis as runLegacy } from '../../legacy/src/server/chemistryEngine';
import { runMultiPlatformAnalysis as runNew } from '../../src/engine';
import { buildExtraCases, EXTRA_MOLECULES } from '../fixtures/cases';
import { normalizeForCompare } from '../fixtures/normalize';

type Outcome = { ok: true; value: unknown } | { ok: false; error: string };

async function capture(run: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { ok: true, value: await run() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const cases = buildExtraCases();

describe('擴充對照：三平台引擎與路由', () => {
  it('案例數量', () => {
    expect(cases).toHaveLength(Object.keys(EXTRA_MOLECULES).length * 14);
  });

  it.each(cases.map((c) => [c.id, c]))('%s', async (_id, c) => {
    const legacy = await capture(() => runLegacy(c.input, c.config));
    const fresh = await capture(() => runNew(c.input, c.config));

    expect(fresh.ok).toBe(legacy.ok);
    if (legacy.ok && fresh.ok) {
      expect(await normalizeForCompare(fresh.value)).toStrictEqual(await normalizeForCompare(legacy.value));
    } else if (!legacy.ok && !fresh.ok) {
      expect(fresh.error).toBe(legacy.error);
    }
  });
});
