// 非環單鍵斷裂：對每個不在環上的單鍵切斷，產生兩側碎片與直接異裂離子。
// 來源：legacy commonFragmentation.ts generateSingleBondFragments
import { ELECTRON_MASS } from '../constants/masses';
import { molToSvgDataUri } from '../chem/depiction';
import { calculateFormulaFromJson } from '../chem/formula';
import type { CommonChemAtom, CommonChemJson, JSMol, RDKitDescriptors, RDKitModule } from '../rdkit/types';

export interface CleavedFragment {
  mol: JSMol;
  smiles: string;
  formula: string;
  exactMass: number;
  image: string;
  bondIdx: number;
  cleavedAtomU: number;
  cleavedAtomV: number;
  bondClass: 'ester' | 'amide' | 'ether' | 'carbonyl_alpha' | 'benzylic' | 'halogen' | 'aliphatic_cc';
  bondDescription: string;
  isLabileHeteroatomBond: boolean;
  // Direct heterolytic cleaved ion without artificial H addition (e.g. C[C+]=O or [O-]c1ccccc1C(=O)O)
  directCationMol?: JSMol;
  directCationSmiles?: string;
  directCationFormula?: string;
  directCationMz?: number;
  directCationImage?: string;
  directAnionMol?: JSMol;
  directAnionSmiles?: string;
  directAnionFormula?: string;
  directAnionMz?: number;
  directAnionImage?: string;
  complementaryFormula?: string;
  complementaryMass?: number;
}

/**
 * Executes acyclic single bond cleavages on an RDKit molecule.
 * Each fragment is guaranteed to be a genuine, valid RDKit molecule with correct formula, exact mass,
 * bond classification, and direct heterolytic ion structures.
 */
