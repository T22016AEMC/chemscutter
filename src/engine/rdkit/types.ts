// RDKit 型別定義：模組與分子物件直接使用 @rdkit/rdkit 套件內建的型別，
// 這裡只補上套件未描述的部分（CommonChem JSON 與子結構比對結果的格式）。
import type { MainModule, Mol } from '@rdkit/rdkit';

/** RDKit WASM 模組（initRDKitModule() 的結果） */
export type RDKitModule = MainModule;

/** RDKit 分子物件（JSMol）；用完需呼叫 .delete() 釋放 WASM 記憶體 */
export type JSMol = Mol;

/**
 * CommonChem JSON（mol.get_json()）中的原子。
 * 省略的欄位代表套用 defaults.atom 的預設值（z=6、impHs=0、chg=0…）。
 */
export interface CommonChemAtom {
  z?: number;
  impHs?: number;
  chg?: number;
  nRad?: number;
  isotope?: number;
  stereo?: string;
  /**
   * 舊版程式讀取的欄位名稱。RDKit 實際輸出的自由基欄位是 nRad，
   * 此欄位永遠不會出現；保留只為了與舊版行為一致。
   */
  radical?: number;
  [key: string]: unknown;
}

/** CommonChem JSON 中的鍵；省略 bo 代表單鍵 */
export interface CommonChemBond {
  bo?: number;
  atoms: [number, number];
  stereo?: string;
  [key: string]: unknown;
}

export interface CommonChemMolecule {
  atoms: CommonChemAtom[];
  bonds: CommonChemBond[];
  [key: string]: unknown;
}

/** mol.get_json() 解析後的結構 */
export interface CommonChemJson {
  rdkitjson?: unknown;
  commonchem?: unknown;
  defaults?: unknown;
  molecules: CommonChemMolecule[];
}

/** mol.get_substruct_match() 解析後的結果；沒有比對到時為空物件 */
export interface SubstructMatch {
  atoms?: number[];
  bonds?: number[];
}

/** mol.get_descriptors() 解析後的結果（只列出本專案用到的欄位） */
export interface RDKitDescriptors {
  exactmw?: number;
  amw?: number;
  [key: string]: number | undefined;
}
