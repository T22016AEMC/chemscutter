/// <reference types="vite/client" />
// 新舊對照測試：同一組輸入分別交給舊版（legacy/）與新版（src/engine/）的共用模組，輸出必須完全相同。
// 暫時例外：tests/parity/ 可以 import legacy/，階段 1 結束時會刪除。
import { beforeAll, describe, expect, it } from 'vitest';

// ---- 舊版 ----
import * as legacyCommon from '../../legacy/src/server/fragmentation/commonFragmentation';
import * as legacyIon from '../../legacy/src/server/fragmentation/ionStructure';
import * as legacyMassBalance from '../../legacy/src/server/fragmentation/massBalance';
import * as legacyIsotope from '../../legacy/src/server/fragmentation/isotopeRules';
import * as legacyFg from '../../legacy/src/server/fragmentation/functionalGroupRules';
import * as legacyProfiles from '../../legacy/src/server/fragmentation/instrumentProfiles';
import * as legacyRegime from '../../legacy/src/server/fragmentation/parameterRegime';
import * as legacyReactions from '../../legacy/src/server/fragmentation/reactionTransforms';
import * as legacyNeutralLoss from '../../legacy/src/server/fragmentation/neutralLossEngine';
import * as legacyScoring from '../../legacy/src/server/fragmentation/fragmentScoring';

// ---- 新版 ----
import { getRDKit } from '../../src/engine/rdkit/loader';
import type { JSMol, RDKitModule } from '../../src/engine/rdkit/types';
import * as masses from '../../src/engine/constants/masses';
import {
  calculateFormulaFromJson,
  computeExactMassFromCounts,
  formatHillFormula,
  parseFormulaCounts
} from '../../src/engine/chem/formula';
import { molToSvgDataUri } from '../../src/engine/chem/depiction';
import {
  balanceParentheses,
  expandChemicalAbbreviations,
  fixTrivalentOxygen,
  fixUnclosedRings,
  normalizeMolblock,
  parseInputToMol,
  repairSmilesSyntax
} from '../../src/engine/chem/inputParsing';
import { analyzeRDKitMolStoichiometry } from '../../src/engine/chem/stoichiometry';
import {
  ADDUCT_TYPES,
  buildVerifiedIonFromSmiles,
  deriveAdductIon,
  deriveDeprotonatedIon,
  deriveProtonatedIon
} from '../../src/engine/chem/ionDerivation';
import { verifyFragmentMassBalance } from '../../src/engine/chem/massBalance';
import { generateIsotopeCandidates } from '../../src/engine/chem/isotopes';
import { detectFunctionalGroups, type FunctionalGroupInfo } from '../../src/engine/rules/functionalGroups';
import {
  executeGraphReactions,
  executeMcLaffertyGraphRearrangement,
  getSmartsMatches
} from '../../src/engine/rules/graphReactions';
import { generateValidNeutralLosses } from '../../src/engine/rules/neutralLosses';
import { generateSingleBondFragments } from '../../src/engine/rules/singleBondCleavage';
import { getProfileForConfig, INSTRUMENT_PROFILES } from '../../src/engine/platform/instrumentProfiles';
import {
  evaluateGcMsRegime,
  evaluateLcMsMsRegime,
  evaluateTofSimsRegime
} from '../../src/engine/platform/parameterRegime';
import { deduplicateAndRankCandidates } from '../../src/engine/scoring/deduplicate';
import type { FragmentCandidate, SimulationConfig } from '../../src/engine/types';

import { buildCases, INPUTS, TECHNIQUES } from '../fixtures/cases';

// ---------------------------------------------------------------------------
// 比較工具：RDKit 分子物件轉成 get_smiles()，SVG 字串轉成 SHA-256；其餘值原樣保留，以 toStrictEqual 嚴格比較
// ---------------------------------------------------------------------------

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const isSvg = (s: string) => s.startsWith('data:image/svg') || s.includes('<svg');
const isMol = (v: object): v is JSMol => typeof (v as { get_smiles?: unknown }).get_smiles === 'function';

