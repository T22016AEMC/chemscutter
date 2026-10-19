// 以舊版引擎（legacy/）產生標準答案（golden master），供之後重構時逐一比對。
// 執行方式：npm run golden:generate
// 注意：tests/golden/ 的檔案不得手動修改，也不得重新產生，除非指令明確要求。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMultiPlatformAnalysis } from '../../legacy/src/server/chemistryEngine';
import { buildCases } from '../../tests/fixtures/cases';
import { toGoldenJson } from '../../tests/fixtures/normalize';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../tests/golden');

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const cases = buildCases();
  const index: unknown[] = [];

  for (const c of cases) {
    const t0 = performance.now();
    let result: unknown;
    let error: string | undefined;
    try {
      result = await runMultiPlatformAnalysis(c.input, c.config);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      result = { error };
    }
    const durationMs = Math.round((performance.now() - t0) * 10) / 10;
    writeFileSync(join(OUT_DIR, `${c.id}.json`), await toGoldenJson(result));

    const candidates = (result as { candidates?: unknown[] }).candidates;
    index.push({
      id: c.id,
      input: c.input,
      config: c.config,
      durationMs,
      candidateCount: Array.isArray(candidates) ? candidates.length : 0,
      error: error !== undefined,
    });
    console.log(`${c.id}\t${durationMs} ms${error ? `\tERROR: ${error}` : ''}`);
  }

  writeFileSync(join(OUT_DIR, '_index.json'), await toGoldenJson(index));
  console.log(`完成：${cases.length} 個案例`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
