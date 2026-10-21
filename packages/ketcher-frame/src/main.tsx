import { createRoot } from 'react-dom/client';
import { Editor } from 'ketcher-react';
import type { Ketcher } from 'ketcher-core';
import { StandaloneStructServiceProvider } from 'ketcher-standalone';
import { FRAME_CHANNEL, fromExpectedWindow, isFrameRequest, type FrameResponse } from '../../../src/shared/ketcherProtocol';
import { unsupportedDrawing } from '../../../src/shared/structureChecks';
import 'ketcher-react/dist/index.css';
import './style.css';

const provider = new StandaloneStructServiceProvider();
let editor: Ketcher | null = null;
let loading = false;
let activeId: number | null = null;
let queue = Promise.resolve();
const send = (message: FrameResponse) => window.parent.postMessage(message, window.location.origin);
const fail = (message: string, id = activeId) => send({ channel: FRAME_CHANNEL, type: 'error', id, message });

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!fromExpectedWindow(event, window.location.origin, window.parent) || !isFrameRequest(event.data)) return;
  const request = event.data;
  queue = queue.then(async () => {
    activeId = request.id;
    try {
      if (!editor) throw new Error('繪圖器尚未就緒，請稍候再試。');
      if (request.type === 'load') {
        loading = true;
        try {
          await editor.setMolecule(request.input);
          if (request.input.trim() && !(await editor.getSmiles()).trim()) throw new Error('empty');
        }
        catch { throw new Error('無法載入結構。請檢查 SMILES 或 Molfile 的格式、價鍵與立體化學。'); }
        send({ channel: FRAME_CHANNEL, type: 'loaded', id: request.id });
      } else {
        if (editor.containsReaction()) throw new Error('目前不支援反應箭頭或反應式，請只保留要分析的結構。');
        const ket = await editor.getKet();
        const drawingError = unsupportedDrawing(ket);
        if (drawingError) throw new Error(drawingError);
        const check = await editor.indigo.check(ket, { types: ['valence', 'stereo', 'query', 'rgroups', 'pseudoatoms'] });
        if (check.valence || check.stereo) throw new Error('結構含有價鍵或立體化學錯誤，請在 Ketcher 中修正後再試。');
        if (check.query || check.rgroups || check.pseudoatoms) throw new Error('目前不支援 R 基團、查詢原子或未指定的原子，請改用明確結構。');
        const molfile = await editor.getMolfile('v3000');
        const smiles = await editor.getSmiles();
        send({ channel: FRAME_CHANNEL, type: 'structure', id: request.id, structure: { molfile, smiles, ket } });
      }
    } catch (error) {
      fail(error instanceof Error && /[\u3400-\u9fff]/.test(error.message)
        ? error.message : '無法取得有效結構，請檢查畫面是否空白、含不支援內容或價鍵錯誤。', request.id);
    } finally { loading = false; activeId = null; }
  });
});

async function initialize(ketcher: Ketcher) {
  editor = ketcher;
  try {
    ketcher.setSettings({ 'ignore-stereochemistry-errors': false });
    await ketcher.indigo.info();
    ketcher.editor.subscribe('change', () => {
      if (!loading) send({ channel: FRAME_CHANNEL, type: 'changed' });
    });
    send({ channel: FRAME_CHANNEL, type: 'ready' });
  } catch { fail('繪圖器的本機 WASM 載入失敗，請重新整理後再試。'); }
}

createRoot(document.getElementById('root')!).render(
  <Editor staticResourcesUrl={import.meta.env.BASE_URL} structServiceProvider={provider}
    disableMacromoleculesEditor onInit={(ketcher) => { void initialize(ketcher); }}
    errorHandler={() => fail('繪圖器無法處理這個操作，請檢查輸入內容後再試。')}
    buttons={{ miew: { hidden: true }, analyse: { hidden: true }, recognize: { hidden: true } }} />
);
