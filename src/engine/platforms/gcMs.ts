// GC-MS 平台碎裂引擎。
// 來源：legacy gcMsFragmentation.ts（照原樣搬移，只改型別、import 與具名質量常數）
import type { SimulationConfig, FragmentCandidate, StructureItem, SignalItem, SweepResultItem } from '../types';
import type { JSMol, RDKitModule } from '../rdkit/types';
import type { FunctionalGroupInfo } from '../rules/functionalGroups';
import { generateSingleBondFragments } from '../rules/singleBondCleavage';
import { molToSvgDataUri } from '../chem/depiction';
import { generateValidNeutralLosses } from '../rules/neutralLosses';
import { executeMcLaffertyGraphRearrangement } from '../rules/graphReactions';
import { generateIsotopeCandidates } from '../chem/isotopes';
import { deduplicateAndRankCandidates } from '../scoring/deduplicate';
import { analyzeRDKitMolStoichiometry } from '../chem/stoichiometry';
import { formatHillFormula } from '../chem/formula';
import { deriveProtonatedIon, deriveAdductIon, buildVerifiedIonFromSmiles } from '../chem/ionDerivation';
import {
  ELECTRON_MASS,
  PROTON_MASS_LEGACY_ROUNDED,
  METHANE_CI_C2H5_ADDUCT_MASS,
  ISOBUTANE_CI_C4H9_ADDUCT_MASS,
  ACETYLENE_LOSS_MASS,
  TROPYLIUM_ION_MZ,
  PHENYL_CATION_MZ
} from '../constants/masses';
import { verifyFragmentMassBalance } from '../chem/massBalance';
import { evaluateGcMsRegime } from '../platform/parameterRegime';
import {
  addStructureOnce,
  buildParentContext,
  buildParentStructure,
  createPlatformOutput,
  type PlatformContext
} from './shared/context';
import { parentAsIon, precursorCandidate } from './shared/precursorIons';
import { buildSignals } from './shared/signals';

export interface GcMsRunResult {
  candidates: FragmentCandidate[];
  structures: StructureItem[];
  signals: SignalItem[];
  parameterContext: string;
  activeRegimeDescription: string;
  sweepResults?: SweepResultItem[];
}

