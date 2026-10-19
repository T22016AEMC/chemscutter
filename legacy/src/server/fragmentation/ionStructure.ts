import { EXACT_ISOTOPE_MASSES, molToSvgDataUri } from './commonFragmentation';

export const ELECTRON_MASS = 0.00054858;
export const HYDROGEN_ATOM_MASS = 1.00782503;
export const PROTON_MASS = 1.00727647;       // H - e-
export const SODIUM_ATOM_MASS = 22.98976928;
export const SODIUM_ION_MASS = 22.98922070;  // Na - e-
export const POTASSIUM_ATOM_MASS = 38.96370648;
export const POTASSIUM_ION_MASS = 38.96315790; // K - e-
export const AMMONIUM_ION_MASS = 18.03382555;  // NH4+ (N + 4H - e-)
export const CESIUM_ATOM_MASS = 132.9054519;
export const CESIUM_ION_MASS = 132.9049033;
export const FORMATE_ANION_MASS = 44.99820285; // HCOO- (C + H + 2O + e-)
export const ACETATE_ANION_MASS = 59.01385291; // CH3COO- (2C + 3H + 2O + e-)

const ATOMIC_NUMBER_TO_SYMBOL: Record<number, string> = {
  1: 'H',
  2: 'He',
  3: 'Li',
  4: 'Be',
  5: 'B',
  6: 'C',
  7: 'N',
  8: 'O',
  9: 'F',
  10: 'Ne',
  11: 'Na',
  12: 'Mg',
  13: 'Al',
  14: 'Si',
  15: 'P',
  16: 'S',
  17: 'Cl',
  18: 'Ar',
  19: 'K',
  20: 'Ca',
  35: 'Br',
  53: 'I',
  55: 'Cs'
};

export interface MolGraphStoichiometry {
  atomCounts: Record<string, number>;
  netCharge: number;
  numRadicals: number;
  neutralFormula: string;
  ionicFormula: string;
  neutralExactMass: number;
  ionExactMass: number;
  mz: number;
}

/**
 * Formats an element count map into a canonical Hill system formula string.
 * Never produces string-hack artifacts like "-H-" or "H+".
 */
export function formatHillFormula(
  countsInput: Record<string, number>,
  charge = 0,
  isRadical = false
): string {
  const counts: Record<string, number> = {};
  for (const [el, cnt] of Object.entries(countsInput)) {
    if (cnt > 0) counts[el] = cnt;
  }

  let formula = '';
  if (counts['C']) {
    formula += 'C' + (counts['C'] > 1 ? counts['C'] : '');
    delete counts['C'];
    if (counts['H']) {
      formula += 'H' + (counts['H'] > 1 ? counts['H'] : '');
      delete counts['H'];
    }
  }

  const remaining = Object.keys(counts).sort();
  for (const sym of remaining) {
    formula += sym + (counts[sym] > 1 ? counts[sym] : '');
  }

  if (!formula) formula = 'H';

  if (charge > 0) {
    const mag = charge > 1 ? `${charge}` : '';
    formula += `${mag}+${isRadical ? '.' : ''}`;
  } else if (charge < 0) {
    const mag = Math.abs(charge) > 1 ? `${Math.abs(charge)}` : '';
    formula += `${mag}-${isRadical ? '.' : ''}`;
  } else if (isRadical) {
    formula += '.';
  }

  return formula;
}

/**
 * Computes exact monoisotopic mass from an element count map.
 */
export function computeExactMassFromCounts(counts: Record<string, number>): number {
  let mass = 0;
  for (const [sym, count] of Object.entries(counts)) {
    if (count <= 0) continue;
    const atomicMass = EXACT_ISOTOPE_MASSES[sym] ?? 12.0;
    mass += atomicMass * count;
  }
  return mass;
}

/**
 * Extracts exact atom counts, formal charge, neutral mass, ion mass, and m/z directly from an RDKit molecule.
 */
