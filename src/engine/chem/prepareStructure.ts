import { parseInputToMol } from './inputParsing';
import { standardizeMolecule } from './standardize';
import type { JSMol, RDKitModule } from '../rdkit/types';
import { InputValidationError } from '../../shared/inputErrors';
import { unsupportedMolfile } from '../../shared/structureChecks';

export interface PreparedStructure {
  inputSmiles: string;
  retainedSmiles: string;
  retainedMolfile: string;
  retainedImage: string;
  standardization_note?: string;
  removed_components: string[];
  multipleComponents: boolean;
}

/** 只轉換輸入與呼叫既有標準化，不新增成分選擇或化學規則。 */
export function prepareStructure(input: string, rdkit: RDKitModule): PreparedStructure {
  if (!input.trim()) throw new InputValidationError('EMPTY_INPUT', '來源：輸入檢查；RDKit 尚未執行。');
  if (/\$RXN|>>/.test(input)) throw new InputValidationError('UNSUPPORTED_CONTENT', '來源：輸入格式；偵測到反應式，RDKit 尚未執行。');
  if (unsupportedMolfile(input)) throw new InputValidationError('UNSUPPORTED_CONTENT', '來源：Molfile 格式；偵測到聚合物／重複單元，RDKit 尚未執行。');
  let mol: JSMol | null = null;
  let retained: JSMol | null = null;
  const errors = rdkit.set_log_capture('rdApp.error');
  const warnings = rdkit.set_log_capture('rdApp.warning');
  const rawMessages = () => [errors?.get_buffer(), warnings?.get_buffer()].filter(Boolean).join('\n');
  const details = () => `來源：RDKit ${rdkit.version()}\n輸入：\n${input}\n解析選項：未傳入，沿用既有預設。\nRDKit 原始訊息：\n${rawMessages() || '（未提供）'}`;
  try {
    const parsed = parseInputToMol(input, rdkit);
    mol = parsed.mol;
    if (!mol || !mol.is_valid()) throw new InputValidationError(
      /valence|kekul|saniti|non-ring atom|aromatic/i.test(rawMessages()) ? 'SANITIZATION_FAILED' : 'UNPARSABLE', details());
    if (mol.get_num_atoms() === 0) throw new InputValidationError('EMPTY_INPUT', details());
    const json = mol.get_json();
    const atoms = (JSON.parse(json) as { molecules: { atoms: { z?: number }[] }[] }).molecules[0].atoms;
    if (atoms.some((atom) => atom.z === 0) || json.includes('rdkitQueries')) {
      throw new InputValidationError('UNSUPPORTED_CONTENT', details());
    }
    const inputSmiles = mol.get_smiles();
    const standardized = standardizeMolecule(mol, rdkit);
    retained = standardized.mol;
    return {
      inputSmiles, retainedSmiles: retained.get_smiles(), retainedMolfile: retained.get_molblock(),
      retainedImage: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(retained.get_svg(360, 220))}`,
      standardization_note: standardized.note, removed_components: standardized.removedComponents,
      // 此處僅計算 RDKit 輸出的不相連成分，不以字串產生碎片。
      multipleComponents: inputSmiles.includes('.')
    };
  } catch (error) {
    if (error instanceof InputValidationError) throw error;
    throw new InputValidationError('OTHER', `${details()}\n例外：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (retained && retained !== mol) retained.delete();
    mol?.delete();
    errors?.delete();
    warnings?.delete();
  }
}
