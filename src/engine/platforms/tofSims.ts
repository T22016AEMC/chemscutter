// TOF-SIMS 平台碎裂引擎。
// 來源：legacy tofSimsFragmentation.ts（照原樣搬移，只改型別、import 與具名質量常數）
import type { SimulationConfig, FragmentCandidate, StructureItem, SignalItem } from '../types';
import type { JSMol, RDKitModule } from '../rdkit/types';
import type { FunctionalGroupInfo } from '../rules/functionalGroups';
import { generateSingleBondFragments } from '../rules/singleBondCleavage';
import { molToSvgDataUri } from '../chem/depiction';
import { generateValidNeutralLosses } from '../rules/neutralLosses';
import { generateIsotopeCandidates } from '../chem/isotopes';
import { deduplicateAndRankCandidates } from '../scoring/deduplicate';
import { analyzeRDKitMolStoichiometry } from '../chem/stoichiometry';
import {
  deriveProtonatedIon,
  deriveDeprotonatedIon,
  deriveAdductIon,
  buildVerifiedIonFromSmiles
} from '../chem/ionDerivation';
import {
  ELECTRON_MASS,
  PROTON_MASS_LEGACY_ROUNDED,
  FLUORIDE_ANION_MZ,
  FLUORINE_NEUTRAL_MASS_ROUNDED,
  CL35_ANION_MZ,
  CL35_NEUTRAL_MASS_ROUNDED,
  CL37_ANION_MZ,
  CL37_NEUTRAL_MASS_ROUNDED,
  BR79_ANION_MZ,
  BR79_NEUTRAL_MASS_ROUNDED,
  BR81_ANION_MZ,
  BR81_NEUTRAL_MASS_ROUNDED,
  NITRITE_ANION_MZ,
  NO2_NEUTRAL_MASS_ROUNDED,
  CYANIDE_ANION_MZ,
  CN_NEUTRAL_MASS_ROUNDED
} from '../constants/masses';
import { verifyFragmentMassBalance } from '../chem/massBalance';
import { evaluateTofSimsRegime } from '../platform/parameterRegime';
import {
  addStructureOnce,
  buildParentContext,
  buildParentStructure,
  createPlatformOutput,
  type PlatformContext
} from './shared/context';
import { parentAsIon, precursorCandidate } from './shared/precursorIons';
import { buildSignals } from './shared/signals';

export interface TechniqueRunResult {
  candidates: FragmentCandidate[];
  structures: StructureItem[];
  signals: SignalItem[];
  parameterContext: string;
  activeRegimeDescription: string;
}

