// RDKit 分子圖反應：中性丟失、重排與 McLafferty 六元環重排。
// 來源：legacy reactionTransforms.ts
import { HYDROGEN_ATOM_MASS_LEGACY_ROUNDED } from '../constants/masses';
import { molToSvgDataUri } from '../chem/depiction';
import { verifyFragmentMassBalance } from '../chem/massBalance';
import { analyzeRDKitMolStoichiometry, type MolGraphStoichiometry } from '../chem/stoichiometry';
import type {
  CommonChemAtom,
  CommonChemJson,
  JSMol,
  RDKitModule,
  SubstructMatch
} from '../rdkit/types';
import type { PathwayStatus } from '../types';

export interface GraphReactionProduct {
  reactionId: string;
  lossType: string;
  name: string;
  neutralLossFormula: string;
  neutralLossMass: number;
  productMol: JSMol;
  productSmiles: string;
  productStoich: MolGraphStoichiometry;
  productImage: string;
  isChargedProduct: boolean;
  charge: number;
  mechanism: string;
  pathwayStatus: PathwayStatus;
  massBalanceVerified: boolean;
  massBalanceError: number;
  confidence: 'High' | 'Medium' | 'Low';
  priority: 'High' | 'Medium' | 'Low';
}

/** buildSubgraphMol 內部使用的鍵（舊索引） */
export interface SubgraphBond {
  u: number;
  v: number;
  bo: number;
}

/**
 * Helper: Extracts all SMARTS matches from an RDKit molecule as arrays of atom indices.
 */
export function getSmartsMatches(mol: JSMol, smarts: string, RDKit: RDKitModule): number[][] {
  try {
    const qmol = RDKit.get_qmol(smarts);
    if (!qmol) return [];
    if (typeof mol.get_substruct_matches === 'function') {
      const raw = mol.get_substruct_matches(qmol);
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return (parsed as (SubstructMatch | null)[])
          .filter((m) => m && Array.isArray(m.atoms) && m.atoms.length > 0)
          .map((m) => (m as SubstructMatch).atoms as number[]);
      }
    }
    const singleRaw = mol.get_substruct_match(qmol);
    const single = JSON.parse(singleRaw) as SubstructMatch | null;
    if (single && Array.isArray(single.atoms) && single.atoms.length > 0) {
      return [single.atoms];
    }
  } catch {
    // ignore
  }
  return [];
}

/**
 * Helper: Builds a new RDKit molecule from a modified CommonChem JSON subgraph,
 * keeping only the connected component that contains `keepAnchorOldIdx` and excluding `removedOldIndices`.
 */
