import { createRoot } from 'react-dom/client';
import { Editor } from 'ketcher-react';
import type { Ketcher } from 'ketcher-core';
import { StandaloneStructServiceProvider } from 'ketcher-standalone';
import { FRAME_CHANNEL, fromExpectedWindow, isFrameRequest, type FrameResponse } from '../../../src/shared/ketcherProtocol';
import { unsupportedDrawing, unsupportedCheck } from '../../../src/shared/structureChecks';
import { InputValidationError, inputMessages, type InputCategory } from '../../../src/shared/inputErrors';
import 'ketcher-react/dist/index.css';
import './style.css';

const provider = new StandaloneStructServiceProvider();
let editor: Ketcher | null = null;
let loading = false;
let importFailed = false;
let activeId: number | null = null;
let queue = Promise.resolve();
const send = (message: FrameResponse) => window.parent.postMessage(message, window.location.origin);
const fail = (message: string, id = activeId, category: InputCategory = 'OTHER', details = '來源：Ketcher；RDKit 尚未執行。') =>
  send({ channel: FRAME_CHANNEL, type: 'error', id, message, category, details });

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!fromExpectedWindow(event, window.location.origin, window.parent) || !isFrameRequest(event.data)) return;
  const request = event.data;
  queue = queue.then(async () => {
    activeId = request.id;
    try {
      if (!editor) throw new Error('繪圖器尚未就緒，請稍候再試。');
      if (request.type === 'load') {
        loading = true;
        importFailed = false;
        try {
          await editor.setMolecule(request.input);
          if (importFailed) throw new Error('Ketcher emitted FAILURE while importing the input');
          if (request.input.trim() && !(await editor.getSmiles()).trim()) throw new Error('Ketcher returned an empty structure after import');
        }
        catch (error) { throw new InputValidationError('UNPARSABLE', `來源：Ketcher 匯入；RDKit 尚未執行。\n${String(error)}`); }
        send({ channel: FRAME_CHANNEL, type: 'loaded', id: request.id });
      } else {
        if (editor.containsReaction()) throw new InputValidationError('UNSUPPORTED_CONTENT', '來源：Ketcher；畫布含反應式，RDKit 尚未執行。');
        const ket = await editor.getKet();
        const drawingError = unsupportedDrawing(ket);
        if (drawingError) throw new InputValidationError('UNSUPPORTED_CONTENT', `來源：Ketcher；${drawingError}\nRDKit 尚未執行。`);
        const check = await editor.indigo.check(ket, { types: ['valence', 'stereo', 'query', 'rgroups', 'pseudoatoms'] });
        if (unsupportedCheck(check)) throw new InputValidationError('UNSUPPORTED_CONTENT', `來源：Indigo；RDKit 尚未執行。\n${JSON.stringify(check)}`);
        const molfile = await editor.getMolfile('v3000');
        const smiles = await editor.getSmiles();
        send({ channel: FRAME_CHANNEL, type: 'structure', id: request.id, structure: { molfile, smiles, ket } });
      }
    } catch (error) {
      if (error instanceof InputValidationError) fail(error.message, request.id, error.category, error.details);
      else fail(inputMessages.OTHER, request.id, 'OTHER', `來源：Ketcher；RDKit 尚未執行。\n${String(error)}`);
    } finally { loading = false; activeId = null; }
  });
});

async function initialize(ketcher: Ketcher) {
  editor = ketcher;
  try {
    ketcher.setSettings({ 'ignore-stereochemistry-errors': false });
    await ketcher.indigo.info();
    // Ketcher 的 runAsyncAction 會吞掉匯入例外，必須接收 FAILURE，不能以 Promise 完成判定成功。
    ketcher.eventBus.on('FAILURE', () => { if (loading) importFailed = true; });
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
