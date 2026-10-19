// RDKit WASM 載入器（單例）。
// 來源：legacy/src/server/fragmentation/commonFragmentation.ts getRDKit()
import initRDKitModule from '@rdkit/rdkit';
import type { RDKitModule } from './types';

export interface RDKitLoaderOptions {
  /**
   * 指定 WASM 檔案位置（Emscripten locateFile）。
   * 在瀏覽器 Web Worker 中需要用它指向部署後的 RDKit_minimal.wasm；Node 環境不需要。
   * 注意：只有第一次呼叫 getRDKit() 時的設定會生效。
   */
  locateFile?: (file: string, prefix: string) => string;
}

let rdkitInstance: RDKitModule | null = null;
let rdkitInitPromise: Promise<RDKitModule> | null = null;

export async function getRDKit(options?: RDKitLoaderOptions): Promise<RDKitModule> {
  if (rdkitInstance) return rdkitInstance;
  if (!rdkitInitPromise) {
    const init = options?.locateFile
      ? initRDKitModule({ locateFile: options.locateFile })
      : initRDKitModule();
    rdkitInitPromise = init.then((instance) => {
      rdkitInstance = instance;
      return instance;
    });
  }
  return rdkitInitPromise;
}
