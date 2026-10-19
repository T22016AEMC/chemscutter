// LC-MS/MS 平台碎裂引擎。
// 來源：legacy lcMsMsFragmentation.ts（照原樣搬移，只改型別、import 與具名質量常數）
import type { SimulationConfig, FragmentCandidate, StructureItem, SignalItem, SweepResultItem } from '../types';
import type { JSMol, RDKitModule } from '../rdkit/types';
import type { FunctionalGroupInfo } from '../rules/functionalGroups';
import { generateSingleBondFragments } from '../rules/singleBondCleavage';
import { molToSvgDataUri } from '../chem/depiction';
import { generateValidNeutralLosses } from '../rules/neutralLosses';
import { executeGraphReactions } from '../rules/graphReactions';
import { generateIsotopeCandidates } from '../chem/isotopes';
import { deduplicateAndRankCandidates } from '../scoring/deduplicate';
import { analyzeRDKitMolStoichiometry } from '../chem/stoichiometry';
import {
  deriveProtonatedIon,
  deriveDeprotonatedIon,
  deriveAdductIon,
  buildVerifiedIonFromSmiles
} from '../chem/ionDerivation';
import { PROTON_MASS_LEGACY_ROUNDED } from '../constants/masses';
import { verifyFragmentMassBalance } from '../chem/massBalance';
import { evaluateLcMsMsRegime } from '../platform/parameterRegime';
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
  forEachSingleBondFragment,
  fragmentIonCandidate,
  fragmentStructure
} from './shared/singleBondProducts';
import { buildParameterSweep } from './shared/parameterSweep';
import { precursorCandidate } from './shared/precursorIons';
import { buildSignals } from './shared/signals';

export interface LcMsMsRunResult {
  candidates: FragmentCandidate[];
  structures: StructureItem[];
  signals: SignalItem[];
  parameterContext: string;
  activeRegimeDescription: string;
  sweepResults?: SweepResultItem[];
}

