const HOST = 'https://pubchem.ncbi.nlm.nih.gov';
const API = `${HOST}/rest/pug/compound`;
export type NameMatch = 'complete' | 'word';
export interface PubChemCompound {
  cid: number;
  title: string;
  name: string;
  formula: string;
  smiles: string;
  smilesField: 'SMILES' | 'ConnectivitySMILES';
}
export interface PubChemResult { compounds: PubChemCompound[]; total: number }
export type PubChemErrorCode = 'EMPTY' | 'BUSY' | 'NOT_FOUND' | 'TIMEOUT' | 'NETWORK' | 'RATE_LIMIT' | 'FORMAT' | 'SERVICE';
const messages: Record<PubChemErrorCode, string> = {
  EMPTY: '請輸入英文名稱或 CAS 號。',
  BUSY: '正在查詢，請等候本次查詢完成。',
  NOT_FOUND: '已嘗試化合物名稱與物質紀錄查詢，仍查無可用的化合物。請改用英文名稱，或直接貼上 SMILES 分析。',
  TIMEOUT: 'PubChem 查詢逾時，請稍後再試。',
  NETWORK: '無法連線 PubChem，請檢查網路連線；離線時仍可貼上 SMILES／Molfile 分析。',
  RATE_LIMIT: 'PubChem 暫時限制請求，請至少等候 30 秒後再試。',
  FORMAT: 'PubChem 回傳的資料格式異常，請稍後再試。',
  SERVICE: 'PubChem 暫時無法提供服務，請稍後再試。',
};
export class PubChemError extends Error {
  constructor(public readonly code: PubChemErrorCode) { super(messages[code]); }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PubChemError('FORMAT');
  return value as Record<string, unknown>;
}
const isCid = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 100_000) throw new PubChemError('FORMAT');
  return value;
}
export function compoundUrl(cid: number): string {
  if (!isCid(cid)) throw new PubChemError('FORMAT');
  return `${HOST}/compound/${cid}`;
}
export function parseCids(value: unknown): number[] {
  const ids = record(record(value).IdentifierList).CID;
  if (!Array.isArray(ids) || !ids.every(isCid)) throw new PubChemError('FORMAT');
  if (!ids.length) throw new PubChemError('NOT_FOUND');
  return [...new Set(ids)];
}
export function parseSubstanceCids(value: unknown): number[] {
  const rows = record(record(value).InformationList).Information;
  if (!Array.isArray(rows)) throw new PubChemError('FORMAT');
  const ids: number[] = [];
  for (const value of rows) {
    const row = record(value);
    if (row.CID === undefined) continue;
    if (!Array.isArray(row.CID) || !row.CID.every(isCid)) throw new PubChemError('FORMAT');
    ids.push(...row.CID);
  }
  if (!ids.length) throw new PubChemError('NOT_FOUND');
  return [...new Set(ids)];
}
export function parseProperties(value: unknown, cids: number[]): PubChemCompound[] {
  const rows = record(record(value).PropertyTable).Properties;
  if (!Array.isArray(rows) || rows.length !== cids.length) throw new PubChemError('FORMAT');
  const compounds = rows.map((value): PubChemCompound => {
    const row = record(value);
    if (!isCid(row.CID) || !cids.includes(row.CID)) throw new PubChemError('FORMAT');
    const smilesField = typeof row.SMILES === 'string' && row.SMILES.trim() ? 'SMILES' : 'ConnectivitySMILES';
    return { cid: row.CID, name: text(row.IUPACName), title: row.Title ? text(row.Title) : text(row.IUPACName),
      formula: text(row.MolecularFormula), smiles: text(row[smilesField]), smilesField };
  });
  if (new Set(compounds.map((item) => item.cid)).size !== cids.length) throw new PubChemError('FORMAT');
  return cids.map((cid) => compounds.find((item) => item.cid === cid)!);
}

// 同一頁面共用一個用戶端；不持久儲存名稱或結構，不自動重試。
export function createPubChemClient(fetcher: typeof fetch = fetch) {
  let busy = false;
  let lastRequest = -Infinity;
  let blockedUntil = 0;
  const cache = new Map<string, PubChemResult>();
  return {
    async search(input: string, match: NameMatch = 'complete'): Promise<PubChemResult> {
      const name = input.trim();
      if (!name) throw new PubChemError('EMPTY');
      if (busy) throw new PubChemError('BUSY');
      const key = `${match}:${name}`;
      const cached = cache.get(key);
      if (cached) return cached;
      if (Date.now() < blockedUntil) throw new PubChemError('RATE_LIMIT');
      busy = true;
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), 20_000);
      async function get(url: string): Promise<unknown> {
        const delay = Math.max(0, lastRequest + 500 - Date.now());
        if (delay) await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(new PubChemError('TIMEOUT')); };
          const timer = setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve(); }, delay);
          controller.signal.addEventListener('abort', abort, { once: true });
        });
        if (controller.signal.aborted) throw new PubChemError('TIMEOUT');
        lastRequest = Date.now();
        const response = await fetcher(url, { signal: controller.signal, credentials: 'omit', mode: 'cors', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
        if (response.status === 404) throw new PubChemError('NOT_FOUND');
        if (response.status === 429 || response.status === 503) {
          const retry = response.headers.get('Retry-After');
          const seconds = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry || '') - Date.now();
          blockedUntil = Date.now() + Math.max(30_000, Number.isFinite(seconds) ? seconds : 0);
          throw new PubChemError('RATE_LIMIT');
        }
        if (!response.ok) throw new PubChemError('SERVICE');
        try { return await response.json() as unknown; }
        catch { if (controller.signal.aborted) throw new PubChemError('TIMEOUT'); throw new PubChemError('FORMAT'); }
      }
      try {
        let ids: number[];
        try { ids = parseCids(await get(`${API}/name/${encodeURIComponent(name)}/cids/JSON?name_type=${match}`)); }
        catch (error) {
          if (!(error instanceof PubChemError) || error.code !== 'NOT_FOUND') throw error;
          ids = parseSubstanceCids(await get(`${HOST}/rest/pug/substance/name/${encodeURIComponent(name)}/cids/JSON`));
        }
        const first = ids.slice(0, 5);
        const compounds = parseProperties(await get(`${API}/cid/${first.join(',')}/property/Title,IUPACName,MolecularFormula,SMILES,ConnectivitySMILES/JSON`), first);
        const result = { compounds, total: ids.length };
        if (cache.size >= 20) cache.delete(cache.keys().next().value!);
        cache.set(key, result);
        return result;
      } catch (error) {
        if (controller.signal.aborted) throw new PubChemError('TIMEOUT');
        if (error instanceof PubChemError) throw error;
        throw new PubChemError('NETWORK');
      } finally {
        clearTimeout(deadline);
        busy = false;
      }
    },
  };
}