export function buildSubgraphMol(
  molJson: CommonChemJson,
  RDKit: RDKitModule,
  removedOldIndices: Set<number>,
  keepAnchorOldIdx: number,
  atomMutator?: (atomCopy: CommonChemAtom, oldIdx: number) => void,
  bondMutator?: (bondCopy: SubgraphBond, oldU: number, oldV: number) => boolean | void,
  extraBondsOld?: SubgraphBond[]
): JSMol | null {
  const atoms = molJson?.molecules?.[0]?.atoms || [];
  const bonds = molJson?.molecules?.[0]?.bonds || [];

  // Build adjacency among non-removed atoms
  const adj = new Map<number, number[]>();
  for (let i = 0; i < atoms.length; i++) {
    if (!removedOldIndices.has(i)) adj.set(i, []);
  }

  const activeBonds: SubgraphBond[] = [];
  for (const b of bonds) {
    const u = b.atoms[0];
    const v = b.atoms[1];
    if (removedOldIndices.has(u) || removedOldIndices.has(v)) continue;
    const bondCopy = { u, v, bo: b.bo !== undefined ? b.bo : 1 };
    if (bondMutator) {
      const keep = bondMutator(bondCopy, u, v);
      if (keep === false) continue;
    }
    activeBonds.push(bondCopy);
    adj.get(u)?.push(v);
    adj.get(v)?.push(u);
  }

  if (extraBondsOld) {
    for (const eb of extraBondsOld) {
      if (!removedOldIndices.has(eb.u) && !removedOldIndices.has(eb.v)) {
        activeBonds.push(eb);
        adj.get(eb.u)?.push(eb.v);
        adj.get(eb.v)?.push(eb.u);
      }
    }
  }

  if (removedOldIndices.has(keepAnchorOldIdx)) return null;

  // BFS from keepAnchorOldIdx to isolate the desired connected component
  const visited = new Set<number>();
  const queue = [keepAnchorOldIdx];
  visited.add(keepAnchorOldIdx);
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const nxt of adj.get(curr) || []) {
      if (!visited.has(nxt)) {
        visited.add(nxt);
        queue.push(nxt);
      }
    }
  }

  const keptOldIndices = Array.from(visited).sort((a, b) => a - b);
  if (keptOldIndices.length === 0) return null;

  const oldToNew = new Map<number, number>();
  keptOldIndices.forEach((oldIdx, newIdx) => oldToNew.set(oldIdx, newIdx));

  const newAtoms = keptOldIndices.map((oldIdx) => {
    const copy = { ...atoms[oldIdx] };
    if (atomMutator) atomMutator(copy, oldIdx);
    return copy;
  });

  const newBonds: { bo: number; atoms: [number, number] }[] = [];
  for (const b of activeBonds) {
    if (oldToNew.has(b.u) && oldToNew.has(b.v)) {
      newBonds.push({
        bo: b.bo,
        atoms: [oldToNew.get(b.u)!, oldToNew.get(b.v)!]
      });
    }
  }

  const subJson = {
    rdkitjson: molJson.rdkitjson,
    defaults: molJson.defaults,
    molecules: [{ atoms: newAtoms, bonds: newBonds }]
  };

  try {
    const newMol = RDKit.get_mol(JSON.stringify(subJson));
    if (newMol && newMol.is_valid()) {
      // Double-check round-trip SMILES sanitization in RDKit
      const canonical = newMol.get_smiles();
      const sanitizedMol = RDKit.get_mol(canonical);
      if (sanitizedMol && sanitizedMol.is_valid()) {
        return sanitizedMol;
      }
      return newMol;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Executes genuine RDKit molecular graph transformations for all major MS rearrangements and neutral losses.
 * Zero string `.replace()` operations on SMILES!
 */
export function executeGraphReactions(
  mol: JSMol,
  RDKit: RDKitModule
): GraphReactionProduct[] {
  const products: GraphReactionProduct[] = [];
  const seenKey = new Set<string>();
  const molJson = JSON.parse(mol.get_json()) as CommonChemJson;
  const parentStoich = analyzeRDKitMolStoichiometry(mol, false);

  const pushVerifiedProduct = (
    reactionId: string,
    lossType: string,
    name: string,
    explicitLossFormula: string | undefined,
    prodMol: JSMol | null,
    isChargedProduct: boolean,
    mechanism: string,
    priority: 'High' | 'Medium' | 'Low',
    confidence: 'High' | 'Medium' | 'Low'
  ) => {
    if (!prodMol || !prodMol.is_valid()) return;
    const prodSmiles = prodMol.get_smiles();
    if (!prodSmiles || prodSmiles === mol.get_smiles()) return;

    const prodStoich = analyzeRDKitMolStoichiometry(prodMol, false);
    const dedupKey = `${lossType}_${prodSmiles}_${prodStoich.netCharge}`;
    if (seenKey.has(dedupKey)) return;

    // For charged acylium products (e.g. [M+H-H2O]+ where protonated precursor lost H2O),
    // compare against protonated precursor stoichiometry if prodStoich.netCharge > 0
    const refCounts =
      prodStoich.netCharge > 0
        ? { ...parentStoich.atomCounts, H: (parentStoich.atomCounts['H'] || 0) + prodStoich.netCharge }
        : parentStoich.atomCounts;
    const refMass =
      prodStoich.netCharge > 0
        ? parentStoich.neutralExactMass + prodStoich.netCharge * HYDROGEN_ATOM_MASS_LEGACY_ROUNDED
        : parentStoich.neutralExactMass;

    const mb = verifyFragmentMassBalance(
      refCounts,
      refMass,
      prodStoich.atomCounts,
      prodStoich.neutralExactMass,
      explicitLossFormula
    );

    if (!mb.verified) return;
    seenKey.add(dedupKey);

    products.push({
      reactionId,
      lossType,
      name,
      neutralLossFormula: mb.neutralLossFormula,
      neutralLossMass: mb.neutralLossMass,
      productMol: prodMol,
      productSmiles: prodSmiles,
      productStoich: prodStoich,
      productImage: molToSvgDataUri(prodMol, 250, 200),
      isChargedProduct,
      charge: prodStoich.netCharge,
      mechanism,
      pathwayStatus: 'Verified Graph Product',
      massBalanceVerified: mb.verified,
      massBalanceError: mb.deltaMass,
      confidence,
      priority
    });
  };

  // ============================================================================
  // 1. Decarboxylation (-CO2, 43.9898 Da)
  // SMARTS: [c,#6:0][CX3:1](=[OX1:2])[OX2H1,O-:3]
  // Removes C(=O)O atoms (1, 2, 3) and transfers 1 H to anchor carbon (0).
  // ============================================================================
  const coohMatches = getSmartsMatches(mol, '[#6,c][CX3](=[OX1])[OX2H1,O-]', RDKit);
  for (const m of coohMatches) {
    if (m.length >= 4) {
      const [anchorIdx, cIdx, o1Idx, o2Idx] = m;
      const removed = new Set([cIdx, o1Idx, o2Idx]);
      const prodMol = buildSubgraphMol(molJson, RDKit, removed, anchorIdx, (atomCopy, oldIdx) => {
        if (oldIdx === anchorIdx) {
          atomCopy.impHs = (atomCopy.impHs || 0) + 1;
        }
      });
      pushVerifiedProduct(
        'Graph_Decarboxylation',
        'CO2',
        '脫羧中性丟失 (Decarboxylation, -CO₂)',
        'CO2',
        prodMol,
        false,
        '羧基 C-C 鍵斷裂伴隨質子轉移，釋放中性 CO₂ (43.9898 Da)',
        'High',
        'High'
      );
    }
  }

  // ============================================================================
  // 2. Ketene Elimination from O-Acetyl / N-Acetyl (-C2H2O, 42.0106 Da)
  // SMARTS: [CH3:0][CX3:1](=[OX1:2])[OX2,NX3:3][#6,c:4]
  // Removes CH3-C(=O) (0, 1, 2) and transfers 1 H to heteroatom O/N (3).
  // ============================================================================
  const acetylMatches = getSmartsMatches(mol, '[CH3][CX3](=[OX1])[OX2,NX3][#6,c]', RDKit);
  for (const m of acetylMatches) {
    if (m.length >= 5) {
      const [ch3Idx, cIdx, oIdx, heteroIdx] = m;
      const removed = new Set([ch3Idx, cIdx, oIdx]);
      const prodMol = buildSubgraphMol(molJson, RDKit, removed, heteroIdx, (atomCopy, oldIdx) => {
        if (oldIdx === heteroIdx) {
          atomCopy.impHs = (atomCopy.impHs || 0) + 1;
        }
      });
      pushVerifiedProduct(
        'Graph_KeteneElimination',
        'C2H2O',
        '脫乙烯酮重排 (Ketene Loss, -C₂H₂O)',
        'C2H2O',
        prodMol,
        false,
        '乙醯基經四元/六元環過渡態氫轉移，脫去中性乙烯酮 CH₂=C=O (42.0106 Da)',
        'High',
        'High'
      );
    }
  }

  // ============================================================================
  // 3. Ortho-Acetoxy / Ortho-Hydroxy Benzoic Acid Elimination (Aspirin / Salicylate Ortho-Effect)
  // SMARTS: [CH3:0][CX3:1](=[OX1:2])[OX2:3][c:4][c:5][CX3:6](=[OX1:7])[OX2H1:8]
  // Sequential / concerted loss of CH3COOH (-C2H4O2, 60.0211 Da) -> Salicyloyl cation [C7H5O2]+ (m/z 121.0284)
  // and neutral ketene-lactone C7H4O2 (120.0211 Da).
  // ============================================================================
  const orthoAcetoxyMatches = getSmartsMatches(
    mol,
    '[CH3][CX3](=[OX1])[OX2][c][c][CX3](=[OX1])[OX2H1]',
    RDKit
  );
  for (const m of orthoAcetoxyMatches) {
    if (m.length >= 9) {
      const [ch3Idx, cAcIdx, oAcIdx, oPhenIdx, , cArIdx, cCarbIdx, , oOhIdx] = m;
      // 3a: Concerted / sequential loss of CH3COOH from [M+H]+ -> Salicyloyl acylium ion O=[C+]c1ccccc1O
      const removedAcetic = new Set([ch3Idx, cAcIdx, oAcIdx, oOhIdx]);
      const salicyloylIonMol = buildSubgraphMol(
        molJson,
        RDKit,
        removedAcetic,
        cArIdx,
        (atomCopy, oldIdx) => {
          if (oldIdx === oPhenIdx) {
            atomCopy.impHs = (atomCopy.impHs || 0) + 1;
          }
          if (oldIdx === cCarbIdx) {
            atomCopy.chg = 1;
            atomCopy.impHs = 0;
          }
        }
      );
      pushVerifiedProduct(
        'Graph_OrthoAceticAcidLoss_Ion',
        'C2H4O2',
        '鄰位效應脫乙酸/連續脫水 (Loss of CH₃COOH / -C₂H₂O-H₂O)',
        'C2H4O2',
        salicyloylIonMol,
        true,
        '鄰位乙醯氧基與羧基發生鄰位效應 (Ortho-effect)，脫去 CH₃COOH (或先脫 CH₂CO 再脫 H₂O) 生成水楊醯基鎓陽離子 [C₇H₅O₂]⁺',
        'High',
        'High'
      );

      // 3b: Neutral / EI radical cation product C7H4O2 (m/z 120.0206) via ring closure between oPhenIdx and cCarbIdx
      const benzodioxinoneMol = buildSubgraphMol(
        molJson,
        RDKit,
        removedAcetic,
        cArIdx,
        (atomCopy, oldIdx) => {
          if (oldIdx === oPhenIdx) {
            atomCopy.impHs = 0;
          }
        },
        undefined,
        [{ u: oPhenIdx, v: cCarbIdx, bo: 1 }]
      );
      pushVerifiedProduct(
        'Graph_OrthoAceticAcidLoss_Neutral',
        'C2H4O2',
        '鄰位效應脫乙酸環化產物 (-CH₃COOH / -C₂H₂O-H₂O)',
        'C2H4O2',
        benzodioxinoneMol,
        false,
        '鄰位酚氧與羰基碳六元環過渡態脫去 CH₃COOH (60.0211 Da) 生成 C₇H₄O₂',
        'High',
        'High'
      );
    }
  }

  // ============================================================================
  // 4. Acylium Dehydration from Carboxylic Acid ([M+H-H2O]+, -H2O 18.0106 Da)
  // SMARTS: [#6,c:0][CX3:1](=[OX1:2])[OX2H1:3]
  // Removes OH (3) and puts +1 formal charge on carbonyl carbon (1) -> R-[C+]=O
  // ============================================================================
  const acylDehydrationMatches = getSmartsMatches(mol, '[#6,c][CX3](=[OX1])[OX2H1]', RDKit);
  for (const m of acylDehydrationMatches) {
    if (m.length >= 4) {
      const [anchorIdx, cCarbIdx, , oOhIdx] = m;
      const removed = new Set([oOhIdx]);
      const acyliumMol = buildSubgraphMol(molJson, RDKit, removed, anchorIdx, (atomCopy, oldIdx) => {
        if (oldIdx === cCarbIdx) {
          atomCopy.chg = 1;
          atomCopy.impHs = 0;
        }
      });
      pushVerifiedProduct(
        'Graph_CarboxylDehydration_Acylium',
        'H2O',
        '羧基質子化脫水形成醯基鎓離子 (Acylium Dehydration, -H₂O)',
        'H2O',
        acyliumMol,
        true,
        '羧基羥基質子化後異裂脫去 H₂O (18.0106 Da)，形成共振穩定的醯基鎓陽離子 R-C≡O⁺',
        'High',
        'High'
      );
    }
  }

  // ============================================================================
  // 5. Aliphatic Alcohol 1,2-Elimination Dehydration (-H2O, 18.0106 Da)
  // SMARTS: [OX2H1:0][CX4:1][CX4H1,CX4H2,CX4H3:2]
  // Removes OH (0), decrements H on beta-C (2), and upgrades C1-C2 bond to double bond!
  // ============================================================================
  const alcDehydrationMatches = getSmartsMatches(
    mol,
    '[OX2H1][CX4][CX4H1,CX4H2,CX4H3]',
    RDKit
  );
  for (const m of alcDehydrationMatches) {
    if (m.length >= 3) {
      const [ohIdx, cAlphaIdx, cBetaIdx] = m;
      const removed = new Set([ohIdx]);
      const alkeneMol = buildSubgraphMol(
        molJson,
        RDKit,
        removed,
        cAlphaIdx,
        (atomCopy, oldIdx) => {
          if (oldIdx === cBetaIdx && (atomCopy.impHs || 0) > 0) {
            atomCopy.impHs = (atomCopy.impHs as number) - 1;
          }
        },
        (bondCopy, u, v) => {
          if ((u === cAlphaIdx && v === cBetaIdx) || (u === cBetaIdx && v === cAlphaIdx)) {
            bondCopy.bo = 2;
          }
          return true;
        }
      );
      pushVerifiedProduct(
        'Graph_AlcoholDehydration',
        'H2O',
        '脂肪醇 1,2-脫水反應 (1,2-Dehydration, -H₂O)',
        'H2O',
        alkeneMol,
        false,
        '脂肪醇羥基與鄰位 β-氫發生 1,2-消除脫去中性水分子 H₂O (18.0106 Da) 形成烯烴',
        'High',
        'High'
      );
    }
  }

  // ============================================================================
  // 6. Aldehyde / Carbonyl Decarbonylation (-CO, 27.9949 Da)
  // SMARTS: [#6,c:0][CX3H1:1]=[OX1:2]
  // ============================================================================
  const aldehydeMatches = getSmartsMatches(mol, '[#6,c][CX3H1]=[OX1]', RDKit);
  for (const m of aldehydeMatches) {
    if (m.length >= 3) {
      const [anchorIdx, cAldIdx, oAldIdx] = m;
      const removed = new Set([cAldIdx, oAldIdx]);
      const decarbMol = buildSubgraphMol(molJson, RDKit, removed, anchorIdx, (atomCopy, oldIdx) => {
        if (oldIdx === anchorIdx) {
          atomCopy.impHs = (atomCopy.impHs || 0) + 1;
        }
      });
      pushVerifiedProduct(
        'Graph_AldehydeDecarbonylation',
        'CO',
        '醛基脫一氧化碳重排 (Decarbonylation, -CO)',
        'CO',
        decarbMol,
        false,
        '醛基 C-C 鍵斷裂伴隨氫遷移脫去中性一氧化碳 CO (27.9949 Da)',
        'Medium',
        'High'
      );
    }
  }

  // ============================================================================
  // 7. Primary Amine 1,2-Elimination Deamination (-NH3, 17.0265 Da)
  // SMARTS: [NX3H2:0][CX4:1][CX4H1,CX4H2,CX4H3:2]
  // ============================================================================
  const amineMatches = getSmartsMatches(mol, '[NX3H2][CX4][CX4H1,CX4H2,CX4H3]', RDKit);
  for (const m of amineMatches) {
    if (m.length >= 3) {
      const [nIdx, cAlphaIdx, cBetaIdx] = m;
      const removed = new Set([nIdx]);
      const deamMol = buildSubgraphMol(
        molJson,
        RDKit,
        removed,
        cAlphaIdx,
        (atomCopy, oldIdx) => {
          if (oldIdx === cBetaIdx && (atomCopy.impHs || 0) > 0) {
            atomCopy.impHs = (atomCopy.impHs as number) - 1;
          }
        },
        (bondCopy, u, v) => {
          if ((u === cAlphaIdx && v === cBetaIdx) || (u === cBetaIdx && v === cAlphaIdx)) {
            bondCopy.bo = 2;
          }
          return true;
        }
      );
      pushVerifiedProduct(
        'Graph_AmineDeamination',
        'NH3',
        '一級胺 1,2-脫氨消除 (Deamination, -NH₃)',
        'NH3',
        deamMol,
        false,
        '一級胺基與鄰位 β-H 發生 1,2-消除脫去中性氨分子 NH₃ (17.0265 Da)',
        'Medium',
        'High'
      );
    }
  }

  // ============================================================================
  // 8. Primary Amide Deamination to Acylium ([M+H-NH3]+, -NH3 17.0265 Da)
  // SMARTS: [#6,c:0][CX3:1](=[OX1:2])[NX3H2:3]
  // ============================================================================
  const amideDeamMatches = getSmartsMatches(mol, '[#6,c][CX3](=[OX1])[NX3H2]', RDKit);
  for (const m of amideDeamMatches) {
    if (m.length >= 4) {
      const [anchorIdx, cCarbIdx, , nIdx] = m;
      const removed = new Set([nIdx]);
      const acyliumMol = buildSubgraphMol(molJson, RDKit, removed, anchorIdx, (atomCopy, oldIdx) => {
        if (oldIdx === cCarbIdx) {
          atomCopy.chg = 1;
          atomCopy.impHs = 0;
        }
      });
      pushVerifiedProduct(
        'Graph_AmideDeamination_Acylium',
        'NH3',
        '一級醯胺質子化脫氨 (Amide Deamination, -NH₃)',
        'NH3',
        acyliumMol,
        true,
        '醯胺氮質子化後 C-N 鍵異裂脫去中性 NH₃ (17.0265 Da)，形成醯基鎓陽離子 R-C≡O⁺',
        'High',
        'High'
      );
    }
  }

  // ============================================================================
  // 9. Methoxy Formaldehyde Elimination (-CH2O, 30.0106 Da)
  // SMARTS: [CH3:0][OX2:1][#6,c:2]
  // Removes CH3 (0) and O (1), transfers 1 H to anchor carbon (2).
  // ============================================================================
  const methoxyMatches = getSmartsMatches(mol, '[CH3][OX2][#6,c]', RDKit);
  for (const m of methoxyMatches) {
    if (m.length >= 3) {
      const [ch3Idx, oIdx, anchorIdx] = m;
      const removed = new Set([ch3Idx, oIdx]);
      const demethMol = buildSubgraphMol(molJson, RDKit, removed, anchorIdx, (atomCopy, oldIdx) => {
        if (oldIdx === anchorIdx) {
          atomCopy.impHs = (atomCopy.impHs || 0) + 1;
        }
      });
      pushVerifiedProduct(
        'Graph_MethoxyFormaldehydeLoss',
        'CH2O',
        '甲氧基四元環重排脫甲醛 (Loss of Formaldehyde, -CH₂O)',
        'CH2O',
        demethMol,
        false,
        '甲氧基經由氫遷移至芳環/碳骨架並脫去中性甲醛分子 CH₂O (30.0106 Da)',
        'Medium',
        'High'
      );
    }
  }

  return products;
}

/**
 * Genuine McLafferty 6-membered transition state graph rearrangement:
 * Traces gamma-H -> beta-C -> alpha-(C/O) -> C(=O) on the RDKit molecular graph,
 * severs the alpha-beta bond, transfers H to the carbonyl side, and computes the exact alkene neutral loss.
 * Zero string `.replace()`!
 */
export function executeMcLaffertyGraphRearrangement(
  mol: JSMol,
  RDKit: RDKitModule
): GraphReactionProduct | null {
  const molJson = JSON.parse(mol.get_json()) as CommonChemJson;
  const parentStoich = analyzeRDKitMolStoichiometry(mol, false);

  // Pattern 1: Ester alkoxy chain with gamma-H: [CX4H1,CX4H2,CX4H3:0][CX4:1][OX2:2][CX3:3](=[OX1:4])
  // E.g. Ethyl acetate CH3(0)-CH2(1)-O(2)-C(3)(=O(4))CH3 -> severs bond (1, 2) and protonates O(2) to give R-C(=O)OH + alkene
  const esterMcMatches = getSmartsMatches(
    mol,
    '[CX4H1,CX4H2,CX4H3][CX4][OX2][CX3](=[OX1])',
    RDKit
  );
  for (const m of esterMcMatches) {
    if (m.length >= 5) {
      const [, cBetaIdx, oAlphaIdx, cCarbIdx] = m;
      const prodMol = buildSubgraphMol(
        molJson,
        RDKit,
        new Set<number>(),
        cCarbIdx,
        (atomCopy, oldIdx) => {
          if (oldIdx === oAlphaIdx) {
            atomCopy.impHs = (atomCopy.impHs || 0) + 1;
          }
        },
        (_bondCopy, u, v) => {
          if ((u === cBetaIdx && v === oAlphaIdx) || (u === oAlphaIdx && v === cBetaIdx)) {
            return false; // Sever alpha-beta C-O bond
          }
          return true;
        }
      );

      if (prodMol && prodMol.is_valid()) {
        const prodStoich = analyzeRDKitMolStoichiometry(prodMol, true);
        const mb = verifyFragmentMassBalance(
          parentStoich.atomCounts,
          parentStoich.neutralExactMass,
          prodStoich.atomCounts,
          prodStoich.neutralExactMass
        );
        if (mb.verified) {
          return {
            reactionId: 'Graph_McLafferty_Ester',
            lossType: mb.neutralLossFormula,
            name: `McLafferty 六元環重排 (-${mb.neutralLossFormula})`,
            neutralLossFormula: mb.neutralLossFormula,
            neutralLossMass: mb.neutralLossMass,
            productMol: prodMol,
            productSmiles: prodMol.get_smiles(),
            productStoich: prodStoich,
            productImage: molToSvgDataUri(prodMol, 250, 200),
            isChargedProduct: false,
            charge: 1,
            mechanism: `McLafferty 六元環過渡態 γ-H 轉移與エステル C-O β-斷裂，脫去中性烯烴 ${mb.neutralLossFormula} (${mb.neutralLossMass.toFixed(4)} Da)`,
            pathwayStatus: 'Verified Graph Product',
            massBalanceVerified: true,
            massBalanceError: mb.deltaMass,
            confidence: 'High',
            priority: 'High'
          };
        }
      }
    }
  }

  // Pattern 2: Acyl / Ketone / Aldehyde / Acid alkyl chain with gamma-H:
  // [CX4H1,CX4H2,CX4H3:0][CX4:1][CX4:2][CX3:3](=[OX1:4])
  // Severs alpha-beta bond (1, 2), protonates carbonyl O (4), shifts C(3)=O(4) -> C(2)=C(3)-O(4)H (true McLafferty enol!)
  const acylMcMatches = getSmartsMatches(
    mol,
    '[CX4H1,CX4H2,CX4H3][CX4][CX4][CX3](=[OX1])',
    RDKit
  );
  for (const m of acylMcMatches) {
    if (m.length >= 5) {
      const [, cBetaIdx, cAlphaIdx, cCarbIdx, oCarbIdx] = m;
      const prodMol = buildSubgraphMol(
        molJson,
        RDKit,
        new Set<number>(),
        cCarbIdx,
        (atomCopy, oldIdx) => {
          if (oldIdx === oCarbIdx) {
            atomCopy.impHs = (atomCopy.impHs || 0) + 1;
          }
        },
        (bondCopy, u, v) => {
          if ((u === cBetaIdx && v === cAlphaIdx) || (u === cAlphaIdx && v === cBetaIdx)) {
            return false; // Sever alpha-beta C-C bond
          }
          if ((u === cAlphaIdx && v === cCarbIdx) || (u === cCarbIdx && v === cAlphaIdx)) {
            bondCopy.bo = 2; // Form enol C=C double bond
          }
          if ((u === cCarbIdx && v === oCarbIdx) || (u === oCarbIdx && v === cCarbIdx)) {
            bondCopy.bo = 1; // Convert C=O to C-OH single bond
          }
          return true;
        }
      );

      if (prodMol && prodMol.is_valid()) {
        const prodStoich = analyzeRDKitMolStoichiometry(prodMol, true);
        const mb = verifyFragmentMassBalance(
          parentStoich.atomCounts,
          parentStoich.neutralExactMass,
          prodStoich.atomCounts,
          prodStoich.neutralExactMass
        );
        if (mb.verified) {
          return {
            reactionId: 'Graph_McLafferty_Carbonyl',
            lossType: mb.neutralLossFormula,
            name: `McLafferty 羰基 γ-H 重排 (-${mb.neutralLossFormula})`,
            neutralLossFormula: mb.neutralLossFormula,
            neutralLossMass: mb.neutralLossMass,
            productMol: prodMol,
            productSmiles: prodMol.get_smiles(),
            productStoich: prodStoich,
            productImage: molToSvgDataUri(prodMol, 250, 200),
            isChargedProduct: false,
            charge: 1,
            mechanism: `McLafferty 六元環過渡態 γ-H 轉移至羰基氧並發生 α-β 單鍵斷裂，釋放中性烯烴 ${mb.neutralLossFormula} (${mb.neutralLossMass.toFixed(4)} Da)`,
            pathwayStatus: 'Verified Graph Product',
            massBalanceVerified: true,
            massBalanceError: mb.deltaMass,
            confidence: 'High',
            priority: 'High'
          };
        }
      }
    }
  }

  return null;
}