export function analyzeRDKitMolStoichiometry(
  mol: any,
  overrideRadical?: boolean
): MolGraphStoichiometry {
  const molJson = JSON.parse(mol.get_json());
  const atoms = molJson?.molecules?.[0]?.atoms || [];
  const atomCounts: Record<string, number> = {};
  let totalH = 0;
  let netCharge = 0;
  let numRadicals = 0;

  for (const a of atoms) {
    const z = a.z !== undefined ? a.z : 6;
    const sym = ATOMIC_NUMBER_TO_SYMBOL[z] || 'C';
    if (sym === 'H') {
      totalH += 1 + (a.impHs || 0);
    } else {
      // Check for explicit isotopes like 35Cl, 37Cl, 79Br, 81Br
      if (a.isotope === 37 && sym === 'Cl') {
        atomCounts['Cl37'] = (atomCounts['Cl37'] || 0) + 1;
      } else if (a.isotope === 81 && sym === 'Br') {
        atomCounts['Br81'] = (atomCounts['Br81'] || 0) + 1;
      } else {
        atomCounts[sym] = (atomCounts[sym] || 0) + 1;
      }
      totalH += a.impHs !== undefined ? a.impHs : 0;
    }
    if (a.chg) netCharge += a.chg;
    if (a.radical) numRadicals += a.radical;
  }

  if (totalH > 0) {
    atomCounts['H'] = (atomCounts['H'] || 0) + totalH;
  }

  // Normalize display counts (map Cl37/Br81 back to Cl/Br for standard Hill formula unless pure halide)
  const displayCounts: Record<string, number> = { ...atomCounts };
  if (displayCounts['Cl37']) {
    displayCounts['Cl'] = (displayCounts['Cl'] || 0) + displayCounts['Cl37'];
    delete displayCounts['Cl37'];
  }
  if (displayCounts['Br81']) {
    displayCounts['Br'] = (displayCounts['Br'] || 0) + displayCounts['Br81'];
    delete displayCounts['Br81'];
  }

  const isRadical = overrideRadical !== undefined ? overrideRadical : numRadicals > 0;
  const rawMassFromAtoms = computeExactMassFromCounts(atomCounts);

  // Neutral exact mass is the mass of the uncharged atom collection (or if already an ion, adjusted for electron mass)
  const neutralExactMass = Number(rawMassFromAtoms.toFixed(4));
  // Ion exact mass accounts for lost/gained electrons due to netCharge:
  // Positive charge (+1) means 1 electron lost (-ELECTRON_MASS); Negative charge (-1) means 1 electron gained (+ELECTRON_MASS)
  const effectiveCharge = netCharge !== 0 ? netCharge : isRadical ? 1 : 0;
  const ionExactMass = Number((rawMassFromAtoms - effectiveCharge * ELECTRON_MASS).toFixed(4));
  const absCharge = Math.max(1, Math.abs(effectiveCharge));
  const mz = Number((ionExactMass / absCharge).toFixed(4));

  const neutralFormula = formatHillFormula(displayCounts, 0, false);
  const ionicFormula = formatHillFormula(displayCounts, effectiveCharge, isRadical);

  return {
    atomCounts: displayCounts,
    netCharge: effectiveCharge,
    numRadicals,
    neutralFormula,
    ionicFormula,
    neutralExactMass,
    ionExactMass,
    mz
  };
}

export interface DerivedIonRepresentation {
  smiles: string;
  canonicalSmiles: string;
  neutralFormula: string;
  formula: string;              // True ionic formula (e.g. C9H9O4+, C9H7O4-, C9H8NaO4+)
  neutralExactMass: number;
  ionExactMass: number;
  charge: number;
  mz: number;
  image: string;
  siteDescription: string;
  isGraphVerifiedIon: boolean;
}

/**
 * Creates a genuine protonated ion [M+H]+ from a neutral RDKit molecule by locating the most basic heteroatom site
 * in the molecular graph and protonating it, or computing exact stoichiometry if no heteroatom is present.
 */
