import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PubChemSearch from '../../src/ui/PubChemSearch';
import { compoundUrl, createPubChemClient, parseCids, parseProperties } from '../../src/ui/pubchem';

const row = (cid = 2244) => ({ CID: cid, Title: 'Aspirin', IUPACName: '2-acetyloxybenzoic acid', MolecularFormula: 'C9H8O4', SMILES: 'C[C@@H](O)N', ConnectivitySMILES: 'CC(O)N' });
const ids = (values = [2244]) => ({ IdentifierList: { CID: values } });
const properties = (values = [row()]) => ({ PropertyTable: { Properties: values } });
const json = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), { status, headers });

describe('PubChem 資料邊界', () => {
  it('採用實際 SMILES 欄位保留立體資訊，沒有才退回 ConnectivitySMILES', () => {
    expect(parseProperties(properties(), [2244])[0]).toMatchObject({ smiles: 'C[C@@H](O)N', smilesField: 'SMILES' });
    expect(parseProperties(properties([{ ...row(), SMILES: '' }]), [2244])[0]).toMatchObject({ smiles: 'CC(O)N', smilesField: 'ConnectivitySMILES' });
  });
  it('驗證 CID、去除重複並依查詢順序傳回所有結果', () => {
    expect(parseCids(ids([2, 1, 2]))).toEqual([2, 1]);
    expect(parseProperties(properties([row(1), row(2)]), [2, 1]).map((item) => item.cid)).toEqual([2, 1]);
  });
  it.each([null, {}, ids([-1]), ids([1.5]), ids(['1' as unknown as number])])('拒絕異常識別碼回應 %j', (value) => {
    expect(() => parseCids(value)).toThrow(expect.objectContaining({ code: 'FORMAT' }));
  });
  it('空 CID 清單為查無結果', () => { expect(() => parseCids(ids([]))).toThrow(expect.objectContaining({ code: 'NOT_FOUND' })); });
  it.each([{}, properties([]), properties([row(2)]), properties([{ ...row(), IUPACName: '' }]), properties([{ ...row(), SMILES: '', ConnectivitySMILES: '' }])])('拒絕缺漏或不相符屬性 %j', (value) => {
    expect(() => parseProperties(value, [2244])).toThrow(expect.objectContaining({ code: 'FORMAT' }));
  });
  it('拒絕重複屬性，連結只由合法 CID 組成固定 PubChem 網域', () => {
    expect(() => parseProperties(properties([row(1), row(1)]), [1, 2])).toThrow();
    expect(compoundUrl(2244)).toBe('https://pubchem.ncbi.nlm.nih.gov/compound/2244');
    expect(() => compoundUrl(NaN)).toThrow();
  });
  it('回傳文字只當資料，不解譯為 HTML 或採用伺服器的連結', () => {
    const data = parseProperties(properties([{ ...row(), Title: '<img src=x onerror=alert(1)>', url: 'https://evil.invalid' } as ReturnType<typeof row>]), [2244]);
    expect(data[0].title).toContain('<img');
    expect(compoundUrl(data[0].cid)).not.toContain('evil');
    const select = vi.fn();
    const markup = renderToStaticMarkup(createElement(PubChemSearch, { onSelect: select, disabled: false }));
    expect(markup).toContain('請輸入英文名稱或 CAS 號');
    expect(markup).toContain('不會送出任何資料');
    expect(markup).not.toContain('iframe');
    expect(select).not.toHaveBeenCalled();
  });
});

