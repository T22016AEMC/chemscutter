// 標準答案的正規化：產生腳本（scripts/golden/）與測試共用。
// - 所有 image 欄位（不論在哪一層）改存 SHA-256 雜湊，欄位名稱改為 imageHash
// - 物件 key 依字母排序；陣列順序與其他值完全保留
// - 值為 undefined 的欄位在 JSON 化時會消失，與標準答案檔一致
// 使用 Web Crypto（Node 與瀏覽器皆內建），不依賴 node:crypto。

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function normalize(value: unknown): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map(normalize));
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const entries: [string, unknown][] = await Promise.all(
      Object.keys(src).map(async (k): Promise<[string, unknown]> =>
        k === 'image' && typeof src[k] === 'string'
          ? ['imageHash', await sha256Hex(src[k] as string)]
          : [k, await normalize(src[k])],
      ),
    );
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = v;
    return out;
  }
  return value;
}

/** 正規化後輸出成標準答案檔的文字格式（縮排 2 格、結尾換行） */
export async function toGoldenJson(value: unknown): Promise<string> {
  return JSON.stringify(await normalize(value), null, 2) + '\n';
}

/**
 * 正規化後再經 JSON 往返，得到與讀取標準答案檔完全相同的結構
 * （undefined 欄位消失、NaN 變成 null），供 toStrictEqual 比對。
 */
export async function normalizeForCompare(value: unknown): Promise<unknown> {
  return JSON.parse(await toGoldenJson(value));
}
