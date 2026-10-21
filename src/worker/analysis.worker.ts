import wasmUrl from '@rdkit/rdkit/RDKit_minimal.wasm?url';
import { handleAnalysisRequest } from './handleAnalysis';

// 由 Vite 產生包含部署 base 的資源網址，避免相對於 Worker 腳本尋找 WASM。
self.addEventListener('message', async (event: MessageEvent<unknown>) => {
  const response = await handleAnalysisRequest(event.data, {
    locateFile: (file, prefix) => file.endsWith('.wasm') ? wasmUrl : prefix + file
  });
  self.postMessage(response);
});