export function runLcMsMsFragmentation(
  mol: JSMol,
  RDKit: RDKitModule,
  config: SimulationConfig,
  fg: FunctionalGroupInfo
): LcMsMsRunResult {
  const parent = buildParentContext(mol);
  const { parentSmiles, parentStoich, parentFormula, parentMass, parentImg } = parent;

  const regime = evaluateLcMsMsRegime(config, fg);
  const { ionization, analyzer, fragmentationMethod: fragMethod, collisionEnergy: ce } = regime;
  const isAutoOrGeneral = config.simulationMode === 'General' || (!config.ionization && !config.analyzer);

  const parameterContext = isAutoOrGeneral
    ? `LC-MS/MS Generic, ${analyzer}, ${fragMethod}, CE ${ce} eV (General)`
    : `LC-MS/MS, ${ionization}, ${analyzer}, ${fragMethod}, CE ${ce} eV (Instrument-aware)`;

  const out = createPlatformOutput();
  const { candidates, structures, seenStructureKeys } = out;
  const ctx: PlatformContext = { ...parent, technique: 'LC-MS/MS', parameterContext };

  // Add Parent Molecule
  addStructureOnce(
    out,
    parentSmiles,
    buildParentStructure(parent, {
      name: '母分子前驅物 (Precursor Molecule)',
      mode: regime.enableNegative && regime.enablePositive ? 'Both' : regime.enableNegative ? 'Negative' : 'Positive',
      mechanism: regime.regimeSummary,
      fragmentationPathway: 'Precursor Selection (MS1)'
    })
  );

  const isLowCE = regime.ceRegime === 'low_ce';
  const isHighCE = regime.ceRegime === 'high_ce';
  const lowMassCutoffMz = regime.isIonTrap ? Number((parentMass * regime.lowMassCutoffRatio).toFixed(2)) : 0;

  // ============================================================================
  // 1. Precursor Ions & Adducts (Governed by ESI vs APCI & Functional Groups)
  // ============================================================================
  if (regime.enablePositive) {
    const hasBase = fg.hasPrimaryAmine || fg.hasSecondaryAmine || fg.hasTertiaryAmine || fg.hasAmide;
    const protParent = deriveProtonatedIon(mol, RDKit, 300, 240);
    // At high CE, precursor ion survival drops significantly
    const precursorSurvivalScore = isLowCE ? 98.0 : isHighCE ? 42.0 : hasBase ? 92.0 : 80.0;

    candidates.push(
      precursorCandidate(ctx, protParent, {
        id: 'Prec_M_H_pos',
        polarity: 'Positive',
        ionType: '[M+H]+',
        mechanism: `${ionization} 正離子化：${protParent.siteDescription}`,
        fragmentationPathway: `${ionization} Protonation → [M+H]+`,
        priority: isHighCE ? 'Medium' : 'High',
        confidence: 'High',
        sourceRule: 'LCMS_Protonation',
        heuristicScore: precursorSurvivalScore,
        explanation: `軟電離過程中母分子獲得質子形成主要正前驅離子 ${protParent.formula} (m/z ${protParent.mz.toFixed(4)})`
      })
    );

    // Alkali metal & Ammonium adducts: ONLY enabled in ESI (suppressed in gas-phase APCI)
    const hasOxygenChelator = fg.hasEther || fg.hasEster || fg.hasCarbonate || fg.hasCarboxyl || fg.hasAliphaticOH;
    if (regime.enableAlkaliAdducts && (hasOxygenChelator || config.precursorAdduct === '[M+Na]+')) {
      const naParent = deriveAdductIon(mol, '[M+Na]+', 300, 240);
      candidates.push(
        precursorCandidate(ctx, naParent, {
          id: 'Prec_M_Na_pos',
          polarity: 'Positive',
          ionType: '[M+Na]+',
          mechanism: naParent.siteDescription,
          fragmentationPathway: 'ESI Sodium Adduct Formation → [M+Na]+',
          priority: hasBase ? 'Medium' : 'High',
          confidence: 'High',
          sourceRule: 'LCMS_SodiumAdduct',
          heuristicScore: hasBase ? 48.0 : 74.0,
          explanation: 'ESI 液相電噴灑中含氧官能基與微量 Na⁺ 螯合形成的非共價加合物 (APCI 下不顯著)'
        })
      );
    }

    if (
      regime.enableAlkaliAdducts &&
      (config.precursorAdduct === '[M+NH4]+' || (!hasBase && (fg.hasEster || fg.hasKetone)))
    ) {
      const nh4Parent = deriveAdductIon(mol, '[M+NH4]+', 300, 240);
      candidates.push(
        precursorCandidate(ctx, nh4Parent, {
          id: 'Prec_M_NH4_pos',
          polarity: 'Positive',
          ionType: '[M+NH4]+',
          mechanism: nh4Parent.siteDescription,
          fragmentationPathway: 'ESI Ammonium Adduct Formation → [M+NH4]+',
          priority: 'Medium',
          confidence: 'Medium',
          sourceRule: 'LCMS_AmmoniumAdduct',
          heuristicScore: 55.0,
          explanation: '流動相含乙酸銨/甲酸銨緩衝鹽時形成的銨根配位准分子離子'
        })
      );
    }
  }

  if (regime.enableNegative) {
    // 已簡化：舊版條件為 fg.hasCarboxyl || fg.hasPhenolicOH || fg.hasSulfonicAcid || fg.negativePathEnabled；
    // 前三項已包含在 negativePathEnabled 的定義中（functionalGroups.ts），因此只保留 negativePathEnabled
    if (fg.negativePathEnabled) {
      const deprotParent = deriveDeprotonatedIon(mol, RDKit, 300, 240);
      if (deprotParent) {
        const negPrecursorScore = isLowCE ? 98.0 : isHighCE ? 45.0 : 90.0;
        candidates.push(
          precursorCandidate(ctx, deprotParent, {
            id: 'Prec_M_H_neg',
            polarity: 'Negative',
            ionType: '[M-H]-',
            mechanism: `${ionization} 負離子化：${deprotParent.siteDescription}`,
            fragmentationPathway: `${ionization} Deprotonation → [M-H]-`,
            pathwayStatus: deprotParent.isGraphVerifiedIon ? 'Verified Graph Product' : 'Candidate',
            priority: isHighCE ? 'Medium' : 'High',
            confidence: 'High',
            sourceRule: 'LCMS_Deprotonation',
            heuristicScore: negPrecursorScore,
            explanation: `酸性位點解離形成真實共軛鹼前驅陰離子 ${deprotParent.formula} (${deprotParent.smiles})`
          })
        );
      }
    }

    if (
      regime.enableAlkaliAdducts &&
      (config.precursorAdduct === '[M+formate]-' || (fg.hasCarboxyl && parentMass > 80))
    ) {
      const formateAdduct = deriveAdductIon(mol, '[M+HCOO]-', 300, 240);
      candidates.push(
        precursorCandidate(ctx, formateAdduct, {
          id: 'Prec_M_Formate_neg',
          polarity: 'Negative',
          ionType: '[M+HCOO]-',
          mechanism: formateAdduct.siteDescription,
          fragmentationPathway: 'ESI Formate Adduct Formation → [M+HCOO]-',
          priority: 'Low',
          confidence: 'Medium',
          sourceRule: 'LCMS_FormateAdduct',
          heuristicScore: 44.0,
          explanation: '流動相含甲酸添加劑時形成的非共價甲酸根加合物'
        })
      );
    }
  }

  // ============================================================================
  // 2. Primary & Sequential Graph Reactions (Neutral Losses & Acylium Rearrangements)
  // ============================================================================
  const neutralLosses = generateValidNeutralLosses(mol, RDKit, fg);

  for (const nl of neutralLosses) {
    // Check if this is a multi-group concerted/sequential loss (like C2H4O2 = C2H2O + H2O)
    const isSequentialStep = nl.lossType === 'C2H4O2';
    if (isSequentialStep && !regime.enableSequentialFragmentation) {
      // At low CE (<18 eV), sequential/high-barrier elimination is suppressed
      continue;
    }

    const structId = `LCMS_NL_${nl.lossType}_${structures.length}`;
    const nlScore = isSequentialStep
      ? isHighCE
        ? 92.0
        : 82.0
      : isLowCE
      ? 88.0
      : isHighCE
      ? 54.0
      : 80.0;

    if (!seenStructureKeys.has(nl.residualSmiles)) {
      seenStructureKeys.add(nl.residualSmiles);
      structures.push({
        id: structId,
        name: `MS/MS 重排脫除產物 (${nl.name})`,
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
        relative_intensity: nlScore,
        heuristicScore: nlScore,
        priority: nl.priority,
        confidence: nl.confidence,
        mode: nl.isChargedProduct ? 'Positive' : regime.enableNegative ? 'Both' : 'Positive',
        mechanism: nl.mechanism,
        fragmentationPathway: `${fragMethod} Neutral Loss (-${nl.neutralFormula})`,
        pathwayStatus: nl.pathwayStatus,
        neutralLoss: nl.neutralFormula,
        neutralLossMass: nl.neutralExactMass,
        massBalanceVerified: nl.massBalanceVerified
      });
    }

    if (nl.isChargedProduct) {
      if (regime.enablePositive && nl.residualMz >= lowMassCutoffMz) {
        candidates.push({
          id: `${structId}_pos_ion`,
          technique: 'LC-MS/MS',
          polarity: 'Positive',
          precursorMz: Number((parentMass + PROTON_MASS_LEGACY_ROUNDED).toFixed(4)),
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
          mechanism: `${fragMethod} (${ce} eV) 碰撞誘導脫除：${nl.mechanism}`,
          fragmentationPathway: `[M+H]+ → -${nl.neutralFormula} → ${nl.residualFormula}`,
          pathwayStatus: nl.pathwayStatus,
          neutralLoss: nl.neutralFormula,
          neutralLossMass: nl.neutralExactMass,
          massBalanceError: nl.massBalanceError,
          massBalanceVerified: nl.massBalanceVerified,
          parentStructureId: structId,
          priority: nlScore >= 75 ? 'High' : 'Medium',
          confidence: nl.confidence,
          sourceRule: 'LCMS_GraphReaction_ChargedIon',
          heuristicScore: nlScore,
          image: nl.residualImage,
          explanation: `前驅離子 [M+H]⁺ 脫去中性 ${nl.neutralFormula} (${nl.neutralExactMass.toFixed(4)} Da)，生成真實陽離子結構 ${nl.residualSmiles} (${nl.residualFormula}, m/z ${nl.residualMz.toFixed(4)})`,
          parameterContext
        });
      }
    } else {
      // Neutral graph product -> Protonate for Positive mode, Deprotonate for Negative mode
      if (regime.enablePositive) {
        const protNl = deriveProtonatedIon(nl.residualMol, RDKit);
        if (protNl.mz >= lowMassCutoffMz) {
          candidates.push({
            id: `${structId}_pos`,
            technique: 'LC-MS/MS',
            polarity: 'Positive',
            precursorMz: Number((parentMass + PROTON_MASS_LEGACY_ROUNDED).toFixed(4)),
            mz: protNl.mz,
            formula: protNl.formula,
            neutralFormula: protNl.neutralFormula,
            smiles: protNl.smiles,
            canonicalSmiles: protNl.canonicalSmiles,
            exactMass: nl.residualExactMass,
            neutralExactMass: nl.residualExactMass,
            ionExactMass: protNl.ionExactMass,
            charge: 1,
            ionType: `[M+H-${nl.neutralFormula}]+`,
            mechanism: `${fragMethod} (${ce} eV) 碰撞誘導脫除：${nl.name}`,
            fragmentationPathway: `[M+H]+ → -${nl.neutralFormula} → ${protNl.formula}`,
            pathwayStatus: nl.pathwayStatus,
            neutralLoss: nl.neutralFormula,
            neutralLossMass: nl.neutralExactMass,
            massBalanceError: nl.massBalanceError,
            massBalanceVerified: nl.massBalanceVerified,
            parentStructureId: structId,
            priority: nlScore >= 75 ? 'High' : nl.priority,
            confidence: nl.confidence,
            sourceRule: 'LCMS_CID_NeutralLoss_Pos',
            heuristicScore: nlScore,
            image: protNl.image,
            explanation: `前驅離子 [M+H]⁺ 在碰撞室中脫去中性 ${nl.neutralFormula} (${nl.neutralExactMass.toFixed(4)} Da) 生成 ${protNl.formula}`,
            parameterContext
          });
        }
      }

      if (regime.enableNegative && (fg.negativePathEnabled || nl.lossType === 'CO2' || nl.lossType === 'C2H2O')) {
        const deprotNl = deriveDeprotonatedIon(nl.residualMol, RDKit);
        if (deprotNl && deprotNl.mz >= lowMassCutoffMz) {
          candidates.push({
            id: `${structId}_neg`,
            technique: 'LC-MS/MS',
            polarity: 'Negative',
            precursorMz: Number((parentMass - PROTON_MASS_LEGACY_ROUNDED).toFixed(4)),
            mz: deprotNl.mz,
            formula: deprotNl.formula,
            neutralFormula: deprotNl.neutralFormula,
            smiles: deprotNl.smiles,
            canonicalSmiles: deprotNl.canonicalSmiles,
            exactMass: nl.residualExactMass,
            neutralExactMass: nl.residualExactMass,
            ionExactMass: deprotNl.ionExactMass,
            charge: -1,
            ionType: `[M-H-${nl.neutralFormula}]-`,
            mechanism: `${fragMethod} (${ce} eV) 負離子碰撞誘導脫除：${nl.name} (${deprotNl.siteDescription})`,
            fragmentationPathway: `[M-H]- → -${nl.neutralFormula} → ${deprotNl.formula}`,
            pathwayStatus: deprotNl.isGraphVerifiedIon ? 'Verified Graph Product' : 'Candidate',
            neutralLoss: nl.neutralFormula,
            neutralLossMass: nl.neutralExactMass,
            massBalanceError: nl.massBalanceError,
            massBalanceVerified: nl.massBalanceVerified,
            parentStructureId: structId,
            priority: 'High',
            confidence: nl.confidence,
            sourceRule: 'LCMS_CID_NeutralLoss_Neg',
            heuristicScore: Math.min(95, nlScore + 5),
            image: deprotNl.image,
            explanation: `去質子化前驅陰離子 [M-H]⁻ 脫去中性 ${nl.neutralFormula} 生成共軛鹼陰離子 ${deprotNl.formula} (${deprotNl.smiles}, m/z ${deprotNl.mz.toFixed(4)})`,
            parameterContext
          });
        }

        // Sequential Second-Step Loss on the residual molecule when enableSequentialFragmentation is true!
        // E.g. Aspirin [M-H]- (179) -> -C2H2O -> Salicylate [C7H5O3]- (137) -> -CO2 -> Phenolate [C6H5O]- (93.0346)!
        if (regime.enableSequentialFragmentation && nl.lossType === 'C2H2O') {
          const secondStepReactions = executeGraphReactions(nl.residualMol, RDKit);
          for (const sec of secondStepReactions) {
            if (sec.lossType === 'CO2' && !sec.isChargedProduct) {
              const deprotSec = deriveDeprotonatedIon(sec.productMol, RDKit);
              if (deprotSec && deprotSec.mz >= lowMassCutoffMz) {
                const combinedLossFormula = 'C3H2O3 (C2H2O+CO2)';
                const combinedLossMass = Number((nl.neutralExactMass + sec.neutralLossMass).toFixed(4));
                const seqStructId = `LCMS_Seq_${nl.lossType}_${sec.lossType}`;

                if (!seenStructureKeys.has(deprotSec.canonicalSmiles)) {
                  seenStructureKeys.add(deprotSec.canonicalSmiles);
                  structures.push({
                    id: seqStructId,
                    name: `二階連續裂解產物 (-${nl.neutralFormula} 再 -${sec.neutralLossFormula})`,
                    formula: deprotSec.formula,
                    neutralFormula: deprotSec.neutralFormula,
                    smiles: deprotSec.smiles,
                    canonicalSmiles: deprotSec.canonicalSmiles,
                    exact_mass: deprotSec.ionExactMass,
                    neutralExactMass: deprotSec.neutralExactMass,
                    ionExactMass: deprotSec.ionExactMass,
                    mz: deprotSec.mz,
                    charge: -1,
                    ionType: `[M-H-${nl.neutralFormula}-${sec.neutralLossFormula}]-`,
                    image: deprotSec.image,
                    relative_intensity: isHighCE ? 88.0 : 72.0,
                    heuristicScore: isHighCE ? 88.0 : 72.0,
                    priority: 'High',
                    confidence: 'High',
                    mode: 'Negative',
                    mechanism: `二階連續碎裂：先脫去 ${nl.neutralFormula} 再發生脫羧 (-${sec.neutralLossFormula}) 生成 ${deprotSec.formula}`,
                    fragmentationPathway: `[M-H]- → -${nl.neutralFormula} → -${sec.neutralLossFormula} → ${deprotSec.formula}`,
                    pathwayStatus: 'Verified Graph Product',
                    neutralLoss: combinedLossFormula,
                    neutralLossMass: combinedLossMass,
                    massBalanceVerified: true
                  });
                }

                candidates.push({
                  id: `${seqStructId}_neg`,
                  technique: 'LC-MS/MS',
                  polarity: 'Negative',
                  precursorMz: Number((parentMass - PROTON_MASS_LEGACY_ROUNDED).toFixed(4)),
                  mz: deprotSec.mz,
                  formula: deprotSec.formula,
                  neutralFormula: deprotSec.neutralFormula,
                  smiles: deprotSec.smiles,
                  canonicalSmiles: deprotSec.canonicalSmiles,
                  exactMass: deprotSec.neutralExactMass,
                  neutralExactMass: deprotSec.neutralExactMass,
                  ionExactMass: deprotSec.ionExactMass,
                  charge: -1,
                  ionType: `[M-H-${nl.neutralFormula}-${sec.neutralLossFormula}]-`,
                  mechanism: `${fragMethod} 二階連續脫除 (Sequential CID/HCD)：先脫 ${nl.neutralFormula} 再脫 ${sec.neutralLossFormula} 生成 ${deprotSec.smiles}`,
                  fragmentationPathway: `[M-H]- → -${nl.neutralFormula} → -${sec.neutralLossFormula} → ${deprotSec.formula}`,
                  pathwayStatus: 'Verified Graph Product',
                  neutralLoss: combinedLossFormula,
                  neutralLossMass: combinedLossMass,
                  massBalanceError: 0.0005,
                  massBalanceVerified: true,
                  parentStructureId: seqStructId,
                  priority: isHighCE ? 'High' : 'Medium',
                  confidence: 'High',
                  sourceRule: 'LCMS_Sequential_NL_Neg',
                  heuristicScore: isHighCE ? 88.0 : 72.0,
                  image: deprotSec.image,
                  explanation: `在中高碰撞能 (${ce} eV) 下，一階產物離子繼續脫去 ${sec.neutralLossFormula} 形成共振穩定陰離子 ${deprotSec.formula} (${deprotSec.smiles})`,
                  parameterContext
                });
              }
            }
          }
        }
      }
    }
  }

  // ============================================================================
  // 3. Low-m/z Diagnostic Carbocations (Only when regime.enableLowMzDiagnosticIons is true!)
  // ============================================================================
  if (regime.enablePositive && regime.enableLowMzDiagnosticIons) {
    // LEGACY-QUIRK(Q19): 診斷離子的 precursorMz 為 parentMass + 1.007276 並四捨五入至 4 位（TOF-SIMS／GC-MS 用中性 parentMass）
    const diagnosticPrecursorMz = Number((parentMass + PROTON_MASS_LEGACY_ROUNDED).toFixed(4));

    // LEGACY-QUIRK(Q15): 只看 hasAcetate || hasKetone，未確認分子確實含乙醯基（GC-MS 另加 hasEster 與 isElementSubset）
    if (fg.hasAcetate || fg.hasKetone) {
      const acetylium = buildVerifiedIonFromSmiles('C[C+]=O', RDKit);
      if (acetylium && acetylium.mz >= lowMassCutoffMz) {
        const mb = verifyAgainstParent(ctx, { C: 2, H: 3, O: 1 }, acetylium.neutralExactMass);
        addDiagnosticIon(out, ctx, acetylium, mb, {
          id: 'LCMS_Diag_Acetylium',
          polarity: 'Positive',
          ionType: '[CH3CO]+',
          precursorMz: diagnosticPrecursorMz,
          structure: {
            name: '乙醯基鎓診斷離子 (Acetylium Ion, [CH₃CO]⁺)',
            mechanism: `${fragMethod} 束流型碰撞裂解產生乙醯基鎓陽離子 C[C+]=O`,
            fragmentationPathway: 'Acyl-Heteroatom Cleavage → [CH3CO]+',
            priority: isHighCE ? 'High' : 'Medium',
            score: isHighCE ? 86.0 : 68.0
          },
          candidate: {
            mechanism: `${fragMethod} (${ce} eV) 醯基異裂：乙醯基鎓陽離子 (C[C+]=O, m/z 43.0178)`,
            fragmentationPathway: 'Acyl Cleavage → [CH3CO]+',
            priority: isHighCE ? 'High' : 'Medium',
            sourceRule: 'LCMS_Diagnostic_Acetylium',
            heuristicScore: isHighCE ? 86.0 : 68.0,
            explanation: '在 QTOF / Orbitrap HCD 中高碰撞能下無低質量截止限制，可清晰觀察到 m/z 43.0178 乙醯基鎓離子'
          }
        });
      }
    }

    if (fg.hasBenzylicPosition) {
      const tropylium = buildVerifiedIonFromSmiles('[cH+]1cccccc1', RDKit);
      if (tropylium && tropylium.mz >= lowMassCutoffMz) {
        const mb = verifyAgainstParent(ctx, { C: 7, H: 7 }, tropylium.neutralExactMass);
        addDiagnosticIon(out, ctx, tropylium, mb, {
          id: 'LCMS_Diag_Tropylium',
          polarity: 'Positive',
          ionType: '[C7H7]+',
          precursorMz: diagnosticPrecursorMz,
          structure: {
            name: '七芳鎓診斷離子 (Tropylium Ion, [C₇H₇]⁺)',
            mechanism: '苄位斷裂與擴環重排形成 Tropylium 鎓陽離子 ([cH+]1cccccc1)',
            fragmentationPathway: 'Benzylic Cleavage → [C7H7]+',
            priority: 'High',
            score: isHighCE ? 90.0 : 75.0
          },
          candidate: {
            mechanism: `${fragMethod} (${ce} eV) 苄基斷裂：七芳鎓陽離子 ([cH+]1cccccc1, m/z 91.0542)`,
            fragmentationPathway: 'Benzylic Cleavage → [C7H7]+',
            priority: 'High',
            sourceRule: 'LCMS_Diagnostic_Tropylium',
            heuristicScore: isHighCE ? 90.0 : 75.0,
            explanation: '含苄基結構在碰撞誘導解離下極易生成 m/z 91.0542 [C7H7]+ 特徵診斷離子'
          }
        });
      }
    }
  }

  // ============================================================================
  // 4. Charge-Directed Heterolytic Single-Bond Cleavages (Governed by CE Regime & LMCO)
  // ============================================================================
  forEachSingleBondFragment(
    ctx,
    mol,
    RDKit,
    {
      idPrefix: 'LCMS_Frag_',
      // At low CE (<18 eV), unactivated carbon-carbon bonds do NOT cleave!
      skip: (frag) => !regime.enableStrongCarbonBondCleavage && !frag.isLabileHeteroatomBond
    },
    (visit) => {
      const { frag, counter, mb } = visit;
      const massFrac = parentMass > 0 ? frag.exactMass / parentMass : 0.5;

      let priority: 'High' | 'Medium' | 'Low' = 'Medium';
      let baseScore = 58.0;

      if (isHighCE) {
        if (massFrac < 0.55) {
          priority = 'High';
          baseScore = 82.0;
        } else {
          priority = 'Low';
          baseScore = 38.0;
        }
      } else if (isLowCE) {
        if (frag.isLabileHeteroatomBond && massFrac > 0.4) {
          priority = 'High';
          baseScore = 76.0;
        } else {
          priority = 'Low';
          baseScore = 42.0;
        }
      } else {
        priority = frag.isLabileHeteroatomBond || (massFrac >= 0.25 && massFrac <= 0.8) ? 'High' : 'Medium';
        baseScore = 64.0 + massFrac * 14 + (frag.isLabileHeteroatomBond ? 6 : 0);
      }

      addStructureOnce(
        out,
        frag.smiles,
        fragmentStructure(visit, {
          name: `MS/MS 碎片 ${counter} (${frag.bondDescription.split(' ')[0]})`,
          score: Number(baseScore.toFixed(1)),
          priority,
          mode: regime.enableNegative ? 'Both' : 'Positive',
          mechanism: `${fragMethod} 碰撞誘導異裂：${frag.bondDescription}`
        })
      );

      // Positive: Protonated H-transfer product ion [Frag+H]+
      if (regime.enablePositive) {
        const protFrag = deriveProtonatedIon(frag.mol, RDKit);
        if (protFrag.mz >= lowMassCutoffMz) {
          candidates.push(
            fragmentIonCandidate(ctx, visit, protFrag, {
              idSuffix: '_pos',
              polarity: 'Positive',
              ionType: '[Frag+H]+',
              // LEGACY-QUIRK(Q19): parentMass + 1.007276 並四捨五入至 4 位（TOF-SIMS 未四捨五入）
              precursorMz: Number((parentMass + PROTON_MASS_LEGACY_ROUNDED).toFixed(4)),
              mechanism: `${fragMethod} 電荷導向異裂 (${frag.bondDescription})：${protFrag.siteDescription}`,
              fragmentationPathway: `[M+H]+ → -${mb.neutralLossFormula} → ${protFrag.formula}`,
              priority,
              confidence: 'High',
              sourceRule: 'LCMS_CID_BackboneCleavage',
              heuristicScore: Number(baseScore.toFixed(1)),
              explanation: `前驅離子移動質子 (Mobile Proton) 引發單鍵異裂，脫去中性 ${mb.neutralLossFormula} (${mb.neutralLossMass.toFixed(4)} Da)，生成 ${protFrag.formula}`
            })
          );
        }
      }

      // Negative: Deprotonated conjugate base product ion [Frag-H]-
      if (regime.enableNegative && (fg.negativePathEnabled || frag.exactMass > 55)) {
        const deprotFrag = deriveDeprotonatedIon(frag.mol, RDKit);
        if (deprotFrag && deprotFrag.mz >= lowMassCutoffMz) {
          candidates.push(
            fragmentIonCandidate(ctx, visit, deprotFrag, {
              idSuffix: '_neg',
              polarity: 'Negative',
              ionType: '[Frag-H]-',
              // LEGACY-QUIRK(Q19): parentMass - 1.007276 並四捨五入至 4 位（TOF-SIMS 未四捨五入）
              precursorMz: Number((parentMass - PROTON_MASS_LEGACY_ROUNDED).toFixed(4)),
              mechanism: `${fragMethod} 負離子骨架異裂 (${frag.bondDescription})：${deprotFrag.siteDescription}`,
              fragmentationPathway: `[M-H]- → -${mb.neutralLossFormula} → ${deprotFrag.formula}`,
              pathwayStatus: deprotFrag.isGraphVerifiedIon ? 'Verified Graph Product' : 'Candidate',
              priority,
              // LEGACY-QUIRK(Q26): [Frag-H]- 的 confidence 為 Medium（TOF-SIMS 為 High）
              confidence: 'Medium',
              sourceRule: 'LCMS_CID_NegativeCleavage',
              heuristicScore: Number((baseScore * 0.9).toFixed(1)),
              explanation: `負離子碰撞活化下脫去中性 ${mb.neutralLossFormula}，負電荷保留於共軛鹼碎片 ${deprotFrag.formula} (${deprotFrag.smiles})`
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
    // LEGACY-QUIRK(Q27): 未設定極性時預設 'Positive'（TOF-SIMS 預設 'Both'）；sourceRule 為 IsotopePattern（其他平台為 IsotopeSignature）
    mode: config.polarity || 'Positive',
    enabled: { positive: regime.enablePositive, negative: regime.enableNegative },
    idPrefix: 'LCMS_Iso_',
    sourceRule: 'IsotopePattern'
  });

  // Deduplicate and rank final candidate list
  const finalCandidates = deduplicateAndRankCandidates(candidates);

  // ============================================================================
  // 6. Parameter Sweep Support (Collision Energy Sweep: default 10, 25, 40 eV or custom range)
  // ============================================================================
  const activeSweepRange = config.collisionEnergyRange || { start: 10, end: 40, step: 15 };
  // 已簡化：舊版另有 if (activeSweepRange)；activeSweepRange 為使用者設定或上一行的預設物件，恆為真
  const { start, end, step } = activeSweepRange;
  const validStep = Math.max(1, step || 5);
  const cePoints: number[] = [];
  for (let currentCE = start; currentCE <= end; currentCE += validStep) {
    cePoints.push(currentCE);
  }

  const sweepResults: SweepResultItem[] | undefined = buildParameterSweep(finalCandidates, {
    points: cePoints,
    label: (currentCE) => `CE ${currentCE} eV`,
    regimeSummary: (currentCE) =>
      currentCE <= 15
        ? '低能區：前驅離子與一階弱鍵脫除為主'
        : currentCE >= 35
        ? '高能區：二階連續重排與小分子診斷離子為主'
        : '中能區：一階與二階產物離子並存',
    score: (c, currentCE) => {
      const massRatio = c.neutralExactMass / (parentMass || 1);
      let energyScore = c.heuristicScore || 50;

      if (currentCE <= 15) {
        if (c.ionType === '[M+H]+' || c.ionType === '[M-H]-') energyScore = 98;
        else if (c.sourceRule.includes('Sequential') || c.sourceRule.includes('Diagnostic')) energyScore = 20;
        else if (massRatio > 0.65) energyScore += 12;
        else energyScore -= 25;
      } else if (currentCE >= 35) {
        if (c.ionType === '[M+H]+' || c.ionType === '[M-H]-') energyScore = 35;
        else if (c.sourceRule.includes('Sequential') || c.sourceRule.includes('Diagnostic') || massRatio < 0.7) {
          energyScore = Math.min(96, energyScore + 22);
        }
      }
      return energyScore;
    },
    // LEGACY-QUIRK(Q28): priority 門檻為 68／42（GC-MS 為 65／40）
    priorityThresholds: { high: 68, medium: 42 }
  });

  const signals = buildSignals(finalCandidates, {
    precursorType: '准分子離子 (Precursor Adduct)',
    fragmentTypePrefix: '產物離子'
  });

  return {
    candidates: finalCandidates,
    structures,
    signals,
    parameterContext,
    activeRegimeDescription: regime.regimeSummary,
    sweepResults
  };
}
