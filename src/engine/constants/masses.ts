// 精確質量常數（Da）。全專案唯一的質量常數定義處，其他檔案一律由此引用。
// 數值完全照搬舊版；舊版中同一物理量若有不同寫法，各自保留為獨立常數，不做統一，
// 以確保輸出與舊版逐位相同。

// 元素精確單同位素原子質量表 (IUPAC Monoisotopic Exact Masses)
// 來源：legacy commonFragmentation.ts EXACT_ISOTOPE_MASSES
export const EXACT_ISOTOPE_MASSES: Record<string, number> = {
  H: 1.00782503,
  C: 12.00000000,
  N: 14.00307400,
  O: 15.99491462,
  F: 18.99840316,
  Na: 22.98976928,
  Mg: 23.98504170,
  Al: 26.98153853,
  Si: 27.97692653,
  P: 30.97376199,
  S: 31.97207117,
  Cl: 34.96885268, // 35Cl
  Cl37: 36.96590259,
  K: 38.96370648,
  Ca: 39.96259086,
  Br: 78.91833760, // 79Br
  Br81: 80.91628970,
  I: 126.90447190,
  Cs: 132.90545190
};

/**
 * 計算元素質量時，查不到的元素一律以此值代替（舊版 computeExactMassFromCounts 的 `?? 12.0`）。
 * 注意：這等於把未知元素當成碳，屬舊版行為。
 */
export const UNKNOWN_ELEMENT_FALLBACK_MASS = 12.0;

// 電子、氫、質子
// 來源：legacy ionStructure.ts；commonFragmentation.ts 直接離子 m/z 計算中寫死的 0.00054858 數值相同，一併引用此常數
export const ELECTRON_MASS = 0.00054858;
export const HYDROGEN_ATOM_MASS = 1.00782503;
/**
 * 舊版 reactionTransforms.ts 計算帶電產物參考質量時寫死的氫原子質量（1.007825），
 * 與 HYDROGEN_ATOM_MASS（1.00782503）不同；保留原值以維持輸出一致。
 */
export const HYDROGEN_ATOM_MASS_LEGACY_ROUNDED = 1.007825;
export const PROTON_MASS = 1.00727647;       // H - e-

// 加合物離子
// 來源：legacy ionStructure.ts
export const SODIUM_ATOM_MASS = 22.98976928;
export const SODIUM_ION_MASS = 22.98922070;  // Na - e-
export const POTASSIUM_ATOM_MASS = 38.96370648;
export const POTASSIUM_ION_MASS = 38.96315790; // K - e-
export const AMMONIUM_ION_MASS = 18.03382555;  // NH4+ (N + 4H - e-)
export const CESIUM_ATOM_MASS = 132.9054519;
export const CESIUM_ION_MASS = 132.9049033;
export const FORMATE_ANION_MASS = 44.99820285; // HCOO- (C + H + 2O + e-)
export const ACETATE_ANION_MASS = 59.01385291; // CH3COO- (2C + 3H + 2O + e-)

// 同位素 M+2 質量位移
// 來源：legacy isotopeRules.ts 中寫死的數值
export const CL37_ISOTOPE_SHIFT = 1.99705;  // 37Cl - 35Cl
export const BR81_ISOTOPE_SHIFT = 1.99795;  // 81Br - 79Br
export const S34_ISOTOPE_SHIFT = 1.9958;    // 34S - 32S

// ---------------------------------------------------------------------------
// 以下為三個平台引擎（legacy tofSims／lcMsMs／gcMsFragmentation.ts）中寫死的數值
// ---------------------------------------------------------------------------

/**
 * 平台引擎計算 precursorMz（[M+H]+／[M-H]- 前驅物）時寫死的質子質量 1.007276，
 * 與 PROTON_MASS（1.00727647）不同；保留原值以維持輸出一致。
 */
export const PROTON_MASS_LEGACY_ROUNDED = 1.007276;

// GC-MS CI 反應氣加合物的加成質量（直接加在中性母分子質量上即得離子 m/z）
export const METHANE_CI_C2H5_ADDUCT_MASS = 29.03858;   // C2H5+
export const ISOBUTANE_CI_C4H9_ADDUCT_MASS = 57.06988; // C4H9+

// GC-MS 二階開環脫乙炔
export const ACETYLENE_LOSS_MASS = 26.0157;            // C2H2
// [C7H7]+，原作為 [C5H5]+ 的前驅物 m/z。目前未使用：[C5H5]+ 規則因 SMILES 無效已移除（見 Q13），保留供重新實作
export const TROPYLIUM_ION_MZ = 91.0542;
export const PHENYL_CATION_MZ = 77.0386;               // [C6H5]+，作為 [C4H3]+ 的前驅物 m/z

// TOF-SIMS 負離子診斷峰（舊版直接寫死、已四捨五入至小數 4 位）
// 注意：F⁻ 以質量表推算應為 18.9990（18.99840316 + 0.00054858），舊版寫 18.9989
export const FLUORIDE_ANION_MZ = 18.9989;
export const FLUORINE_NEUTRAL_MASS_ROUNDED = 18.9984;
export const CL35_ANION_MZ = 34.9694;
export const CL35_NEUTRAL_MASS_ROUNDED = 34.9689;
export const CL37_ANION_MZ = 36.9665;
export const CL37_NEUTRAL_MASS_ROUNDED = 36.9659;
export const BR79_ANION_MZ = 78.9189;
export const BR79_NEUTRAL_MASS_ROUNDED = 78.9183;
export const BR81_ANION_MZ = 80.9168;
export const BR81_NEUTRAL_MASS_ROUNDED = 80.9163;
export const NITRITE_ANION_MZ = 45.9935;               // NO2-
export const NO2_NEUTRAL_MASS_ROUNDED = 45.9929;
export const CYANIDE_ANION_MZ = 26.0036;               // CN-
export const CN_NEUTRAL_MASS_ROUNDED = 26.0031;
