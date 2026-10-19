// 分子式字串與元素計數、精確質量的轉換。
// 來源：legacy commonFragmentation.ts（calculateFormulaFromJson）、
//       ionStructure.ts（formatHillFormula、computeExactMassFromCounts）、
//       massBalance.ts（parseFormulaCounts）
import { EXACT_ISOTOPE_MASSES, UNKNOWN_ELEMENT_FALLBACK_MASS } from '../constants/masses';
import type { CommonChemJson } from '../rdkit/types';
import { ATOMIC_NUMBER_TO_SYMBOL } from './elements';

/**
 * 由 RDKit CommonChem JSON 計算 Hill 分子式（含電荷符號）。
 * 查不到的原子序以 `Element${z}` 表示。
 */
export function calculateFormulaFromJson(molJson: CommonChemJson | null | undefined): string {
  const atomCounts: Record<string, number> = {};
  let totalH = 0;
  let netCharge = 0;

  const atoms = molJson?.molecules?.[0]?.atoms || [];
  for (const a of atoms) {
    const z = a.z !== undefined ? a.z : 6;
    const sym = ATOMIC_NUMBER_TO_SYMBOL[z] || `Element${z}`;
    if (sym === 'H') {
      totalH += 1 + (a.impHs || 0);
    } else {
      atomCounts[sym] = (atomCounts[sym] || 0) + 1;
      totalH += a.impHs !== undefined ? a.impHs : 0;
    }
    if (a.chg) netCharge += a.chg;
  }

  if (totalH > 0) {
    atomCounts['H'] = (atomCounts['H'] || 0) + totalH;
  }

  // Hill System: C first, then H, then alphabetically
  let formula = '';
  if (atomCounts['C']) {
    formula += 'C' + (atomCounts['C'] > 1 ? atomCounts['C'] : '');
    delete atomCounts['C'];
    if (atomCounts['H']) {
      formula += 'H' + (atomCounts['H'] > 1 ? atomCounts['H'] : '');
      delete atomCounts['H'];
    }
  }

  const otherElements = Object.keys(atomCounts).sort();
  for (const sym of otherElements) {
    formula += sym + (atomCounts[sym] > 1 ? atomCounts[sym] : '');
  }

  if (!formula) formula = 'H';
  if (netCharge > 0) {
    formula += netCharge > 1 ? `${netCharge}+` : '+';
  } else if (netCharge < 0) {
    formula += Math.abs(netCharge) > 1 ? `${Math.abs(netCharge)}-` : '-';
  }

  return formula;
}

/**
 * Formats an element count map into a canonical Hill system formula string.
 * Never produces string-hack artifacts like "-H-" or "H+".
 */
export function formatHillFormula(
  countsInput: Record<string, number>,
  charge = 0,
  isRadical = false
): string {
  const counts: Record<string, number> = {};
  for (const [el, cnt] of Object.entries(countsInput)) {
    if (cnt > 0) counts[el] = cnt;
  }

  let formula = '';
  if (counts['C']) {
    formula += 'C' + (counts['C'] > 1 ? counts['C'] : '');
    delete counts['C'];
    if (counts['H']) {
      formula += 'H' + (counts['H'] > 1 ? counts['H'] : '');
      delete counts['H'];
    }
  }

  const remaining = Object.keys(counts).sort();
  for (const sym of remaining) {
    formula += sym + (counts[sym] > 1 ? counts[sym] : '');
  }

  if (!formula) formula = 'H';

  if (charge > 0) {
    const mag = charge > 1 ? `${charge}` : '';
    formula += `${mag}+${isRadical ? '.' : ''}`;
  } else if (charge < 0) {
    const mag = Math.abs(charge) > 1 ? `${Math.abs(charge)}` : '';
    formula += `${mag}-${isRadical ? '.' : ''}`;
  } else if (isRadical) {
    formula += '.';
  }

  return formula;
}

/**
 * Computes exact monoisotopic mass from an element count map.
 */
export function computeExactMassFromCounts(counts: Record<string, number>): number {
  let mass = 0;
  for (const [sym, count] of Object.entries(counts)) {
    if (count <= 0) continue;
    const atomicMass = EXACT_ISOTOPE_MASSES[sym] ?? UNKNOWN_ELEMENT_FALLBACK_MASS;
    mass += atomicMass * count;
  }
  return mass;
}

/**
 * Parses a standard molecular formula (e.g. "C9H8O4", "C7H6O3", "CO2", "C2H2O")
 * into an element count map. Ignores trailing charge symbols (+, -, .).
 */
export function parseFormulaCounts(formulaStr: string): Record<string, number> {
  const clean = (formulaStr || '').replace(/[+\-•.]+$/g, '').trim();
  const counts: Record<string, number> = {};
  const regex = /([A-Z][a-z]?)(\d*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(clean)) !== null) {
    const sym = match[1];
    if (!sym) continue;
    const cnt = match[2] ? parseInt(match[2], 10) : 1;
    counts[sym] = (counts[sym] || 0) + cnt;
  }
  return counts;
}
