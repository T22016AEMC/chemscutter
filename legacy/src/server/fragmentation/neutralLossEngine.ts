import { FunctionalGroupInfo } from './functionalGroupRules';
import { executeGraphReactions } from './reactionTransforms';
import { PathwayStatus } from '../../types';

export interface NeutralLossResult {
  lossType: string;
  name: string;
  neutralFormula: string;
  neutralExactMass: number;
  residualMol: any;
  residualSmiles: string;
  residualFormula: string;
  residualNeutralFormula: string;
  residualExactMass: number;
  residualIonExactMass: number;
  residualMz: number;
  residualImage: string;
  isChargedProduct: boolean;
  charge: number;
  mechanism: string;
  pathwayStatus: PathwayStatus;
  massBalanceVerified: boolean;
  massBalanceError: number;
  confidence: 'High' | 'Medium' | 'Low';
  priority: 'High' | 'Medium' | 'Low';
}

/**
 * Generates genuine RDKit molecular graph products for neutral losses and rearrangements.
 * Strictly prohibits SMILES.replace() or formula string concatenation:
 * every product is built by mutating the RDKit CommonChem molecular graph and verified for mass balance.
 */
export function generateValidNeutralLosses(
  mol: any,
  RDKit: any,
  _fg: FunctionalGroupInfo
): NeutralLossResult[] {
  const graphProducts = executeGraphReactions(mol, RDKit);

  return graphProducts.map((gp) => ({
    lossType: gp.lossType,
    name: gp.name,
    neutralFormula: gp.neutralLossFormula,
    neutralExactMass: gp.neutralLossMass,
    residualMol: gp.productMol,
    residualSmiles: gp.productSmiles,
    residualFormula: gp.isChargedProduct ? gp.productStoich.ionicFormula : gp.productStoich.neutralFormula,
    residualNeutralFormula: gp.productStoich.neutralFormula,
    residualExactMass: gp.productStoich.neutralExactMass,
    residualIonExactMass: gp.productStoich.ionExactMass,
    residualMz: gp.productStoich.mz,
    residualImage: gp.productImage,
    isChargedProduct: gp.isChargedProduct,
    charge: gp.charge,
    mechanism: gp.mechanism,
    pathwayStatus: gp.pathwayStatus,
    massBalanceVerified: gp.massBalanceVerified,
    massBalanceError: gp.massBalanceError,
    confidence: gp.confidence,
    priority: gp.priority
  }));
}
