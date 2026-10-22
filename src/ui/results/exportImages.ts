import type { FragmentCandidate } from '../../engine/types';
import type { DepictionRequest, DepictionResponse } from '../../worker/depiction';

export interface ExportImage { content?: Blob; note: string }
export async function pngFromSvg(uri: string): Promise<Blob> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('結構圖片無法讀取')); image.src = uri; });
  const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 240;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('瀏覽器無法產生 PNG');
  context.fillStyle = '#fff'; context.fillRect(0, 0, 360, 240); context.drawImage(image, 0, 0, 360, 240);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG 轉換失敗')), 'image/png'));
}

/** 僅在使用者選擇含圖匯出時建立 Worker；相同結構共用 PNG，不改引擎資料。 */
export async function exportImages(items: readonly FragmentCandidate[], progress: (done: number) => void): Promise<Map<string, ExportImage>> {
  const worker = new Worker(new URL('../../worker/depiction.worker.ts', import.meta.url), { type: 'module' });
  const cache = new Map<string, ExportImage>();
  const images = new Map<string, ExportImage>();
  let sequence = 0;
  try {
    for (const item of items) {
      const smiles = item.canonicalSmiles || item.smiles;
      if (!smiles) { images.set(item.id, { note: '引擎未提供結構 SMILES，無法繪圖。' }); progress(images.size); continue; }
      let value = cache.get(smiles);
      if (!value) {
        const id = ++sequence;
        const response = await new Promise<DepictionResponse>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('結構繪圖逾時，請取消包含結構圖後再試。')), 30000);
          const fail = () => { clearTimeout(timer); reject(new Error('結構繪圖中斷，請取消包含結構圖後再試。')); };
          worker.onerror = fail; worker.onmessageerror = fail;
          worker.onmessage = (event: MessageEvent<DepictionResponse>) => {
            if (event.data?.type !== 'depiction' || event.data.id !== id) return;
            clearTimeout(timer); resolve(event.data);
          };
          worker.postMessage({ type: 'depict', id, smiles } satisfies DepictionRequest);
        });
        value = response.image ? { content: await pngFromSvg(response.image), note: '' } : { note: response.error || '此候選無法產生結構圖。' };
        cache.set(smiles, value);
      }
      images.set(item.id, value); progress(images.size);
    }
    return images;
  } finally { worker.terminate(); }
}