async function canon(value: unknown): Promise<unknown> {
  if (typeof value === 'string') return isSvg(value) ? { svgSha256: await sha256(value) } : value;
  if (Array.isArray(value)) return Promise.all(value.map(canon));
  if (value !== null && typeof value === 'object') {
    if (isMol(value)) return { molSmiles: value.get_smiles() };
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) out[key] = await canon((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

/** 斷言新舊輸出完全相同（數值以 Object.is 嚴格比較，不設容許誤差） */
async function expectSame(actualNew: unknown, expectedLegacy: unknown) {
  expect(await canon(actualNew)).toStrictEqual(await canon(expectedLegacy));
}

// ---------------------------------------------------------------------------
// 測試資料
// ---------------------------------------------------------------------------

interface GoldenFile {
  parent?: { formula: string; exact_mass: number };
  candidates?: FragmentCandidate[];
  signals?: { formula: string; neutralFormula?: string }[];
  structures?: { formula: string; neutralFormula?: string }[];
}

const goldenModules = import.meta.glob<{ default: GoldenFile }>('../golden/*.json', { eager: true });
const goldenCases = Object.entries(goldenModules)
  .filter(([path]) => !path.endsWith('_index.json'))
  .map(([path, mod]) => ({ id: path.replace(/^.*\/(.*)\.json$/, '$1'), data: mod.default }));

const EXTRA_PARSE_INPUTS = [
  '',
  '   ',
  '{"smiles":"CCO"}',
  '{"smiles": 5}',
  '{"input":"aspirin"}',
  '{"molblock":"not a molblock"}',
  '{not json}',
  'PhCOOH',
  'Ph-OMe',
  'AcO-Ph-COOH',
  'O2N-Ph',
  't-BuOH',
  'CC(=O',
  'C1CCC',
  'CC(O))C',
  'c1ccccc1O2C',
  '阿司匹靈',
  'ACETONE',
  'Ethyl Acetate'
];

const EXTRA_REPAIR_INPUTS = ['CC(=O', 'C1CCC', 'CC(O))C', 'CO1C', 'c1ccccc1O2C', 'C(=O1)C', '', '  ', 'C[N+](=O)[O-]1'];

const CHARGED_ION_SMILES = [
  'c1cc[c+]cc1',
  '[cH+]1cccccc1',
  'C[C+]=O',
  'CC(=O)[O-]',
  'O=C[O-]',
  'C1=CC=[CH+]C=1',
  'C#CC=[CH+]',
  '[37Cl-]',
  '[81Br-]',
  'not_a_smiles(',
  ''
];

const EXTRA_FORMULAS = ['', 'C6H6NO++.', 'C7H7+.', 'Cl-', '35Cl-', 'C2H4O2 (³⁷Cl)', 'H', 'CO2', 'C9H8NaO4+', 'Br2-•', 'c6h6'];

const SMARTS_SAMPLES = ['[#6,c][CX3](=[OX1])[OX2H1,O-]', '[OX2]', 'c', '[#7]', 'invalid((smarts'];

// ---------------------------------------------------------------------------

let RDKit: RDKitModule;
const parsedMols = new Map<string, JSMol>();
const fgByInput = new Map<string, FunctionalGroupInfo>();

beforeAll(async () => {
  RDKit = await getRDKit();
  for (const [name, input] of INPUTS) {
    const { mol } = parseInputToMol(input, RDKit);
    if (mol) {
      parsedMols.set(name, mol);
      fgByInput.set(name, detectFunctionalGroups(mol, RDKit));
    }
  }
});

describe('RDKit 載入器與質量常數', () => {
  it('新舊 getRDKit() 載入相同版本的 RDKit', async () => {
    const legacyRDKit = (await legacyCommon.getRDKit()) as RDKitModule;
    expect(RDKit.version()).toBe(legacyRDKit.version());
  });

  it('getRDKit() 為單例', async () => {
    expect(await getRDKit()).toBe(RDKit);
  });

  it('質量常數與舊版數值相同', () => {
    expect(masses.EXACT_ISOTOPE_MASSES).toStrictEqual(legacyCommon.EXACT_ISOTOPE_MASSES);
    expect(masses.ELECTRON_MASS).toBe(legacyIon.ELECTRON_MASS);
    expect(masses.HYDROGEN_ATOM_MASS).toBe(legacyIon.HYDROGEN_ATOM_MASS);
    expect(masses.PROTON_MASS).toBe(legacyIon.PROTON_MASS);
    expect(masses.SODIUM_ATOM_MASS).toBe(legacyIon.SODIUM_ATOM_MASS);
    expect(masses.SODIUM_ION_MASS).toBe(legacyIon.SODIUM_ION_MASS);
    expect(masses.POTASSIUM_ATOM_MASS).toBe(legacyIon.POTASSIUM_ATOM_MASS);
    expect(masses.POTASSIUM_ION_MASS).toBe(legacyIon.POTASSIUM_ION_MASS);
    expect(masses.AMMONIUM_ION_MASS).toBe(legacyIon.AMMONIUM_ION_MASS);
    expect(masses.CESIUM_ATOM_MASS).toBe(legacyIon.CESIUM_ATOM_MASS);
    expect(masses.CESIUM_ION_MASS).toBe(legacyIon.CESIUM_ION_MASS);
    expect(masses.FORMATE_ANION_MASS).toBe(legacyIon.FORMATE_ANION_MASS);
    expect(masses.ACETATE_ANION_MASS).toBe(legacyIon.ACETATE_ANION_MASS);
  });

  it('儀器 profile 表與舊版相同', () => {
    expect(INSTRUMENT_PROFILES).toStrictEqual(legacyProfiles.INSTRUMENT_PROFILES);
    for (const t of TECHNIQUES) {
      expect(getProfileForConfig(t)).toStrictEqual(legacyProfiles.getProfileForConfig(t));
    }
  });
});

describe('結構輸入解析與字串處理', () => {
  const allTexts = [...INPUTS.map(([, input]) => input), ...EXTRA_PARSE_INPUTS];

  it.each(allTexts.map((t) => [JSON.stringify(t).slice(0, 50), t]))('parseInputToMol %s', async (_label, text) => {
    await expectSame(parseInputToMol(text, RDKit), legacyCommon.parseInputToMol(text, RDKit));
  });

  it('無效輸入的錯誤訊息一致', () => {
    const fresh = parseInputToMol('not_a_molecule_xyz', RDKit);
    const old = legacyCommon.parseInputToMol('not_a_molecule_xyz', RDKit);
    expect(fresh.mol).toBeNull();
    expect(fresh.error).toBeDefined();
    expect(fresh.error).toBe(old.error);
  });

  it('expandChemicalAbbreviations / balanceParentheses / fixUnclosedRings / fixTrivalentOxygen / normalizeMolblock', () => {
    for (const t of [...allTexts, ...EXTRA_REPAIR_INPUTS]) {
      expect(expandChemicalAbbreviations(t)).toBe(legacyCommon.expandChemicalAbbreviations(t));
      expect(balanceParentheses(t)).toBe(legacyCommon.balanceParentheses(t));
      expect(fixUnclosedRings(t)).toBe(legacyCommon.fixUnclosedRings(t));
      expect(fixTrivalentOxygen(t)).toBe(legacyCommon.fixTrivalentOxygen(t));
      expect(normalizeMolblock(t)).toBe(legacyCommon.normalizeMolblock(t));
    }
    // Molfile 標頭行數不是 3 行時會被重建
    const shifted = '\n' + INPUTS.find(([n]) => n === 'molfile_ethyl_acetate')![1];
    expect(normalizeMolblock(shifted)).toBe(legacyCommon.normalizeMolblock(shifted));
  });

  it('repairSmilesSyntax', async () => {
    for (const t of [...allTexts, ...EXTRA_REPAIR_INPUTS]) {
      await expectSame(repairSmilesSyntax(t, RDKit), legacyCommon.repairSmilesSyntax(t, RDKit));
    }
  });
});

describe.each(INPUTS.filter(([name]) => name !== 'invalid_input').map(([name]) => [name]))('分子 %s', (name) => {
  const mol = () => parsedMols.get(name)!;

  it('已成功解析', () => {
    expect(parsedMols.has(name)).toBe(true);
  });

  it('calculateFormulaFromJson', () => {
    const json = JSON.parse(mol().get_json());
    expect(calculateFormulaFromJson(json)).toBe(legacyCommon.calculateFormulaFromJson(json));
  });

  it('analyzeRDKitMolStoichiometry', async () => {
    for (const override of [undefined, true, false]) {
      await expectSame(
        analyzeRDKitMolStoichiometry(mol(), override),
        legacyIon.analyzeRDKitMolStoichiometry(mol(), override)
      );
    }
  });

  it('formatHillFormula / computeExactMassFromCounts', () => {
    const counts = analyzeRDKitMolStoichiometry(mol()).atomCounts;
    const variants: Record<string, number>[] = [
      counts,
      {},
      { ...counts, H: 0 },
      { ...counts, Cl37: 1, Br81: 2, Xx: 1, Na: -1 }
    ];
    for (const c of variants) {
      for (const charge of [-2, -1, 0, 1, 2]) {
        for (const radical of [false, true]) {
          expect(formatHillFormula(c, charge, radical)).toBe(legacyIon.formatHillFormula(c, charge, radical));
        }
      }
      expect(formatHillFormula(c)).toBe(legacyIon.formatHillFormula(c));
      expect(computeExactMassFromCounts(c)).toBe(legacyIon.computeExactMassFromCounts(c));
    }
  });

  it('deriveProtonatedIon / deriveDeprotonatedIon', async () => {
    await expectSame(deriveProtonatedIon(mol(), RDKit), legacyIon.deriveProtonatedIon(mol(), RDKit));
    await expectSame(deriveProtonatedIon(mol(), RDKit, 300, 240), legacyIon.deriveProtonatedIon(mol(), RDKit, 300, 240));
    await expectSame(deriveDeprotonatedIon(mol(), RDKit), legacyIon.deriveDeprotonatedIon(mol(), RDKit));
    await expectSame(
      deriveDeprotonatedIon(mol(), RDKit, 300, 240),
      legacyIon.deriveDeprotonatedIon(mol(), RDKit, 300, 240)
    );
  });

  it.each(ADDUCT_TYPES.map((a) => [a]))('deriveAdductIon %s', async (adduct) => {
    await expectSame(deriveAdductIon(mol(), adduct), legacyIon.deriveAdductIon(mol(), adduct));
    await expectSame(deriveAdductIon(mol(), adduct, 300, 240), legacyIon.deriveAdductIon(mol(), adduct, 300, 240));
  });

  it('buildVerifiedIonFromSmiles（以分子本身的 SMILES）', async () => {
    const smiles = mol().get_smiles();
    await expectSame(buildVerifiedIonFromSmiles(smiles, RDKit), legacyIon.buildVerifiedIonFromSmiles(smiles, RDKit));
  });

  it('detectFunctionalGroups', () => {
    expect(detectFunctionalGroups(mol(), RDKit)).toStrictEqual(legacyFg.detectFunctionalGroups(mol(), RDKit));
  });

  it('getSmartsMatches', () => {
    for (const smarts of SMARTS_SAMPLES) {
      expect(getSmartsMatches(mol(), smarts, RDKit)).toStrictEqual(legacyReactions.getSmartsMatches(mol(), smarts, RDKit));
    }
  });

  it('executeGraphReactions', async () => {
    await expectSame(executeGraphReactions(mol(), RDKit), legacyReactions.executeGraphReactions(mol(), RDKit));
  });

  it('executeMcLaffertyGraphRearrangement', async () => {
    await expectSame(
      executeMcLaffertyGraphRearrangement(mol(), RDKit),
      legacyReactions.executeMcLaffertyGraphRearrangement(mol(), RDKit)
    );
  });

  it('generateValidNeutralLosses', async () => {
    const fg = fgByInput.get(name)!;
    await expectSame(
      generateValidNeutralLosses(mol(), RDKit, fg),
      legacyNeutralLoss.generateValidNeutralLosses(mol(), RDKit, fg)
    );
  });

  it('generateSingleBondFragments', async () => {
    await expectSame(generateSingleBondFragments(mol(), RDKit), legacyCommon.generateSingleBondFragments(mol(), RDKit));
  });

  it('molToSvgDataUri', async () => {
    await expectSame(molToSvgDataUri(mol()), legacyCommon.molToSvgDataUri(mol()));
    await expectSame(molToSvgDataUri(mol(), 400, 300), legacyCommon.molToSvgDataUri(mol(), 400, 300));
  });

  it('generateIsotopeCandidates', () => {
    const fg = fgByInput.get(name)!;
    const formula = calculateFormulaFromJson(JSON.parse(mol().get_json()));
    const exactMass = Number(JSON.parse(mol().get_descriptors()).exactmw);
    for (const mode of ['Positive', 'Negative', 'Both'] as const) {
      expect(generateIsotopeCandidates(formula, exactMass, mode, fg)).toStrictEqual(
        legacyIsotope.generateIsotopeCandidates(formula, exactMass, mode, fg)
      );
    }
  });
});

describe('不依賴分子的函式', () => {
  it('molToSvgDataUri 對 null／undefined 回傳空字串', () => {
    expect(molToSvgDataUri(null)).toBe(legacyCommon.molToSvgDataUri(null));
    expect(molToSvgDataUri(undefined)).toBe(legacyCommon.molToSvgDataUri(undefined));
  });

  it.each(CHARGED_ION_SMILES.map((s) => [s]))('buildVerifiedIonFromSmiles %s', async (smiles) => {
    await expectSame(buildVerifiedIonFromSmiles(smiles, RDKit), legacyIon.buildVerifiedIonFromSmiles(smiles, RDKit));
    await expectSame(
      buildVerifiedIonFromSmiles(smiles, RDKit, 250, 200),
      legacyIon.buildVerifiedIonFromSmiles(smiles, RDKit, 250, 200)
    );
  });

  it('isotope 與 regime 對假想官能基組合（negativePathEnabled 切換）', () => {
    const fg = { ...fgByInput.get('bromochlorobenzene')! };
    for (const negative of [true, false]) {
      const f = { ...fg, negativePathEnabled: negative, hasMcLaffertyMotif: !negative };
      for (const mode of ['Positive', 'Negative', 'Both'] as const) {
        expect(generateIsotopeCandidates('C6H4BrClS2', 233.5, mode, f)).toStrictEqual(
          legacyIsotope.generateIsotopeCandidates('C6H4BrClS2', 233.5, mode, f)
        );
      }
      const lcConfig: SimulationConfig = { technique: 'LC-MS/MS' };
      expect(evaluateLcMsMsRegime(lcConfig, f)).toStrictEqual(legacyRegime.evaluateLcMsMsRegime(lcConfig, f));
      const gcConfig: SimulationConfig = { technique: 'GC-MS' };
      expect(evaluateGcMsRegime(gcConfig, f)).toStrictEqual(legacyRegime.evaluateGcMsRegime(gcConfig, f));
    }
  });
});

describe('參數區間判斷（全部案例的 config）', () => {
  const cases = buildCases().filter((c) => c.inputName !== 'invalid_input');

  it.each(cases.map((c) => [c.id, c]))('%s', (_id, c) => {
    const fg = fgByInput.get(c.inputName)!;
    const technique = c.config.technique!;
    // 與舊版 runMultiPlatformAnalysis 相同的 config 合併方式，另外也直接以原始 config 測試
    const finalConfig: SimulationConfig = {
      ...legacyProfiles.getProfileForConfig(technique).defaultConfig,
      ...c.config,
      technique
    };
    const rawConfig = c.config as SimulationConfig;
    for (const config of [finalConfig, rawConfig]) {
      expect(evaluateTofSimsRegime(config, fg)).toStrictEqual(legacyRegime.evaluateTofSimsRegime(config, fg));
      expect(evaluateLcMsMsRegime(config, fg)).toStrictEqual(legacyRegime.evaluateLcMsMsRegime(config, fg));
      expect(evaluateGcMsRegime(config, fg)).toStrictEqual(legacyRegime.evaluateGcMsRegime(config, fg));
    }
  });
});

describe('以標準答案資料比對', () => {
  it('golden 檔案數量正確', () => {
    expect(goldenCases).toHaveLength(591);
  });

  it.each(goldenCases.map((g) => [g.id, g.data]))('deduplicateAndRankCandidates %s', (_id, data) => {
    const candidates = data.candidates ?? [];
    // 舊版會修改合併中的物件；新舊各自使用獨立的深拷貝
    const fresh = deduplicateAndRankCandidates(structuredClone(candidates));
    const old = legacyScoring.deduplicateAndRankCandidates(structuredClone(candidates));
    expect(fresh).toStrictEqual(old);
    // 已排序過的清單再跑一次，也必須相同
    const doubled = [...candidates, ...candidates.slice(0, 5)];
    expect(deduplicateAndRankCandidates(structuredClone(doubled))).toStrictEqual(
      legacyScoring.deduplicateAndRankCandidates(structuredClone(doubled))
    );
  });

  it.each(goldenCases.map((g) => [g.id, g.data]))('parseFormulaCounts / verifyFragmentMassBalance %s', (_id, data) => {
    const formulas = new Set<string>(EXTRA_FORMULAS);
    if (data.parent) formulas.add(data.parent.formula);
    for (const item of [...(data.candidates ?? []), ...(data.signals ?? []), ...(data.structures ?? [])]) {
      formulas.add(item.formula);
      if (item.neutralFormula) formulas.add(item.neutralFormula);
    }
    for (const c of data.candidates ?? []) {
      if (c.neutralLoss) formulas.add(c.neutralLoss);
    }
    for (const f of formulas) {
      expect(parseFormulaCounts(f)).toStrictEqual(legacyMassBalance.parseFormulaCounts(f));
    }

    if (!data.parent) return;
    const parent = data.parent;
    for (const c of data.candidates ?? []) {
      const frag = c.neutralFormula ?? c.formula;
      const argSets: Parameters<typeof verifyFragmentMassBalance>[] = [
        [parent.formula, parent.exact_mass, frag, c.neutralExactMass, c.neutralLoss],
        [parent.formula, parent.exact_mass, frag, c.neutralExactMass],
        [parent.formula, parent.exact_mass, c.formula, c.ionExactMass, undefined, 0.001],
        [parseFormulaCounts(parent.formula), parent.exact_mass, parseFormulaCounts(frag), c.neutralExactMass, c.neutralLoss]
      ];
      for (const args of argSets) {
        expect(verifyFragmentMassBalance(...args)).toStrictEqual(legacyMassBalance.verifyFragmentMassBalance(...args));
      }
    }
  });
});
