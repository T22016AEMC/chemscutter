import ExcelJS from 'exceljs';
import { StructureItem, SignalItem } from '../types';

const renderImageToDataUrl = (src: string, size = 160): Promise<{ dataUrl: string; width: number; height: number } | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const natW = img.naturalWidth || size;
      const natH = img.naturalHeight || size;
      const scale = Math.min(size / natW, size / natH);
      const drawW = Math.round(natW * scale);
      const drawH = Math.round(natH * scale);

      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const offsetX = Math.round((size - drawW) / 2);
        const offsetY = Math.round((size - drawH) / 2);
        ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
        resolve({ dataUrl: canvas.toDataURL('image/png'), width: size, height: size });
      } else {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
};

const downloadBuffer = (buffer: ExcelJS.Buffer, filename: string) => {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export interface ExportStructuresOptions {
  structures: StructureItem[];
  parentCompoundName?: string;
  parentFormula?: string;
  technique?: string;
  filename?: string;
  onProgress?: (progress: { current: number; total: number; stage: string }) => void;
}

export const exportStructuresToExcel = async (
  optionsOrStructures: ExportStructuresOptions | StructureItem[],
  filenameArg?: string
) => {
  const isArray = Array.isArray(optionsOrStructures);
  const structures = isArray ? optionsOrStructures : optionsOrStructures.structures;
  const technique = isArray ? 'MS' : optionsOrStructures.technique || 'MS';
  const parentFormula = isArray ? '' : optionsOrStructures.parentFormula || '';
  const onProgress = isArray ? undefined : optionsOrStructures.onProgress;

  const safeFormula = parentFormula ? `_${parentFormula.replace(/[^a-zA-Z0-9]/g, '')}` : '';
  const safeTech = technique.replace(/[^a-zA-Z0-9]/g, '_');
  const filename =
    filenameArg ||
    (!isArray && optionsOrStructures.filename) ||
    `CheMScutter_${safeTech}${safeFormula}_Structures.xlsx`;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Fragment Structures');

  sheet.columns = [
    { header: 'Structure', key: 'image', width: 22 },
    { header: 'ID', key: 'id', width: 12 },
    { header: 'Name / Ion Label', key: 'name', width: 28 },
    { header: 'Ion Formula', key: 'formula', width: 18 },
    { header: 'Neutral Formula', key: 'neutralFormula', width: 16 },
    { header: 'Ion Type', key: 'ionType', width: 16 },
    { header: 'Polarity', key: 'mode', width: 12 },
    { header: 'm/z', key: 'mz', width: 14 },
    { header: 'Ion Exact Mass (Da)', key: 'ionExactMass', width: 18 },
    { header: 'Neutral Exact Mass (Da)', key: 'neutralExactMass', width: 20 },
    { header: 'Charge (z)', key: 'charge', width: 11 },
    { header: 'Neutral Loss', key: 'neutralLoss', width: 15 },
    { header: 'Pathway Status', key: 'pathwayStatus', width: 22 },
    { header: 'Mass Balance Verified', key: 'massBalanceVerified', width: 20 },
    { header: 'Priority', key: 'priority', width: 12 },
    { header: 'Heuristic Score (0-100)', key: 'heuristicScore', width: 22 },
    { header: 'Confidence', key: 'confidence', width: 14 },
    { header: 'Mechanism', key: 'mechanism', width: 26 },
    { header: 'Fragmentation Pathway & Rule', key: 'pathway', width: 45 },
    { header: 'Canonical Ion SMILES', key: 'smiles', width: 32 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  const IMAGE_SIZE_PX = 140;
  const ROW_HEIGHT_PT = 115;

  for (let i = 0; i < structures.length; i++) {
    const item = structures[i];
    onProgress?.({
      current: i + 1,
      total: structures.length,
      stage: `正在處理結構圖像 (${i + 1}/${structures.length}): ${item.formula}...`
    });

    const rowIndex = i + 2;
    const score = item.heuristicScore ?? item.relative_intensity;
    const row = sheet.addRow({
      id: item.id,
      name: item.name,
      formula: item.formula,
      neutralFormula: item.neutralFormula || '-',
      ionType: item.ionType || '-',
      mode: item.mode || 'Positive',
      mz: item.mz !== undefined ? Number(item.mz.toFixed(4)) : Number(item.exact_mass.toFixed(4)),
      ionExactMass: item.ionExactMass !== undefined ? Number(item.ionExactMass.toFixed(4)) : Number(item.exact_mass.toFixed(4)),
      neutralExactMass: item.neutralExactMass !== undefined ? Number(item.neutralExactMass.toFixed(4)) : Number(item.exact_mass.toFixed(4)),
      charge: item.charge !== undefined ? item.charge : '-',
      neutralLoss: item.neutralLoss || '-',
      pathwayStatus: item.pathwayStatus || 'Verified Graph Product',
      massBalanceVerified: item.massBalanceVerified ? 'Yes' : 'No',
      priority: item.priority || '-',
      heuristicScore: score !== undefined ? Number(score.toFixed(0)) : '-',
      confidence: item.confidence || '-',
      mechanism: item.mechanism || '-',
      pathway: item.fragmentationPathway || item.sourceRule || '',
      smiles: item.canonicalSmiles || item.smiles || '-',
    });

    row.height = ROW_HEIGHT_PT;
    row.alignment = { vertical: 'middle', wrapText: true };

    if (item.image) {
      const rendered = await renderImageToDataUrl(item.image, IMAGE_SIZE_PX);
      if (rendered) {
        const base64Data = rendered.dataUrl.replace(/^data:image\/png;base64,/, '');
        const imageId = workbook.addImage({
          base64: base64Data,
          extension: 'png',
        });

        sheet.addImage(imageId, {
          tl: { col: 0.1, row: rowIndex - 1 + 0.05 } as any,
          ext: { width: rendered.width, height: rendered.height },
          editAs: 'oneCell'
        });
      }
    }
  }

  onProgress?.({
    current: structures.length,
    total: structures.length,
    stage: '正在產生 Excel 檔案...'
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer, filename);
};

export const exportSignalsToExcel = async (
  signals: SignalItem[],
  structures: StructureItem[] = [],
  filename = 'CheMScutter_Predicted_Signals.xlsx'
) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Signals');

  sheet.columns = [
    { header: 'Representative Structure', key: 'image', width: 22 },
    { header: 'm/z', key: 'mz', width: 15 },
    { header: 'Ion Exact Mass (Da)', key: 'ionExactMass', width: 18 },
    { header: 'Neutral Exact Mass (Da)', key: 'neutralExactMass', width: 20 },
    { header: 'Charge (z)', key: 'charge', width: 11 },
    { header: 'Ion Formula', key: 'formula', width: 18 },
    { header: 'Ion Type / Adduct', key: 'adduct', width: 18 },
    { header: 'Polarity', key: 'mode', width: 12 },
    { header: 'Neutral Loss', key: 'neutralLoss', width: 15 },
    { header: 'Pathway Status', key: 'pathwayStatus', width: 22 },
    { header: 'Mass Balance Verified', key: 'massBalanceVerified', width: 20 },
    { header: 'Priority', key: 'priority', width: 12 },
    { header: 'Heuristic Score (0-100)', key: 'heuristicScore', width: 22 },
    { header: 'Confidence', key: 'confidence', width: 14 },
    { header: 'Mechanism', key: 'mechanism', width: 26 },
    { header: 'Fragmentation Pathway & Rule', key: 'pathway', width: 45 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  const IMAGE_SIZE_PX = 140;
  const ROW_HEIGHT_PT = 115;

  for (let i = 0; i < signals.length; i++) {
    const item = signals[i];
    const rowIndex = i + 2;

    const matchingStruct = structures.find(s =>
      (item.parentStructureId && s.id === item.parentStructureId) ||
      (s.formula === item.formula && s.mode === item.mode) ||
      Math.abs(s.exact_mass - item.mz) < 0.005
    );

    const score = item.heuristicScore ?? item.relative_intensity;

    const row = sheet.addRow({
      mz: Number(item.mz.toFixed(4)),
      ionExactMass: item.ionExactMass !== undefined ? Number(item.ionExactMass.toFixed(4)) : Number(item.mz.toFixed(4)),
      neutralExactMass: item.neutralExactMass !== undefined ? Number(item.neutralExactMass.toFixed(4)) : '-',
      charge: item.charge !== undefined ? item.charge : '-',
      formula: item.formula,
      adduct: item.adduct || item.type || '-',
      mode: item.mode || 'Positive',
      neutralLoss: item.neutralLoss || '-',
      pathwayStatus: item.pathwayStatus || 'Verified Graph Product',
      massBalanceVerified: item.massBalanceVerified ? 'Yes' : 'No',
      priority: item.priority || '-',
      heuristicScore: score !== undefined ? Number(score.toFixed(0)) : '-',
      confidence: item.confidence || '-',
      mechanism: item.mechanism || '-',
      pathway: item.fragmentationPathway || item.sourceRule || '',
    });

    row.alignment = { vertical: 'middle', wrapText: true };

    if (matchingStruct && matchingStruct.image) {
      row.height = ROW_HEIGHT_PT;
      const rendered = await renderImageToDataUrl(matchingStruct.image, IMAGE_SIZE_PX);
      if (rendered) {
        const base64Data = rendered.dataUrl.replace(/^data:image\/png;base64,/, '');
        const imageId = workbook.addImage({
          base64: base64Data,
          extension: 'png',
        });

        sheet.addImage(imageId, {
          tl: { col: 0.1, row: rowIndex - 1 + 0.05 } as any,
          ext: { width: rendered.width, height: rendered.height },
          editAs: 'oneCell'
        });
      }
    } else {
      row.height = 30;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer, filename);
};
