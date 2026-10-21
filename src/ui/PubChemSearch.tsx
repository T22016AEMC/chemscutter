import { useRef, useState } from 'react';
import { compoundUrl, createPubChemClient, type NameMatch, type PubChemCompound, type PubChemResult } from './pubchem';

export default function PubChemSearch({ onSelect, disabled }: { onSelect: (compound: PubChemCompound) => void; disabled: boolean }) {
  const [name, setName] = useState('');
  const [match, setMatch] = useState<NameMatch>('complete');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PubChemResult | null>(null);
  const client = useRef<ReturnType<typeof createPubChemClient> | null>(null);
  const sending = useRef(false);

  async function search() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      client.current ??= createPubChemClient();
      setResult(await client.current.search(name, match));
    } catch (error) { setError(error instanceof Error ? error.message : '查詢失敗，請稍後再試。'); }
    finally { sending.current = false; setBusy(false); }
  }

  return <section className="pubchem-search" aria-labelledby="pubchem-title">
    <h3 id="pubchem-title">以名稱查詢</h3>
    <p>請輸入英文名稱或 CAS 號。名稱查詢會把輸入的名稱送到 PubChem；繪圖與貼 SMILES／Molfile 不會送出任何資料。查詢只在本次頁面暫存，不寫入瀏覽器儲存空間。</p>
    <p>資料來源：<a href="https://pubchem.ncbi.nlm.nih.gov/" target="_blank" rel="noopener noreferrer">PubChem</a>。查詢結果可能不是您想要的結構，請先在 Ketcher 確認後再分析。</p>
    <form onSubmit={(event) => { event.preventDefault(); void search(); }}>
      <label htmlFor="compound-name">英文名稱或 CAS 號</label>
      <input id="compound-name" value={name} disabled={busy || disabled} autoComplete="off" spellCheck={false}
        onChange={(event) => { setName(event.target.value); setResult(null); setError(''); }} />
      <label htmlFor="name-match">名稱比對方式</label>
      <select id="name-match" value={match} disabled={busy || disabled} onChange={(event) => { setMatch(event.target.value as NameMatch); setResult(null); setError(''); }}>
        <option value="complete">完整名稱或 CAS 號</option><option value="word">名稱關鍵字（可回傳多筆）</option>
      </select>
      <button type="submit" disabled={busy || disabled}>{busy ? '查詢中…' : '查詢 PubChem'}</button>
    </form>
    <p role="status" aria-live="polite">{busy ? '正在查詢 PubChem，請稍候…' : result ? `找到 ${result.total} 筆，顯示前 ${result.compounds.length} 筆。請自行選擇，不會自動載入或分析。` : ''}</p>
    {error && <p role="alert" className="error">{error}</p>}
    {result && <ul className="pubchem-results">{result.compounds.map((item) => <li key={item.cid}>
      <p><strong>{item.title}</strong>；CID：{item.cid}；分子式：{item.formula}</p>
      <p>正式名稱（IUPAC）：{item.name}</p>
      <p><a href={compoundUrl(item.cid)} target="_blank" rel="noopener noreferrer">PubChem CID {item.cid}</a></p>
      <button type="button" disabled={disabled} onClick={() => onSelect(item)}>選擇 CID {item.cid}，載入 Ketcher</button>
    </li>)}</ul>}
  </section>;
}
