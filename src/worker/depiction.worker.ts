import wasmUrl from '@rdkit/rdkit/RDKit_minimal.wasm?url';
import { depict, isDepictionRequest, type DepictionResponse } from './depiction';
let queue = Promise.resolve();
self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (!isDepictionRequest(request)) return;
  queue = queue.then(async () => {
    try { self.postMessage(await depict(request, { locateFile: (file, prefix) => file.endsWith('.wasm') ? wasmUrl : prefix + file })); }
    catch { self.postMessage({ type: 'depiction', id: request.id, image: '', error: '結構繪圖引擎載入失敗，請重新整理後再試。' } satisfies DepictionResponse); }
  });
});
