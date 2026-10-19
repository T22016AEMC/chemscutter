import { FunctionalGroupInfo } from './functionalGroupRules';
import { PROTON_MASS } from './ionStructure';
import { parseFormulaCounts } from './massBalance';
import { formatHillFormula } from './ionStructure';

export interface IsotopeCandidate {
  type: string;
  mode: 'Positive' | 'Negative';
  adduct: string;
  formula: string;
  mz: number;
  intensityRatio: string;
  relative_intensity: number;
  mechanism: string;
  confidence: 'High' | 'Medium' | 'Low';
  priority: 'High' | 'Medium' | 'Low';
}

/**
 * Generates isotopic signature signals based on actual element stoichiometry
 * with exact mass shifts for [M+H+2]+ or [M-H+2]-.
 */
export function generateIsotopeCandidates(
  formula: string,
  exactMass: number,
  mode: 'Positive' | 'Negative' | 'Both',
  fg: FunctionalGroupInfo
): IsotopeCandidate[] {
  const candidates: IsotopeCandidate[] = [];
  const baseCounts = parseFormulaCounts(formula);

  const numCl = baseCounts['Cl'] || 0;
  const numBr = baseCounts['Br'] || 0;
  const numS = baseCounts['S'] || 0;

  const isNegative = mode === 'Negative' || (mode === 'Both' && fg.negativePathEnabled);

  const buildIsoFormula = (isoTag: string): { ionFormula: string; baseIonMz: number } => {
    const counts = { ...baseCounts };
    if (isNegative) {
      counts['H'] = Math.max(0, (counts['H'] || 1) - 1);
      if (counts['H'] === 0) delete counts['H'];
      return {
        ionFormula: `${formatHillFormula(counts, -1, false)} (${isoTag})`,
        baseIonMz: exactMass - PROTON_MASS
      };
    } else {
      counts['H'] = (counts['H'] || 0) + 1;
      return {
        ionFormula: `${formatHillFormula(counts, 1, false)} (${isoTag})`,
        baseIonMz: exactMass + PROTON_MASS
      };
    }
  };

  // Chlorine 35Cl / 37Cl pattern (~3:1 ratio per Cl atom, +1.99705 Da)
  if (numCl > 0) {
    const { ionFormula, baseIonMz } = buildIsoFormula('³⁷Cl');
    const cl37Mz = baseIonMz + 1.99705;

    candidates.push({
      type: '同位素特徵訊號 (Isotope M+2)',
      mode: isNegative ? 'Negative' : 'Positive',
      adduct: isNegative ? '[M-H+2]- (³⁷Cl)' : '[M+H+2]+ (³⁷Cl)',
      formula: ionFormula,
      mz: Number(cl37Mz.toFixed(4)),
      intensityRatio: '3:1 (M : M+2)',
      relative_intensity: Math.min(95, Number((32.0 * numCl).toFixed(1))),
      mechanism: '含氯同位素特徵峰 (³⁵Cl : ³⁷Cl 天然豐度比約 3:1，質量差 +1.9971 Da)',
      confidence: 'High',
      priority: 'High'
    });
  }

  // Bromine 79Br / 81Br doublet pattern (~1:1 ratio per Br atom, +1.99795 Da)
  if (numBr > 0) {
    const { ionFormula, baseIonMz } = buildIsoFormula('⁸¹Br');
    const br81Mz = baseIonMz + 1.99795;

    candidates.push({
      type: '同位素特徵訊號 (Isotope M+2)',
      mode: isNegative ? 'Negative' : 'Positive',
      adduct: isNegative ? '[M-H+2]- (⁸¹Br)' : '[M+H+2]+ (⁸¹Br)',
      formula: ionFormula,
      mz: Number(br81Mz.toFixed(4)),
      intensityRatio: '1:1 (M : M+2)',
      relative_intensity: Math.min(96, Number((97.3 * numBr).toFixed(1))),
      mechanism: '含溴同位素特徵雙峰 (⁷⁹Br : ⁸¹Br 天然豐度比約 1:1，質量差 +1.9980 Da)',
      confidence: 'High',
      priority: 'High'
    });
  }

  // Sulfur 34S pattern (~4.4% natural abundance, +1.9958 Da)
  if (numS > 0) {
    const { ionFormula, baseIonMz } = buildIsoFormula('³⁴S');
    const s34Mz = baseIonMz + 1.9958;

    candidates.push({
      type: '同位素特徵訊號 (Isotope M+2)',
      mode: isNegative ? 'Negative' : 'Positive',
      adduct: isNegative ? '[M-H+2]- (³⁴S)' : '[M+H+2]+ (³⁴S)',
      formula: ionFormula,
      mz: Number(s34Mz.toFixed(4)),
      intensityRatio: '~4.4% (M+2)',
      relative_intensity: Math.max(20, Number((22.0 + 4.4 * numS).toFixed(1))),
      mechanism: '含硫同位素特徵訊號 (³²S : ³⁴S 天然豐度比約 95:4.4，質量差 +1.9958 Da)',
      confidence: 'Medium',
      priority: 'Medium'
    });
  }

  return candidates;
}
