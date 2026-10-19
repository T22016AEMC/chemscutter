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
import { addStructureOnce, buildParentContext, buildParentStructure, createPlatformOutput } from './shared/context';
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

    candidates.push({
      id: 'Prec_M_H_pos',
      technique: 'LC-MS/MS',
      polarity: 'Positive',
      precursorMz: protParent.mz,
      mz: protParent.mz,
      formula: protParent.formula,
      neutralFormula: parentFormula,
      smiles: protParent.smiles,
      canonicalSmiles: protParent.canonicalSmiles,
      exactMass: parentMass,
      neutralExactMass: parentMass,
      ionExactMass: protParent.ionExactMass,
      charge: 1,
      ionType: '[M+H]+',
      mechanism: `${ionization} 正離子化：${protParent.siteDescription}`,
      fragmentationPathway: `${ionization} Protonation → [M+H]+`,
      pathwayStatus: 'Verified Graph Product',
      massBalanceVerified: true,
      parentStructureId: 'Parent',
      priority: isHighCE ? 'Medium' : 'High',
      confidence: 'High',
      sourceRule: 'LCMS_Protonation',
      heuristicScore: precursorSurvivalScore,
      image: protParent.image,
      explanation: `軟電離過程中母分子獲得質子形成主要正前驅離子 ${protParent.formula} (m/z ${protParent.mz.toFixed(4)})`,
      parameterContext
    });

    // Alkali metal & Ammonium adducts: ONLY enabled in ESI (suppressed in gas-phase APCI)
    const hasOxygenChelator = fg.hasEther || fg.hasEster || fg.hasCarbonate || fg.hasCarboxyl || fg.hasAliphaticOH;
    if (regime.enableAlkaliAdducts && (hasOxygenChelator || config.precursorAdduct === '[M+Na]+')) {
      const naParent = deriveAdductIon(mol, '[M+Na]+', 300, 240);
      candidates.push({
        id: 'Prec_M_Na_pos',
        technique: 'LC-MS/MS',
        polarity: 'Positive',
        precursorMz: naParent.mz,
        mz: naParent.mz,
        formula: naParent.formula,
        neutralFormula: parentFormula,
        smiles: naParent.smiles,
        canonicalSmiles: naParent.canonicalSmiles,
        exactMass: parentMass,
        neutralExactMass: parentMass,
        ionExactMass: naParent.ionExactMass,
        charge: 1,
        ionType: '[M+Na]+',
        mechanism: naParent.siteDescription,
        fragmentationPathway: 'ESI Sodium Adduct Formation → [M+Na]+',
        pathwayStatus: 'Verified Graph Product',
        massBalanceVerified: true,
        parentStructureId: 'Parent',
        priority: hasBase ? 'Medium' : 'High',
        confidence: 'High',
        sourceRule: 'LCMS_SodiumAdduct',
        heuristicScore: hasBase ? 48.0 : 74.0,
        image: naParent.image,
        explanation: 'ESI 液相電噴灑中含氧官能基與微量 Na⁺ 螯合形成的非共價加合物 (APCI 下不顯著)',
        parameterContext
      });
    }

    if (
      regime.enableAlkaliAdducts &&
      (config.precursorAdduct === '[M+NH4]+' || (!hasBase && (fg.hasEster || fg.hasKetone)))
    ) {
      const nh4Parent = deriveAdductIon(mol, '[M+NH4]+', 300, 240);
      candidates.push({
        id: 'Prec_M_NH4_pos',
        technique: 'LC-MS/MS',
        polarity: 'Positive',
        precursorMz: nh4Parent.mz,
        mz: nh4Parent.mz,
        formula: nh4Parent.formula,
        neutralFormula: parentFormula,
        smiles: nh4Parent.smiles,
        canonicalSmiles: nh4Parent.canonicalSmiles,
        exactMass: parentMass,
        neutralExactMass: parentMass,
        ionExactMass: nh4Parent.ionExactMass,
        charge: 1,
        ionType: '[M+NH4]+',
        mechanism: nh4Parent.siteDescription,
        fragmentationPathway: 'ESI Ammonium Adduct Formation → [M+NH4]+',
        pathwayStatus: 'Verified Graph Product',
        massBalanceVerified: true,
        parentStructureId: 'Parent',
        priority: 'Medium',
        confidence: 'Medium',
        sourceRule: 'LCMS_AmmoniumAdduct',
        heuristicScore: 55.0,
        image: nh4Parent.image,
        explanation: '流動相含乙酸銨/甲酸銨緩衝鹽時形成的銨根配位准分子離子',
        parameterContext
      });
    }
  }

  if (regime.enableNegative) {
    if (fg.hasCarboxyl || fg.hasPhenolicOH || fg.hasSulfonicAcid || fg.negativePathEnabled) {
      const deprotParent = deriveDeprotonatedIon(mol, RDKit, 300, 240);
      if (deprotParent) {
        const negPrecursorScore = isLowCE ? 98.0 : isHighCE ? 45.0 : 90.0;
        candidates.push({
          id: 'Prec_M_H_neg',
          technique: 'LC-MS/MS',
          polarity: 'Negative',
          precursorMz: deprotParent.mz,
          mz: deprotParent.mz,
          formula: deprotParent.formula,
          neutralFormula: parentFormula,
          smiles: deprotParent.smiles,
          canonicalSmiles: deprotParent.canonicalSmiles,
          exactMass: parentMass,
          neutralExactMass: parentMass,
          ionExactMass: deprotParent.ionExactMass,
          charge: -1,
          ionType: '[M-H]-',
          mechanism: `${ionization} 負離子化：${deprotParent.siteDescription}`,
          fragmentationPathway: `${ionization} Deprotonation → [M-H]-`,
          pathwayStatus: deprotParent.isGraphVerifiedIon ? 'Verified Graph Product' : 'Candidate',
          massBalanceVerified: true,
          parentStructureId: 'Parent',
          priority: isHighCE ? 'Medium' : 'High',
          confidence: 'High',
          sourceRule: 'LCMS_Deprotonation',
          heuristicScore: negPrecursorScore,
          image: deprotParent.image,
          explanation: `酸性位點解離形成真實共軛鹼前驅陰離子 ${deprotParent.formula} (${deprotParent.smiles})`,
          parameterContext
        });
      }
    }

    if (
      regime.enableAlkaliAdducts &&
      (config.precursorAdduct === '[M+formate]-' || (fg.hasCarboxyl && parentMass > 80))
    ) {
      const formateAdduct = deriveAdductIon(mol, '[M+HCOO]-', 300, 240);
      candidates.push({
        id: 'Prec_M_Formate_neg',
        technique: 'LC-MS/MS',
        polarity: 'Negative',
        precursorMz: formateAdduct.mz,
        mz: formateAdduct.mz,
        formula: formateAdduct.formula,
        neutralFormula: parentFormula,
        smiles: formateAdduct.smiles,
        canonicalSmiles: formateAdduct.canonicalSmiles,
        exactMass: parentMass,
        neutralExactMass: parentMass,
        ionExactMass: formateAdduct.ionExactMass,
        charge: -1,
        ionType: '[M+HCOO]-',
        mechanism: formateAdduct.siteDescription,
        fragmentationPathway: 'ESI Formate Adduct Formation → [M+HCOO]-',
        pathwayStatus: 'Verified Graph Product',
        massBalanceVerified: true,
        parentStructureId: 'Parent',
        priority: 'Low',
        confidence: 'Medium',
        sourceRule: 'LCMS_FormateAdduct',
        heuristicScore: 44.0,
        image: formateAdduct.image,
        explanation: '流動相含甲酸添加劑時形成的非共價甲酸根加合物',
        parameterContext
      });
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
    if (fg.hasAcetate || fg.hasKetone) {
      const acetylium = buildVerifiedIonFromSmiles('C[C+]=O', RDKit);
      if (acetylium && acetylium.mz >= lowMassCutoffMz) {
        const mb = verifyFragmentMassBalance(
          parentStoich.atomCounts,
          parentMass,
          { C: 2, H: 3, O: 1 },
          acetylium.neutralExactMass
        );
        const structId = 'LCMS_Diag_Acetylium';
        if (!seenStructureKeys.has(acetylium.canonicalSmiles)) {
          seenStructureKeys.add(acetylium.canonicalSmiles);
          structures.push({
            id: structId,
            name: '乙醯基鎓診斷離子 (Acetylium Ion, [CH₃CO]⁺)',
            formula: acetylium.formula,
            neutralFormula: acetylium.neutralFormula,
            smiles: acetylium.smiles,
            canonicalSmiles: acetylium.canonicalSmiles,
            exact_mass: acetylium.ionExactMass,
            neutralExactMass: acetylium.neutralExactMass,
            ionExactMass: acetylium.ionExactMass,
            mz: acetylium.mz,
            charge: 1,
            ionType: '[CH3CO]+',
            image: acetylium.image,
            relative_intensity: isHighCE ? 86.0 : 68.0,
            heuristicScore: isHighCE ? 86.0 : 68.0,
            priority: isHighCE ? 'High' : 'Medium',
            confidence: 'High',
            mode: 'Positive',
            mechanism: `${fragMethod} 束流型碰撞裂解產生乙醯基鎓陽離子 C[C+]=O`,
            fragmentationPathway: 'Acyl-Heteroatom Cleavage → [CH3CO]+',
            pathwayStatus: 'Verified Graph Product',
            neutralLoss: mb.neutralLossFormula,
            neutralLossMass: mb.neutralLossMass,
            massBalanceVerified: mb.verified
          });
        }
        candidates.push({
          id: structId,
          technique: 'LC-MS/MS',
          polarity: 'Positive',
          precursorMz: Number((parentMass + PROTON_MASS_LEGACY_ROUNDED).toFixed(4)),
          mz: acetylium.mz,
          formula: acetylium.formula,
          neutralFormula: acetylium.neutralFormula,
          smiles: acetylium.smiles,
          canonicalSmiles: acetylium.canonicalSmiles,
          exactMass: acetylium.ionExactMass,
          neutralExactMass: acetylium.neutralExactMass,
          ionExactMass: acetylium.ionExactMass,
          charge: 1,
          ionType: '[CH3CO]+',
          mechanism: `${fragMethod} (${ce} eV) 醯基異裂：乙醯基鎓陽離子 (C[C+]=O, m/z 43.0178)`,
          fragmentationPathway: 'Acyl Cleavage → [CH3CO]+',
          pathwayStatus: 'Verified Graph Product',
          neutralLoss: mb.neutralLossFormula,
          neutralLossMass: mb.neutralLossMass,
          massBalanceError: mb.deltaMass,
          massBalanceVerified: mb.verified,
          parentStructureId: structId,
          priority: isHighCE ? 'High' : 'Medium',
          confidence: 'High',
          sourceRule: 'LCMS_Diagnostic_Acetylium',
          heuristicScore: isHighCE ? 86.0 : 68.0,
          image: acetylium.image,
          explanation: '在 QTOF / Orbitrap HCD 中高碰撞能下無低質量截止限制，可清晰觀察到 m/z 43.0178 乙醯基鎓離子',
          parameterContext
        });
      }
    }

    if (fg.hasBenzylicPosition) {
      const tropylium = buildVerifiedIonFromSmiles('[cH+]1cccccc1', RDKit);
      if (tropylium && tropylium.mz >= lowMassCutoffMz) {
        const mb = verifyFragmentMassBalance(
          parentStoich.atomCounts,
          parentMass,
          { C: 7, H: 7 },
          tropylium.neutralExactMass
        );
        const structId = 'LCMS_Diag_Tropylium';
        if (!seenStructureKeys.has(tropylium.canonicalSmiles)) {
          seenStructureKeys.add(tropylium.canonicalSmiles);
          structures.push({
            id: structId,
            name: '七芳鎓診斷離子 (Tropylium Ion, [C₇H₇]⁺)',
            formula: tropylium.formula,
            neutralFormula: tropylium.neutralFormula,
            smiles: tropylium.smiles,
            canonicalSmiles: tropylium.canonicalSmiles,
            exact_mass: tropylium.ionExactMass,
            neutralExactMass: tropylium.neutralExactMass,
            ionExactMass: tropylium.ionExactMass,
            mz: tropylium.mz,
            charge: 1,
            ionType: '[C7H7]+',
            image: tropylium.image,
            relative_intensity: isHighCE ? 90.0 : 75.0,
            heuristicScore: isHighCE ? 90.0 : 75.0,
            priority: 'High',
            confidence: 'High',
            mode: 'Positive',
            mechanism: '苄位斷裂與擴環重排形成 Tropylium 鎓陽離子 ([cH+]1cccccc1)',
            fragmentationPathway: 'Benzylic Cleavage → [C7H7]+',
            pathwayStatus: 'Verified Graph Product',
            neutralLoss: mb.neutralLossFormula,
            neutralLossMass: mb.neutralLossMass,
            massBalanceVerified: mb.verified
          });
        }
        candidates.push({
          id: structId,
          technique: 'LC-MS/MS',
          polarity: 'Positive',
          precursorMz: Number((parentMass + PROTON_MASS_LEGACY_ROUNDED).toFixed(4)),
          mz: tropylium.mz,
          formula: tropylium.formula,
          neutralFormula: tropylium.neutralFormula,
          smiles: tropylium.smiles,
          canonicalSmiles: tropylium.canonicalSmiles,
          exactMass: tropylium.ionExactMass,
          neutralExactMass: tropylium.neutralExactMass,
          ionExactMass: tropylium.ionExactMass,
          charge: 1,
          ionType: '[C7H7]+',
          mechanism: `${fragMethod} (${ce} eV) 苄基斷裂：七芳鎓陽離子 ([cH+]1cccccc1, m/z 91.0542)`,
          fragmentationPathway: 'Benzylic Cleavage → [C7H7]+',
          pathwayStatus: 'Verified Graph Product',
          neutralLoss: mb.neutralLossFormula,
          neutralLossMass: mb.neutralLossMass,
          massBalanceError: mb.deltaMass,
          massBalanceVerified: mb.verified,
          parentStructureId: structId,
          priority: 'High',
          confidence: 'High',
          sourceRule: 'LCMS_Diagnostic_Tropylium',
          heuristicScore: isHighCE ? 90.0 : 75.0,
          image: tropylium.image,
          explanation: '含苄基結構在碰撞誘導解離下極易生成 m/z 91.0542 [C7H7]+ 特徵診斷離子',
          parameterContext
        });
      }
    }
  }

  // ============================================================================
  // 4. Charge-Directed Heterolytic Single-Bond Cleavages (Governed by CE Regime & LMCO)
  // ============================================================================
  const singleBondFragments = generateSingleBondFragments(mol, RDKit);
  let fragCounter = 1;

  for (const frag of singleBondFragments) {
    // At low CE (<18 eV), unactivated carbon-carbon bonds do NOT cleave!
    if (!regime.enableStrongCarbonBondCleavage && !frag.isLabileHeteroatomBond) {
      continue;
    }

    const fragId = `LCMS_Frag_${fragCounter}`;
    const fragStoich = analyzeRDKitMolStoichiometry(frag.mol, false);
    const mb = verifyFragmentMassBalance(
      parentStoich.atomCounts,
      parentMass,
      fragStoich.atomCounts,
      frag.exactMass
    );

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

    if (!seenStructureKeys.has(frag.smiles)) {
      seenStructureKeys.add(frag.smiles);
      structures.push({
        id: fragId,
        name: `MS/MS 碎片 ${fragCounter} (${frag.bondDescription.split(' ')[0]})`,
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
        confidence: 'High',
        mode: regime.enableNegative ? 'Both' : 'Positive',
        mechanism: `${fragMethod} 碰撞誘導異裂：${frag.bondDescription}`,
        fragmentationPathway: frag.bondDescription,
        pathwayStatus: 'Verified Graph Product',
        neutralLoss: mb.neutralLossFormula,
        neutralLossMass: mb.neutralLossMass,
        massBalanceVerified: mb.verified
      });
    }

    // Positive: Protonated H-transfer product ion [Frag+H]+
    if (regime.enablePositive) {
      const protFrag = deriveProtonatedIon(frag.mol, RDKit);
      if (protFrag.mz >= lowMassCutoffMz) {
        candidates.push({
          id: `${fragId}_pos`,
          technique: 'LC-MS/MS',
          polarity: 'Positive',
          precursorMz: Number((parentMass + PROTON_MASS_LEGACY_ROUNDED).toFixed(4)),
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
          mechanism: `${fragMethod} 電荷導向異裂 (${frag.bondDescription})：${protFrag.siteDescription}`,
          fragmentationPathway: `[M+H]+ → -${mb.neutralLossFormula} → ${protFrag.formula}`,
          pathwayStatus: 'Verified Graph Product',
          neutralLoss: mb.neutralLossFormula,
          neutralLossMass: mb.neutralLossMass,
          massBalanceError: mb.deltaMass,
          massBalanceVerified: mb.verified,
          parentStructureId: fragId,
          priority,
          confidence: 'High',
          sourceRule: 'LCMS_CID_BackboneCleavage',
          heuristicScore: Number(baseScore.toFixed(1)),
          image: protFrag.image,
          explanation: `前驅離子移動質子 (Mobile Proton) 引發單鍵異裂，脫去中性 ${mb.neutralLossFormula} (${mb.neutralLossMass.toFixed(4)} Da)，生成 ${protFrag.formula}`,
          parameterContext
        });
      }
    }

    // Negative: Deprotonated conjugate base product ion [Frag-H]-
    if (regime.enableNegative && (fg.negativePathEnabled || frag.exactMass > 55)) {
      const deprotFrag = deriveDeprotonatedIon(frag.mol, RDKit);
      if (deprotFrag && deprotFrag.mz >= lowMassCutoffMz) {
        candidates.push({
          id: `${fragId}_neg`,
          technique: 'LC-MS/MS',
          polarity: 'Negative',
          precursorMz: Number((parentMass - PROTON_MASS_LEGACY_ROUNDED).toFixed(4)),
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
          mechanism: `${fragMethod} 負離子骨架異裂 (${frag.bondDescription})：${deprotFrag.siteDescription}`,
          fragmentationPathway: `[M-H]- → -${mb.neutralLossFormula} → ${deprotFrag.formula}`,
          pathwayStatus: deprotFrag.isGraphVerifiedIon ? 'Verified Graph Product' : 'Candidate',
          neutralLoss: mb.neutralLossFormula,
          neutralLossMass: mb.neutralLossMass,
          massBalanceError: mb.deltaMass,
          massBalanceVerified: mb.verified,
          parentStructureId: fragId,
          priority,
          confidence: 'Medium',
          sourceRule: 'LCMS_CID_NegativeCleavage',
          heuristicScore: Number((baseScore * 0.9).toFixed(1)),
          image: deprotFrag.image,
          explanation: `負離子碰撞活化下脫去中性 ${mb.neutralLossFormula}，負電荷保留於共軛鹼碎片 ${deprotFrag.formula} (${deprotFrag.smiles})`,
          parameterContext
        });
      }
    }

    fragCounter++;
  }

  // ============================================================================
  // 5. Isotope Signatures
  // ============================================================================
  const isotopes = generateIsotopeCandidates(
    parentFormula,
    parentMass,
    config.polarity || 'Positive',
    fg
  );
  for (const iso of isotopes) {
    if (iso.mode === 'Positive' && !regime.enablePositive) continue;
    if (iso.mode === 'Negative' && !regime.enableNegative) continue;
    candidates.push({
      id: `LCMS_Iso_${iso.formula}`,
      technique: 'LC-MS/MS',
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
      sourceRule: 'IsotopePattern',
      heuristicScore: iso.relative_intensity,
      image: parentImg,
      explanation: iso.mechanism,
      parameterContext
    });
  }

  // Deduplicate and rank final candidate list
  const finalCandidates = deduplicateAndRankCandidates(candidates);

  // ============================================================================
  // 6. Parameter Sweep Support (Collision Energy Sweep: default 10, 25, 40 eV or custom range)
  // ============================================================================
  const activeSweepRange = config.collisionEnergyRange || { start: 10, end: 40, step: 15 };
  let sweepResults: SweepResultItem[] | undefined;
  if (activeSweepRange) {
    const { start, end, step } = activeSweepRange;
    const sweepList: SweepResultItem[] = [];
    const validStep = Math.max(1, step || 5);

    for (let currentCE = start; currentCE <= end; currentCE += validStep) {
      const topList = finalCandidates
        .filter((c) => !c.ionType.includes('³⁷Cl') && !c.ionType.includes('⁸¹Br'))
        .map((c) => {
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

          let likelihood: 'Dominant' | 'Prominent' | 'Trace' | 'Unfavored' = 'Prominent';
          if (energyScore >= 80) likelihood = 'Dominant';
          else if (energyScore >= 55) likelihood = 'Prominent';
          else if (energyScore >= 35) likelihood = 'Trace';
          else likelihood = 'Unfavored';

          return {
            id: c.id,
            ionType: c.ionType,
            formula: c.formula,
            mz: c.mz,
            priority: (energyScore > 68 ? 'High' : energyScore > 42 ? 'Medium' : 'Low') as 'High' | 'Medium' | 'Low',
            likelihood,
            score: energyScore
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(({ id, ionType, formula, mz, priority, likelihood }) => ({
          id,
          ionType,
          formula,
          mz,
          priority,
          likelihood
        }));

      sweepList.push({
        parameterValue: currentCE,
        parameterLabel: `CE ${currentCE} eV`,
        regimeSummary:
          currentCE <= 15
            ? '低能區：前驅離子與一階弱鍵脫除為主'
            : currentCE >= 35
            ? '高能區：二階連續重排與小分子診斷離子為主'
            : '中能區：一階與二階產物離子並存',
        topCandidates: topList
      });
    }
    sweepResults = sweepList;
  }

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
