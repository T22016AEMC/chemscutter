import { useState } from 'react';
import type { AnalysisResult, FragmentCandidate } from '../../engine/types';
import type { ExportProvenance } from './exportWorkbook';

export default function ExportButton({ result, filtered, provenance }: { result: AnalysisResult; filtered: FragmentCandidate[]; provenance?: ExportProvenance }) {
  const [onlyFiltered, setOnlyFiltered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download() {
    if (busy) return;
    setBusy(true); setError('');
    let url: string | undefined;
    try {
      const { createWorkbook, exportFilename } = await import('./exportWorkbook');
      const at = new Date();
      const blob = await createWorkbook(result, { at, version: __GIT_COMMIT__, provenance, candidates: onlyFiltered ? filtered : undefined });
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
    <label><input type="checkbox" checked={onlyFiltered} onChange={(e) => setOnlyFiltered(e.target.checked)} disabled={busy} />只匯出目前篩選結果（{filtered.length} 筆）</label>
    <button type="button" onClick={download} disabled={busy}>{busy ? '正在產生 Excel…' : '匯出 Excel'}</button>
    <small>預設匯出全部候選；檔案包含母分子及此次分析實際使用的參數。</small>
    {error && <p role="alert">{error}</p>}
  </div>;
}
