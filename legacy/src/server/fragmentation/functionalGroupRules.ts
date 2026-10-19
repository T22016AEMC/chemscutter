/**
 * Functional Group Detection Rules for Mass Spectrometry
 * Uses RDKit SMARTS substructure queries to detect functional groups and structural motifs.
 */

export interface FunctionalGroupInfo {
  detectedGroups: string[];
  hasCarboxyl: boolean;
  hasPhenolicOH: boolean;
  hasAliphaticOH: boolean;
  hasEster: boolean;
  hasAcetate: boolean;
  hasAmide: boolean;
  hasPrimaryAmine: boolean;
  hasSecondaryAmine: boolean;
  hasTertiaryAmine: boolean;
  hasEther: boolean;
  hasMethoxy: boolean;
  hasKetone: boolean;
  hasAldehyde: boolean;
  hasCarbonate: boolean;
  hasCarbamate: boolean;
  hasSulfonicAcid: boolean;
  hasSulfone: boolean;
  hasSulfonamide: boolean;
  hasNitrile: boolean;
  hasCyano: boolean;
  hasNitro: boolean;
  hasFluoro: boolean;
  hasChloro: boolean;
  hasBromo: boolean;
  hasIodo: boolean;
  hasAromaticRing: boolean;
  hasAlkene: boolean;
  hasAlkyne: boolean;
  hasMcLaffertyMotif: boolean;
  hasBenzylicPosition: boolean;
  negativePathEnabled: boolean;
  theories: string[];
}