describe('PubChem 網路、限流與防連按（全數模擬 fetch）', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
  afterEach(() => { vi.useRealTimers(); });

  it('只送名稱與已取得的 CID，編碼 URL；兩端點間隔至少 500ms，命中記憶體快取不送請求', async () => {
    const times: number[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      times.push(Date.now());
      return json(times.length === 1 ? ids() : properties());
    });
    const client = createPubChemClient(fetcher);
    const pending = client.search('aspirin / test');
    await vi.advanceTimersByTimeAsync(500);
    const result = await pending;
    expect(times).toEqual([0, 500]);
    expect(fetcher.mock.calls[0][0]).toBe('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/aspirin%20%2F%20test/cids/JSON?name_type=complete');
    expect(fetcher.mock.calls[1][0]).toContain('/cid/2244/property/Title,IUPACName,MolecularFormula,SMILES,ConnectivitySMILES/JSON');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', mode: 'cors', signal: expect.any(AbortSignal) });
    expect(await client.search('aspirin / test')).toEqual(result);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('多筆結果最多取得五筆，不自動選擇；保留完整命中數', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(ids([1, 2, 3, 4, 5, 6])))
      .mockResolvedValueOnce(json(properties([1, 2, 3, 4, 5].map(row))));
    const pending = createPubChemClient(fetcher).search('myxalamid', 'word');
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toMatchObject({ total: 6, compounds: [1, 2, 3, 4, 5].map((cid) => expect.objectContaining({ cid })) });
    expect(fetcher.mock.calls[0][0]).toContain('name_type=word');
    expect(fetcher.mock.calls[1][0]).toContain('/cid/1,2,3,4,5/');
  });
  it('空白不連線，查詢進行中拒絕第二次送出，完成後可再次查詢', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(ids())).mockResolvedValueOnce(json(properties()));
    const client = createPubChemClient(fetcher);
    await expect(client.search(' ')).rejects.toMatchObject({ code: 'EMPTY' });
    expect(fetcher).not.toHaveBeenCalled();
    const pending = client.search('aspirin');
    await expect(client.search('ethyl acetate')).rejects.toMatchObject({ code: 'BUSY' });
    await vi.advanceTimersByTimeAsync(500);
    await pending;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(await client.search('aspirin')).toMatchObject({ total: 1 });
  });
  it.each([[429, 'RATE_LIMIT'], [503, 'RATE_LIMIT'], [500, 'SERVICE']])('HTTP %s 提供明確錯誤且不自動重試', async (status, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({}, status as number));
    await expect(createPubChemClient(fetcher).search('aspirin')).rejects.toMatchObject({ code });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('化合物查無時自動查物質，忽略無 CID 的紀錄並去重，不自動選取', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(json({ InformationList: { Information: [{ SID: 1, CID: [12577030] }, { SID: 2, CID: [12577030, 44607779] }, { SID: 3 }] } }))
      .mockResolvedValueOnce(json(properties([row(12577030), row(44607779)])));
    const pending = createPubChemClient(fetcher).search('33791-58-1');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ total: 2, compounds: [expect.objectContaining({ cid: 12577030 }), expect.objectContaining({ cid: 44607779 })] });
    expect(fetcher.mock.calls[1][0]).toBe('https://pubchem.ncbi.nlm.nih.gov/rest/pug/substance/name/33791-58-1/cids/JSON');
    expect(fetcher.mock.calls[2][0]).toContain('/cid/12577030,44607779/');
  });
  it('兩種方式都查無時說明已嘗試的範圍', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({}, 404));
    const check = expect(createPubChemClient(fetcher).search('unknown')).rejects.toMatchObject({ code: 'NOT_FOUND', message: expect.stringContaining('物質紀錄') });
    await vi.advanceTimersByTimeAsync(500); await check;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('後備查詢仍遵守限流，不繼續取得屬性', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(json({}, 429));
    const check = expect(createPubChemClient(fetcher).search('33791-58-1')).rejects.toMatchObject({ code: 'RATE_LIMIT' });
    await vi.advanceTimersByTimeAsync(500); await check;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('後備物質查詢沿用同一個二十秒逾時', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({}, 404)).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const check = expect(createPubChemClient(fetcher).search('33791-58-1')).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(20_000); await check;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('限流冷卻遵守 Retry-After，冷卻期間不連線', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({}, 429, { 'Retry-After': '75' }));
    const client = createPubChemClient(fetcher);
    await expect(client.search('aspirin')).rejects.toMatchObject({ code: 'RATE_LIMIT' });
    await vi.advanceTimersByTimeAsync(74_999);
    await expect(client.search('another')).rejects.toMatchObject({ code: 'RATE_LIMIT' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(client.search('another')).rejects.toMatchObject({ code: 'RATE_LIMIT' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('20 秒逾時會中斷請求，且可重試', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const client = createPubChemClient(fetcher);
    const check = expect(client.search('aspirin')).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(20_000);
    await check;
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    fetcher.mockResolvedValue(json({}, 404));
    const retry = expect(client.search('aspirin')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await vi.advanceTimersByTimeAsync(500); await retry;
  });
  it('離線或網路失敗提供中文提示', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(createPubChemClient(fetcher).search('aspirin')).rejects.toMatchObject({ code: 'NETWORK', message: expect.stringContaining('網路連線') });
  });
  it('非 JSON 與異常資料分開攔截，不顯示原始 HTML', async () => {
    for (const response of [new Response('<h1>Service error</h1>'), json({ unrelated: true })]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(createPubChemClient(fetcher).search('aspirin')).rejects.toMatchObject({ code: 'FORMAT', message: expect.not.stringContaining('<h1>') });
    }
  });
  it('屬性端點失敗不會留下部分或快取結果', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(ids())).mockResolvedValueOnce(json({}, 500));
    const client = createPubChemClient(fetcher);
    const check = expect(client.search('aspirin')).rejects.toMatchObject({ code: 'SERVICE' });
    await vi.advanceTimersByTimeAsync(500);
    await check;
    fetcher.mockResolvedValue(json({}, 404));
    const retry = expect(client.search('aspirin')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await vi.advanceTimersByTimeAsync(1000);
    await retry;
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
