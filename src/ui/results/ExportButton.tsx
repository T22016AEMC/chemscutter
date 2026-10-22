import { useState } from 'react';
import type { AnalysisResult, FragmentCandidate } from '../../engine/types';
import type { ExportProvenance } from './exportWorkbook';

export default function ExportButton({ result, selected, provenance }: { result: AnalysisResult; selected: FragmentCandidate[]; provenance?: ExportProvenance }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [includeImages, setIncludeImages] = useState(false);
  const [progress, setProgress] = useState(0);
  async function download() {
    if (busy || !selected.length) return;
    setBusy(true); setError(''); setProgress(0);
    let url: string | undefined;
    try {
      const { createWorkbook, exportFilename } = await import('./exportWorkbook');
      const images = includeImages ? await (await import('./exportImages')).exportImages(selected, setProgress) : undefined;
      const at = new Date();
      const blob = await createWorkbook(result, { at, version: __GIT_COMMIT__, provenance, candidates: selected, images });
      url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = exportFilename(result, at);
      document.body.append(anchor); anchor.click(); anchor.remove();
      // 讓瀏覽器完成接收下載，再釋放暫存網址。
      const downloadUrl = url;
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);
      url = undefined;
    } catch { setError('Excel 匯出失敗，請再試一次；分析結果仍保留在畫面上。'); }
    finally { if (url) URL.revokeObjectURL(url); setBusy(false); }
  }
  return <div className="excel-export">
    <label><input type="checkbox" checked={includeImages} disabled={busy} onChange={(event) => setIncludeImages(event.target.checked)} />包含結構圖（PNG；檔案較大、匯出較久）</label>
    <button type="button" onClick={download} disabled={busy || !selected.length}>{busy ? '正在產生 Excel…' : '匯出 Excel'}</button>
    {busy && includeImages && <p role="status">正在準備結構圖：{progress}／{selected.length} 筆，請稍候…</p>}
    <small>{selected.length ? `只匯出按下按鈕時已勾選的 ${selected.length} 筆候選，包含被篩選隱藏的勾選項目。` : '尚未勾選任何碎片，請先勾選後再匯出。'}檔案包含母分子及此次分析實際使用的參數。</small>
    {error && <p role="alert">{error}</p>}
  </div>;
}
