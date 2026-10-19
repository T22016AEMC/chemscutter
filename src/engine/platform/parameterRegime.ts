// 依儀器參數判斷三個平台的碎裂區間（regime）與可開啟的反應路徑。
// 來源：legacy parameterRegime.ts
import type { SimulationConfig } from '../types';
import type { FunctionalGroupInfo } from '../rules/functionalGroups';

export interface TofSimsRegime {
  primaryIon: string;
  primaryIonClass: 'monoatomic_metal' | 'cluster_metal' | 'giant_cluster' | 'reactive_cs' | 'reactive_o2' | 'generic';
  energyKeV: number;
  energyRegime: 'low_keV' | 'standard_keV' | 'high_keV';
  enablePositive: boolean;
  enableNegative: boolean;
  enableDeepAromaticCracking: boolean;
  enableHomolyticRadicals: boolean;
  enableAlkaliAdducts: boolean;
  enableCsAdduct: boolean;
  intactMolecularModifier: number;
  smallFragmentModifier: number;
  regimeSummary: string;
}

export interface LcMsMsRegime {
  ionization: string;
  analyzer: string;
  fragmentationMethod: string;
  collisionEnergy: number;
  ceRegime: 'low_ce' | 'mid_ce' | 'high_ce';
  isAPCI: boolean;
  isIonTrap: boolean;
  isBeamType: boolean;
  lowMassCutoffRatio: number;
  enablePositive: boolean;
  enableNegative: boolean;
  enableAlkaliAdducts: boolean;
  enableInSourceDehydration: boolean;
  enableSequentialFragmentation: boolean;
  enableLowMzDiagnosticIons: boolean;
  enableStrongCarbonBondCleavage: boolean;
  regimeSummary: string;
}

export interface GcMsRegime {
  ionization: 'EI' | 'CI';
  electronEnergy: number;
  eeRegime: 'soft_ei' | 'mid_ei' | 'standard_70eV';
  reagentGas: 'Methane' | 'Isobutane' | 'Ammonia';
  analyzer: string;
  isCI: boolean;
  enableOddElectronRadicals: boolean;
  enableMcLafferty: boolean;
  enableAlphaCleavage: boolean;
  enableSecondaryRingCracking: boolean;
  enableDeepHomolyticCleavage: boolean;
  enableCiReagentAdducts: boolean;
  enableCiHeterolyticLosses: boolean;
  regimeSummary: string;
}

export function evaluateTofSimsRegime(
  config: SimulationConfig,
  fg: FunctionalGroupInfo
): TofSimsRegime {
  const primaryIon = config.primaryIon || 'Generic';
  const energyKeV = config.primaryIonEnergy !== undefined ? config.primaryIonEnergy : 25;
  const polarity = config.polarity || 'Both';

  let primaryIonClass: TofSimsRegime['primaryIonClass'] = 'generic';
  if (primaryIon === 'Bi+' || primaryIon === 'Au+') {
    primaryIonClass = 'monoatomic_metal';
  } else if (primaryIon === 'Bi3+' || primaryIon === 'Au3+') {
    primaryIonClass = 'cluster_metal';
  } else if (primaryIon === 'C60+' || primaryIon === 'Ar Cluster') {
    primaryIonClass = 'giant_cluster';
  } else if (primaryIon === 'Cs+') {
    primaryIonClass = 'reactive_cs';
  } else if (primaryIon === 'O2+') {
    primaryIonClass = 'reactive_o2';
  }

  const energyRegime: TofSimsRegime['energyRegime'] =
    energyKeV < 15 ? 'low_keV' : energyKeV > 35 ? 'high_keV' : 'standard_keV';

  const enablePositive = polarity === 'Positive' || polarity === 'Both';
  const enableNegative = polarity === 'Negative' || polarity === 'Both';

  // Giant cluster ions (C60+, Ar_n+) deposit energy in the very top surface with low eV/atom,
  // preserving intact [M+H]+ / [M-H]- and primary functional group cleavages while suppressing deep ring cracking.
  const enableDeepAromaticCracking =
    primaryIonClass !== 'giant_cluster' && energyRegime !== 'low_keV';

  const enableHomolyticRadicals =
    primaryIonClass !== 'giant_cluster' || energyRegime === 'high_keV';

  const enableCsAdduct = primaryIonClass === 'reactive_cs';
  const enableAlkaliAdducts = enablePositive;

  let intactMolecularModifier = 0;
  let smallFragmentModifier = 0;
  let regimeSummary = '';

  switch (primaryIonClass) {
    case 'monoatomic_metal':
      intactMolecularModifier = -12;
      smallFragmentModifier = +15;
      regimeSummary = `${primaryIon} (${energyKeV} keV) 線性碰撞級聯：高能量密度撞擊，開啟深層芳環開環、均裂自由基與小分子碎片，完整母分子離子相對降低`;
      break;
    case 'cluster_metal':
      intactMolecularModifier = +10;
      smallFragmentModifier = +5;
      regimeSummary = `${primaryIon} (${energyKeV} keV) 金屬團簇非線性級聯：同時提升完整准分子離子 [M+H]⁺/[M-H]⁻ 產率並保留結構特徵碎片`;
      break;
    case 'giant_cluster':
      intactMolecularModifier = +20;
      smallFragmentModifier = -20;
      regimeSummary = `${primaryIon} (${energyKeV} keV) 多原子溫和濺射：低每原子動能 (Low eV/atom)，強烈保留母分子離子與一階官能基脫除，抑制深層芳環打碎`;
      break;
    case 'reactive_cs':
      intactMolecularModifier = +5;
      smallFragmentModifier = +8;
      regimeSummary = `Cs⁺ (${energyKeV} keV) 活性金屬表面注入：降低表面功函數，強烈提升電負性負離子 ([M-H]⁻、酸根、鹵離子) 與 [M+Cs]⁺ 配位峰`;
      break;
    case 'reactive_o2':
      intactMolecularModifier = +5;
      smallFragmentModifier = +10;
      regimeSummary = `O₂⁺ (${energyKeV} keV) 活性氧束轟擊：促進表面氧化與正二次離子發射效率`;
      break;
    default:
      regimeSummary = `Generic TOF-SIMS (${energyKeV} keV) 通用表面碰撞級聯模型：涵蓋正/負准分子離子、特徵官能基離子與單鍵斷裂`;
      break;
  }

  return {
    primaryIon,
    primaryIonClass,
    energyKeV,
    energyRegime,
    enablePositive,
    enableNegative,
    enableDeepAromaticCracking,
    enableHomolyticRadicals,
    enableAlkaliAdducts,
    enableCsAdduct,
    intactMolecularModifier,
    smallFragmentModifier,
    regimeSummary
  };
}

