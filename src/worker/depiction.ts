import { getRDKit, type RDKitLoaderOptions } from '../engine/rdkit/loader';
import { molToSvgDataUri } from '../engine/chem/depiction';
import type { JSMol } from '../engine/rdkit/types';
export interface DepictionRequest { type: 'depict'; id: number; smiles: string }
export interface DepictionResponse { type: 'depiction'; id: number; image: string; error?: string }
export function isDepictionRequest(value: unknown): value is DepictionRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  return request.type === 'depict' && Number.isSafeInteger(request.id) && (request.id as number) > 0
    && typeof request.smiles === 'string' && request.smiles.length > 0 && request.smiles.length <= 100_000;
}
export async function depict(request: DepictionRequest, options?: RDKitLoaderOptions): Promise<DepictionResponse> {
  let mol: JSMol | null = null;
  const rdkit = await getRDKit(options);
  const errors = rdkit.set_log_capture('rdApp.error');
  const warnings = rdkit.set_log_capture('rdApp.warning');
  try {
    mol = rdkit.get_mol(request.smiles);
    const image = molToSvgDataUri(mol, 360, 240);
    return { type: 'depiction', id: request.id, image, ...(!image && { error: '此候選無法產生結構圖。' }) };
  } catch { return { type: 'depiction', id: request.id, image: '', error: '此候選無法產生結構圖。' }; }
  finally { mol?.delete(); errors?.delete(); warnings?.delete(); }
}
