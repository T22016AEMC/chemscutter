// TOF-SIMS 平台碎裂引擎。
// 來源：legacy tofSimsFragmentation.ts。階段 1c 照原樣搬移；階段 1e 起，與其他平台相同的流程改用 ./shared/ 的共用函式，
// 本檔只保留 TOF-SIMS 特有的觸發條件、分數、precursorMz 與說明文字。
// 標有 LEGACY-QUIRK(Qxx) 的地方是刻意保留的舊版不一致行為，修正時搜尋該標記即可找到全部位置。
import type { SimulationConfig, FragmentCandidate, StructureItem, SignalItem } from '../types';
import type { JSMol, RDKitModule } from '../rdkit/types';
import type { FunctionalGroupInfo } from '../rules/functionalGroups';
import { generateValidNeutralLosses } from '../rules/neutralLosses';
import { deduplicateAndRankCandidates } from '../scoring/deduplicate';
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
import { evaluateTofSimsRegime } from '../platform/parameterRegime';
import {
  addStructureOnce,
  buildParentContext,
  buildParentStructure,
  createPlatformOutput,
  type PlatformContext,
  verifyAgainstParent
} from './shared/context';
import { addDiagnosticIon } from './shared/diagnosticIons';
import { addIsotopeSignals } from './shared/isotopeSignals';
import {
  chargedResidualCandidate,
  neutralLossStructId,
  neutralLossStructure,
  residualIonCandidate
} from './shared/neutralLossProducts';
import {
  analyzeDirectCation,
  directCationCandidate,
  forEachSingleBondFragment,
  fragmentAsRadicalIon,
  fragmentIonCandidate,
  fragmentStructure
} from './shared/singleBondProducts';
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
  const { parentSmiles, parentFormula, parentMass } = parent;

  const regime = evaluateTofSimsRegime(config, fg);
  const primaryIon = config.primaryIon || 'Generic';
  const energyStr = config.primaryIonEnergy ? `${config.primaryIonEnergy} keV` : '25 keV';
  const modeStr = config.simulationMode || 'General';
  const parameterContext =
    config.primaryIon && config.primaryIon !== 'Generic'
      ? `TOF-SIMS, ${primaryIon} (${energyStr}), Polarity: ${config.polarity || 'Both'}, Mode: ${modeStr}`
      : 'Primary ion 未指定，使用通用 TOF-SIMS fragmentation model (General)';

  const out = createPlatformOutput();
  const { candidates, structures } = out;
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
  // LEGACY-QUIRK(Q19): 診斷離子的 precursorMz 使用中性母分子質量 parentMass，而非前驅離子的 m/z
  const diagnosticPrecursorMz = parentMass;

  if (regime.enablePositive) {
    // Phenyl cation: [C6H5]+ -> c1cc[c+]cc1 (77.0386 Da)
    if (fg.hasAromaticRing && regime.enableDeepAromaticCracking) {
      const phenylIon = buildVerifiedIonFromSmiles('c1cc[c+]cc1', RDKit);
      if (phenylIon) {
        const mb = verifyAgainstParent(ctx, { C: 6, H: 5 }, phenylIon.neutralExactMass);
        addDiagnosticIon(out, ctx, phenylIon, mb, {
          id: 'Diag_C6H5_pos',
          polarity: 'Positive',
          ionType: '[C6H5]+',
          precursorMz: diagnosticPrecursorMz,
          structure: {
            name: '苯基陽離子 (Phenyl Cation, [C₆H₅]⁺)',
            mechanism: '芳香環取代基表面碰撞斷裂形成苯基陽離子 c1cc[c+]cc1',
            fragmentationPathway: 'Aromatic Substituent Cleavage → [C6H5]+',
            priority: 'High',
            score: 85.0
          },
          candidate: {
            mechanism: '芳香環特徵診斷二次陽離子 (Phenyl Cation, c1cc[c+]cc1)',
            fragmentationPathway: 'Aromatic Ring Cleavage → [C6H5]+',
            priority: 'High',
            sourceRule: 'TOF-SIMS_AromaticDiagnostic',
            heuristicScore: Math.min(95, 84 + regime.smallFragmentModifier),
            explanation: '芳香環結構在表面轟擊時的指標性正離子特徵峰 (m/z 77.0386)，結構為帶正電之 c1cc[c+]cc1'
          }
        });
      }
    }

    // Tropylium cation: [C7H7]+ -> [cH+]1cccccc1 (91.0542 Da)
    if (fg.hasBenzylicPosition) {
      const tropyliumIon = buildVerifiedIonFromSmiles('[cH+]1cccccc1', RDKit);
      if (tropyliumIon) {
        const mb = verifyAgainstParent(ctx, { C: 7, H: 7 }, tropyliumIon.neutralExactMass);
        addDiagnosticIon(out, ctx, tropyliumIon, mb, {
          id: 'Diag_C7H7_pos',
          polarity: 'Positive',
          ionType: '[C7H7]+',
          precursorMz: diagnosticPrecursorMz,
          structure: {
            name: '七芳鎓陽離子 (Tropylium Cation, [C₇H₇]⁺)',
            mechanism: '苄位斷裂並擴環重排形成芳香穩定七元環 Tropylium 鎓陽離子 ([cH+]1cccccc1)',
            fragmentationPathway: 'Benzylic Cleavage & Ring Expansion → [C7H7]+',
            priority: 'High',
            score: 92.0
          },
          candidate: {
            mechanism: '苄基斷裂擴環重排：七元環芳香共振穩定 Tropylium 鎓陽離子 ([cH+]1cccccc1)',
            fragmentationPathway: 'Benzylic Cleavage & Ring Expansion → [C7H7]+',
            priority: 'High',
            sourceRule: 'TOF-SIMS_Tropylium',
            heuristicScore: Math.min(96, 90 + Math.round(regime.smallFragmentModifier * 0.5)),
            explanation: '苄基碳發生斷裂並擴環為 6π 芳香穩定的七元環 Tropylium 陽離子 [cH+]1cccccc1 (m/z 91.0542)'
          }
        });
      }
    }

    // Acetylium cation: [CH3CO]+ -> C[C+]=O (43.0178 Da)
    if (fg.hasAcetylGroup) {
      const acetyliumIon = buildVerifiedIonFromSmiles('C[C+]=O', RDKit);
      if (acetyliumIon) {
        const mb = verifyAgainstParent(ctx, { C: 2, H: 3, O: 1 }, acetyliumIon.neutralExactMass);
        addDiagnosticIon(out, ctx, acetyliumIon, mb, {
          id: 'Diag_C2H3O_pos',
          polarity: 'Positive',
          ionType: '[CH3CO]+',
          precursorMz: diagnosticPrecursorMz,
          structure: {
            name: '乙醯基鎓陽離子 (Acetylium Cation, [CH₃CO]⁺)',
            mechanism: '乙醯酯/甲基酮 α-醯氧鍵斷裂形成乙醯基鎓陽離子 C[C+]=O',
            fragmentationPathway: 'Acyl-Oxygen Heterolysis → [CH3CO]+',
            priority: 'High',
            score: 88.0
          },
          candidate: {
            mechanism: '乙醯基 α-裂解：共振穩定乙醯基鎓陽離子 (C[C+]=O, m/z 43.0178)',
            fragmentationPathway: 'Acyl Cleavage → [CH3CO]+',
            priority: 'High',
            sourceRule: 'TOF-SIMS_Acetylium',
            heuristicScore: Math.min(95, 86 + regime.smallFragmentModifier),
            explanation: '乙醯基 C-O 鍵斷裂產生帶正電之乙醯基鎓離子 C[C+]=O (C2H3O+, m/z 43.0178)'
          }
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
        const mb = verifyAgainstParent(ctx, { C: 2, H: 3, O: 2 }, acetateIon.neutralExactMass);
        addDiagnosticIon(out, ctx, acetateIon, mb, {
          id: 'Diag_Acetate_neg',
          polarity: 'Negative',
          ionType: '[CH3COO]-',
          precursorMz: diagnosticPrecursorMz,
          structure: {
            name: '乙酸根陰離子 (Acetate Anion, [CH₃COO]⁻)',
            mechanism: '乙醯酯鍵表面異裂釋出共振穩定乙酸根陰離子 CC(=O)[O-]',
            fragmentationPathway: 'Ester Heterolysis → [CH3COO]-',
            priority: 'High',
            score: 90.0
          },
          candidate: {
            mechanism: '乙醯酯鍵表面異裂：乙酸根二次陰離子 (CC(=O)[O-], m/z 59.0139)',
            fragmentationPathway: 'Ester Heterolysis → [CH3COO]-',
            priority: 'High',
            sourceRule: 'TOF-SIMS_AcetateAnion',
            heuristicScore: 90.0,
            explanation: '乙醯氧基酯鍵異裂直接釋出共振穩定的乙酸根陰離子 CC(=O)[O-]'
          }
        });
      }
    }

    // Carboxyl -> Formate O=C[O-] (44.9982 Da)（舊版只建立 candidate，不加入 structures）
    if (fg.hasCarboxyl) {
      const formateIon = buildVerifiedIonFromSmiles('O=C[O-]', RDKit);
      if (formateIon) {
        const mb = verifyAgainstParent(ctx, { C: 1, H: 1, O: 2 }, formateIon.neutralExactMass);
        addDiagnosticIon(out, ctx, formateIon, mb, {
          id: 'Diag_Formate_neg',
          polarity: 'Negative',
          ionType: '[HCOO]-',
          precursorMz: diagnosticPrecursorMz,
          candidate: {
            mechanism: '羧酸微裂解產生甲酸根特徵二次陰離子 (O=C[O-], m/z 44.9982)',
            fragmentationPathway: 'Carboxyl Cleavage → [HCOO]-',
            priority: 'Medium',
            sourceRule: 'TOF-SIMS_FormateAnion',
            heuristicScore: 68.0,
            explanation: '表面羧基官能基碎裂解離出的指標性小分子陰離子 O=C[O-]'
          }
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
    const structId = neutralLossStructId(out, 'NL_', nl);

    addStructureOnce(
      out,
      nl.residualSmiles,
      neutralLossStructure(nl, structId, {
        name: `重排/中性脫除產物 (${nl.name})`,
        score: nl.priority === 'High' ? 78.0 : 58.0,
        // LEGACY-QUIRK(Q24): 中性產物只看分子是否有負離子路徑，不看使用者設定的極性
        mode: nl.isChargedProduct ? 'Positive' : fg.negativePathEnabled ? 'Both' : 'Positive',
        fragmentationPathway: `Graph Reaction (-${nl.neutralFormula})`
      })
    );

    if (nl.isChargedProduct) {
      // Already a genuine charged ion (e.g., acylium [M+H-H2O]+ or salicyloyl [M+H-C2H4O2]+)
      if (regime.enablePositive) {
        candidates.push(
          chargedResidualCandidate(ctx, nl, structId, {
            // LEGACY-QUIRK(Q29): id 後綴為 _ion_pos（LC-MS/MS 為 _pos_ion、GC-MS 為 _ion）
            idSuffix: '_ion_pos',
            // LEGACY-QUIRK(Q19): parentMass + 1.007276，未四捨五入（LC-MS/MS 有四捨五入）
            precursorMz: parentMass + PROTON_MASS_LEGACY_ROUNDED,
            charge: nl.charge || 1,
            ionType: `[M+H-${nl.neutralFormula}]+`,
            mechanism: nl.mechanism,
            fragmentationPathway: `[M+H]+ → -${nl.neutralFormula} → ${nl.residualFormula}`,
            priority: nl.priority,
            sourceRule: 'TOF-SIMS_GraphReaction_Pos',
            heuristicScore: nl.priority === 'High' ? 84.0 : 65.0,
            explanation: `由 RDKit 分子圖反應直接生成帶正電之 ${nl.residualFormula} (${nl.residualSmiles})，脫去中性 ${nl.neutralFormula}`
          })
        );
      }
    } else {
      // Neutral graph product -> derive protonated [M-NL+H]+ and deprotonated [M-NL-H]-
      if (regime.enablePositive) {
        const protNl = deriveProtonatedIon(nl.residualMol, RDKit);
        candidates.push(
          residualIonCandidate(ctx, nl, structId, protNl, {
            idSuffix: '_pos',
            polarity: 'Positive',
            // LEGACY-QUIRK(Q19): parentMass + 1.007276，未四捨五入（LC-MS/MS 有四捨五入）
            precursorMz: parentMass + PROTON_MASS_LEGACY_ROUNDED,
            ionType: `[M-${nl.neutralFormula}+H]+`,
            mechanism: `${nl.mechanism}；${protNl.siteDescription}`,
            fragmentationPathway: `M → -${nl.neutralFormula} (+H+) → ${protNl.formula}`,
            pathwayStatus: nl.pathwayStatus,
            priority: nl.priority,
            sourceRule: 'TOF-SIMS_NeutralLoss_Pos',
            heuristicScore: nl.priority === 'High' ? 80.0 : 62.0,
            explanation: `母分子於表面發生 ${nl.name} 並質子化形成 ${protNl.formula}`
          })
        );
      }

      if (regime.enableNegative && fg.negativePathEnabled) {
        const deprotNl = deriveDeprotonatedIon(nl.residualMol, RDKit);
        if (deprotNl) {
          candidates.push(
            residualIonCandidate(ctx, nl, structId, deprotNl, {
              idSuffix: '_neg',
              polarity: 'Negative',
              // LEGACY-QUIRK(Q19): parentMass - 1.007276，未四捨五入（LC-MS/MS 有四捨五入）
              precursorMz: parentMass - PROTON_MASS_LEGACY_ROUNDED,
              ionType: `[M-${nl.neutralFormula}-H]-`,
              mechanism: `陰離子裂解分支：${nl.name} 後去質子化 (${deprotNl.siteDescription})`,
              fragmentationPathway: `[M-H]- → -${nl.neutralFormula} → ${deprotNl.formula}`,
              // LEGACY-QUIRK(Q9): 沿用中性產物的 pathwayStatus；去質子化退回中性結構時仍標示為 Verified（LC-MS/MS 依 isGraphVerifiedIon）
              pathwayStatus: nl.pathwayStatus,
              priority: nl.priority,
              sourceRule: 'TOF-SIMS_NeutralLoss_Neg',
              heuristicScore: nl.priority === 'High' ? 85.0 : 65.0,
              explanation: `陰離子模式下誘發 ${nl.name} 形成共軛鹼負離子 ${deprotNl.formula} (${deprotNl.smiles})`
            })
          );
        }
      }
    }
  }

  // ============================================================================
  // 4. Exocyclic Single-Bond Cleavages (Heterolytic & Homolytic)
  // ============================================================================
  forEachSingleBondFragment(
    ctx,
    mol,
    RDKit,
    {
      idPrefix: 'Frag_',
      // In giant cluster gentle sputtering (C60+ / Ar Cluster), suppress unactivated C-C bond shattering
      skip: (frag) => regime.primaryIonClass === 'giant_cluster' && !frag.isLabileHeteroatomBond
    },
    (visit) => {
      const { frag, counter } = visit;
      const massFraction = parentMass > 0 ? frag.exactMass / parentMass : 0.5;
      const isMajor = frag.isLabileHeteroatomBond || (massFraction > 0.25 && massFraction < 0.85);
      const priority: 'High' | 'Medium' | 'Low' = isMajor ? 'High' : 'Medium';
      const confidence: 'High' | 'Medium' | 'Low' = 'High';
      const baseScore = Math.max(
        30,
        Math.min(88, 48 + massFraction * 32 + (frag.isLabileHeteroatomBond ? 8 : 0))
      );

      addStructureOnce(
        out,
        frag.smiles,
        fragmentStructure(visit, {
          name: `碎片 ${counter} (${frag.bondDescription.split(' ')[0]})`,
          score: Number(baseScore.toFixed(1)),
          priority,
          // LEGACY-QUIRK(Q24): 只看分子是否有負離子路徑，不看使用者設定的極性
          mode: fg.negativePathEnabled ? 'Both' : 'Positive',
          mechanism: `TOF-SIMS ${frag.bondDescription}`
        })
      );

      // 4a. Direct Heterolytic Cation (e.g. Acylium R-[C+]=O or Carbocation R+) if available
      if (regime.enablePositive && frag.directCationMol && frag.directCationMz) {
        const cat = analyzeDirectCation(ctx, frag.directCationMol);
        candidates.push(
          directCationCandidate(ctx, visit, cat, {
            idSuffix: '_pos_direct',
            // LEGACY-QUIRK(Q19): precursorMz 使用中性母分子質量 parentMass
            precursorMz: parentMass,
            mechanism: `${frag.bondDescription}：直接異裂陽離子 (${frag.directCationSmiles})`,
            fragmentationPathway: `Direct Heterolytic Cleavage → ${cat.stoich.ionicFormula}`,
            neutralLoss: cat.mb.neutralLossFormula,
            priority,
            sourceRule: 'TOF-SIMS_DirectHeterolyticCation',
            heuristicScore: Number(Math.min(92, baseScore + 4).toFixed(1)),
            explanation: `單鍵直接異裂保留正電荷於碳中心，形成 ${cat.stoich.ionicFormula} (${frag.directCationSmiles})`
          })
        );
      }

      // 4b. Protonated H-transfer fragment [Frag+H]+
      if (regime.enablePositive) {
        const protFrag = deriveProtonatedIon(frag.mol, RDKit);
        candidates.push(
          fragmentIonCandidate(ctx, visit, protFrag, {
            idSuffix: '_pos_H',
            polarity: 'Positive',
            ionType: '[Frag+H]+',
            // LEGACY-QUIRK(Q19): parentMass + 1.007276，未四捨五入（LC-MS/MS 有四捨五入）
            precursorMz: parentMass + PROTON_MASS_LEGACY_ROUNDED,
            mechanism: `${frag.bondDescription} 伴隨表面質子轉移 (${protFrag.siteDescription})`,
            fragmentationPathway: `Bond Cleavage + H-Transfer → ${protFrag.formula}`,
            priority,
            confidence,
            sourceRule: 'TOF-SIMS_SingleBondCleavage_H',
            heuristicScore: Number(baseScore.toFixed(1)),
            explanation: `單鍵斷裂產物於表面獲得質子形成二次陽離子 ${protFrag.formula}`
          })
        );
      }

      // 4c. Homolytic Radical Cation [Frag]+. (Enabled only when regime allows homolytic radicals)
      if (regime.enablePositive && regime.enableHomolyticRadicals) {
        // LEGACY-QUIRK(Q3): 離子式以字串接 "+."、m/z 以中性質量減電子質量計算；碎片本身帶形式電荷時兩者皆錯（如 C6H6NO++.）
        const radMz = Number((frag.exactMass - ELECTRON_MASS).toFixed(4));
        candidates.push(
          fragmentIonCandidate(ctx, visit, fragmentAsRadicalIon(frag, `${frag.formula}+.`, radMz), {
            idSuffix: '_pos_rad',
            polarity: 'Positive',
            ionType: '[Frag]+.',
            precursorMz: parentMass,
            mechanism: `${frag.bondDescription}：表面均裂自由基二次陽離子 (Homolytic Cleavage)`,
            fragmentationPathway: `Homolytic Cleavage → ${frag.formula}+.`,
            priority: 'Medium',
            confidence: 'Medium',
            sourceRule: 'TOF-SIMS_HomolyticCleavage',
            heuristicScore: Number((baseScore * 0.72).toFixed(1)),
            explanation: '高能碰撞級聯下單鍵均裂產生的奇數電子游離基碎片離子'
          })
        );
      }

      // 4d. Negative Deprotonated Fragment [Frag-H]-
      if (regime.enableNegative && fg.negativePathEnabled) {
        const deprotFrag = deriveDeprotonatedIon(frag.mol, RDKit);
        if (deprotFrag) {
          candidates.push(
            fragmentIonCandidate(ctx, visit, deprotFrag, {
              idSuffix: '_neg',
              polarity: 'Negative',
              ionType: '[Frag-H]-',
              // LEGACY-QUIRK(Q19): parentMass - 1.007276，未四捨五入（LC-MS/MS 有四捨五入）
              precursorMz: parentMass - PROTON_MASS_LEGACY_ROUNDED,
              mechanism: `陰離子裂解分支：${frag.bondDescription} 去質子化 (${deprotFrag.siteDescription})`,
              fragmentationPathway: `Negative Cleavage → ${deprotFrag.formula}`,
              pathwayStatus: deprotFrag.isGraphVerifiedIon ? 'Verified Graph Product' : 'Candidate',
              priority,
              // LEGACY-QUIRK(Q26): [Frag-H]- 的 confidence 為 High（LC-MS/MS 為 Medium）
              confidence,
              sourceRule: 'TOF-SIMS_NegativeFragment',
              heuristicScore: Number((baseScore * 0.9).toFixed(1)),
              explanation: `陰離子發射模式下碎片去質子化產物 ${deprotFrag.formula} (${deprotFrag.smiles})`
            })
          );
        }
      }
    }
  );

  // ============================================================================
  // 5. Isotope Signatures
  // ============================================================================
  addIsotopeSignals(out, ctx, fg, {
    // LEGACY-QUIRK(Q27): 未設定極性時預設 'Both'（LC-MS/MS 預設 'Positive'）；sourceRule 為 IsotopeSignature（LC-MS/MS 為 IsotopePattern）
    mode: config.polarity || 'Both',
    enabled: { positive: regime.enablePositive, negative: regime.enableNegative },
    idPrefix: 'Iso_',
    sourceRule: 'IsotopeSignature'
  });

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
