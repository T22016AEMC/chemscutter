import { describe, expect, it } from 'vitest';
import readXlsxFile from 'read-excel-file/universal';
import { createWorkbook, exportFilename, workbookData, candidateHeaders } from '../../src/ui/results/exportWorkbook';
import { runMultiPlatformAnalysis } from '../../src/engine';
import { defaultConfig, recordOnly } from '../../src/shared/parameters';

const at = new Date('2026-10-22T03:04:05.000Z');
describe('Excel 匯出及實際讀回', () => {
  it('三工作表、原始離子式、完整數值、參數快照與 CE 掃描', async () => {
    const result = await runMultiPlatformAnalysis('CCOC(C)=O', defaultConfig('LC-MS/MS'));
    const first = result.candidates![0];
    const blob = await createWorkbook(result, { at, version: 'abcdef0', provenance: { cid: 8857, title: 'ethyl acetate' } });
    const sheets = await readXlsxFile(await blob.arrayBuffer());
    expect(sheets.map((sheet) => sheet.sheet)).toEqual(['候選清單', '母分子', '參數']);
    expect(sheets[0].data[0]).toEqual(candidateHeaders);
    expect(sheets[0].data).toHaveLength(14);
    expect(sheets[0].data[1][0]).toBe(first.mz);
    expect(sheets[0].data[1][1]).toBe(first.formula);
    expect(sheets[0].data[1][5]).toBe(first.heuristicScore);
    expect(typeof sheets[0].data[1][0]).toBe('number');
    expect(typeof sheets[0].data[1][5]).toBe('number');
    expect(sheets[1].data).toContainEqual(['PubChem CID', 8857]);
    expect(sheets[2].data.map((row) => row.slice(0, 2))).toContainEqual(['網站版本', 'abcdef0']);
    expect(sheets[2].data.map((row) => row.slice(0, 2))).toContainEqual(['匯出時間', at.toISOString()]);
    expect(sheets[2].data.map((row) => row.slice(0, 2))).toContainEqual(['碰撞能量（eV）', 25]);
    expect(sheets[2].data.filter((row) => row[0] === '掃描能量').map((row) => row[1])).toEqual([10, 25, 40]);
    expect(sheets[2].data.map((row) => row.slice(0, 2))).toContainEqual(['聲明', '分數為啟發式可信度，不是訊號強度']);
    expect(workbookData(result, { at, version: 'test' })[0].data[1][0]).toMatchObject({ type: Number, value: first.mz, format: '0.0000' });
  });
  it('=、+、-、@ 開頭的所有來源字串都以文字儲存，不轉成公式', async () => {
    const result = await runMultiPlatformAnalysis('CCOC(C)=O', defaultConfig('TOF-SIMS'));
    const malicious = ['=1+1', '+SUM(A1:A2)', '-1+2', '@SUM(1,2)'];
    result.candidates = result.candidates!.slice(0, 4).map((item, index) => ({ ...item, explanation: malicious[index], formula: malicious[index] }));
    const blob = await createWorkbook(result, { at, version: 'test', provenance: { cid: 1, title: '=HYPERLINK("https://example.invalid")' } });
    const sheets = await readXlsxFile(await blob.arrayBuffer());
    expect(sheets[0].data.slice(1).map((row) => row[3])).toEqual(malicious);
    expect(sheets[0].data.slice(1).map((row) => row[1])).toEqual(malicious);
    expect(sheets[1].data).toContainEqual(['PubChem 名稱', '=HYPERLINK("https://example.invalid")']);
    expect(String(sheets[2].data.find((row) => row[0] === '分析器')?.[1])).toContain(recordOnly);
  });
  it('篩選匯出不改原結果；多成分與檔名保留必要資訊', async () => {
    const result = await runMultiPlatformAnalysis('[Na+].[O-]C(=O)c1ccccc1', defaultConfig('GC-MS'));
    const candidates = result.candidates!.slice(0, 2);
    const blob = await createWorkbook(result, { at, version: 'test', candidates });
    const sheets = await readXlsxFile(await blob.arrayBuffer());
    expect(sheets[0].data).toHaveLength(3);
    expect(result.candidates!.length).toBeGreaterThan(2);
    expect(sheets[1].data).toContainEqual(['被移除成分', '[Na+]']);
    expect(sheets[1].data.find((row) => row[0] === '標準化說明')?.[1]).toBe(result.parent.standardization_note);
    expect(sheets[2].data.map((row) => row.slice(0, 2))).toContainEqual(['匯出範圍', '目前篩選結果']);
    const filename = exportFilename({ ...result, parent: { ...result.parent, formula: 'bad:/\\?*"<>|\n' } }, at);
    expect(filename).toMatch(/^CheMScutter_GC-MS_.*_20261022_\d{6}\.xlsx$/);
    expect(filename).not.toMatch(/[<>:"/\\|?*\x00-\x1f]/);
  });
});
