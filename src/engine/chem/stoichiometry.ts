// 由 RDKit 分子圖計算元素計數、電荷、中性／離子精確質量與 m/z。
// 來源：legacy ionStructure.ts analyzeRDKitMolStoichiometry
import { ELECTRON_MASS } from '../constants/masses';
import type { CommonChemJson, JSMol } from '../rdkit/types';
import { ATOMIC_NUMBER_TO_SYMBOL } from './elements';
import { computeExactMassFromCounts, formatHillFormula } from './formula';

export interface MolGraphStoichiometry {
  atomCounts: Record<string, number>;
  netCharge: number;
  numRadicals: number;
  neutralFormula: string;
  ionicFormula: string;
  neutralExactMass: number;
  ionExactMass: number;
  mz: number;
}

/**
 * Extracts exact atom counts, formal charge, neutral mass, ion mass, and m/z directly from an RDKit molecule.
 * 查不到的原子序以 'C' 計算（舊版行為）。
 */
export function analyzeRDKitMolStoichiometry(
  mol: JSMol,
  overrideRadical?: boolean
): MolGraphStoichiometry {
  const molJson = JSON.parse(mol.get_json()) as CommonChemJson;
  const atoms = molJson?.molecules?.[0]?.atoms || [];
  const atomCounts: Record<string, number> = {};
  let totalH = 0;
  let netCharge = 0;
  let numRadicals = 0;

  for (const a of atoms) {
    const z = a.z !== undefined ? a.z : 6;
    const sym = ATOMIC_NUMBER_TO_SYMBOL[z] || 'C';
    if (sym === 'H') {
      totalH += 1 + (a.impHs || 0);
    } else {
      // Check for explicit isotopes like 35Cl, 37Cl, 79Br, 81Br
      if (a.isotope === 37 && sym === 'Cl') {
        atomCounts['Cl37'] = (atomCounts['Cl37'] || 0) + 1;
      } else if (a.isotope === 81 && sym === 'Br') {
        atomCounts['Br81'] = (atomCounts['Br81'] || 0) + 1;
      } else {
        atomCounts[sym] = (atomCounts[sym] || 0) + 1;
      }
      totalH += a.impHs !== undefined ? a.impHs : 0;
    }
    if (a.chg) netCharge += a.chg;
    // 舊版讀取 a.radical，但 RDKit JSON 的自由基欄位是 nRad，因此 numRadicals 恆為 0（照舊保留）
    if (a.radical) numRadicals += a.radical;
  }

  if (totalH > 0) {
    atomCounts['H'] = (atomCounts['H'] || 0) + totalH;
  }

  // Normalize display counts (map Cl37/Br81 back to Cl/Br for standard Hill formula unless pure halide)
  const displayCounts: Record<string, number> = { ...atomCounts };
  if (displayCounts['Cl37']) {
    displayCounts['Cl'] = (displayCounts['Cl'] || 0) + displayCounts['Cl37'];
    delete displayCounts['Cl37'];
  }
  if (displayCounts['Br81']) {
    displayCounts['Br'] = (displayCounts['Br'] || 0) + displayCounts['Br81'];
    delete displayCounts['Br81'];
  }

  const isRadical = overrideRadical !== undefined ? overrideRadical : numRadicals > 0;
  const rawMassFromAtoms = computeExactMassFromCounts(atomCounts);

  // Neutral exact mass is the mass of the uncharged atom collection (or if already an ion, adjusted for electron mass)
  const neutralExactMass = Number(rawMassFromAtoms.toFixed(4));
  // Ion exact mass accounts for lost/gained electrons due to netCharge:
  // Positive charge (+1) means 1 electron lost (-ELECTRON_MASS); Negative charge (-1) means 1 electron gained (+ELECTRON_MASS)
  const effectiveCharge = netCharge !== 0 ? netCharge : isRadical ? 1 : 0;
  const ionExactMass = Number((rawMassFromAtoms - effectiveCharge * ELECTRON_MASS).toFixed(4));
  const absCharge = Math.max(1, Math.abs(effectiveCharge));
  const mz = Number((ionExactMass / absCharge).toFixed(4));

  const neutralFormula = formatHillFormula(displayCounts, 0, false);
  const ionicFormula = formatHillFormula(displayCounts, effectiveCharge, isRadical);

  return {
    atomCounts: displayCounts,
    netCharge: effectiveCharge,
    numRadicals,
    neutralFormula,
    ionicFormula,
    neutralExactMass,
    ionExactMass,
    mz
  };
}