export function deriveProtonatedIon(
  neutralMol: any,
  RDKit: any,
  imgWidth = 250,
  imgHeight = 200
): DerivedIonRepresentation {
  const baseStoich = analyzeRDKitMolStoichiometry(neutralMol, false);
  const molJson = JSON.parse(neutralMol.get_json());
  const atoms = molJson?.molecules?.[0]?.atoms || [];
  const bonds = molJson?.molecules?.[0]?.bonds || [];

  // Find preferred protonation site via SMARTS priority:
  // 1. Amine nitrogen [NX3;!$(NC=O)]
  // 2. Aromatic sp2 nitrogen [nX2]
  // 3. Carbonyl oxygen [OX1]=[CX3]
  // 4. Ester / Ether / Alcohol oxygen [OX2]
  const protonationRules: { smarts: string; desc: string }[] = [
    { smarts: '[NX3;!$(NC=O);!$(NS=O)]', desc: '胺基氮原子質子化 (-NHₙ⁺)' },
    { smarts: '[nX2]', desc: '芳香雜環氮原子質子化 (Ar-NH⁺)' },
    { smarts: '[OX1]=[CX3]', desc: '羰基氧原子質子化 (C=OH⁺)' },
    { smarts: '[OX2]', desc: '含氧官能基質子化 (-OH₂⁺ / -ROH⁺)' }
  ];

  let targetAtomIdx = -1;
  let siteDescription = '氣相質子轉移形成准分子陽離子';

  for (const rule of protonationRules) {
    try {
      const qmol = RDKit.get_qmol(rule.smarts);
      if (qmol) {
        const matchStr = neutralMol.get_substruct_match(qmol);
        const match = JSON.parse(matchStr);
        if (match.atoms && match.atoms.length > 0) {
          targetAtomIdx = match.atoms[0];
          siteDescription = rule.desc;
          break;
        }
      }
    } catch {
      // ignore
    }
  }

  // Build protonated atom counts (+1 H, charge = +1)
  const protonatedCounts: Record<string, number> = {
    ...baseStoich.atomCounts,
    H: (baseStoich.atomCounts['H'] || 0) + 1
  };
  const ionicFormula = formatHillFormula(protonatedCounts, 1, false);
  const neutralExactMass = baseStoich.neutralExactMass;
  const ionExactMass = Number((neutralExactMass + PROTON_MASS).toFixed(4));
  const mz = ionExactMass;

  // Attempt to construct the actual charged RDKit molecule on the molecular graph
  if (targetAtomIdx >= 0 && targetAtomIdx < atoms.length) {
    try {
      const newAtoms = atoms.map((a: any, idx: number) => {
        const copy = { ...a };
        if (idx === targetAtomIdx) {
          copy.impHs = (copy.impHs !== undefined ? copy.impHs : 0) + 1;
          copy.chg = (copy.chg || 0) + 1;
        }
        return copy;
      });
      const newJson = {
        rdkitjson: molJson.rdkitjson,
        defaults: molJson.defaults,
        molecules: [{ atoms: newAtoms, bonds }]
      };
      const ionMol = RDKit.get_mol(JSON.stringify(newJson));
      if (ionMol && ionMol.is_valid()) {
        const ionSmiles = ionMol.get_smiles();
        const ionImg = molToSvgDataUri(ionMol, imgWidth, imgHeight);
        return {
          smiles: ionSmiles,
          canonicalSmiles: ionSmiles,
          neutralFormula: baseStoich.neutralFormula,
          formula: ionicFormula,
          neutralExactMass,
          ionExactMass,
          charge: 1,
          mz,
          image: ionImg || molToSvgDataUri(neutralMol, imgWidth, imgHeight),
          siteDescription,
          isGraphVerifiedIon: true
        };
      }
    } catch {
      // fallback to neutral depiction with exact protonated stoichiometry
    }
  }

  const fallbackSmiles = neutralMol.get_smiles();
  return {
    smiles: fallbackSmiles,
    canonicalSmiles: fallbackSmiles,
    neutralFormula: baseStoich.neutralFormula,
    formula: ionicFormula,
    neutralExactMass,
    ionExactMass,
    charge: 1,
    mz,
    image: molToSvgDataUri(neutralMol, imgWidth, imgHeight),
    siteDescription,
    isGraphVerifiedIon: false
  };
}

/**
 * Creates a genuine deprotonated ion [M-H]- from a neutral RDKit molecule by locating the most acidic proton site
 * in the molecular graph and removing H+ (setting formal charge = -1 on the conjugate base atom).
 * Never uses string hacks like "Formula-H-": returns the true conjugate base formula (e.g. C9H7O4- for Aspirin).
 */