export function evaluateLcMsMsRegime(
  config: SimulationConfig,
  fg: FunctionalGroupInfo
): LcMsMsRegime {
  const ionization = config.ionization || 'Auto';
  const analyzer = config.analyzer || 'QTOF';
  const fragmentationMethod = config.fragmentationMethod || 'CID';
  const collisionEnergy = config.collisionEnergy !== undefined ? config.collisionEnergy : 25;

  const ceRegime: LcMsMsRegime['ceRegime'] =
    collisionEnergy < 18 ? 'low_ce' : collisionEnergy >= 35 ? 'high_ce' : 'mid_ce';

  const isAPCI = ionization.startsWith('APCI');
  const isIonTrap = analyzer === 'Ion Trap';
  const isBeamType =
    fragmentationMethod === 'HCD' ||
    analyzer === 'QTOF' ||
    analyzer === 'Orbitrap' ||
    analyzer === 'Triple Quadrupole';

  const enablePositive =
    config.polarity === 'Positive' ||
    config.polarity === 'Both' ||
    (!config.polarity && !ionization.endsWith('-')) ||
    ionization.endsWith('+') ||
    ionization === 'Auto';

  const enableNegative =
    config.polarity === 'Negative' ||
    config.polarity === 'Both' ||
    ionization.endsWith('-') ||
    (ionization === 'Auto' && fg.negativePathEnabled);

  // APCI occurs in gas phase via corona discharge -> alkali metal adducts [M+Na]+/[M+K]+ are suppressed,
  // whereas thermal/in-source dehydration (-H2O) is promoted.
  const enableAlkaliAdducts = !isAPCI;
  const enableInSourceDehydration = isAPCI;

  // Sequential multi-step fragmentation (e.g. -CH2CO followed by -H2O or -CO2) requires mid-to-high CE or beam-type HCD/CID
  const enableSequentialFragmentation =
    ceRegime === 'high_ce' || (ceRegime === 'mid_ce' && isBeamType);

  // Low m/z diagnostic carbocations (m/z 43 acylium, m/z 77 phenyl, m/z 91 tropylium) require higher internal energy
  // and are suppressed in low-CE or Ion Trap (due to 1/3 LMCO rule).
  const enableLowMzDiagnosticIons = ceRegime !== 'low_ce' && !isIonTrap;

  // At low CE (<18 eV), only labile heteroatom bonds (ester, amide, ether) and neutral losses occur;
  // unactivated C-C single bonds do not cleave at low CE.
  const enableStrongCarbonBondCleavage = ceRegime !== 'low_ce';

  const lowMassCutoffRatio = isIonTrap ? 0.28 : 0.0;

  const ceDesc =
    ceRegime === 'low_ce'
      ? `低碰撞能 (${collisionEnergy} eV)：保留高比例前驅離子，僅開啟低能障中性脫除与弱雜原子鍵異裂，抑制骨架深層斷裂`
      : ceRegime === 'high_ce'
      ? `高碰撞能 (${collisionEnergy} eV)：前驅離子大幅耗盡，開啟二階連續脫除 (Sequential losses) 與低 m/z 特徵診斷陽離子`
      : `中段碰撞能 (${collisionEnergy} eV)：平衡呈現前驅離子、一階中性脫除、官能基異裂與特徵產物離子`;

  const methodDesc = isIonTrap
    ? `Ion Trap 共振 CID (受 1/3 低質量截止 LMCO 限制，主要走單步最低活化能重排)`
    : `${analyzer} ${fragmentationMethod} 束流型碰撞 (無低質量截止，支援多步連續碎裂)`;

  return {
    ionization,
    analyzer,
    fragmentationMethod,
    collisionEnergy,
    ceRegime,
    isAPCI,
    isIonTrap,
    isBeamType,
    lowMassCutoffRatio,
    enablePositive,
    enableNegative,
    enableAlkaliAdducts,
    enableInSourceDehydration,
    enableSequentialFragmentation,
    enableLowMzDiagnosticIons,
    enableStrongCarbonBondCleavage,
    regimeSummary: `${ionization} / ${methodDesc} / ${ceDesc}`
  };
}

