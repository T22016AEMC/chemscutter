import wasmUrl from '@rdkit/rdkit/RDKit_minimal.wasm?url';
import { createStructureSession } from './structureSession';

const handle = createStructureSession();
let queue = Promise.resolve();

// 由 Vite 產生包含部署 base 的資源網址，避免相對於 Worker 腳本尋找 WASM。
self.addEventListener('message', (event: MessageEvent<unknown>) => {
  queue = queue.then(async () => {
    const response = await handle(event.data, {
      locateFile: (file, prefix) => file.endsWith('.wasm') ? wasmUrl : prefix + file
    });
    if (response) self.postMessage(response);
  });
});