export function runGcMsFragmentation(
  mol: JSMol,
  RDKit: RDKitModule,
  config: SimulationConfig,
  fg: FunctionalGroupInfo
): GcMsRunResult {
  const parent = buildParentContext(mol);
  const { parentSmiles, parentStoich, parentFormula, parentMass, parentImg } = parent;

  const regime = evaluateGcMsRegime(config, fg);
  const { isCI, electronEnergy: ee, reagentGas, analyzer } = regime;

  const parameterContext = isCI
    ? `GC-MS CI (${reagentGas} reagent gas), ${analyzer}`
    : `GC-MS EI (${ee} eV), ${analyzer}, ${ee >= 55 ? 'Standard NIST 70eV Regime' : 'Low-Energy Soft EI Regime'}`;

  const out = createPlatformOutput();
  const { candidates, structures, seenStructureKeys } = out;
  const ctx: PlatformContext = { ...parent, technique: 'GC-MS', parameterContext };

  // Add Parent Molecule（EI 時母體為分子自由基陽離子 M⁺•）
  addStructureOnce(
    out,
    parentSmiles,
    buildParentStructure(parent, {
      name: isCI ? '母分子 (CI Precursor Molecule)' : '母分子自由基陽離子 (Molecular Radical Cation M⁺•)',
      mode: 'Positive',
      mechanism: regime.regimeSummary,
      fragmentationPathway: isCI ? `CI (${reagentGas}) Ionization` : `EI (${ee} eV) Electron Impact`,
      ion: isCI
        ? undefined
        : { formula: `${parentFormula}+.`, mass: Number((parentMass - ELECTRON_MASS).toFixed(4)), charge: 1 }
    })
  );

  // ============================================================================
  // 1. Molecular Ion M+. (in EI) or [M+H]+ & Reagent Adducts (in CI)
  // ============================================================================
  if (isCI) {
    const protParent = deriveProtonatedIon(mol, RDKit, 300, 240);
    candidates.push(
      precursorCandidate(ctx, protParent, {
        id: 'GCMS_CI_MH_pos',
        polarity: 'Positive',
        ionType: '[M+H]+',
        mechanism: `CI (${reagentGas}) 氣相化學游離：${protParent.siteDescription}`,
        fragmentationPathway: `CI Proton Transfer → ${protParent.formula}`,
        priority: 'High',
        confidence: 'High',
        sourceRule: 'GCMS_CI_Protonation',
        heuristicScore: 98.0,
        explanation: `CI 反應氣 (${reagentGas}) 發生軟電離質子轉移，形成強烈准分子離子 ${protParent.formula}`
      })
    );

    // Reagent-gas specific adduct ions!
    if (reagentGas === 'Ammonia') {
      const nh4Adduct = deriveAdductIon(mol, '[M+NH4]+', 300, 240);
      candidates.push(
        precursorCandidate(ctx, nh4Adduct, {
          id: 'GCMS_CI_MNH4_pos',
          polarity: 'Positive',
          ionType: '[M+NH4]+',
          mechanism: 'NH₃ CI 特徵反應氣加合物：銨根配位陽離子 ([M+NH₄]⁺, +18.0338 Da)',
          fragmentationPathway: 'NH3 CI Adduct Formation → [M+NH4]+',
          priority: 'High',
          confidence: 'High',
          sourceRule: 'GCMS_CI_AmmoniaAdduct',
          heuristicScore: 92.0,
          explanation: '氨氣作為 CI 反應氣時，極性官能基與 NH₄⁺ 形成極強之特徵 [M+NH₄]⁺ 峰'
        })
      );
    } else if (reagentGas === 'Methane') {
      // Methane CI: [M+C2H5]+ (+29.0386 Da) and [M+C3H5]+ (+41.0386 Da)
      const c2h5Counts = {
        ...parentStoich.atomCounts,
        C: (parentStoich.atomCounts['C'] || 0) + 2,
        H: (parentStoich.atomCounts['H'] || 0) + 5
      };
      const c2h5Mass = Number((parentMass + METHANE_CI_C2H5_ADDUCT_MASS).toFixed(4));
      candidates.push(
        precursorCandidate(ctx, parentAsIon(ctx, formatHillFormula(c2h5Counts, 1, false), c2h5Mass), {
          id: 'GCMS_CI_MC2H5_pos',
          polarity: 'Positive',
          ionType: '[M+C2H5]+',
          mechanism: 'CH₄ CI 特徵乙基加合物離子 ([M+C₂H₅]⁺, M + 29.0386 Da)',
          fragmentationPathway: 'Methane CI Reagent Addition → [M+C2H5]+',
          priority: 'Medium',
          confidence: 'High',
          sourceRule: 'GCMS_CI_MethaneAdduct_C2H5',
          heuristicScore: 68.0,
          explanation: '甲烷電漿中之 C₂H₅⁺ 反應離子與母分子加合產生 M+29 特徵確認峰'
        })
      );
    } else if (reagentGas === 'Isobutane') {
      // Isobutane CI: [M+C4H9]+ (+57.0699 Da)
      const c4h9Counts = {
        ...parentStoich.atomCounts,
        C: (parentStoich.atomCounts['C'] || 0) + 4,
        H: (parentStoich.atomCounts['H'] || 0) + 9
      };
      const c4h9Mass = Number((parentMass + ISOBUTANE_CI_C4H9_ADDUCT_MASS).toFixed(4));
      candidates.push(
        precursorCandidate(ctx, parentAsIon(ctx, formatHillFormula(c4h9Counts, 1, false), c4h9Mass), {
          id: 'GCMS_CI_MC4H9_pos',
          polarity: 'Positive',
          ionType: '[M+C4H9]+',
          mechanism: 'i-C₄H₁₀ CI 特徵叔丁基加合物離子 ([M+C₄H₉]⁺, M + 57.0699 Da)',
          fragmentationPathway: 'Isobutane CI Reagent Addition → [M+C4H9]+',
          priority: 'Medium',
          confidence: 'High',
          sourceRule: 'GCMS_CI_IsobutaneAdduct',
          heuristicScore: 64.0,
          explanation: '異丁烷 CI 電漿中之 t-C₄H₉⁺ 與母分子形成 M+57 加合物確認峰'
        })
      );
    }
  } else {
    // Electron Ionization (EI) -> Odd-electron Molecular Radical Cation M+.
    const isAromaticOrRigid = fg.hasAromaticRing;
    const molIonScore =
      regime.eeRegime === 'soft_ei'
        ? 96.0
        : isAromaticOrRigid
        ? 88.0
        : 48.0;
    const mRadMz = Number((parentMass - ELECTRON_MASS).toFixed(4));

    candidates.push(
      precursorCandidate(ctx, parentAsIon(ctx, `${parentFormula}+.`, mRadMz), {
        id: 'GCMS_Prec_Mrad_pos',
        polarity: 'Positive',
        ionType: 'M+.',
        mechanism: `EI (${ee} eV) 電子撞擊直接游離分子自由基陽離子 (Molecular Radical Cation M⁺•)`,
        fragmentationPathway: `EI (${ee} eV) Direct Ionization → M+.`,
        priority: isAromaticOrRigid || regime.eeRegime === 'soft_ei' ? 'High' : 'Medium',
        confidence: 'High',
        sourceRule: 'GCMS_EI_MolecularIon',
        heuristicScore: molIonScore,
        explanation: `${ee} eV 電子束撞擊脫除一個價電子，形成奇數電子自由基陽離子 ${parentFormula}⁺• (m/z ${mRadMz.toFixed(4)})`
      })
    );
  }

  // ============================================================================
  // 2. Characteristic EI Fragmentation Pathways (Only in EI Mode!)
  // ============================================================================
  if (regime.enableOddElectronRadicals) {
    // 2a. Benzylic Cleavage -> Genuine Tropylium Cation [cH+]1cccccc1 (C7H7+, m/z 91.0542)
    if (fg.hasBenzylicPosition) {
      const tropylium = buildVerifiedIonFromSmiles('[cH+]1cccccc1', RDKit);
      if (tropylium) {
        const mb = verifyFragmentMassBalance(
          parentStoich.atomCounts,
          parentMass,
          { C: 7, H: 7 },
          tropylium.neutralExactMass
        );
        const structId = 'GCMS_Tropylium_pos';
        if (!seenStructureKeys.has(tropylium.canonicalSmiles)) {
          seenStructureKeys.add(tropylium.canonicalSmiles);
          structures.push({
            id: structId,
            name: '七芳鎓陽離子 (Tropylium Cation, [C₇H₇]⁺)',
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
            relative_intensity: 95.0,
            heuristicScore: 95.0,
            priority: 'High',
            confidence: 'High',
            mode: 'Positive',
            mechanism: '苄位 β-均裂並擴環重排為七元環芳香 Tropylium 鎓陽離子 ([cH+]1cccccc1)',
            fragmentationPathway: 'M+. → Benzylic β-Cleavage & Ring Expansion → [C7H7]+',
            pathwayStatus: 'Verified Graph Product',
            neutralLoss: mb.neutralLossFormula,
            neutralLossMass: mb.neutralLossMass,
            massBalanceVerified: mb.verified
          });
        }

        candidates.push({
          id: structId,
          technique: 'GC-MS',
          polarity: 'Positive',
          precursorMz: parentMass,
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
          mechanism: '苄位 β-裂解與擴環重排：七芳鎓陽離子 ([cH+]1cccccc1, m/z 91.0542)',
          fragmentationPathway: 'M+. → Benzylic Cleavage → [C7H7]+',
          pathwayStatus: 'Verified Graph Product',
          neutralLoss: mb.neutralLossFormula,
          neutralLossMass: mb.neutralLossMass,
          massBalanceError: mb.deltaMass,
          massBalanceVerified: mb.verified,
          parentStructureId: structId,
          priority: 'High',
          confidence: 'High',
          sourceRule: 'GCMS_TropyliumFormation',
          heuristicScore: 95.0,
          image: tropylium.image,
          explanation: '含苄基結構在 EI 下發生 β-鍵斷裂並擴環為 6π 芳香穩定的七員環 Tropylium 陽離子 [cH+]1cccccc1 (m/z 91.0542)',
          parameterContext
        });

        // Secondary ring contraction (-C2H2, m/z 91 -> 65.0386 [C5H5]+): ONLY enabled when EE >= 30 eV!
        if (regime.enableSecondaryRingCracking) {
          const c5h5Ion = buildVerifiedIonFromSmiles('C1=CC=[CH+]C=1', RDKit);
          if (c5h5Ion) {
            const c5StructId = 'GCMS_C5H5_pos';
            if (!seenStructureKeys.has(c5h5Ion.canonicalSmiles)) {
              seenStructureKeys.add(c5h5Ion.canonicalSmiles);
              structures.push({
                id: c5StructId,
                name: '環戊二烯基陽離子 ([C₅H₅]⁺, m/z 65)',
                formula: c5h5Ion.formula,
                neutralFormula: c5h5Ion.neutralFormula,
                smiles: c5h5Ion.smiles,
                canonicalSmiles: c5h5Ion.canonicalSmiles,
                exact_mass: c5h5Ion.ionExactMass,
                neutralExactMass: c5h5Ion.neutralExactMass,
                ionExactMass: c5h5Ion.ionExactMass,
                mz: c5h5Ion.mz,
                charge: 1,
                ionType: '[C5H5]+',
                image: c5h5Ion.image,
                relative_intensity: 70.0,
                heuristicScore: 70.0,
                priority: 'Medium',
                confidence: 'High',
                mode: 'Positive',
                mechanism: 'Tropylium 陽離子二階脫去中性乙炔 (-C₂H₂, m/z 91 → 65)',
                fragmentationPathway: '[C7H7]+ → -C2H2 → [C5H5]+',
                pathwayStatus: 'Verified Graph Product',
                neutralLoss: 'C2H2',
                neutralLossMass: ACETYLENE_LOSS_MASS,
                massBalanceVerified: true
              });
            }
            candidates.push({
              id: c5StructId,
              technique: 'GC-MS',
              polarity: 'Positive',
              precursorMz: TROPYLIUM_ION_MZ,
              mz: c5h5Ion.mz,
              formula: c5h5Ion.formula,
              neutralFormula: c5h5Ion.neutralFormula,
              smiles: c5h5Ion.smiles,
              canonicalSmiles: c5h5Ion.canonicalSmiles,
              exactMass: c5h5Ion.ionExactMass,
              neutralExactMass: c5h5Ion.neutralExactMass,
              ionExactMass: c5h5Ion.ionExactMass,
              charge: 1,
              ionType: '[C5H5]+',
              mechanism: 'Tropylium 陽離子二階脫去中性乙炔 (Loss of C₂H₂, m/z 91.0542 → 65.0386)',
              fragmentationPathway: '[C7H7]+ → -C2H2 → [C5H5]+',
              pathwayStatus: 'Verified Graph Product',
              neutralLoss: 'C2H2',
              neutralLossMass: ACETYLENE_LOSS_MASS,
              massBalanceError: 0.0001,
              massBalanceVerified: true,
              parentStructureId: c5StructId,
              priority: 'Medium',
              confidence: 'High',
              sourceRule: 'GCMS_AcetyleneLoss',
              heuristicScore: 70.0,
              image: c5h5Ion.image,
              explanation: '高能 EI 下 [C₇H₇]⁺ 進一步縮環脫除 C₂H₂ (26.0157 Da) 生成 [C₅H₅]⁺',
              parameterContext
            });
          }
        }
      }
    }

    // 2b. Carbonyl Alpha-Cleavage -> Genuine Acetylium Cation C[C+]=O (C2H3O+, m/z 43.0178)
    if (fg.hasAcetate || fg.hasKetone || fg.hasEster) {
      const acetylium = buildVerifiedIonFromSmiles('C[C+]=O', RDKit);
      if (acetylium) {
        const mb = verifyFragmentMassBalance(
          parentStoich.atomCounts,
          parentMass,
          { C: 2, H: 3, O: 1 },
          acetylium.neutralExactMass
        );
        if (mb.isElementSubset) {
          const structId = 'GCMS_Acylium_pos';
          if (!seenStructureKeys.has(acetylium.canonicalSmiles)) {
            seenStructureKeys.add(acetylium.canonicalSmiles);
            structures.push({
              id: structId,
              name: '乙醯基鎓陽離子 (Acetylium Cation, [CH₃CO]⁺)',
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
              relative_intensity: 92.0,
              heuristicScore: 92.0,
              priority: 'High',
              confidence: 'High',
              mode: 'Positive',
              mechanism: '羰基 α-均裂產物：乙醯基鎓陽離子 C[C+]=O (m/z 43.0178)',
              fragmentationPathway: 'M+. → Carbonyl α-Cleavage → [CH3CO]+',
              pathwayStatus: 'Verified Graph Product',
              neutralLoss: mb.neutralLossFormula,
              neutralLossMass: mb.neutralLossMass,
              massBalanceVerified: mb.verified
            });
          }
          candidates.push({
            id: structId,
            technique: 'GC-MS',
            polarity: 'Positive',
            precursorMz: parentMass,
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
            mechanism: '羰基 α-均裂產物：乙醯基鎓陽離子 (C[C+]=O, m/z 43.0178)',
            fragmentationPathway: 'M+. → Carbonyl α-Cleavage → [CH3CO]+',
            pathwayStatus: 'Verified Graph Product',
            neutralLoss: mb.neutralLossFormula,
            neutralLossMass: mb.neutralLossMass,
            massBalanceError: mb.deltaMass,
            massBalanceVerified: mb.verified,
            parentStructureId: structId,
            priority: 'High',
            confidence: 'High',
            sourceRule: 'GCMS_AcyliumCleavage',
            heuristicScore: 92.0,
            image: acetylium.image,
            explanation: '羰基鄰位單鍵在電子撞擊下發生 α-均裂，保留三重鍵共振穩定醯基鎓離子 C[C+]=O (C2H3O+, m/z 43.0178)',
            parameterContext
          });
        }
      }
    }

    // 2c. Aromatic Ring -> Genuine Phenyl Cation c1cc[c+]cc1 (C6H5+, m/z 77.0386)
    if (fg.hasAromaticRing) {
      const phenylIon = buildVerifiedIonFromSmiles('c1cc[c+]cc1', RDKit);
      if (phenylIon) {
        const mb = verifyFragmentMassBalance(
          parentStoich.atomCounts,
          parentMass,
          { C: 6, H: 5 },
          phenylIon.neutralExactMass
        );
        const structId = 'GCMS_Phenyl_pos';
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
            relative_intensity: 88.0,
            heuristicScore: 88.0,
            priority: 'High',
            confidence: 'High',
            mode: 'Positive',
            mechanism: '芳環取代基 α-斷裂形成苯基陽離子 c1cc[c+]cc1 (m/z 77.0386)',
            fragmentationPathway: 'M+. → Arylic Cleavage → [C6H5]+',
            pathwayStatus: 'Verified Graph Product',
            neutralLoss: mb.neutralLossFormula,
            neutralLossMass: mb.neutralLossMass,
            massBalanceVerified: mb.verified
          });
        }
        candidates.push({
          id: structId,
          technique: 'GC-MS',
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
          mechanism: '苯環取代基均裂解離苯基陽離子 (c1cc[c+]cc1, m/z 77.0386)',
          fragmentationPathway: 'M+. → Arylic Cleavage → [C6H5]+',
          pathwayStatus: 'Verified Graph Product',
          neutralLoss: mb.neutralLossFormula,
          neutralLossMass: mb.neutralLossMass,
          massBalanceError: mb.deltaMass,
          massBalanceVerified: mb.verified,
          parentStructureId: structId,
          priority: 'High',
          confidence: 'High',
          sourceRule: 'GCMS_PhenylCleavage',
          heuristicScore: 88.0,
          image: phenylIon.image,
          explanation: '芳香化合物在 EI 質譜中的經典指紋碎片峰 c1cc[c+]cc1 (C6H5+, m/z 77.0386)',
          parameterContext
        });

        // Secondary ring opening of Phenyl cation (-C2H2, m/z 77 -> 51.0229 [C4H3]+): ONLY enabled when EE >= 30 eV!
        if (regime.enableSecondaryRingCracking) {
          const c4h3Ion = buildVerifiedIonFromSmiles('C#CC=[CH+]', RDKit);
          if (c4h3Ion) {
            const c4StructId = 'GCMS_C4H3_pos';
            if (!seenStructureKeys.has(c4h3Ion.canonicalSmiles)) {
              seenStructureKeys.add(c4h3Ion.canonicalSmiles);
              structures.push({
                id: c4StructId,
                name: '丁烯炔基陽離子 ([C₄H₃]⁺, m/z 51)',
                formula: c4h3Ion.formula,
                neutralFormula: c4h3Ion.neutralFormula,
                smiles: c4h3Ion.smiles,
                canonicalSmiles: c4h3Ion.canonicalSmiles,
                exact_mass: c4h3Ion.ionExactMass,
                neutralExactMass: c4h3Ion.neutralExactMass,
                ionExactMass: c4h3Ion.ionExactMass,
                mz: c4h3Ion.mz,
                charge: 1,
                ionType: '[C4H3]+',
                image: c4h3Ion.image,
                relative_intensity: 66.0,
                heuristicScore: 66.0,
                priority: 'Medium',
                confidence: 'High',
                mode: 'Positive',
                mechanism: '苯基陽離子二階開環脫去乙炔 (-C₂H₂, m/z 77 → 51)',
                fragmentationPathway: '[C6H5]+ → -C2H2 → [C4H3]+',
                pathwayStatus: 'Verified Graph Product',
                neutralLoss: 'C2H2',
                neutralLossMass: ACETYLENE_LOSS_MASS,
                massBalanceVerified: true
              });
            }
            candidates.push({
              id: c4StructId,
              technique: 'GC-MS',
              polarity: 'Positive',
              precursorMz: PHENYL_CATION_MZ,
              mz: c4h3Ion.mz,
              formula: c4h3Ion.formula,
              neutralFormula: c4h3Ion.neutralFormula,
              smiles: c4h3Ion.smiles,
              canonicalSmiles: c4h3Ion.canonicalSmiles,
              exactMass: c4h3Ion.ionExactMass,
              neutralExactMass: c4h3Ion.neutralExactMass,
              ionExactMass: c4h3Ion.ionExactMass,
              charge: 1,
              ionType: '[C4H3]+',
              mechanism: '苯基陽離子二階開環脫去乙炔 (Loss of C₂H₂, m/z 77.0386 → 51.0229)',
              fragmentationPathway: '[C6H5]+ → -C2H2 → [C4H3]+',
              pathwayStatus: 'Verified Graph Product',
              neutralLoss: 'C2H2',
              neutralLossMass: ACETYLENE_LOSS_MASS,
              massBalanceError: 0.0001,
              massBalanceVerified: true,
              parentStructureId: c4StructId,
              priority: 'Medium',
              confidence: 'High',
              sourceRule: 'GCMS_PhenylRingOpening',
              heuristicScore: 66.0,
              image: c4h3Ion.image,
              explanation: '高能 EI 下 [C₆H₅]⁺ 進一步開環脫去 C₂H₂ 生成 [C₄H₃]⁺ (C#CC=[CH+], m/z 51.0229)',
              parameterContext
            });
          }
        }
      }
    }

    // 2d. Genuine McLafferty Graph Rearrangement (Zero SMILES.replace()!)
    if (regime.enableMcLafferty) {
      const mclProd = executeMcLaffertyGraphRearrangement(mol, RDKit);
      if (mclProd) {
        const structId = 'GCMS_McLafferty_Struct';
        const radMz = Number((mclProd.productStoich.neutralExactMass - ELECTRON_MASS).toFixed(4));
        if (!seenStructureKeys.has(mclProd.productSmiles)) {
          seenStructureKeys.add(mclProd.productSmiles);
          structures.push({
            id: structId,
            name: `McLafferty 重排產物 (${mclProd.name})`,
            formula: `${mclProd.productStoich.neutralFormula}+.`,
            neutralFormula: mclProd.productStoich.neutralFormula,
            smiles: mclProd.productSmiles,
            canonicalSmiles: mclProd.productSmiles,
            exact_mass: radMz,
            neutralExactMass: mclProd.productStoich.neutralExactMass,
            ionExactMass: radMz,
            mz: radMz,
            charge: 1,
            ionType: `[M-${mclProd.neutralLossFormula}]+.`,
            image: mclProd.productImage,
            relative_intensity: 88.0,
            heuristicScore: 88.0,
            priority: 'High',
            confidence: 'High',
            mode: 'Positive',
            mechanism: mclProd.mechanism,
            fragmentationPathway: `M+. → McLafferty 6-Membered TS (-${mclProd.neutralLossFormula}) → [M-${mclProd.neutralLossFormula}]+.`,
            pathwayStatus: 'Verified Graph Product',
            neutralLoss: mclProd.neutralLossFormula,
            neutralLossMass: mclProd.neutralLossMass,
            massBalanceVerified: true
          });
        }

        candidates.push({
          id: 'GCMS_McLafferty',
          technique: 'GC-MS',
          polarity: 'Positive',
          precursorMz: parentMass,
          mz: radMz,
          formula: `${mclProd.productStoich.neutralFormula}+.`,
          neutralFormula: mclProd.productStoich.neutralFormula,
          smiles: mclProd.productSmiles,
          canonicalSmiles: mclProd.productSmiles,
          exactMass: mclProd.productStoich.neutralExactMass,
          neutralExactMass: mclProd.productStoich.neutralExactMass,
          ionExactMass: radMz,
          charge: 1,
          ionType: `[M-${mclProd.neutralLossFormula}]+.`,
          mechanism: mclProd.mechanism,
          fragmentationPathway: `M+. → McLafferty Rearrangement (-${mclProd.neutralLossFormula})`,
          pathwayStatus: 'Verified Graph Product',
          neutralLoss: mclProd.neutralLossFormula,
          neutralLossMass: mclProd.neutralLossMass,
          massBalanceError: mclProd.massBalanceError,
          massBalanceVerified: mclProd.massBalanceVerified,
          parentStructureId: structId,
          priority: 'High',
          confidence: 'High',
          sourceRule: 'GCMS_McLafferty_Rearrangement',
          heuristicScore: 88.0,
          image: mclProd.productImage,
          explanation: `羰基氧與 γ-位氫原子經六元環過渡態發生分子內氫轉移並伴隨 α-β 鍵均裂，脫去中性烯烴 ${mclProd.neutralLossFormula} (${mclProd.neutralLossMass.toFixed(4)} Da)`,
          parameterContext
        });
      }
    }
  }

  // ============================================================================
  // 3. Genuine Neutral Losses from Graph Reaction Engine
  // ============================================================================
  const neutralLosses = generateValidNeutralLosses(mol, RDKit, fg);
  for (const nl of neutralLosses) {
    // In Ammonia CI (very soft), suppress secondary / high-barrier neutral losses
    if (isCI && !regime.enableCiHeterolyticLosses && nl.lossType !== 'C2H2O') {
      continue;
    }
    // In soft EI (<30 eV), suppress multi-step concerted elimination like C2H4O2
    if (!isCI && nl.lossType === 'C2H4O2' && !regime.enableSecondaryRingCracking) {
      continue;
    }

    const structId = `GCMS_NL_${nl.lossType}_${structures.length}`;
    if (!seenStructureKeys.has(nl.residualSmiles)) {
      seenStructureKeys.add(nl.residualSmiles);
      structures.push({
        id: structId,
        name: `氣相脫除產物 (${nl.name})`,
        formula: nl.isChargedProduct
          ? nl.residualFormula
          : isCI
          ? `${nl.residualNeutralFormula}H+`
          : `${nl.residualNeutralFormula}+.`,
        neutralFormula: nl.residualNeutralFormula,
        smiles: nl.residualSmiles,
        canonicalSmiles: nl.residualSmiles,
        exact_mass: nl.isChargedProduct ? nl.residualIonExactMass : nl.residualExactMass,
        neutralExactMass: nl.residualExactMass,
        ionExactMass: nl.residualIonExactMass,
        mz: nl.residualMz,
        charge: 1,
        image: nl.residualImage,
        relative_intensity: nl.priority === 'High' ? 84.0 : 62.0,
        heuristicScore: nl.priority === 'High' ? 84.0 : 62.0,
        priority: nl.priority,
        confidence: nl.confidence,
        mode: 'Positive',
        mechanism: nl.mechanism,
        fragmentationPathway: isCI
          ? `[M+H]+ → -${nl.neutralFormula}`
          : `M+. → -${nl.neutralFormula}`,
        pathwayStatus: nl.pathwayStatus,
        neutralLoss: nl.neutralFormula,
        neutralLossMass: nl.neutralExactMass,
        massBalanceVerified: nl.massBalanceVerified
      });
    }

    if (nl.isChargedProduct) {
      // Even-electron cation product (e.g., Acylium or Salicyloyl cation m/z 121.0284)
      candidates.push({
        id: `${structId}_ion`,
        technique: 'GC-MS',
        polarity: 'Positive',
        precursorMz: parentMass,
        mz: nl.residualMz,
        formula: nl.residualFormula,
        neutralFormula: nl.residualNeutralFormula,
        smiles: nl.residualSmiles,
        canonicalSmiles: nl.residualSmiles,
        exactMass: nl.residualIonExactMass,
        neutralExactMass: nl.residualExactMass,
        ionExactMass: nl.residualIonExactMass,
        charge: 1,
        ionType: isCI ? `[M+H-${nl.neutralFormula}]+` : `[${nl.residualNeutralFormula}]+`,
        mechanism: nl.mechanism,
        fragmentationPathway: `Graph Reaction (-${nl.neutralFormula}) → ${nl.residualFormula}`,
        pathwayStatus: nl.pathwayStatus,
        neutralLoss: nl.neutralFormula,
        neutralLossMass: nl.neutralExactMass,
        massBalanceError: nl.massBalanceError,
        massBalanceVerified: nl.massBalanceVerified,
        parentStructureId: structId,
        priority: nl.priority,
        confidence: nl.confidence,
        sourceRule: 'GCMS_GraphReaction_Cation',
        heuristicScore: nl.priority === 'High' ? 86.0 : 65.0,
        image: nl.residualImage,
        explanation: `生成共振穩定陽離子 ${nl.residualFormula} (${nl.residualSmiles}, m/z ${nl.residualMz.toFixed(4)})`,
        parameterContext
      });
    } else if (isCI) {
      // In CI mode, neutral loss occurs from [M+H]+ -> [M+H-NL]+
      const protNl = deriveProtonatedIon(nl.residualMol, RDKit);
      candidates.push({
        id: `${structId}_ci_pos`,
        technique: 'GC-MS',
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
        mechanism: `CI 質子轉移誘導脫除：${nl.name}`,
        fragmentationPathway: `[M+H]+ → -${nl.neutralFormula} → ${protNl.formula}`,
        pathwayStatus: nl.pathwayStatus,
        neutralLoss: nl.neutralFormula,
        neutralLossMass: nl.neutralExactMass,
        massBalanceError: nl.massBalanceError,
        massBalanceVerified: nl.massBalanceVerified,
        parentStructureId: structId,
        priority: nl.priority,
        confidence: nl.confidence,
        sourceRule: 'GCMS_CI_NeutralLoss',
        heuristicScore: 76.0,
        image: protNl.image,
        explanation: `CI 准分子離子 [M+H]⁺ 脫去中性 ${nl.neutralFormula} 形成 ${protNl.formula}`,
        parameterContext
      });
    } else {
      // In EI mode, neutral loss from M+. gives odd-electron radical cation [M-NL]+.
      const radMz = Number((nl.residualExactMass - ELECTRON_MASS).toFixed(4));
      candidates.push({
        id: `${structId}_ei_rad`,
        technique: 'GC-MS',
        polarity: 'Positive',
        precursorMz: Number((parentMass - ELECTRON_MASS).toFixed(4)),
        mz: radMz,
        formula: `${nl.residualNeutralFormula}+.`,
        neutralFormula: nl.residualNeutralFormula,
        smiles: nl.residualSmiles,
        canonicalSmiles: nl.residualSmiles,
        exactMass: nl.residualExactMass,
        neutralExactMass: nl.residualExactMass,
        ionExactMass: radMz,
        charge: 1,
        ionType: `[M-${nl.neutralFormula}]+.`,
        mechanism: `EI (${ee} eV) 氣相中性脫除：${nl.name}`,
        fragmentationPathway: `M+. → -${nl.neutralFormula} → ${nl.residualNeutralFormula}+.`,
        pathwayStatus: nl.pathwayStatus,
        neutralLoss: nl.neutralFormula,
        neutralLossMass: nl.neutralExactMass,
        massBalanceError: nl.massBalanceError,
        massBalanceVerified: nl.massBalanceVerified,
        parentStructureId: structId,
        priority: nl.priority,
        confidence: nl.confidence,
        sourceRule: 'GCMS_EI_NeutralLoss',
        heuristicScore: nl.priority === 'High' ? 88.0 : 64.0,
        image: nl.residualImage,
        explanation: `分子自由基陽離子 M⁺• 脫去中性小分子 ${nl.neutralFormula} (${nl.neutralExactMass.toFixed(4)} Da)，產生奇數電子自由基陽離子 ${nl.residualNeutralFormula}⁺• (m/z ${radMz.toFixed(4)})`,
        parameterContext
      });
    }
  }

  // ============================================================================
  // 4. Single-Bond Alpha & Homolytic Cleavages (Governed by EI vs CI & EE Regime)
  // ============================================================================
  if (!isCI) {
    const singleBondFragments = generateSingleBondFragments(mol, RDKit);
    let fragCounter = 1;

    for (const frag of singleBondFragments) {
      // In soft EI (<30 eV), suppress unactivated C-C homolytic shattering
      if (!regime.enableDeepHomolyticCleavage && !frag.isLabileHeteroatomBond && frag.bondClass === 'aliphatic_cc') {
        continue;
      }

      const fragId = `GCMS_Frag_${fragCounter}`;
      const fragStoich = analyzeRDKitMolStoichiometry(frag.mol, false);
      const mb = verifyFragmentMassBalance(
        parentStoich.atomCounts,
        parentMass,
        fragStoich.atomCounts,
        frag.exactMass
      );

      const massFrac = parentMass > 0 ? frag.exactMass / parentMass : 0.5;
      const priority: 'High' | 'Medium' | 'Low' = massFrac < 0.7 ? 'High' : 'Medium';
      const score = Math.max(32, Math.min(86, 72 - massFrac * 22));

      if (!seenStructureKeys.has(frag.smiles)) {
        seenStructureKeys.add(frag.smiles);
        structures.push({
          id: fragId,
          name: `EI 裂解碎片 ${fragCounter} (${frag.bondDescription.split(' ')[0]})`,
          formula: frag.formula,
          neutralFormula: frag.formula,
          smiles: frag.smiles,
          canonicalSmiles: frag.smiles,
          exact_mass: frag.exactMass,
          neutralExactMass: frag.exactMass,
          ionExactMass: Number((frag.exactMass - ELECTRON_MASS).toFixed(4)),
          mz: Number((frag.exactMass - ELECTRON_MASS).toFixed(4)),
          charge: 1,
          image: frag.image,
          relative_intensity: Number(score.toFixed(1)),
          heuristicScore: Number(score.toFixed(1)),
          priority,
          confidence: 'High',
          mode: 'Positive',
          mechanism: `EI (${ee} eV) ${frag.bondDescription}`,
          fragmentationPathway: frag.bondDescription,
          pathwayStatus: 'Verified Graph Product',
          neutralLoss: mb.neutralLossFormula,
          neutralLossMass: mb.neutralLossMass,
          massBalanceVerified: mb.verified
        });
      }

      // Direct even-electron cleavage cation if available (e.g. R-[C+]=O or carbocation)
      if (frag.directCationMol && frag.directCationMz) {
        const catStoich = analyzeRDKitMolStoichiometry(frag.directCationMol, false);
        const catMb = verifyFragmentMassBalance(
          parentStoich.atomCounts,
          parentMass,
          catStoich.atomCounts,
          catStoich.neutralExactMass
        );
        candidates.push({
          id: `${fragId}_cat`,
          technique: 'GC-MS',
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
          mechanism: `EI ${frag.bondDescription}：偶數電子陽離子 (${frag.directCationSmiles})`,
          fragmentationPathway: `M+. → Direct Bond Cleavage (-${catMb.neutralLossFormula}.) → ${catStoich.ionicFormula}`,
          pathwayStatus: 'Verified Graph Product',
          neutralLoss: `${catMb.neutralLossFormula}•`,
          neutralLossMass: catMb.neutralLossMass,
          massBalanceError: catMb.deltaMass,
          massBalanceVerified: catMb.verified,
          parentStructureId: fragId,
          priority,
          confidence: 'High',
          sourceRule: 'GCMS_AlphaOrDirectCleavage',
          heuristicScore: Number(Math.min(88, score + 4).toFixed(1)),
          image: frag.directCationImage || frag.image,
          explanation: `單鍵均裂脫去自由基 ${catMb.neutralLossFormula}•，形成偶數電子陽離子 ${catStoich.ionicFormula} (${frag.directCationSmiles})`,
          parameterContext
        });
      }

      const radMz = Number((frag.exactMass - ELECTRON_MASS).toFixed(4));
      candidates.push({
        id: `${fragId}_rad`,
        technique: 'GC-MS',
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
        mechanism: `EI ${frag.bondDescription} 伴隨氫轉移`,
        fragmentationPathway: `M+. → Cleavage & H-Rearrangement → ${frag.formula}+.`,
        pathwayStatus: 'Verified Graph Product',
        neutralLoss: mb.neutralLossFormula,
        neutralLossMass: mb.neutralLossMass,
        massBalanceError: mb.deltaMass,
        massBalanceVerified: mb.verified,
        parentStructureId: fragId,
        priority,
        confidence: 'High',
        sourceRule: 'GCMS_HomolyticCleavage',
        heuristicScore: Number(score.toFixed(1)),
        image: frag.image,
        explanation: `${ee} eV 條件下單鍵斷裂伴隨氫重排產生的離子 ${frag.formula}⁺•`,
        parameterContext
      });

      fragCounter++;
    }
  }

  // ============================================================================
  // 5. Halogen Isotope Signatures
  // ============================================================================
  const isotopes = generateIsotopeCandidates(parentFormula, parentMass, 'Positive', fg);
  for (const iso of isotopes) {
    candidates.push({
      id: `GCMS_Iso_${iso.formula}`,
      technique: 'GC-MS',
      polarity: 'Positive',
      precursorMz: parentMass,
      mz: iso.mz,
      formula: iso.formula,
      neutralFormula: parentFormula,
      smiles: parentSmiles,
      canonicalSmiles: parentSmiles,
      exactMass: parentMass,
      neutralExactMass: parentMass,
      ionExactMass: iso.mz,
      charge: 1,
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

  // Deduplicate and rank final candidate list
  const finalCandidates = deduplicateAndRankCandidates(candidates);

  // ============================================================================
  // 6. Parameter Sweep Support (Electron Energy Sweep: 20, 35, 50, 70 eV)
  // ============================================================================
  let sweepResults: SweepResultItem[] | undefined;
  if (!isCI && config.electronEnergy) {
    const sweepList: SweepResultItem[] = [];
    const energies = [20, 35, 50, 70];

    for (const curEE of energies) {
      const topList = finalCandidates
        .filter((c) => !c.ionType.includes('³⁷Cl') && !c.ionType.includes('⁸¹Br'))
        .map((c) => {
          const massRatio = c.neutralExactMass / (parentMass || 1);
          let energyScore = c.heuristicScore || 50;

          if (curEE <= 25) {
            if (c.ionType === 'M+.') energyScore = 96;
            else if (c.sourceRule.includes('AcetyleneLoss') || c.sourceRule.includes('RingOpening')) energyScore = 15;
            else energyScore -= 22;
          } else if (curEE >= 70) {
            if (c.ionType === 'M+.' && !fg.hasAromaticRing) energyScore -= 18;
            if (massRatio < 0.75) energyScore = Math.min(96, energyScore + 14);
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
            priority: (energyScore > 65 ? 'High' : energyScore > 40 ? 'Medium' : 'Low') as 'High' | 'Medium' | 'Low',
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
        parameterValue: curEE,
        parameterLabel: `EE ${curEE} eV`,
        regimeSummary:
          curEE <= 25
            ? '軟電離閾值區：M⁺• 強烈主導，二階開環不發生'
            : curEE >= 70
            ? 'NIST 70 eV 標準區：一階與二階特徵裂解完整展開'
            : '中能過渡區：一階重排與 α-裂解逐漸增強',
        topCandidates: topList
      });
    }
    sweepResults = sweepList;
  }

  const signals = buildSignals(finalCandidates, {
    precursorType: '分子離子 (Molecular/Precursor Ion)',
    fragmentTypePrefix: '碎片離子'
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