export function runTofSimsFragmentation(
  mol: JSMol,
  RDKit: RDKitModule,
  config: SimulationConfig,
  fg: FunctionalGroupInfo
): TechniqueRunResult {
  const parent = buildParentContext(mol);
  const { parentSmiles, parentStoich, parentFormula, parentMass, parentImg } = parent;

  const regime = evaluateTofSimsRegime(config, fg);
  const primaryIon = config.primaryIon || 'Generic';
  const energyStr = config.primaryIonEnergy ? `${config.primaryIonEnergy} keV` : '25 keV';
  const modeStr = config.simulationMode || 'General';
  const parameterContext =
    config.primaryIon && config.primaryIon !== 'Generic'
      ? `TOF-SIMS, ${primaryIon} (${energyStr}), Polarity: ${config.polarity || 'Both'}, Mode: ${modeStr}`
      : 'Primary ion 未指定，使用通用 TOF-SIMS fragmentation model (General)';

  const out = createPlatformOutput();
  const { candidates, structures, seenStructureKeys } = out;
  const ctx: PlatformContext = { ...parent, technique: 'TOF-SIMS', parameterContext };

  // Add Parent Molecule to structures list
  addStructureOnce(
    out,
    parentSmiles,
    buildParentStructure(parent, {
      name: '母分子 (Parent Molecule)',
      // LEGACY-QUIRK(Q24): 只看分子是否有負離子路徑，不看使用者設定的極性（LC-MS/MS 依 regime 極性決定）
      mode: fg.negativePathEnabled ? 'Both' : 'Positive',
      mechanism: regime.regimeSummary,
      fragmentationPathway: 'Intact Surface Desorption'
    })
  );

  // ============================================================================
  // 1. Molecular & Precursor Secondary Ions (Controlled by Polarity & Primary Ion Regime)
  // ============================================================================
  if (regime.enablePositive) {
    // [M+H]+
    const protParent = deriveProtonatedIon(mol, RDKit, 300, 240);
    const mhScore = Math.min(98, Math.max(40, (fg.negativePathEnabled ? 82 : 94) + regime.intactMolecularModifier));
    candidates.push(
      precursorCandidate(ctx, protParent, {
        id: 'Parent_H_pos',
        polarity: 'Positive',
        ionType: '[M+H]+',
        mechanism: `表面二次離子碰撞級聯：${protParent.siteDescription}`,
        fragmentationPathway: `Surface Proton Transfer → [M+H]+`,
        priority: 'High',
        confidence: 'High',
        sourceRule: 'TOF-SIMS_Protonation',
        heuristicScore: mhScore,
        explanation: `一次離子束 (${primaryIon}) 轟擊樣品表面引發界面質子轉移，生成真實化學式為 ${protParent.formula} 之准分子二次陽離子`
      })
    );

    // [M+Na]+ 與 [M+K]+
    // 已簡化：舊版此處另包一層 if (regime.enableAlkaliAdducts)；TOF-SIMS 的 enableAlkaliAdducts 定義為
    // enablePositive（parameterRegime.ts），在本區塊內恆為真，因此移除該判斷
    const naParent = deriveAdductIon(mol, '[M+Na]+', 300, 240);
    candidates.push(
      precursorCandidate(ctx, naParent, {
        id: 'Parent_Na_pos',
        polarity: 'Positive',
        ionType: '[M+Na]+',
        mechanism: naParent.siteDescription,
        fragmentationPathway: 'Surface Alkali Cationization → [M+Na]+',
        priority: 'Medium',
        confidence: 'High',
        sourceRule: 'TOF-SIMS_SodiumAdduct',
        heuristicScore: Math.max(30, 64 + Math.round(regime.intactMolecularModifier * 0.5)),
        explanation: '表面微量鹼金屬 Na⁺ 與極性位點配位形成非共價加合物'
      })
    );

    const kParent = deriveAdductIon(mol, '[M+K]+', 300, 240);
    candidates.push(
      precursorCandidate(ctx, kParent, {
        id: 'Parent_K_pos',
        polarity: 'Positive',
        ionType: '[M+K]+',
        mechanism: kParent.siteDescription,
        fragmentationPathway: 'Surface Alkali Cationization → [M+K]+',
        priority: 'Low',
        confidence: 'Medium',
        sourceRule: 'TOF-SIMS_PotassiumAdduct',
        heuristicScore: 42.0,
        explanation: '表面微量 K⁺ 配位加合物'
      })
    );

    // [M+Cs]+ ONLY when Cs+ primary ion is used!
    if (regime.enableCsAdduct) {
      const csParent = deriveAdductIon(mol, '[M+Cs]+', 300, 240);
      candidates.push(
        precursorCandidate(ctx, csParent, {
          id: 'Parent_Cs_pos',
          polarity: 'Positive',
          ionType: '[M+Cs]+',
          mechanism: csParent.siteDescription,
          fragmentationPathway: 'Cs+ Primary Beam Cationization → [M+Cs]+',
          priority: 'High',
          confidence: 'High',
          sourceRule: 'TOF-SIMS_CesiumAdduct',
          heuristicScore: 78.0,
          explanation: '選用 Cs⁺ 作為一次離子源時，注入表面的銫離子與有機分子形成特徵 [M+Cs]⁺ 加合物'
        })
      );
    }

    // Molecular Radical Cation M+.
    const mRadMass = Number((parentMass - ELECTRON_MASS).toFixed(4));
    candidates.push(
      precursorCandidate(ctx, parentAsIon(ctx, `${parentFormula}+.`, mRadMass), {
        id: 'Parent_radical_pos',
        polarity: 'Positive',
        ionType: 'M+.',
        mechanism: '表面高能碰撞直接電子游離自由基陽離子 (Direct Electron Ionization)',
        fragmentationPathway: 'Surface Direct Electron Emission → M+.',
        priority: 'Medium',
        confidence: 'High',
        sourceRule: 'TOF-SIMS_DirectIonization',
        heuristicScore: Math.max(30, 58 + Math.round(regime.intactMolecularModifier * 0.4)),
        explanation: '表面高能碰撞級聯引發外層電子直接脫除，形成奇數電子分子離子'
      })
    );
  }

  // [M-H]- (Negative Secondary Ion with genuine deprotonated graph structure)
  if (regime.enableNegative) {
    const deprotParent = deriveDeprotonatedIon(mol, RDKit, 300, 240);
    if (deprotParent) {
      const negBoost = regime.primaryIonClass === 'reactive_cs' ? 10 : 0;
      const mhNegScore = Math.min(
        98,
        Math.max(35, (fg.negativePathEnabled ? 94 : 52) + regime.intactMolecularModifier + negBoost)
      );
      candidates.push(
        precursorCandidate(ctx, deprotParent, {
          id: 'Parent_H_neg',
          polarity: 'Negative',
          ionType: '[M-H]-',
          mechanism: `陰離子裂解分支：${deprotParent.siteDescription}`,
          fragmentationPathway: 'Surface Deprotonation → [M-H]-',
          pathwayStatus: deprotParent.isGraphVerifiedIon ? 'Verified Graph Product' : 'Candidate',
          priority: fg.negativePathEnabled ? 'High' : 'Medium',
          confidence: 'High',
          sourceRule: 'TOF-SIMS_Deprotonation',
          heuristicScore: mhNegScore,
          explanation: `母分子脫去一顆質子 H⁺ 形成真實共軛鹼離子式 ${deprotParent.formula} (${deprotParent.smiles})`
        })
      );
    }
  }

  // ============================================================================
  // 2. Characteristic Functional-Group Diagnostic Ions (with REAL Charged Ion SMILES!)
  // ============================================================================
  if (regime.enablePositive) {
    // Phenyl cation: [C6H5]+ -> c1cc[c+]cc1 (77.0386 Da)
    if (fg.hasAromaticRing && regime.enableDeepAromaticCracking) {
      const phenylIon = buildVerifiedIonFromSmiles('c1cc[c+]cc1', RDKit);
      if (phenylIon) {
        const mb = verifyFragmentMassBalance(
          parentStoich.atomCounts,
          parentMass,
          { C: 6, H: 5 },
          phenylIon.neutralExactMass
        );
        const structId = 'Diag_C6H5_pos';
        if (!seenStructureKeys.has(phenylIon.canonicalSmiles)) {
          seenStructureKeys.add(phenylIon.canonicalSmiles);
          structures.push({
            id: structId,
            name: '苯基陽離子 (Phenyl Cation, [C₆H₅]⁺)',
            formula: phenylIon.formula,
            neutralFormula: phenylIon.neutralFormula,
            smiles: phenylIon.smiles,
            canonicalSmiles: phenylIon.canonicalSmiles,
            exact_mass: phenylIon.ionExactMass,
            neutralExactMass: phenylIon.neutralExactMass,
            ionExactMass: phenylIon.ionExactMass,
            mz: phenylIon.mz,
            charge: 1,
            ionType: '[C6H5]+',
            image: phenylIon.image,
            relative_intensity: 85.0,
            heuristicScore: 85.0,
            priority: 'High',
            confidence: 'High',
            mode: 'Positive',
            mechanism: '芳香環取代基表面碰撞斷裂形成苯基陽離子 c1cc[c+]cc1',
            fragmentationPathway: 'Aromatic Substituent Cleavage → [C6H5]+',
            pathwayStatus: 'Verified Graph Product',
            neutralLoss: mb.neutralLossFormula,
            neutralLossMass: mb.neutralLossMass,
            massBalanceVerified: mb.verified
          });
        }
        candidates.push({
          id: structId,
          technique: 'TOF-SIMS',
          polarity: 'Positive',
          precursorMz: parentMass,
          mz: phenylIon.mz,
          formula: phenylIon.formula,
          neutralFormula: phenylIon.neutralFormula,
          smiles: phenylIon.smiles,
          canonicalSmiles: phenylIon.canonicalSmiles,
          exactMass: phenylIon.ionExactMass,
          neutralExactMass: phenylIon.neutralExactMass,
          ionExactMass: phenylIon.ionExactMass,
          charge: 1,
          ionType: '[C6H5]+',
          mechanism: '芳香環特徵診斷二次陽離子 (Phenyl Cation, c1cc[c+]cc1)',
          fragmentationPathway: 'Aromatic Ring Cleavage → [C6H5]+',
          pathwayStatus: 'Verified Graph Product',
          neutralLoss: mb.neutralLossFormula,
          neutralLossMass: mb.neutralLossMass,
          massBalanceError: mb.deltaMass,
          massBalanceVerified: mb.verified,
          parentStructureId: structId,
          priority: 'High',
          confidence: 'High',
          sourceRule: 'TOF-SIMS_AromaticDiagnostic',
          heuristicScore: Math.min(95, 84 + regime.smallFragmentModifier),
          image: phenylIon.image,
          explanation: '芳香環結構在表面轟擊時的指標性正離子特徵峰 (m/z 77.0386)，結構為帶正電之 c1cc[c+]cc1',
          parameterContext
        });
      }
    }

    // Tropylium cation: [C7H7]+ -> [cH+]1cccccc1 (91.0542 Da)
    if (fg.hasBenzylicPosition) {
      const tropyliumIon = buildVerifiedIonFromSmiles('[cH+]1cccccc1', RDKit);
      if (tropyliumIon) {
        const mb = verifyFragmentMassBalance(
          parentStoich.atomCounts,
          parentMass,
          { C: 7, H: 7 },
          tropyliumIon.neutralExactMass
        );
        const structId = 'Diag_C7H7_pos';
        if (!seenStructureKeys.has(tropyliumIon.canonicalSmiles)) {
          seenStructureKeys.add(tropyliumIon.canonicalSmiles);
          structures.push({
            id: structId,
            name: '七芳鎓陽離子 (Tropylium Cation, [C₇H₇]⁺)',
            formula: tropyliumIon.formula,
            neutralFormula: tropyliumIon.neutralFormula,
            smiles: tropyliumIon.smiles,
            canonicalSmiles: tropyliumIon.canonicalSmiles,
            exact_mass: tropyliumIon.ionExactMass,
            neutralExactMass: tropyliumIon.neutralExactMass,
            ionExactMass: tropyliumIon.ionExactMass,
            mz: tropyliumIon.mz,
            charge: 1,
            ionType: '[C7H7]+',
            image: tropyliumIon.image,
            relative_intensity: 92.0,
            heuristicScore: 92.0,
            priority: 'High',
            confidence: 'High',
            mode: 'Positive',
            mechanism: '苄位斷裂並擴環重排形成芳香穩定七元環 Tropylium 鎓陽離子 ([cH+]1cccccc1)',
            fragmentationPathway: 'Benzylic Cleavage & Ring Expansion → [C7H7]+',
            pathwayStatus: 'Verified Graph Product',
            neutralLoss: mb.neutralLossFormula,
            neutralLossMass: mb.neutralLossMass,
            massBalanceVerified: mb.verified
          });
        }
        candidates.push({
          id: structId,
          technique: 'TOF-SIMS',
          polarity: 'Positive',
          precursorMz: parentMass,
          mz: tropyliumIon.mz,
          formula: tropyliumIon.formula,
          neutralFormula: tropyliumIon.neutralFormula,
          smiles: tropyliumIon.smiles,
          canonicalSmiles: tropyliumIon.canonicalSmiles,
          exactMass: tropyliumIon.ionExactMass,
          neutralExactMass: tropyliumIon.neutralExactMass,
          ionExactMass: tropyliumIon.ionExactMass,
          charge: 1,
          ionType: '[C7H7]+',
          mechanism: '苄基斷裂擴環重排：七元環芳香共振穩定 Tropylium 鎓陽離子 ([cH+]1cccccc1)',
          fragmentationPathway: 'Benzylic Cleavage & Ring Expansion → [C7H7]+',
          pathwayStatus: 'Verified Graph Product',
          neutralLoss: mb.neutralLossFormula,
          neutralLossMass: mb.neutralLossMass,
          massBalanceError: mb.deltaMass,
          massBalanceVerified: mb.verified,
          parentStructureId: structId,
          priority: 'High',
          confidence: 'High',
          sourceRule: 'TOF-SIMS_Tropylium',
          heuristicScore: Math.min(96, 90 + Math.round(regime.smallFragmentModifier * 0.5)),
          image: tropyliumIon.image,
          explanation: '苄基碳發生斷裂並擴環為 6π 芳香穩定的七元環 Tropylium 陽離子 [cH+]1cccccc1 (m/z 91.0542)',
          parameterContext
        });
      }
    }

    // Acetylium cation: [CH3CO]+ -> C[C+]=O (43.0178 Da)
    if (fg.hasAcetate || fg.hasKetone) {
      const acetyliumIon = buildVerifiedIonFromSmiles('C[C+]=O', RDKit);
      if (acetyliumIon) {
        const mb = verifyFragmentMassBalance(
          parentStoich.atomCounts,
          parentMass,
          { C: 2, H: 3, O: 1 },
          acetyliumIon.neutralExactMass
        );
        const structId = 'Diag_C2H3O_pos';
        if (!seenStructureKeys.has(acetyliumIon.canonicalSmiles)) {
          seenStructureKeys.add(acetyliumIon.canonicalSmiles);
          structures.push({
            id: structId,
            name: '乙醯基鎓陽離子 (Acetylium Cation, [CH₃CO]⁺)',
            formula: acetyliumIon.formula,
            neutralFormula: acetyliumIon.neutralFormula,
            smiles: acetyliumIon.smiles,
            canonicalSmiles: acetyliumIon.canonicalSmiles,
            exact_mass: acetyliumIon.ionExactMass,
            neutralExactMass: acetyliumIon.neutralExactMass,
            ionExactMass: acetyliumIon.ionExactMass,
            mz: acetyliumIon.mz,
            charge: 1,
            ionType: '[CH3CO]+',
            image: acetyliumIon.image,
            relative_intensity: 88.0,
            heuristicScore: 88.0,
            priority: 'High',
            confidence: 'High',
            mode: 'Positive',
            mechanism: '乙醯酯/甲基酮 α-醯氧鍵斷裂形成乙醯基鎓陽離子 C[C+]=O',
            fragmentationPathway: 'Acyl-Oxygen Heterolysis → [CH3CO]+',
            pathwayStatus: 'Verified Graph Product',
            neutralLoss: mb.neutralLossFormula,
            neutralLossMass: mb.neutralLossMass,
            massBalanceVerified: mb.verified
          });
        }
        candidates.push({
          id: structId,
          technique: 'TOF-SIMS',
          polarity: 'Positive',
          precursorMz: parentMass,
          mz: acetyliumIon.mz,
          formula: acetyliumIon.formula,
          neutralFormula: acetyliumIon.neutralFormula,
          smiles: acetyliumIon.smiles,
          canonicalSmiles: acetyliumIon.canonicalSmiles,
          exactMass: acetyliumIon.ionExactMass,
          neutralExactMass: acetyliumIon.neutralExactMass,
          ionExactMass: acetyliumIon.ionExactMass,
          charge: 1,
          ionType: '[CH3CO]+',
          mechanism: '乙醯基 α-裂解：共振穩定乙醯基鎓陽離子 (C[C+]=O, m/z 43.0178)',
          fragmentationPathway: 'Acyl Cleavage → [CH3CO]+',
          pathwayStatus: 'Verified Graph Product',
          neutralLoss: mb.neutralLossFormula,
          neutralLossMass: mb.neutralLossMass,
          massBalanceError: mb.deltaMass,
          massBalanceVerified: mb.verified,
          parentStructureId: structId,
          priority: 'High',
          confidence: 'High',
          sourceRule: 'TOF-SIMS_Acetylium',
          heuristicScore: Math.min(95, 86 + regime.smallFragmentModifier),
          image: acetyliumIon.image,
          explanation: '乙醯基 C-O 鍵斷裂產生帶正電之乙醯基鎓離子 C[C+]=O (C2H3O+, m/z 43.0178)',
          parameterContext
        });
      }
    }
  }

  // Negative Characteristic Ions
  if (regime.enableNegative) {
    // Acetate -> CC(=O)[O-] (59.0139 Da)
    if (fg.hasAcetate) {
      const acetateIon = buildVerifiedIonFromSmiles('CC(=O)[O-]', RDKit);
      if (acetateIon) {
        const mb = verifyFragmentMassBalance(
          parentStoich.atomCounts,
          parentMass,
          { C: 2, H: 3, O: 2 },
          acetateIon.neutralExactMass
        );
        const structId = 'Diag_Acetate_neg';
        if (!seenStructureKeys.has(acetateIon.canonicalSmiles)) {
          seenStructureKeys.add(acetateIon.canonicalSmiles);
          structures.push({
            id: structId,
            name: '乙酸根陰離子 (Acetate Anion, [CH₃COO]⁻)',
            formula: acetateIon.formula,
            neutralFormula: acetateIon.neutralFormula,
            smiles: acetateIon.smiles,
            canonicalSmiles: acetateIon.canonicalSmiles,
            exact_mass: acetateIon.ionExactMass,
            neutralExactMass: acetateIon.neutralExactMass,
            ionExactMass: acetateIon.ionExactMass,
            mz: acetateIon.mz,
            charge: -1,
            ionType: '[CH3COO]-',
            image: acetateIon.image,
            relative_intensity: 90.0,
            heuristicScore: 90.0,
            priority: 'High',
            confidence: 'High',
            mode: 'Negative',
            mechanism: '乙醯酯鍵表面異裂釋出共振穩定乙酸根陰離子 CC(=O)[O-]',
            fragmentationPathway: 'Ester Heterolysis → [CH3COO]-',
            pathwayStatus: 'Verified Graph Product',
            neutralLoss: mb.neutralLossFormula,
            neutralLossMass: mb.neutralLossMass,
            massBalanceVerified: mb.verified
          });
        }
        candidates.push({
          id: structId,
          technique: 'TOF-SIMS',
          polarity: 'Negative',
          precursorMz: parentMass,
          mz: acetateIon.mz,
          formula: acetateIon.formula,
          neutralFormula: acetateIon.neutralFormula,
          smiles: acetateIon.smiles,
          canonicalSmiles: acetateIon.canonicalSmiles,
          exactMass: acetateIon.ionExactMass,
          neutralExactMass: acetateIon.neutralExactMass,
          ionExactMass: acetateIon.ionExactMass,
          charge: -1,
          ionType: '[CH3COO]-',
          mechanism: '乙醯酯鍵表面異裂：乙酸根二次陰離子 (CC(=O)[O-], m/z 59.0139)',
          fragmentationPathway: 'Ester Heterolysis → [CH3COO]-',
          pathwayStatus: 'Verified Graph Product',
          neutralLoss: mb.neutralLossFormula,
          neutralLossMass: mb.neutralLossMass,
          massBalanceError: mb.deltaMass,
          massBalanceVerified: mb.verified,
          parentStructureId: structId,
          priority: 'High',
          confidence: 'High',
          sourceRule: 'TOF-SIMS_AcetateAnion',
          heuristicScore: 90.0,
          image: acetateIon.image,
          explanation: '乙醯氧基酯鍵異裂直接釋出共振穩定的乙酸根陰離子 CC(=O)[O-]',
          parameterContext
        });
      }
    }

    // Carboxyl -> Formate O=C[O-] (44.9982 Da)
    if (fg.hasCarboxyl) {
      const formateIon = buildVerifiedIonFromSmiles('O=C[O-]', RDKit);
      if (formateIon) {
        const mb = verifyFragmentMassBalance(
          parentStoich.atomCounts,
          parentMass,
          { C: 1, H: 1, O: 2 },
          formateIon.neutralExactMass
        );
        candidates.push({
          id: 'Diag_Formate_neg',
          technique: 'TOF-SIMS',
          polarity: 'Negative',
          precursorMz: parentMass,
          mz: formateIon.mz,
          formula: formateIon.formula,
          neutralFormula: formateIon.neutralFormula,
          smiles: formateIon.smiles,
          canonicalSmiles: formateIon.canonicalSmiles,
          exactMass: formateIon.ionExactMass,
          neutralExactMass: formateIon.neutralExactMass,
          ionExactMass: formateIon.ionExactMass,
          charge: -1,
          ionType: '[HCOO]-',
          mechanism: '羧酸微裂解產生甲酸根特徵二次陰離子 (O=C[O-], m/z 44.9982)',
          fragmentationPathway: 'Carboxyl Cleavage → [HCOO]-',
          pathwayStatus: 'Verified Graph Product',
          neutralLoss: mb.neutralLossFormula,
          neutralLossMass: mb.neutralLossMass,
          massBalanceError: mb.deltaMass,
          massBalanceVerified: mb.verified,
          priority: 'Medium',
          confidence: 'High',
          sourceRule: 'TOF-SIMS_FormateAnion',
          heuristicScore: 68.0,
          image: formateIon.image,
          explanation: '表面羧基官能基碎裂解離出的指標性小分子陰離子 O=C[O-]',
          parameterContext
        });
      }
    }

    // Halogens & Pseudohalogens
    if (fg.hasFluoro) {
      candidates.push({
        id: 'Diag_F_neg',
        technique: 'TOF-SIMS',
        polarity: 'Negative',
        mz: FLUORIDE_ANION_MZ,
        formula: 'F-',
        neutralFormula: 'F',
        smiles: '[F-]',
        canonicalSmiles: '[F-]',
        exactMass: FLUORIDE_ANION_MZ,
        neutralExactMass: FLUORINE_NEUTRAL_MASS_ROUNDED,
        ionExactMass: FLUORIDE_ANION_MZ,
        charge: -1,
        ionType: 'F-',
        mechanism: '高電負性氟陰離子直接異裂解離 (Fluoride Anion, [F-])',
        fragmentationPathway: 'C-F Heterolysis → F-',
        pathwayStatus: 'Verified Graph Product',
        massBalanceVerified: true,
        priority: 'High',
        confidence: 'High',
        sourceRule: 'TOF-SIMS_HalogenIon',
        heuristicScore: 94.0,
        parameterContext
      });
    }
    if (fg.hasChloro) {
      candidates.push(
        {
          id: 'Diag_Cl35_neg',
          technique: 'TOF-SIMS',
          polarity: 'Negative',
          mz: CL35_ANION_MZ,
          formula: '35Cl-',
          neutralFormula: 'Cl',
          smiles: '[35Cl-]',
          canonicalSmiles: '[35Cl-]',
          exactMass: CL35_ANION_MZ,
          neutralExactMass: CL35_NEUTRAL_MASS_ROUNDED,
          ionExactMass: CL35_ANION_MZ,
          charge: -1,
          ionType: '³⁵Cl⁻',
          mechanism: '高電子親和力氯陰離子表面解離 (³⁵Cl⁻，約 75.8% 天然豐度)',
          fragmentationPathway: 'C-Cl Heterolysis → ³⁵Cl⁻',
          pathwayStatus: 'Verified Graph Product',
          massBalanceVerified: true,
          priority: 'High',
          confidence: 'High',
          sourceRule: 'TOF-SIMS_HalogenIon',
          heuristicScore: 96.0,
          parameterContext
        },
        {
          id: 'Diag_Cl37_neg',
          technique: 'TOF-SIMS',
          polarity: 'Negative',
          mz: CL37_ANION_MZ,
          formula: '37Cl-',
          neutralFormula: 'Cl',
          smiles: '[37Cl-]',
          canonicalSmiles: '[37Cl-]',
          exactMass: CL37_ANION_MZ,
          neutralExactMass: CL37_NEUTRAL_MASS_ROUNDED,
          ionExactMass: CL37_ANION_MZ,
          charge: -1,
          ionType: '³⁷Cl⁻',
          mechanism: '氯天然同位素特徵陰離子 (³⁷Cl⁻，約 24.2% 天然豐度，3:1 特徵雙峰)',
          fragmentationPathway: 'C-Cl Heterolysis → ³⁷Cl⁻',
          pathwayStatus: 'Verified Graph Product',
          massBalanceVerified: true,
          priority: 'High',
          confidence: 'High',
          sourceRule: 'TOF-SIMS_HalogenIon',
          heuristicScore: 82.0,
          parameterContext
        }
      );
    }
    if (fg.hasBromo) {
      candidates.push(
        {
          id: 'Diag_Br79_neg',
          technique: 'TOF-SIMS',
          polarity: 'Negative',
          mz: BR79_ANION_MZ,
          formula: '79Br-',
          neutralFormula: 'Br',
          smiles: '[79Br-]',
          canonicalSmiles: '[79Br-]',
          exactMass: BR79_ANION_MZ,
          neutralExactMass: BR79_NEUTRAL_MASS_ROUNDED,
          ionExactMass: BR79_ANION_MZ,
          charge: -1,
          ionType: '⁷⁹Br⁻',
          mechanism: '高電子親和力溴陰離子表面解離 (⁷⁹Br⁻，約 50.7% 天然豐度)',
          fragmentationPathway: 'C-Br Heterolysis → ⁷⁹Br⁻',
          pathwayStatus: 'Verified Graph Product',
          massBalanceVerified: true,
          priority: 'High',
          confidence: 'High',
          sourceRule: 'TOF-SIMS_HalogenIon',
          heuristicScore: 95.0,
          parameterContext
        },
        {
          id: 'Diag_Br81_neg',
          technique: 'TOF-SIMS',
          polarity: 'Negative',
          mz: BR81_ANION_MZ,
          formula: '81Br-',
          neutralFormula: 'Br',
          smiles: '[81Br-]',
          canonicalSmiles: '[81Br-]',
          exactMass: BR81_ANION_MZ,
          neutralExactMass: BR81_NEUTRAL_MASS_ROUNDED,
          ionExactMass: BR81_ANION_MZ,
          charge: -1,
          ionType: '⁸¹Br⁻',
          mechanism: '溴天然同位素特徵陰離子 (⁸¹Br⁻，約 49.3% 天然豐度，1:1 特徵雙峰)',
          fragmentationPathway: 'C-Br Heterolysis → ⁸¹Br⁻',
          pathwayStatus: 'Verified Graph Product',
          massBalanceVerified: true,
          priority: 'High',
          confidence: 'High',
          sourceRule: 'TOF-SIMS_HalogenIon',
          heuristicScore: 94.0,
          parameterContext
        }
      );
    }
    if (fg.hasNitro) {
      candidates.push({
        id: 'Diag_NO2_neg',
        technique: 'TOF-SIMS',
        polarity: 'Negative',
        mz: NITRITE_ANION_MZ,
        formula: 'NO2-',
        neutralFormula: 'NO2',
        smiles: 'O=[N+]([O-])[O-]',
        canonicalSmiles: '[O-]N=O',
        exactMass: NITRITE_ANION_MZ,
        neutralExactMass: NO2_NEUTRAL_MASS_ROUNDED,
        ionExactMass: NITRITE_ANION_MZ,
        charge: -1,
        ionType: 'NO₂⁻',
        mechanism: '強吸電子硝基表面異裂解離出亞硝酸根陰離子 ([O-]N=O)',
        fragmentationPathway: 'C-NO2 Cleavage → NO2-',
        pathwayStatus: 'Verified Graph Product',
        massBalanceVerified: true,
        priority: 'High',
        confidence: 'High',
        sourceRule: 'TOF-SIMS_NitroIon',
        heuristicScore: 91.0,
        parameterContext
      });
    }
    if (fg.hasCyano) {
      candidates.push({
        id: 'Diag_CN_neg',
        technique: 'TOF-SIMS',
        polarity: 'Negative',
        mz: CYANIDE_ANION_MZ,
        formula: 'CN-',
        neutralFormula: 'CN',
        smiles: '[C-]#N',
        canonicalSmiles: '[C-]#N',
        exactMass: CYANIDE_ANION_MZ,
        neutralExactMass: CN_NEUTRAL_MASS_ROUNDED,
        ionExactMass: CYANIDE_ANION_MZ,
        charge: -1,
        ionType: 'CN⁻',
        mechanism: '擬鹵素氰基表面解離出氰根陰離子 ([C-]#N)',
        fragmentationPathway: 'C-CN Cleavage → CN-',
        pathwayStatus: 'Verified Graph Product',
        massBalanceVerified: true,
        priority: 'High',
        confidence: 'High',
        sourceRule: 'TOF-SIMS_CyanoIon',
        heuristicScore: 92.0,
        parameterContext
      });
    }
  }

  // ============================================================================
  // 3. Genuine Neutral Losses from Graph Reaction Engine
  // ============================================================================
  const neutralLosses = generateValidNeutralLosses(mol, RDKit, fg);
  for (const nl of neutralLosses) {
    const structId = `NL_${nl.lossType}_${structures.length}`;

    if (!seenStructureKeys.has(nl.residualSmiles)) {
      seenStructureKeys.add(nl.residualSmiles);
      structures.push({
        id: structId,
        name: `重排/中性脫除產物 (${nl.name})`,
        formula: nl.residualFormula,
        neutralFormula: nl.residualNeutralFormula,
        smiles: nl.residualSmiles,
        canonicalSmiles: nl.residualSmiles,
        exact_mass: nl.isChargedProduct ? nl.residualIonExactMass : nl.residualExactMass,
        neutralExactMass: nl.residualExactMass,
        ionExactMass: nl.residualIonExactMass,
        mz: nl.residualMz,
        charge: nl.charge,
        image: nl.residualImage,
        relative_intensity: nl.priority === 'High' ? 78.0 : 58.0,
        heuristicScore: nl.priority === 'High' ? 78.0 : 58.0,
        priority: nl.priority,
        confidence: nl.confidence,
        mode: nl.isChargedProduct ? 'Positive' : fg.negativePathEnabled ? 'Both' : 'Positive',
        mechanism: nl.mechanism,
        fragmentationPathway: `Graph Reaction (-${nl.neutralFormula})`,
        pathwayStatus: nl.pathwayStatus,
        neutralLoss: nl.neutralFormula,
        neutralLossMass: nl.neutralExactMass,
        massBalanceVerified: nl.massBalanceVerified
      });
    }

    if (nl.isChargedProduct) {
      // Already a genuine charged ion (e.g., acylium [M+H-H2O]+ or salicyloyl [M+H-C2H4O2]+)
      if (regime.enablePositive) {
        candidates.push({
          id: `${structId}_ion_pos`,
          technique: 'TOF-SIMS',
          polarity: 'Positive',
          precursorMz: parentMass + PROTON_MASS_LEGACY_ROUNDED,
          mz: nl.residualMz,
          formula: nl.residualFormula,
          neutralFormula: nl.residualNeutralFormula,
          smiles: nl.residualSmiles,
          canonicalSmiles: nl.residualSmiles,
          exactMass: nl.residualIonExactMass,
          neutralExactMass: nl.residualExactMass,
          ionExactMass: nl.residualIonExactMass,
          charge: nl.charge || 1,
          ionType: `[M+H-${nl.neutralFormula}]+`,
          mechanism: nl.mechanism,
          fragmentationPathway: `[M+H]+ → -${nl.neutralFormula} → ${nl.residualFormula}`,
          pathwayStatus: nl.pathwayStatus,
          neutralLoss: nl.neutralFormula,
          neutralLossMass: nl.neutralExactMass,
          massBalanceError: nl.massBalanceError,
          massBalanceVerified: nl.massBalanceVerified,
          parentStructureId: structId,
          priority: nl.priority,
          confidence: nl.confidence,
          sourceRule: 'TOF-SIMS_GraphReaction_Pos',
          heuristicScore: nl.priority === 'High' ? 84.0 : 65.0,
          image: nl.residualImage,
          explanation: `由 RDKit 分子圖反應直接生成帶正電之 ${nl.residualFormula} (${nl.residualSmiles})，脫去中性 ${nl.neutralFormula}`,
          parameterContext
        });
      }
    } else {
      // Neutral graph product -> derive protonated [M-NL+H]+ and deprotonated [M-NL-H]-
      if (regime.enablePositive) {
        const protNl = deriveProtonatedIon(nl.residualMol, RDKit);
        candidates.push({
          id: `${structId}_pos`,
          technique: 'TOF-SIMS',
          polarity: 'Positive',
          precursorMz: parentMass + PROTON_MASS_LEGACY_ROUNDED,
          mz: protNl.mz,
          formula: protNl.formula,
          neutralFormula: protNl.neutralFormula,
          smiles: protNl.smiles,
          canonicalSmiles: protNl.canonicalSmiles,
          exactMass: nl.residualExactMass,
          neutralExactMass: nl.residualExactMass,
          ionExactMass: protNl.ionExactMass,
          charge: 1,
          ionType: `[M-${nl.neutralFormula}+H]+`,
          mechanism: `${nl.mechanism}；${protNl.siteDescription}`,
          fragmentationPathway: `M → -${nl.neutralFormula} (+H+) → ${protNl.formula}`,
          pathwayStatus: nl.pathwayStatus,
          neutralLoss: nl.neutralFormula,
          neutralLossMass: nl.neutralExactMass,
          massBalanceError: nl.massBalanceError,
          massBalanceVerified: nl.massBalanceVerified,
          parentStructureId: structId,
          priority: nl.priority,
          confidence: nl.confidence,
          sourceRule: 'TOF-SIMS_NeutralLoss_Pos',
          heuristicScore: nl.priority === 'High' ? 80.0 : 62.0,
          image: protNl.image,
          explanation: `母分子於表面發生 ${nl.name} 並質子化形成 ${protNl.formula}`,
          parameterContext
        });
      }

      if (regime.enableNegative && fg.negativePathEnabled) {
        const deprotNl = deriveDeprotonatedIon(nl.residualMol, RDKit);
        if (deprotNl) {
          candidates.push({
            id: `${structId}_neg`,
            technique: 'TOF-SIMS',
            polarity: 'Negative',
            precursorMz: parentMass - PROTON_MASS_LEGACY_ROUNDED,
            mz: deprotNl.mz,
            formula: deprotNl.formula,
            neutralFormula: deprotNl.neutralFormula,
            smiles: deprotNl.smiles,
            canonicalSmiles: deprotNl.canonicalSmiles,
            exactMass: nl.residualExactMass,
            neutralExactMass: nl.residualExactMass,
            ionExactMass: deprotNl.ionExactMass,
            charge: -1,
            ionType: `[M-${nl.neutralFormula}-H]-`,
            mechanism: `陰離子裂解分支：${nl.name} 後去質子化 (${deprotNl.siteDescription})`,
            fragmentationPathway: `[M-H]- → -${nl.neutralFormula} → ${deprotNl.formula}`,
            pathwayStatus: nl.pathwayStatus,
            neutralLoss: nl.neutralFormula,
            neutralLossMass: nl.neutralExactMass,
            massBalanceError: nl.massBalanceError,
            massBalanceVerified: nl.massBalanceVerified,
            parentStructureId: structId,
            priority: nl.priority,
            confidence: nl.confidence,
            sourceRule: 'TOF-SIMS_NeutralLoss_Neg',
            heuristicScore: nl.priority === 'High' ? 85.0 : 65.0,
            image: deprotNl.image,
            explanation: `陰離子模式下誘發 ${nl.name} 形成共軛鹼負離子 ${deprotNl.formula} (${deprotNl.smiles})`,
            parameterContext
          });
        }
      }
    }
  }

  // ============================================================================
  // 4. Exocyclic Single-Bond Cleavages (Heterolytic & Homolytic)
  // ============================================================================
  const cleavedFragments = generateSingleBondFragments(mol, RDKit);
  let fragCount = 1;

  for (const frag of cleavedFragments) {
    // In giant cluster gentle sputtering (C60+ / Ar Cluster), suppress unactivated C-C bond shattering
    if (regime.primaryIonClass === 'giant_cluster' && !frag.isLabileHeteroatomBond) {
      continue;
    }

    const fragId = `Frag_${fragCount}`;
    const fragStoich = analyzeRDKitMolStoichiometry(frag.mol, false);
    const mb = verifyFragmentMassBalance(
      parentStoich.atomCounts,
      parentMass,
      fragStoich.atomCounts,
      frag.exactMass
    );

    const massFraction = parentMass > 0 ? frag.exactMass / parentMass : 0.5;
    const isMajor = frag.isLabileHeteroatomBond || (massFraction > 0.25 && massFraction < 0.85);
    const priority: 'High' | 'Medium' | 'Low' = isMajor ? 'High' : 'Medium';
    const confidence: 'High' | 'Medium' | 'Low' = 'High';
    const baseScore = Math.max(
      30,
      Math.min(88, 48 + massFraction * 32 + (frag.isLabileHeteroatomBond ? 8 : 0))
    );

    if (!seenStructureKeys.has(frag.smiles)) {
      seenStructureKeys.add(frag.smiles);
      structures.push({
        id: fragId,
        name: `碎片 ${fragCount} (${frag.bondDescription.split(' ')[0]})`,
        formula: frag.formula,
        neutralFormula: frag.formula,
        smiles: frag.smiles,
        canonicalSmiles: frag.smiles,
        exact_mass: frag.exactMass,
        neutralExactMass: frag.exactMass,
        ionExactMass: frag.exactMass,
        mz: frag.exactMass,
        charge: 0,
        image: frag.image,
        relative_intensity: Number(baseScore.toFixed(1)),
        heuristicScore: Number(baseScore.toFixed(1)),
        priority,
        confidence,
        mode: fg.negativePathEnabled ? 'Both' : 'Positive',
        mechanism: `TOF-SIMS ${frag.bondDescription}`,
        fragmentationPathway: frag.bondDescription,
        pathwayStatus: 'Verified Graph Product',
        neutralLoss: mb.neutralLossFormula,
        neutralLossMass: mb.neutralLossMass,
        massBalanceVerified: mb.verified
      });
    }

    // 4a. Direct Heterolytic Cation (e.g. Acylium R-[C+]=O or Carbocation R+) if available
    if (regime.enablePositive && frag.directCationMol && frag.directCationMz) {
      const catStoich = analyzeRDKitMolStoichiometry(frag.directCationMol, false);
      const catMb = verifyFragmentMassBalance(
        parentStoich.atomCounts,
        parentMass,
        catStoich.atomCounts,
        catStoich.neutralExactMass
      );
      candidates.push({
        id: `${fragId}_pos_direct`,
        technique: 'TOF-SIMS',
        polarity: 'Positive',
        precursorMz: parentMass,
        mz: catStoich.mz,
        formula: catStoich.ionicFormula,
        neutralFormula: catStoich.neutralFormula,
        smiles: frag.directCationSmiles || frag.smiles,
        canonicalSmiles: frag.directCationSmiles || frag.smiles,
        exactMass: catStoich.neutralExactMass,
        neutralExactMass: catStoich.neutralExactMass,
        ionExactMass: catStoich.ionExactMass,
        charge: 1,
        ionType: `[${catStoich.neutralFormula}]+`,
        mechanism: `${frag.bondDescription}：直接異裂陽離子 (${frag.directCationSmiles})`,
        fragmentationPathway: `Direct Heterolytic Cleavage → ${catStoich.ionicFormula}`,
        pathwayStatus: 'Verified Graph Product',
        neutralLoss: catMb.neutralLossFormula,
        neutralLossMass: catMb.neutralLossMass,
        massBalanceError: catMb.deltaMass,
        massBalanceVerified: catMb.verified,
        parentStructureId: fragId,
        priority,
        confidence: 'High',
        sourceRule: 'TOF-SIMS_DirectHeterolyticCation',
        heuristicScore: Number(Math.min(92, baseScore + 4).toFixed(1)),
        image: frag.directCationImage || frag.image,
        explanation: `單鍵直接異裂保留正電荷於碳中心，形成 ${catStoich.ionicFormula} (${frag.directCationSmiles})`,
        parameterContext
      });
    }

    // 4b. Protonated H-transfer fragment [Frag+H]+
    if (regime.enablePositive) {
      const protFrag = deriveProtonatedIon(frag.mol, RDKit);
      candidates.push({
        id: `${fragId}_pos_H`,
        technique: 'TOF-SIMS',
        polarity: 'Positive',
        precursorMz: parentMass + PROTON_MASS_LEGACY_ROUNDED,
        mz: protFrag.mz,
        formula: protFrag.formula,
        neutralFormula: protFrag.neutralFormula,
        smiles: protFrag.smiles,
        canonicalSmiles: protFrag.canonicalSmiles,
        exactMass: frag.exactMass,
        neutralExactMass: frag.exactMass,
        ionExactMass: protFrag.ionExactMass,
        charge: 1,
        ionType: '[Frag+H]+',
        mechanism: `${frag.bondDescription} 伴隨表面質子轉移 (${protFrag.siteDescription})`,
        fragmentationPathway: `Bond Cleavage + H-Transfer → ${protFrag.formula}`,
        pathwayStatus: 'Verified Graph Product',
        neutralLoss: mb.neutralLossFormula,
        neutralLossMass: mb.neutralLossMass,
        massBalanceError: mb.deltaMass,
        massBalanceVerified: mb.verified,
        parentStructureId: fragId,
        priority,
        confidence,
        sourceRule: 'TOF-SIMS_SingleBondCleavage_H',
        heuristicScore: Number(baseScore.toFixed(1)),
        image: protFrag.image,
        explanation: `單鍵斷裂產物於表面獲得質子形成二次陽離子 ${protFrag.formula}`,
        parameterContext
      });
    }

    // 4c. Homolytic Radical Cation [Frag]+. (Enabled only when regime allows homolytic radicals)
    if (regime.enablePositive && regime.enableHomolyticRadicals) {
      const radMz = Number((frag.exactMass - ELECTRON_MASS).toFixed(4));
      candidates.push({
        id: `${fragId}_pos_rad`,
        technique: 'TOF-SIMS',
        polarity: 'Positive',
        precursorMz: parentMass,
        mz: radMz,
        formula: `${frag.formula}+.`,
        neutralFormula: frag.formula,
        smiles: frag.smiles,
        canonicalSmiles: frag.smiles,
        exactMass: frag.exactMass,
        neutralExactMass: frag.exactMass,
        ionExactMass: radMz,
        charge: 1,
        ionType: '[Frag]+.',
        mechanism: `${frag.bondDescription}：表面均裂自由基二次陽離子 (Homolytic Cleavage)`,
        fragmentationPathway: `Homolytic Cleavage → ${frag.formula}+.`,
        pathwayStatus: 'Verified Graph Product',
        neutralLoss: mb.neutralLossFormula,
        neutralLossMass: mb.neutralLossMass,
        massBalanceError: mb.deltaMass,
        massBalanceVerified: mb.verified,
        parentStructureId: fragId,
        priority: 'Medium',
        confidence: 'Medium',
        sourceRule: 'TOF-SIMS_HomolyticCleavage',
        heuristicScore: Number((baseScore * 0.72).toFixed(1)),
        image: frag.image,
        explanation: '高能碰撞級聯下單鍵均裂產生的奇數電子游離基碎片離子',
        parameterContext
      });
    }

    // 4d. Negative Deprotonated Fragment [Frag-H]-
    if (regime.enableNegative && fg.negativePathEnabled) {
      const deprotFrag = deriveDeprotonatedIon(frag.mol, RDKit);
      if (deprotFrag) {
        candidates.push({
          id: `${fragId}_neg`,
          technique: 'TOF-SIMS',
          polarity: 'Negative',
          precursorMz: parentMass - PROTON_MASS_LEGACY_ROUNDED,
          mz: deprotFrag.mz,
          formula: deprotFrag.formula,
          neutralFormula: deprotFrag.neutralFormula,
          smiles: deprotFrag.smiles,
          canonicalSmiles: deprotFrag.canonicalSmiles,
          exactMass: frag.exactMass,
          neutralExactMass: frag.exactMass,
          ionExactMass: deprotFrag.ionExactMass,
          charge: -1,
          ionType: '[Frag-H]-',
          mechanism: `陰離子裂解分支：${frag.bondDescription} 去質子化 (${deprotFrag.siteDescription})`,
          fragmentationPathway: `Negative Cleavage → ${deprotFrag.formula}`,
          pathwayStatus: deprotFrag.isGraphVerifiedIon ? 'Verified Graph Product' : 'Candidate',
          neutralLoss: mb.neutralLossFormula,
          neutralLossMass: mb.neutralLossMass,
          massBalanceError: mb.deltaMass,
          massBalanceVerified: mb.verified,
          parentStructureId: fragId,
          priority,
          confidence,
          sourceRule: 'TOF-SIMS_NegativeFragment',
          heuristicScore: Number((baseScore * 0.9).toFixed(1)),
          image: deprotFrag.image,
          explanation: `陰離子發射模式下碎片去質子化產物 ${deprotFrag.formula} (${deprotFrag.smiles})`,
          parameterContext
        });
      }
    }

    fragCount++;
  }

  // ============================================================================
  // 5. Isotope Signatures
  // ============================================================================
  const isotopes = generateIsotopeCandidates(
    parentFormula,
    parentMass,
    config.polarity || 'Both',
    fg
  );
  for (const iso of isotopes) {
    if (iso.mode === 'Positive' && !regime.enablePositive) continue;
    if (iso.mode === 'Negative' && !regime.enableNegative) continue;
    candidates.push({
      id: `Iso_${iso.formula}`,
      technique: 'TOF-SIMS',
      polarity: iso.mode,
      precursorMz: parentMass,
      mz: iso.mz,
      formula: iso.formula,
      neutralFormula: parentFormula,
      smiles: parentSmiles,
      canonicalSmiles: parentSmiles,
      exactMass: parentMass,
      neutralExactMass: parentMass,
      ionExactMass: iso.mz,
      charge: iso.mode === 'Negative' ? -1 : 1,
      ionType: iso.adduct,
      mechanism: iso.mechanism,
      fragmentationPathway: 'Natural Isotope Abundance Pattern (M+2)',
      pathwayStatus: 'Verified Graph Product',
      massBalanceVerified: true,
      parentStructureId: 'Parent',
      priority: iso.priority,
      confidence: iso.confidence,
      sourceRule: 'IsotopeSignature',
      heuristicScore: iso.relative_intensity,
      image: parentImg,
      explanation: iso.mechanism,
      parameterContext
    });
  }

  const finalCandidates = deduplicateAndRankCandidates(candidates);
  const signals = buildSignals(finalCandidates, {
    precursorType: '准分子離子 (Precursor/Adduct)',
    fragmentTypePrefix: '碎片訊號'
  });

  return {
    candidates: finalCandidates,
    structures,
    signals,
    parameterContext,
    activeRegimeDescription: regime.regimeSummary
  };
}
