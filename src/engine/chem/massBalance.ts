// 前驅物 = 碎片 + 中性丟失 的元素與質量守恆檢查。
// 來源：legacy massBalance.ts verifyFragmentMassBalance（parseFormulaCounts 移至 formula.ts）
import { computeExactMassFromCounts, formatHillFormula, parseFormulaCounts } from './formula';

export interface MassBalanceVerification {
  verified: boolean;
  deltaMass: number;
  neutralLossFormula: string;
  neutralLossMass: number;
  isElementSubset: boolean;
}

/**
 * Verifies mass and elemental conservation between a precursor (or neutral parent)
 * and a fragment + neutral loss.
 * If explicitNeutralLossFormula is not given, derives the exact complementary neutral loss
 * from (parentCounts - fragmentCounts).
 */
export function verifyFragmentMassBalance(
  parentFormulaOrCounts: string | Record<string, number>,
  parentExactMass: number,
  fragmentFormulaOrCounts: string | Record<string, number>,
  fragmentExactMass: number,
  explicitNeutralLossFormula?: string,
  toleranceDa = 0.015
): MassBalanceVerification {
  const parentCounts =
    typeof parentFormulaOrCounts === 'string'
      ? parseFormulaCounts(parentFormulaOrCounts)
      : { ...parentFormulaOrCounts };

  const fragCounts =
    typeof fragmentFormulaOrCounts === 'string'
      ? parseFormulaCounts(fragmentFormulaOrCounts)
      : { ...fragmentFormulaOrCounts };

  // Check if fragment elements are a subset of parent elements (allowing +1 H for protonation or H-transfer)
  let isElementSubset = true;
  const diffCounts: Record<string, number> = {};

  const allElements = new Set([...Object.keys(parentCounts), ...Object.keys(fragCounts)]);
  for (const el of allElements) {
    const pCnt = parentCounts[el] || 0;
    const fCnt = fragCounts[el] || 0;
    const diff = pCnt - fCnt;
    if (diff < 0) {
      // Allow at most +1 H difference from H-transfer or protonation during heterolytic cleavage
      if (el === 'H' && diff === -1) {
        diffCounts[el] = 0;
      } else {
        isElementSubset = false;
      }
    } else if (diff > 0) {
      diffCounts[el] = diff;
    }
  }

  const nlFormula = explicitNeutralLossFormula
    ? explicitNeutralLossFormula.split(' ')[0].trim()
    : formatHillFormula(diffCounts, 0, false);

  const nlCounts = explicitNeutralLossFormula
    ? parseFormulaCounts(nlFormula)
    : diffCounts;

  const nlMass = Number(computeExactMassFromCounts(nlCounts).toFixed(4));
  const deltaMass = Number(Math.abs(parentExactMass - (fragmentExactMass + nlMass)).toFixed(4));
  const verified = isElementSubset && deltaMass <= toleranceDa && nlMass > 0.5;

  return {
    verified,
    deltaMass,
    neutralLossFormula: nlMass > 0.5 ? nlFormula : '',
    neutralLossMass: nlMass,
    isElementSubset
  };
}