export function detectFunctionalGroups(mol: any, RDKit: any): FunctionalGroupInfo {
  const checkSmarts = (smarts: string): boolean => {
    try {
      const qmol = RDKit.get_qmol(smarts);
      if (!qmol) return false;
      const matchStr = mol.get_substruct_match(qmol);
      const match = JSON.parse(matchStr);
      return Boolean(match.atoms && match.atoms.length > 0);
    } catch {
      return false;
    }
  };

  const hasCarboxyl = checkSmarts('[CX3](=O)[OX2H1,O-]');
  const hasPhenolicOH = checkSmarts('[OX2H][c]');
  const hasAliphaticOH = checkSmarts('[OX2H][CX4]');
  const hasAcetate = checkSmarts('CC(=O)O[c,C]');
  const hasEster = checkSmarts('[#6][CX3](=O)[OX2H0][#6]');
  const hasAmide = checkSmarts('[#6][CX3](=O)[NX3][#6,#1]');
  const hasPrimaryAmine = checkSmarts('[NX3H2][#6]');
  const hasSecondaryAmine = checkSmarts('[#6][NX3H1][#6]');
  const hasTertiaryAmine = checkSmarts('[#6][NX3]([#6])[#6]');
  const hasMethoxy = checkSmarts('CO[#6,c]');
  const hasEther = checkSmarts('[#6][OX2H0][#6]');
  const hasKetone = checkSmarts('[#6][CX3](=O)[#6]');
  const hasAldehyde = checkSmarts('[CX3H1](=O)[#6,#1]');
  const hasCarbonate = checkSmarts('[#6][OX2][CX3](=O)[OX2][#6]');
  const hasCarbamate = checkSmarts('[#6][OX2][CX3](=O)[NX3][#6,#1]');
  const hasSulfonicAcid = checkSmarts('[SX4](=[OX1])(=[OX1])[OX2H,O-]');
  const hasSulfone = checkSmarts('[#6][SX4](=[OX1])(=[OX1])[#6]');
  const hasSulfonamide = checkSmarts('[SX4](=[OX1])(=[OX1])[NX3]');
  const hasNitrile = checkSmarts('[CX2]#[NX1]');
  const hasCyano = hasNitrile;
  const hasNitro = checkSmarts('[$([NX3](=O)=O),$([NX3+](=O)[O-])]') || checkSmarts('[NX3+](=O)[O-]');
  const hasFluoro = checkSmarts('[#9]');
  const hasChloro = checkSmarts('[#17]');
  const hasBromo = checkSmarts('[#35]');
  const hasIodo = checkSmarts('[#53]');
  const hasAromaticRing = checkSmarts('a1aaaaa1') || checkSmarts('a1aaaa1');
  const hasAlkene = checkSmarts('[CX3]=[CX3]');
  const hasAlkyne = checkSmarts('[CX2]#[CX2]');
  const hasBenzylicPosition = checkSmarts('c[CX4H1,CX4H2,CX4H3]');
  const hasMcLaffertyMotif = checkSmarts('[CX4H1,CX4H2,CX4H3][CX4][CX4][CX3]=O') ||
                             checkSmarts('[CX4H1,CX4H2,CX4H3][CX4][CX4][c]');

  const detectedGroups: string[] = [];
  if (hasCarboxyl) detectedGroups.push('羧基 (-COOH)');
  if (hasPhenolicOH) detectedGroups.push('酚羥基 (-OH)');
  if (hasAliphaticOH) detectedGroups.push('脂肪醇羥基 (-OH)');
  if (hasAcetate) detectedGroups.push('乙醯酯結構 (Acetate)');
  else if (hasEster) detectedGroups.push('酯基 (-COO-)');
  if (hasAmide) detectedGroups.push('醯胺基 (-CONH-)');
  if (hasPrimaryAmine) detectedGroups.push('一級胺 (-NH2)');
  if (hasSecondaryAmine) detectedGroups.push('二級胺 (-NH-)');
  if (hasTertiaryAmine) detectedGroups.push('三級胺 (-NR2)');
  if (hasMethoxy) detectedGroups.push('甲氧基 (-OCH3)');
  else if (hasEther) detectedGroups.push('醚基 (-O-)');
  if (hasKetone) detectedGroups.push('酮羰基 (C=O)');
  if (hasAldehyde) detectedGroups.push('醛基 (-CHO)');
  if (hasCarbonate) detectedGroups.push('碳酸酯基 (-O-COO-)');
  if (hasCarbamate) detectedGroups.push('胺基甲酸酯基 (-O-CONH-)');
  if (hasSulfonicAcid) detectedGroups.push('磺酸基 (-SO3H)');
  if (hasSulfonamide) detectedGroups.push('磺醯胺基 (-SO2NH-)');
  else if (hasSulfone) detectedGroups.push('碸基 (-SO2-)');
  if (hasNitrile) detectedGroups.push('氰基 (-CN)');
  if (hasNitro) detectedGroups.push('硝基 (-NO2)');
  if (hasFluoro) detectedGroups.push('氟基 (-F)');
  if (hasChloro) detectedGroups.push('氯基 (-Cl)');
  if (hasBromo) detectedGroups.push('溴基 (-Br)');
  if (hasIodo) detectedGroups.push('碘基 (-I)');
  if (hasAromaticRing) detectedGroups.push('芳香環系 (Aromatic Ring)');
  if (hasBenzylicPosition) detectedGroups.push('苄位碳 (Benzylic Carbon)');
  if (hasAlkene) detectedGroups.push('碳碳雙鍵 (Alkene)');
  if (hasAlkyne) detectedGroups.push('碳碳三鍵 (Alkyne)');
  if (hasMcLaffertyMotif) detectedGroups.push('McLafferty γ-H 拓樸結構');

  const negativePathEnabled =
    hasCarboxyl ||
    hasPhenolicOH ||
    hasSulfonicAcid ||
    hasFluoro ||
    hasChloro ||
    hasBromo ||
    hasNitro ||
    hasCyano;

  const theories: string[] = [
    '准平衡理論 (Quasi-Equilibrium Theory, QET) / RRKM 微觀反應速率理論'
  ];
  if (hasMcLaffertyMotif) {
    theories.push('McLafferty 斷裂理論：6-元環過渡態 γ-H 轉移與 β-鍵斷裂');
  }
  if (negativePathEnabled) {
    theories.push('高電負性/酸性官能基陰離子裂解分支 (Negative Cleavage Path: [M-H]⁻ 與酸根陰離子解離)');
  }
  if (hasBenzylicPosition) {
    theories.push('苄位斷裂 / Tropylium 鎓離子穩定共振重排機制');
  }

  return {
    detectedGroups,
    hasCarboxyl,
    hasPhenolicOH,
    hasAliphaticOH,
    hasEster,
    hasAcetate,
    hasAmide,
    hasPrimaryAmine,
    hasSecondaryAmine,
    hasTertiaryAmine,
    hasEther,
    hasMethoxy,
    hasKetone,
    hasAldehyde,
    hasCarbonate,
    hasCarbamate,
    hasSulfonicAcid,
    hasSulfone,
    hasSulfonamide,
    hasNitrile,
    hasCyano,
    hasNitro,
    hasFluoro,
    hasChloro,
    hasBromo,
    hasIodo,
    hasAromaticRing,
    hasAlkene,
    hasAlkyne,
    hasMcLaffertyMotif,
    hasBenzylicPosition,
    negativePathEnabled,
    theories
  };
}
