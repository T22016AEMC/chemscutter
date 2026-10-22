import writeXlsxFile, { type Cell, type SheetData, type Sheet, type Image } from 'write-excel-file/universal';
import type { ExportImage } from './exportImages';
import type { AnalysisResult, FragmentCandidate } from '../../engine/types';
import { parameterRows, recordOnly } from '../../shared/parameters';

export interface ExportProvenance { cid: number; title: string }
export interface ExportOptions { version: string; at: Date; provenance?: ExportProvenance; candidates?: FragmentCandidate[]; images?: Map<string, ExportImage> }
export const candidateHeaders = ['m/z', '離子式', '離子類型', '說明', '來源規則', '分數（0–100）', '信心標籤', '極性', '電荷', 'SMILES', '結構備註'];
const ranks = { High: '高', Medium: '中', Low: '低' };
// 所有字串明確指定 String 型別；包含 =、+、-、@ 的內容只會寫成文字，不產生公式。
export function textCell(value: string): Cell { return { type: String, value }; }
const cell = (value: string | number | undefined): Cell => typeof value === 'number' ? { type: Number, value, format: '0.0000' } : textCell(value ?? '');
const row = (values: (string | number | undefined)[]) => values.map(cell);

export function workbookData(result: AnalysisResult, options: ExportOptions): Sheet<Blob>[] {
  const candidates = options.candidates ?? result.candidates ?? [];
  const exportedIds = new Set(candidates.map((item) => item.id));
  const parent = result.parent;
  const parameters: SheetData = [row(['參數', '實際使用值']), ...parameterRows(result.simulationConfig || { technique: result.technique }).map(row),
    row(['引擎模式標籤', result.technique === 'TOF-SIMS' ? `${result.simulationModeLabel || '未提供'}（${recordOnly}）` : result.simulationModeLabel]), row(['參數情境', result.parameterContext]), row(['引擎條件說明', result.activeRegimeDescription]),
    row(['網站版本', options.version]), row(['匯出時間', options.at.toISOString()]), row(['匯出範圍', options.candidates ? '已勾選候選' : '全部候選']),
    row(['匯出筆數／本次分析總候選數', `匯出筆數 ${candidates.length}／本次分析總候選數 ${result.candidates?.length || 0}`]),
    row(['聲明', '分數為啟發式可信度，不是訊號強度'])];
  if (result.technique === 'LC-MS/MS') parameters.push(row(['碰撞能量掃描', '固定執行碰撞能量掃描（10／25／40 eV）']));
  for (const sweep of result.sweepResults || []) {
    parameters.push([], row(['掃描項目', sweep.parameterLabel]), row(['掃描能量', sweep.parameterValue]), row(['掃描條件說明', sweep.regimeSummary]),
      row(['候選編號', '離子類型', '離子式', 'm/z', '優先度', '相對可能性']));
    for (const item of sweep.topCandidates.filter((item) => exportedIds.has(item.id))) parameters.push(row([item.id, item.ionType, item.formula, item.mz, item.priority, item.likelihood]));
  }
  const images: Image[] = [];
  const candidateData: SheetData = [row(options.images ? [...candidateHeaders, '結構圖（PNG）'] : candidateHeaders)];
  candidates.forEach((item, index) => {
    const smiles = item.canonicalSmiles || item.smiles;
    const image = options.images?.get(item.id);
    const note = !smiles ? '引擎未提供結構 SMILES，無法還原結構。' : image?.note || '';
    const cells = row([item.mz, item.formula, item.ionType, item.explanation || item.mechanism, item.sourceRule, item.heuristicScore, ranks[item.confidence], item.polarity === 'Positive' ? '正離子' : '負離子', item.charge, smiles || '', note]);
    if (options.images) {
      cells.push({ ...textCell(image?.content ? '' : note || '未產生結構圖。'), height: 96 });
      if (image?.content) images.push({ content: image.content, contentType: 'image/png', width: 180, height: 120, dpi: 96, anchor: { row: index + 2, column: 12 }, offsetX: 4, offsetY: 4, description: `候選 ${item.id} 結構` });
    }
    candidateData.push(cells);
  });
  return [
    { sheet: '候選清單', data: candidateData, ...(options.images && { images, columns: [...candidateHeaders.map(() => ({})), { width: 28 }] }) },
    { sheet: '母分子', data: [row(['項目', '內容']), row(['輸入的 SMILES', parent.input_smiles || parent.smiles]), row(['標準化後的 SMILES', parent.smiles]), row(['分子式', parent.formula]), row(['單同位素質量（Da）', parent.exact_mass]), row(['標準化說明', parent.standardization_note || '無']), row(['被移除成分', parent.removed_components?.join('、') || '無']), ...(options.provenance ? [row(['PubChem CID', options.provenance.cid]), row(['PubChem 名稱', options.provenance.title])] : [])] },
    { sheet: '參數', data: parameters },
  ];
}
export function exportFilename(result: AnalysisResult, at: Date): string {
  const stamp = `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, '0')}${String(at.getDate()).padStart(2, '0')}_${String(at.getHours()).padStart(2, '0')}${String(at.getMinutes()).padStart(2, '0')}${String(at.getSeconds()).padStart(2, '0')}`;
  return `CheMScutter_${result.technique}_${result.parent.formula}_${stamp}.xlsx`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
}
export async function createWorkbook(result: AnalysisResult, options: ExportOptions): Promise<Blob> {
  return writeXlsxFile(workbookData(result, options)).toBlob();
}