export function generateSingleBondFragments(mol: JSMol, RDKit: RDKitModule): CleavedFragment[] {
  const molJson = JSON.parse(mol.get_json()) as CommonChemJson;
  const atoms = molJson?.molecules?.[0]?.atoms || [];
  const bonds = molJson?.molecules?.[0]?.bonds || [];
  const numAtoms = atoms.length;
  const results: CleavedFragment[] = [];
  const seenSmiles = new Set<string>();

  // Helper to check if an atom has a double bond to oxygen (carbonyl)
  const hasCarbonylDoubleBond = (atomIdx: number): boolean => {
    for (const b of bonds) {
      if ((b.bo || 1) === 2) {
        const other = b.atoms[0] === atomIdx ? b.atoms[1] : b.atoms[1] === atomIdx ? b.atoms[0] : -1;
        if (other !== -1 && atoms[other]?.z === 8) return true;
      }
    }
    return false;
  };

  for (let bIdx = 0; bIdx < bonds.length; bIdx++) {
    const bond = bonds[bIdx];
    const bo = bond.bo !== undefined ? bond.bo : 1;
    if (bo !== 1) continue; // Only single bonds

    const u = bond.atoms[0];
    const v = bond.atoms[1];

    // Check if bond is in a ring via BFS
    const visited: boolean[] = new Array(numAtoms).fill(false);
    const queue = [u];
    visited[u] = true;

    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (let i = 0; i < bonds.length; i++) {
        if (i === bIdx) continue;
        const b = bonds[i];
        let neighbor = -1;
        if (b.atoms[0] === curr) neighbor = b.atoms[1];
        else if (b.atoms[1] === curr) neighbor = b.atoms[0];
        if (neighbor !== -1 && !visited[neighbor]) {
          visited[neighbor] = true;
          queue.push(neighbor);
        }
      }
    }

    if (visited[v]) continue; // In-ring bond, skip

    const compA: number[] = [];
    const compB: number[] = [];
    for (let i = 0; i < numAtoms; i++) {
      if (visited[i]) compA.push(i);
      else compB.push(i);
    }

    // Classify the cleaved bond
    const zU = atoms[u]?.z || 6;
    const zV = atoms[v]?.z || 6;
    const uIsCarb = zU === 6 && hasCarbonylDoubleBond(u);
    const vIsCarb = zV === 6 && hasCarbonylDoubleBond(v);

    let bondClass: CleavedFragment['bondClass'] = 'aliphatic_cc';
    let bondDescription = '非環單鍵斷裂 (Exocyclic Single-Bond Cleavage)';
    let isLabileHeteroatomBond = false;

    if ((uIsCarb && zV === 8) || (vIsCarb && zU === 8)) {
      bondClass = 'ester';
      bondDescription = '酯基/羧基 C-O 醯氧單鍵異裂 (Ester/Acyl-Oxygen Cleavage)';
      isLabileHeteroatomBond = true;
    } else if ((uIsCarb && zV === 7) || (vIsCarb && zU === 7)) {
      bondClass = 'amide';
      bondDescription = '醯胺 C-N 鍵異裂 (Amide C-N Bond Cleavage)';
      isLabileHeteroatomBond = true;
    } else if (zU === 8 || zV === 8 || zU === 7 || zV === 7 || zU === 16 || zV === 16) {
      bondClass = 'ether';
      bondDescription = '雜原子單鍵斷裂 (C-O / C-N / C-S Cleavage)';
      isLabileHeteroatomBond = true;
    } else if (uIsCarb || vIsCarb) {
      bondClass = 'carbonyl_alpha';
      bondDescription = '羰基 α-碳單鍵斷裂 (Carbonyl α-Cleavage)';
      isLabileHeteroatomBond = false;
    } else if ([9, 17, 35, 53].includes(zU) || [9, 17, 35, 53].includes(zV)) {
      bondClass = 'halogen';
      bondDescription = '碳-鹵素鍵斷裂 (Carbon-Halogen Cleavage)';
      isLabileHeteroatomBond = true;
    }

    const makeSubMol = (
      nodeIndices: number[],
      severedAtom: number,
      mode: 'h_transfer' | 'direct_cation' | 'direct_anion'
    ): JSMol | null => {
      const oldToNew = new Map<number, number>();
      nodeIndices.forEach((oldIdx, newIdx) => oldToNew.set(oldIdx, newIdx));

      const subAtoms = nodeIndices.map((oldIdx) => {
        const atomCopy: CommonChemAtom = { ...atoms[oldIdx] };
        if (oldIdx === severedAtom) {
          if (mode === 'h_transfer') {
            atomCopy.impHs = (atomCopy.impHs || 0) + 1;
          } else if (mode === 'direct_cation') {
            atomCopy.chg = (atomCopy.chg || 0) + 1;
          } else if (mode === 'direct_anion') {
            atomCopy.chg = (atomCopy.chg || 0) - 1;
          }
        }
        return atomCopy;
      });

      const subBonds: { bo: number; atoms: [number, number] }[] = [];
      for (let i = 0; i < bonds.length; i++) {
        if (i === bIdx) continue;
        const b = bonds[i];
        if (oldToNew.has(b.atoms[0]) && oldToNew.has(b.atoms[1])) {
          subBonds.push({
            bo: b.bo !== undefined ? b.bo : 1,
            atoms: [oldToNew.get(b.atoms[0])!, oldToNew.get(b.atoms[1])!]
          });
        }
      }

      const subJson = {
        rdkitjson: molJson.rdkitjson,
        defaults: molJson.defaults,
        molecules: [{ atoms: subAtoms, bonds: subBonds }]
      };

      try {
        const m = RDKit.get_mol(JSON.stringify(subJson));
        if (m && m.is_valid()) return m;
      } catch {
        return null;
      }
      return null;
    };

    const pairs = [
      { nodes: compA, otherNodes: compB, severedU: u, severedV: v },
      { nodes: compB, otherNodes: compA, severedU: v, severedV: u }
    ];

    for (const side of pairs) {
      const fragMol = makeSubMol(side.nodes, side.severedU, 'h_transfer');
      if (!fragMol || !fragMol.is_valid()) continue;

      const fragSmiles = fragMol.get_smiles();
      if (!fragSmiles || fragSmiles === '' || seenSmiles.has(fragSmiles)) continue;
      seenSmiles.add(fragSmiles);

      const fragJson = JSON.parse(fragMol.get_json()) as CommonChemJson;
      const fragFormula = calculateFormulaFromJson(fragJson);
      const fragDesc = JSON.parse(fragMol.get_descriptors()) as RDKitDescriptors;
      const fragMass = Number(fragDesc.exactmw || fragDesc.amw || 0);
      const fragImg = molToSvgDataUri(fragMol, 250, 200);

      // Also build direct cleavage cation (e.g. R-[C+]=O or R-[CH2+]) if severed atom is carbon
      let directCationMol: JSMol | undefined = undefined;
      let directCationSmiles: string | undefined;
      let directCationFormula: string | undefined;
      let directCationMz: number | undefined;
      let directCationImage: string | undefined;

      const zSevered = atoms[side.severedU]?.z || 6;
      if (zSevered === 6) {
        const catMol = makeSubMol(side.nodes, side.severedU, 'direct_cation');
        if (catMol && catMol.is_valid()) {
          directCationMol = catMol;
          directCationSmiles = catMol.get_smiles();
          directCationFormula = calculateFormulaFromJson(JSON.parse(catMol.get_json()) as CommonChemJson);
          const catDesc = JSON.parse(catMol.get_descriptors()) as RDKitDescriptors;
          directCationMz = Number((Number(catDesc.exactmw || catDesc.amw || 0) - ELECTRON_MASS).toFixed(4));
          directCationImage = molToSvgDataUri(catMol, 250, 200);
        }
      }

      // Also build direct cleavage anion (e.g. R-O- or R-COO-) if severed atom is O, N, S, or halogen
      let directAnionMol: JSMol | undefined = undefined;
      let directAnionSmiles: string | undefined;
      let directAnionFormula: string | undefined;
      let directAnionMz: number | undefined;
      let directAnionImage: string | undefined;

      if ([8, 7, 16, 9, 17, 35, 53].includes(zSevered)) {
        const anMol = makeSubMol(side.nodes, side.severedU, 'direct_anion');
        if (anMol && anMol.is_valid()) {
          directAnionMol = anMol;
          directAnionSmiles = anMol.get_smiles();
          directAnionFormula = calculateFormulaFromJson(JSON.parse(anMol.get_json()) as CommonChemJson);
          const anDesc = JSON.parse(anMol.get_descriptors()) as RDKitDescriptors;
          directAnionMz = Number((Number(anDesc.exactmw || anDesc.amw || 0) + ELECTRON_MASS).toFixed(4));
          directAnionImage = molToSvgDataUri(anMol, 250, 200);
        }
      }

      results.push({
        mol: fragMol,
        smiles: fragSmiles,
        formula: fragFormula,
        exactMass: Number(fragMass.toFixed(4)),
        image: fragImg,
        bondIdx: bIdx,
        cleavedAtomU: side.severedU,
        cleavedAtomV: side.severedV,
        bondClass,
        bondDescription,
        isLabileHeteroatomBond,
        directCationMol,
        directCationSmiles,
        directCationFormula,
        directCationMz,
        directCationImage,
        directAnionMol,
        directAnionSmiles,
        directAnionFormula,
        directAnionMz,
        directAnionImage
      });
    }
  }

  return results;
}
