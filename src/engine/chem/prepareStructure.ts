import { parseInputToMol } from './inputParsing';
import { standardizeMolecule } from './standardize';
import type { JSMol, RDKitModule } from '../rdkit/types';

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
  if (!input.trim()) throw new Error('畫面是空的，請先繪圖或輸入 SMILES／Molfile。');
  if (/\$RXN|>>/.test(input)) throw new Error('目前不支援反應式，請只保留要分析的結構。');
  let mol: JSMol | null = null;
  let retained: JSMol | null = null;
  try {
    const parsed = parseInputToMol(input, rdkit);
    mol = parsed.mol;
    if (!mol || !mol.is_valid()) throw new Error('無法辨識結構，請檢查 SMILES／Molfile 的格式、價鍵與立體化學。');
    if (mol.get_num_atoms() === 0) throw new Error('畫面是空的，請先繪圖或匯入結構。');
    const json = mol.get_json();
    const atoms = (JSON.parse(json) as { molecules: { atoms: { z?: number }[] }[] }).molecules[0].atoms;
    if (atoms.some((atom) => atom.z === 0) || json.includes('rdkitQueries')) {
      throw new Error('目前不支援 R 基團、查詢原子或未指定的原子，請改用明確結構。');
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
  } finally {
    if (retained && retained !== mol) retained.delete();
    mol?.delete();
  }
}
