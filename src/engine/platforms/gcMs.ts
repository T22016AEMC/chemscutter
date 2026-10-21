// GC-MS 平台碎裂引擎。
// 來源：legacy gcMsFragmentation.ts。階段 1c 照原樣搬移；階段 1e 起，與其他平台相同的流程改用 ./shared/ 的共用函式，
// 本檔只保留 GC-MS 特有的觸發條件、分數、precursorMz 與說明文字。
// 標有 LEGACY-QUIRK(Qxx) 的地方是刻意保留的舊版不一致行為，修正時搜尋該標記即可找到全部位置。
import type { SimulationConfig, FragmentCandidate, StructureItem, SignalItem, SweepResultItem } from '../types';
import type { JSMol, RDKitModule } from '../rdkit/types';
import type { FunctionalGroupInfo } from '../rules/functionalGroups';
import { generateValidNeutralLosses } from '../rules/neutralLosses';
import { executeMcLaffertyGraphRearrangement } from '../rules/graphReactions';
import { deduplicateAndRankCandidates } from '../scoring/deduplicate';
import { formatHillFormula } from '../chem/formula';
import { deriveProtonatedIon, deriveAdductIon, buildVerifiedIonFromSmiles } from '../chem/ionDerivation';
import {
  ELECTRON_MASS,
  PROTON_MASS_LEGACY_ROUNDED,
  METHANE_CI_C2H5_ADDUCT_MASS,
  ISOBUTANE_CI_C4H9_ADDUCT_MASS,
  ACETYLENE_LOSS_MASS,
  PHENYL_CATION_MZ
} from '../constants/masses';
import { evaluateGcMsRegime } from '../platform/parameterRegime';
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
  residualAsRadicalIon,
  residualIonCandidate
} from './shared/neutralLossProducts';
import {
  analyzeDirectCation,
  directCationCandidate,
  chargedFragmentCandidate,
  chargedFragmentIonInfo,
  forEachSingleBondFragment,
  fragmentAsRadicalIon,
  fragmentIonCandidate,
  fragmentStructure
} from './shared/singleBondProducts';
import { buildParameterSweep } from './shared/parameterSweep';
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
  const { parentSmiles, parentStoich, parentFormula, parentMass } = parent;

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
    // LEGACY-QUIRK(Q19): 診斷離子的 precursorMz 使用中性母分子質量 parentMass，而非 M+. 的 m/z
    const diagnosticPrecursorMz = parentMass;

    // 2a. Benzylic Cleavage -> Genuine Tropylium Cation [cH+]1cccccc1 (C7H7+, m/z 91.0542)
    if (fg.hasBenzylicPosition) {
      const tropylium = buildVerifiedIonFromSmiles('[cH+]1cccccc1', RDKit);
      if (tropylium) {
        const mb = verifyAgainstParent(ctx, { C: 7, H: 7 }, tropylium.neutralExactMass);
        addDiagnosticIon(out, ctx, tropylium, mb, {
          id: 'GCMS_Tropylium_pos',
          polarity: 'Positive',
          ionType: '[C7H7]+',
          precursorMz: diagnosticPrecursorMz,
          structure: {
            name: '七芳鎓陽離子 (Tropylium Cation, [C₇H₇]⁺)',
            mechanism: '苄位 β-均裂並擴環重排為七元環芳香 Tropylium 鎓陽離子 ([cH+]1cccccc1)',
            fragmentationPathway: 'M+. → Benzylic β-Cleavage & Ring Expansion → [C7H7]+',
            priority: 'High',
            score: 95.0
          },
          candidate: {
            mechanism: '苄位 β-裂解與擴環重排：七芳鎓陽離子 ([cH+]1cccccc1, m/z 91.0542)',
            fragmentationPathway: 'M+. → Benzylic Cleavage → [C7H7]+',
            priority: 'High',
            sourceRule: 'GCMS_TropyliumFormation',
            heuristicScore: 95.0,
            explanation: '含苄基結構在 EI 下發生 β-鍵斷裂並擴環為 6π 芳香穩定的七員環 Tropylium 陽離子 [cH+]1cccccc1 (m/z 91.0542)'
          }
        });

        // 已移除：SMILES 無效從未產生結果，見 Q13，待以正確結構重新實作
        // （原為 Tropylium 二階縮環脫乙炔 [C5H5]+，m/z 91 → 65，SMILES 'C1=CC=[CH+]C=1'）
      }
    }

    // 2b. Carbonyl Alpha-Cleavage -> Genuine Acetylium Cation C[C+]=O (C2H3O+, m/z 43.0178)
    if (fg.hasAcetylGroup) {
      const acetylium = buildVerifiedIonFromSmiles('C[C+]=O', RDKit);
      if (acetylium) {
        const mb = verifyAgainstParent(ctx, { C: 2, H: 3, O: 1 }, acetylium.neutralExactMass);
        addDiagnosticIon(out, ctx, acetylium, mb, {
          id: 'GCMS_Acylium_pos',
          polarity: 'Positive',
          ionType: '[CH3CO]+',
          precursorMz: diagnosticPrecursorMz,
          structure: {
            name: '乙醯基鎓陽離子 (Acetylium Cation, [CH₃CO]⁺)',
            mechanism: '羰基 α-均裂產物：乙醯基鎓陽離子 C[C+]=O (m/z 43.0178)',
            fragmentationPathway: 'M+. → Carbonyl α-Cleavage → [CH3CO]+',
            priority: 'High',
            score: 92.0
          },
          candidate: {
            mechanism: '羰基 α-均裂產物：乙醯基鎓陽離子 (C[C+]=O, m/z 43.0178)',
            fragmentationPathway: 'M+. → Carbonyl α-Cleavage → [CH3CO]+',
            priority: 'High',
            sourceRule: 'GCMS_AcyliumCleavage',
            heuristicScore: 92.0,
            explanation: '羰基鄰位單鍵在電子撞擊下發生 α-均裂，保留三重鍵共振穩定醯基鎓離子 C[C+]=O (C2H3O+, m/z 43.0178)'
          }
        });
      }
    }

    // 2c. Aromatic Ring -> Genuine Phenyl Cation c1cc[c+]cc1 (C6H5+, m/z 77.0386)
    if (fg.hasAromaticRing) {
      const phenylIon = buildVerifiedIonFromSmiles('c1cc[c+]cc1', RDKit);
      if (phenylIon) {
        const mb = verifyAgainstParent(ctx, { C: 6, H: 5 }, phenylIon.neutralExactMass);
        addDiagnosticIon(out, ctx, phenylIon, mb, {
          id: 'GCMS_Phenyl_pos',
          polarity: 'Positive',
          ionType: '[C6H5]+',
          precursorMz: diagnosticPrecursorMz,
          structure: {
            name: '苯基陽離子 (Phenyl Cation, [C₆H₅]⁺)',
            mechanism: '芳環取代基 α-斷裂形成苯基陽離子 c1cc[c+]cc1 (m/z 77.0386)',
            fragmentationPathway: 'M+. → Arylic Cleavage → [C6H5]+',
            priority: 'High',
            score: 88.0
          },
          candidate: {
            mechanism: '苯環取代基均裂解離苯基陽離子 (c1cc[c+]cc1, m/z 77.0386)',
            fragmentationPathway: 'M+. → Arylic Cleavage → [C6H5]+',
            priority: 'High',
            sourceRule: 'GCMS_PhenylCleavage',
            heuristicScore: 88.0,
            explanation: '芳香化合物在 EI 質譜中的經典指紋碎片峰 c1cc[c+]cc1 (C6H5+, m/z 77.0386)'
          }
        });

        // Secondary ring opening of Phenyl cation (-C2H2, m/z 77 -> 51.0229 [C4H3]+): ONLY enabled when EE >= 30 eV!
        if (regime.enableSecondaryRingCracking) {
          const c4h3Ion = buildVerifiedIonFromSmiles('C#CC=[CH+]', RDKit);
          if (c4h3Ion) {
            addDiagnosticIon(
              out,
              ctx,
              c4h3Ion,
              // LEGACY-QUIRK(Q30): 質量平衡為寫死值（丟失 C2H2、誤差 0.0001、驗證通過），並未實際計算
              { neutralLossFormula: 'C2H2', neutralLossMass: ACETYLENE_LOSS_MASS, deltaMass: 0.0001, verified: true },
              {
                id: 'GCMS_C4H3_pos',
                polarity: 'Positive',
                ionType: '[C4H3]+',
                // 二階產物的前驅物為 [C6H5]+
                precursorMz: PHENYL_CATION_MZ,
                structure: {
                  name: '丁烯炔基陽離子 ([C₄H₃]⁺, m/z 51)',
                  mechanism: '苯基陽離子二階開環脫去乙炔 (-C₂H₂, m/z 77 → 51)',
                  fragmentationPathway: '[C6H5]+ → -C2H2 → [C4H3]+',
                  priority: 'Medium',
                  score: 66.0
                },
                candidate: {
                  mechanism: '苯基陽離子二階開環脫去乙炔 (Loss of C₂H₂, m/z 77.0386 → 51.0229)',
                  fragmentationPathway: '[C6H5]+ → -C2H2 → [C4H3]+',
                  priority: 'Medium',
                  sourceRule: 'GCMS_PhenylRingOpening',
                  heuristicScore: 66.0,
                  explanation: '高能 EI 下 [C₆H₅]⁺ 進一步開環脫去 C₂H₂ 生成 [C₄H₃]⁺ (C#CC=[CH+], m/z 51.0229)'
                }
              }
            );
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

    const structId = neutralLossStructId(out, 'GCMS_NL_', nl);
    addStructureOnce(
      out,
      nl.residualSmiles,
      neutralLossStructure(nl, structId, {
        name: `氣相脫除產物 (${nl.name})`,
        score: nl.priority === 'High' ? 84.0 : 62.0,
        mode: 'Positive',
        fragmentationPathway: isCI
          ? `[M+H]+ → -${nl.neutralFormula}`
          : `M+. → -${nl.neutralFormula}`,
        // LEGACY-QUIRK(Q16): 中性產物的離子式以字串拼接（CI 為中性式接 "H+"、EI 為中性式接 "+."），charge 一律為 1
        formula: nl.isChargedProduct
          ? nl.residualFormula
          : isCI
          ? `${nl.residualNeutralFormula}H+`
          : `${nl.residualNeutralFormula}+.`,
        charge: 1
      })
    );

    if (nl.isChargedProduct) {
      // Even-electron cation product (e.g., Acylium or Salicyloyl cation m/z 121.0284)
      candidates.push(
        chargedResidualCandidate(ctx, nl, structId, {
          // LEGACY-QUIRK(Q29): id 後綴為 _ion（TOF-SIMS 為 _ion_pos、LC-MS/MS 為 _pos_ion）
          idSuffix: '_ion',
          // LEGACY-QUIRK(Q19): precursorMz 使用中性母分子質量 parentMass
          precursorMz: parentMass,
          // LEGACY-QUIRK(Q31): charge 固定為 1（TOF-SIMS／LC-MS/MS 為 nl.charge || 1）
          charge: 1,
          ionType: isCI ? `[M+H-${nl.neutralFormula}]+` : `[${nl.residualNeutralFormula}]+`,
          mechanism: nl.mechanism,
          fragmentationPathway: `Graph Reaction (-${nl.neutralFormula}) → ${nl.residualFormula}`,
          priority: nl.priority,
          sourceRule: 'GCMS_GraphReaction_Cation',
          heuristicScore: nl.priority === 'High' ? 86.0 : 65.0,
          explanation: `生成共振穩定陽離子 ${nl.residualFormula} (${nl.residualSmiles}, m/z ${nl.residualMz.toFixed(4)})`
        })
      );
    } else if (isCI) {
      // In CI mode, neutral loss occurs from [M+H]+ -> [M+H-NL]+
      const protNl = deriveProtonatedIon(nl.residualMol, RDKit);
      candidates.push(
        residualIonCandidate(ctx, nl, structId, protNl, {
          idSuffix: '_ci_pos',
          polarity: 'Positive',
          // LEGACY-QUIRK(Q19): parentMass + 1.007276 並四捨五入至 4 位
          precursorMz: Number((parentMass + PROTON_MASS_LEGACY_ROUNDED).toFixed(4)),
          ionType: `[M+H-${nl.neutralFormula}]+`,
          mechanism: `CI 質子轉移誘導脫除：${nl.name}`,
          fragmentationPathway: `[M+H]+ → -${nl.neutralFormula} → ${protNl.formula}`,
          pathwayStatus: nl.pathwayStatus,
          priority: nl.priority,
          sourceRule: 'GCMS_CI_NeutralLoss',
          heuristicScore: 76.0,
          explanation: `CI 准分子離子 [M+H]⁺ 脫去中性 ${nl.neutralFormula} 形成 ${protNl.formula}`
        })
      );
    } else {
      // In EI mode, neutral loss from M+. gives odd-electron radical cation [M-NL]+.
      const radMz = Number((nl.residualExactMass - ELECTRON_MASS).toFixed(4));
      candidates.push(
        residualIonCandidate(ctx, nl, structId, residualAsRadicalIon(nl, `${nl.residualNeutralFormula}+.`, radMz), {
          idSuffix: '_ei_rad',
          polarity: 'Positive',
          precursorMz: Number((parentMass - ELECTRON_MASS).toFixed(4)),
          ionType: `[M-${nl.neutralFormula}]+.`,
          mechanism: `EI (${ee} eV) 氣相中性脫除：${nl.name}`,
          fragmentationPathway: `M+. → -${nl.neutralFormula} → ${nl.residualNeutralFormula}+.`,
          pathwayStatus: nl.pathwayStatus,
          priority: nl.priority,
          sourceRule: 'GCMS_EI_NeutralLoss',
          heuristicScore: nl.priority === 'High' ? 88.0 : 64.0,
          explanation: `分子自由基陽離子 M⁺• 脫去中性小分子 ${nl.neutralFormula} (${nl.neutralExactMass.toFixed(4)} Da)，產生奇數電子自由基陽離子 ${nl.residualNeutralFormula}⁺• (m/z ${radMz.toFixed(4)})`
        })
      );
    }
  }

  // ============================================================================
  // 4. Single-Bond Alpha & Homolytic Cleavages (Governed by EI vs CI & EE Regime)
  // ============================================================================
  if (!isCI) {
    forEachSingleBondFragment(
      ctx,
      mol,
      RDKit,
      {
        idPrefix: 'GCMS_Frag_',
        // In soft EI (<30 eV), suppress unactivated C-C homolytic shattering
        skip: (frag) =>
          !regime.enableDeepHomolyticCleavage && !frag.isLabileHeteroatomBond && frag.bondClass === 'aliphatic_cc'
      },
      (visit) => {
        const { frag, counter } = visit;
        const massFrac = parentMass > 0 ? frag.exactMass / parentMass : 0.5;
        const priority: 'High' | 'Medium' | 'Low' = massFrac < 0.7 ? 'High' : 'Medium';
        const score = Math.max(32, Math.min(86, 72 - massFrac * 22));
        // 中性碎片的自由基陽離子 m/z：中性質量減電子質量
        const radMz = Number((frag.exactMass - ELECTRON_MASS).toFixed(4));

        addStructureOnce(
          out,
          frag.smiles,
          {
            ...fragmentStructure(visit, {
              name: `EI 裂解碎片 ${counter} (${frag.bondDescription.split(' ')[0]})`,
              score: Number(score.toFixed(1)),
              priority,
              mode: 'Positive',
              mechanism: `EI (${ee} eV) ${frag.bondDescription}`,
              ion: visit.charge !== 0 ? chargedFragmentIonInfo(visit) : { mass: radMz, charge: 1 }
            }),
            formula: visit.charge === 0 ? `${frag.formula}+.` : frag.formula
          }
        );

        // 碎片本身帶形式電荷：只產生該離子本身（[Frag]+），不再推導直接異裂陽離子與 [Frag]+.；
        // GC-MS 只有正離子模式，負電荷碎片不產生候選
        if (visit.charge !== 0) {
          if (visit.charge > 0) {
            // GC-MS 沒有 [Frag+H]+，分數、優先度與 precursorMz 沿用直接異裂陽離子
            candidates.push(
              chargedFragmentCandidate(ctx, visit, {
                // LEGACY-QUIRK(Q19): precursorMz 使用中性母分子質量 parentMass，而非 M+. 的 m/z
                precursorMz: parentMass,
                mechanism: `EI ${frag.bondDescription}：碎片本身帶正形式電荷 (${frag.smiles})`,
                fragmentationPathway: `M+. → Bond Cleavage → ${visit.stoich.ionicFormula}`,
                priority,
                confidence: 'High',
                sourceRule: 'GCMS_ChargedFragment',
                heuristicScore: Number(Math.min(88, score + 4).toFixed(1)),
                explanation: `單鍵斷裂後碎片保留原有的形式電荷，直接形成偶電子離子 ${visit.stoich.ionicFormula}`
              })
            );
          }
          return;
        }

        // Direct even-electron cleavage cation if available (e.g. R-[C+]=O or carbocation)
        if (frag.directCationMol && frag.directCationMz) {
          const cat = analyzeDirectCation(ctx, frag.directCationMol);
          candidates.push(
            directCationCandidate(ctx, visit, cat, {
              idSuffix: '_cat',
              // LEGACY-QUIRK(Q19): precursorMz 使用中性母分子質量 parentMass，而非 M+. 的 m/z
              precursorMz: parentMass,
              mechanism: `EI ${frag.bondDescription}：偶數電子陽離子 (${frag.directCationSmiles})`,
              fragmentationPathway: `M+. → Direct Bond Cleavage (-${cat.mb.neutralLossFormula}.) → ${cat.stoich.ionicFormula}`,
              // EI 均裂丟失的是自由基，中性丟失以「•」標示
              neutralLoss: `${cat.mb.neutralLossFormula}•`,
              priority,
              sourceRule: 'GCMS_AlphaOrDirectCleavage',
              heuristicScore: Number(Math.min(88, score + 4).toFixed(1)),
              explanation: `單鍵均裂脫去自由基 ${cat.mb.neutralLossFormula}•，形成偶數電子陽離子 ${cat.stoich.ionicFormula} (${frag.directCationSmiles})`
            })
          );
        }

        candidates.push(
          // 中性碎片的自由基陽離子 [Frag]+.
          fragmentIonCandidate(ctx, visit, fragmentAsRadicalIon(frag, `${frag.formula}+.`, radMz), {
            idSuffix: '_rad',
            polarity: 'Positive',
            ionType: '[Frag]+.',
            precursorMz: parentMass,
            mechanism: `EI ${frag.bondDescription} 伴隨氫轉移`,
            fragmentationPathway: `M+. → Cleavage & H-Rearrangement → ${frag.formula}+.`,
            priority,
            confidence: 'High',
            sourceRule: 'GCMS_HomolyticCleavage',
            heuristicScore: Number(score.toFixed(1)),
            explanation: `${ee} eV 條件下單鍵斷裂伴隨氫重排產生的離子 ${frag.formula}⁺•`
          })
        );
      }
    );
  }

  // ============================================================================
  // 5. Halogen Isotope Signatures
  // ============================================================================
  // GC-MS 只有正離子：以 'Positive' 產生的同位素訊號必定為正離子，因此不需依極性過濾
  addIsotopeSignals(out, ctx, fg, {
    mode: 'Positive',
    enabled: { positive: true, negative: true },
    idPrefix: 'GCMS_Iso_',
    sourceRule: 'IsotopeSignature'
  });

  // Deduplicate and rank final candidate list
  const finalCandidates = deduplicateAndRankCandidates(candidates);

  // ============================================================================
  // 6. Parameter Sweep Support (Electron Energy Sweep: 20, 35, 50, 70 eV)
  // ============================================================================
  let sweepResults: SweepResultItem[] | undefined;
  if (!isCI && config.electronEnergy) {
    sweepResults = buildParameterSweep(finalCandidates, {
      points: [20, 35, 50, 70],
      label: (curEE) => `EE ${curEE} eV`,
      regimeSummary: (curEE) =>
        curEE <= 25
          ? '軟電離閾值區：M⁺• 強烈主導，二階開環不發生'
          : curEE >= 70
          ? 'NIST 70 eV 標準區：一階與二階特徵裂解完整展開'
          : '中能過渡區：一階重排與 α-裂解逐漸增強',
      score: (c, curEE) => {
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
        return energyScore;
      },
      // LEGACY-QUIRK(Q28): priority 門檻為 65／40（LC-MS/MS 為 68／42）
      priorityThresholds: { high: 65, medium: 40 }
    });
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