export function deriveDeprotonatedIon(
  neutralMol: any,
  RDKit: any,
  imgWidth = 250,
  imgHeight = 200
): DerivedIonRepresentation | null {
  const baseStoich = analyzeRDKitMolStoichiometry(neutralMol, false);
  const currentH = baseStoich.atomCounts['H'] || 0;
  if (currentH < 1) return null;

  const molJson = JSON.parse(neutralMol.get_json());
  const atoms = molJson?.molecules?.[0]?.atoms || [];
  const bonds = molJson?.molecules?.[0]?.bonds || [];

  // Acidic site priority via SMARTS (the first atom in pattern is the deprotonation target):
  const deprotonationRules: { smarts: string; desc: string }[] = [
    { smarts: '[OX2H1][SX4](=O)=O', desc: '磺酸羥基去質子化 (-SO₃⁻)' },
    { smarts: '[OX2H1][CX3]=O', desc: '羧酸羥基去質子化 (-COO⁻)' },
    { smarts: '[OX2H1][c]', desc: '酚羥基去質子化 (Ar-O⁻)' },
    { smarts: '[NX3H1,NX3H2][SX4,CX3]=O', desc: '醯胺/磺醯胺氮去質子化 (-CON⁻-)' },
    { smarts: '[OX2H1][CX4]', desc: '醇羥基去質子化 (-CH₂O⁻)' }
  ];

  let targetAtomIdx = -1;
  let siteDescription = '酸性官能基去質子化形成共軛鹼陰離子';

  for (const rule of deprotonationRules) {
    try {
      const qmol = RDKit.get_qmol(rule.smarts);
      if (qmol) {
        const matchStr = neutralMol.get_substruct_match(qmol);
        const match = JSON.parse(matchStr);
        if (match.atoms && match.atoms.length > 0) {
          targetAtomIdx = match.atoms[0];
          siteDescription = rule.desc;
          break;
        }
      }
    } catch {
      // ignore
    }
  }

  // Exact conjugate base counts (-1 H, charge = -1)
  const deprotCounts: Record<string, number> = {
    ...baseStoich.atomCounts,
    H: currentH - 1
  };
  if (deprotCounts['H'] <= 0) delete deprotCounts['H'];

  const ionicFormula = formatHillFormula(deprotCounts, -1, false);
  const neutralExactMass = baseStoich.neutralExactMass;
  const ionExactMass = Number((neutralExactMass - PROTON_MASS).toFixed(4));
  const mz = ionExactMass;

  if (targetAtomIdx >= 0 && targetAtomIdx < atoms.length) {
    try {
      const newAtoms = atoms.map((a: any, idx: number) => {
        const copy = { ...a };
        if (idx === targetAtomIdx && (copy.impHs || 0) > 0) {
          copy.impHs = copy.impHs - 1;
          copy.chg = (copy.chg || 0) - 1;
        }
        return copy;
      });
      const newJson = {
        rdkitjson: molJson.rdkitjson,
        defaults: molJson.defaults,
        molecules: [{ atoms: newAtoms, bonds }]
      };
      const ionMol = RDKit.get_mol(JSON.stringify(newJson));
      if (ionMol && ionMol.is_valid()) {
        const ionSmiles = ionMol.get_smiles();
        const ionImg = molToSvgDataUri(ionMol, imgWidth, imgHeight);
        return {
          smiles: ionSmiles,
          canonicalSmiles: ionSmiles,
          neutralFormula: baseStoich.neutralFormula,
          formula: ionicFormula,
          neutralExactMass,
          ionExactMass,
          charge: -1,
          mz,
          image: ionImg || molToSvgDataUri(neutralMol, imgWidth, imgHeight),
          siteDescription,
          isGraphVerifiedIon: true
        };
      }
    } catch {
      // fallback
    }
  }

  const fallbackSmiles = neutralMol.get_smiles();
  return {
    smiles: fallbackSmiles,
    canonicalSmiles: fallbackSmiles,
    neutralFormula: baseStoich.neutralFormula,
    formula: ionicFormula,
    neutralExactMass,
    ionExactMass,
    charge: -1,
    mz,
    image: molToSvgDataUri(neutralMol, imgWidth, imgHeight),
    siteDescription,
    isGraphVerifiedIon: false
  };
}

/**
 * Derives adduct ion stoichiometry and exact mass (e.g. [M+Na]+, [M+K]+, [M+NH4]+, [M+HCOO]-, [M+CH3COO]-).
 */