export function evaluateGcMsRegime(
  config: SimulationConfig,
  fg: FunctionalGroupInfo
): GcMsRegime {
  const ionization: 'EI' | 'CI' = config.ionization === 'CI' ? 'CI' : 'EI';
  const isCI = ionization === 'CI';
  const electronEnergy = config.electronEnergy !== undefined ? config.electronEnergy : 70;
  const reagentGas = (config.reagentGas as 'Methane' | 'Isobutane' | 'Ammonia') || 'Methane';
  const analyzer = config.analyzer || 'Quadrupole';

  const eeRegime: GcMsRegime['eeRegime'] =
    electronEnergy < 30 ? 'soft_ei' : electronEnergy < 55 ? 'mid_ei' : 'standard_70eV';

  // In CI mode, odd-electron radical pathways (M+., McLafferty radical cation, secondary acetylene loss) are replaced
  // by even-electron proton-transfer pathways ([M+H]+, reagent gas adducts, heterolytic neutral loss [M+H-HX]+).
  const enableOddElectronRadicals = !isCI;
  const enableMcLafferty = !isCI && fg.hasMcLaffertyMotif;
  const enableAlphaCleavage = !isCI;

  // Secondary ring-opening / acetylene loss (e.g. m/z 91 -> 65, m/z 77 -> 51, sequential -CH2CO -H2O)
  // requires >= 35-50 eV electron energy in EI.
  const enableSecondaryRingCracking = !isCI && eeRegime !== 'soft_ei';
  const enableDeepHomolyticCleavage = !isCI && eeRegime === 'standard_70eV';

  const enableCiReagentAdducts = isCI;
  // Ammonia CI is very soft (PA = 853.6 kJ/mol), so only labile groups fragment; Methane CI induces stronger heterolytic loss.
  const enableCiHeterolyticLosses = isCI && reagentGas !== 'Ammonia';

  let regimeSummary = '';
  if (isCI) {
    if (reagentGas === 'Ammonia') {
      regimeSummary = `GC-MS CI (NH₃ 氨氣軟電離, PA=854 kJ/mol)：高選擇性質子親和力，以 [M+H]⁺ 與強 [M+NH₄]⁺ 加合物為主，抑制自由基與深層裂解`;
    } else if (reagentGas === 'Isobutane') {
      regimeSummary = `GC-MS CI (i-C₄H₁₀ 異丁烷, PA=802 kJ/mol)：溫和質子轉移形成 [M+H]⁺、[M+C₄H₉]⁺ (+57 Da) 與一階極性基團脫除`;
    } else {
      regimeSummary = `GC-MS CI (CH₄ 甲烷, PA=544 kJ/mol)：產生 [M+H]⁺、特徵 [M+C₂H₅]⁺ (+29 Da) / [M+C₃H₅]⁺ (+41 Da) 加合物與異裂脫除離子 [M+H-HX]⁺`;
    }
  } else {
    if (eeRegime === 'soft_ei') {
      regimeSummary = `GC-MS 低能量軟電離 EI (${electronEnergy} eV)：大幅保留分子自由基陽離子 M⁺• 與低能障一階重排，抑制二階芳環開環 (-C₂H₂) 與深層骨架碎裂`;
    } else if (eeRegime === 'mid_ei') {
      regimeSummary = `GC-MS 中能量 EI (${electronEnergy} eV)：開啟分子離子 M⁺•、α-均裂、McLafferty 重排與一階中性脫除`;
    } else {
      regimeSummary = `GC-MS 標準高能 EI (${electronEnergy} eV, NIST 標準)：完整開啟 M⁺•、α-均裂、苄位擴環 (m/z 91)、McLafferty 重排與二階連續開環裂解 (m/z 91→65, 77→51)`;
    }
  }

  return {
    ionization,
    electronEnergy,
    eeRegime,
    reagentGas,
    analyzer,
    isCI,
    enableOddElectronRadicals,
    enableMcLafferty,
    enableAlphaCleavage,
    enableSecondaryRingCracking,
    enableDeepHomolyticCleavage,
    enableCiReagentAdducts,
    enableCiHeterolyticLosses,
    regimeSummary
  };
}
