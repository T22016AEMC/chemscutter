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
    expect(sheets[2].data.map((row) => row.slice(0, 2))).toContainEqual(['匯出範圍', '已勾選候選']);
    expect(sheets[2].data.map((row) => row.slice(0, 2))).toContainEqual(['匯出筆數／本次分析總候選數', `匯出筆數 2／本次分析總候選數 ${result.candidates!.length}`]);
    expect(sheets[0].data.slice(1).map((row) => row[0])).toEqual(candidates.map((item) => item.mz));
    const filename = exportFilename({ ...result, parent: { ...result.parent, formula: 'bad:/\\?*"<>|\n' } }, at);
    expect(filename).toMatch(/^CheMScutter_GC-MS_.*_20261022_\d{6}\.xlsx$/);
    expect(filename).not.toMatch(/[<>:"/\\|?*\x00-\x1f]/);
  });
  it('SMILES 純文字、缺值原因與可選 PNG 圖片可實際寫入讀回', async () => {
    const result = await runMultiPlatformAnalysis('CCOC(C)=O', defaultConfig('LC-MS/MS'));
    const candidates = result.candidates!.slice(0, 2).map((item, index) => index ? { ...item, smiles: '', canonicalSmiles: '' } : item);
    const png = new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG2kAAAAASUVORK5CYII='), c => c.charCodeAt(0))], { type: 'image/png' });
    const options = { at, version: 'test', candidates, images: new Map([[candidates[0].id, { content: png, note: '' }]]) };
    const data = workbookData(result, options);
    expect(data[0].images).toHaveLength(1);
    expect(data[0].images![0]).toMatchObject({ anchor: { row: 2, column: 12 }, width: 180, height: 120, contentType: 'image/png' });
    const blob = await createWorkbook(result, options);
    const sheets = await readXlsxFile(await blob.arrayBuffer());
    expect(sheets[0].data[0]).toEqual([...candidateHeaders, '結構圖（PNG）']);
    expect(sheets[0].data[1][9]).toBe(candidates[0].canonicalSmiles || candidates[0].smiles);
    expect(sheets[0].data[2][9]).toBeNull();
    expect(sheets[0].data[2][10]).toBe('引擎未提供結構 SMILES，無法還原結構。');
    expect(sheets[0].data[2][11]).toContain('引擎未提供');
    const exportedIds = new Set(candidates.map((item) => item.id));
    const allIds = new Set(result.candidates!.map((item) => item.id));
    for (const row of sheets[2].data) {
      if (typeof row[0] === 'string' && allIds.has(row[0])) expect(exportedIds.has(row[0])).toBe(true);
    }
  });
});