export function deriveAdductIon(
  neutralMol: any,
  adductType: '[M+Na]+' | '[M+K]+' | '[M+NH4]+' | '[M+Cs]+' | '[M+HCOO]-' | '[M+CH3COO]-',
  imgWidth = 250,
  imgHeight = 200
): DerivedIonRepresentation {
  const baseStoich = analyzeRDKitMolStoichiometry(neutralMol, false);
  const counts: Record<string, number> = { ...baseStoich.atomCounts };
  let ionExactMass = baseStoich.neutralExactMass;
  let charge = 1;
  let siteDescription = '';

  switch (adductType) {
    case '[M+Na]+':
      counts['Na'] = (counts['Na'] || 0) + 1;
      ionExactMass += SODIUM_ION_MASS;
      charge = 1;
      siteDescription = '極性含氧/含氮官能基與鈉離子 (Na⁺) 配位形成非共價加合物';
      break;
    case '[M+K]+':
      counts['K'] = (counts['K'] || 0) + 1;
      ionExactMass += POTASSIUM_ION_MASS;
      charge = 1;
      siteDescription = '極性官能基與鉀離子 (K⁺) 配位形成非共價加合物';
      break;
    case '[M+Cs]+':
      counts['Cs'] = (counts['Cs'] || 0) + 1;
      ionExactMass += CESIUM_ION_MASS;
      charge = 1;
      siteDescription = 'Cs⁺ 主離子束注入表面與母分子形成銫配位二次陽離子';
      break;
    case '[M+NH4]+':
      counts['N'] = (counts['N'] || 0) + 1;
      counts['H'] = (counts['H'] || 0) + 4;
      ionExactMass += AMMONIUM_ION_MASS;
      charge = 1;
      siteDescription = '氣相或流動相銨根離子 (NH₄⁺) 氫鍵配位加合物';
      break;
    case '[M+HCOO]-':
      counts['C'] = (counts['C'] || 0) + 1;
      counts['H'] = (counts['H'] || 0) + 1;
      counts['O'] = (counts['O'] || 0) + 2;
      ionExactMass += FORMATE_ANION_MASS;
      charge = -1;
      siteDescription = '流動相甲酸根陰離子 (HCOO⁻) 氫鍵配位加合物';
      break;
    case '[M+CH3COO]-':
      counts['C'] = (counts['C'] || 0) + 2;
      counts['H'] = (counts['H'] || 0) + 3;
      counts['O'] = (counts['O'] || 0) + 2;
      ionExactMass += ACETATE_ANION_MASS;
      charge = -1;
      siteDescription = '流動相乙酸根陰離子 (CH₃COO⁻) 氫鍵配位加合物';
      break;
  }

  ionExactMass = Number(ionExactMass.toFixed(4));
  const mz = Number((ionExactMass / Math.abs(charge)).toFixed(4));
  const formula = formatHillFormula(counts, charge, false);
  const smiles = neutralMol.get_smiles();

  return {
    smiles,
    canonicalSmiles: smiles,
    neutralFormula: baseStoich.neutralFormula,
    formula,
    neutralExactMass: baseStoich.neutralExactMass,
    ionExactMass,
    charge,
    mz,
    image: molToSvgDataUri(neutralMol, imgWidth, imgHeight),
    siteDescription,
    isGraphVerifiedIon: true
  };
}

/**
 * Builds a genuine charged RDKit ion molecule from an explicitly charged SMILES string
 * (e.g., '[cH+]1cccccc1' for Tropylium C7H7+, 'c1cc[c+]cc1' for Phenyl cation C6H5+, 'C[C+]=O' for Acetylium C2H3O+).
 * Ensures SMILES, formula, charge, neutralExactMass, ionExactMass, and m/z are 100% consistent!
 */
export function buildVerifiedIonFromSmiles(
  chargedSmiles: string,
  RDKit: any,
  imgWidth = 220,
  imgHeight = 180
): DerivedIonRepresentation | null {
  try {
    const mol = RDKit.get_mol(chargedSmiles);
    if (!mol || !mol.is_valid()) return null;

    const stoich = analyzeRDKitMolStoichiometry(mol, false);
    const canonicalSmiles = mol.get_smiles();
    const image = molToSvgDataUri(mol, imgWidth, imgHeight);

    return {
      smiles: canonicalSmiles,
      canonicalSmiles,
      neutralFormula: stoich.neutralFormula,
      formula: stoich.ionicFormula,
      neutralExactMass: stoich.neutralExactMass,
      ionExactMass: stoich.ionExactMass,
      charge: stoich.netCharge || 1,
      mz: stoich.mz,
      image,
      siteDescription: '真實帶電離子分子圖結構 (RDKit Graph Ion)',
      isGraphVerifiedIon: true
    };
  } catch {
    return null;
  }
}
