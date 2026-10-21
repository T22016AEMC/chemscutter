import { describe, expect, it } from 'vitest';
import { depict, isDepictionRequest } from '../../src/worker/depiction';
describe('Worker 結構繪圖', () => {
  it('訊息協定拒絕錯誤型別與過長資料', () => {
    expect(isDepictionRequest({ type: 'depict', id: 1, smiles: 'CCO' })).toBe(true);
    for (const value of [null, {}, { type: 'depict', id: 0, smiles: 'CCO' }, { type: 'depict', id: 1, smiles: '' }, { type: 'depict', id: 1, smiles: 'C'.repeat(100_001) }]) expect(isDepictionRequest(value)).toBe(false);
  });
  it('沿用 depiction 回傳 SVG data URL，不更改輸入', async () => {
    const request = Object.freeze({ type: 'depict' as const, id: 1, smiles: 'CCOC(C)=O' });
    const result = await depict(request);
    expect(result.id).toBe(1); expect(result.image).toMatch(/^data:image\/svg\+xml;/);
    expect(decodeURIComponent(result.image)).toContain('<svg');
    expect(request.smiles).toBe('CCOC(C)=O');
  });
  it('無法繪製時傳回可顯示的中文錯誤，不中止後續請求', async () => {
    expect(await depict({ type: 'depict', id: 2, smiles: 'invalid_smiles' })).toMatchObject({ image: '', error: '此候選無法產生結構圖。' });
    expect((await depict({ type: 'depict', id: 3, smiles: 'CCO' })).image).not.toBe('');
  });
});
