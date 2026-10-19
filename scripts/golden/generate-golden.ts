// 以舊版引擎（legacy/）產生標準答案（golden master），供之後重構時逐一比對。
// 執行方式：npm run golden:generate
// 注意：tests/golden/ 的檔案不得手動修改，也不得重新產生，除非指令明確要求。
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRDKit, runMultiPlatformAnalysis } from '../../legacy/src/server/chemistryEngine';
import type { MassTechnique, SimulationConfig } from '../../legacy/src/types';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../tests/golden');

const MOLECULES: Record<string, string> = {
  aspirin: 'CC(=O)Oc1ccccc1C(=O)O',
  salicylic_acid: 'OC(=O)c1ccccc1O',
  caffeine: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C',
  ibuprofen: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O',
  acetaminophen: 'CC(=O)Nc1ccc(O)cc1',
  toluene: 'Cc1ccccc1',
  hexan_2_one: 'CCCCC(C)=O',
  butyrophenone: 'CCCC(=O)c1ccccc1',
  methyl_benzoate: 'COC(=O)c1ccccc1',
  bromochlorobenzene: 'Clc1ccc(Br)cc1',
  fluorobenzoic_acid: 'OC(=O)c1ccc(F)cc1',
  nitrobenzene: '[O-][N+](=O)c1ccccc1',
  benzonitrile: 'N#Cc1ccccc1',
  ethanol: 'CCO',
  benzenesulfonic_acid: 'OS(=O)(=O)c1ccccc1',
  dimethylbenzylamine: 'CN(C)Cc1ccccc1',
  glucose: 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O',
};

const TECHNIQUES: MassTechnique[] = ['TOF-SIMS', 'LC-MS/MS', 'GC-MS'];

// 檔名不可含「/」，案例 ID 中以 LC-MS-MS 表示 LC-MS/MS
const techniqueId = (t: MassTechnique) => t.replace('/', '-');

// 舊版介面切換技術時送出的基礎 config（legacy/src/App.tsx handleTechniqueChange）
const UI_BASE: Record<MassTechnique, SimulationConfig> = {
  'TOF-SIMS': {
    technique: 'TOF-SIMS',
    polarity: 'Both',
    primaryIon: 'Generic',
    primaryIonEnergy: 25,
    analyzer: 'TOF',
    simulationMode: 'General',
  },
  'LC-MS/MS': {
    technique: 'LC-MS/MS',
    polarity: 'Both',
    ionization: 'Auto',
    analyzer: 'QTOF',
    fragmentationMethod: 'CID',
    collisionEnergy: 25,
    simulationMode: 'General',
  },
  'GC-MS': {
    technique: 'GC-MS',
    polarity: 'Positive',
    ionization: 'EI',
    electronEnergy: 70,
    analyzer: 'Quadrupole',
    simulationMode: 'Instrument-aware',
  },
};

// 參數變化案例：以介面基礎 config 套用表單（legacy/src/components/TechniqueParamForm.tsx）實際會做的變更
// TOF-SIMS 改主要離子時，表單會同時把 simulationMode 設為 Instrument-aware
// LC-MS/MS 改游離方式時，表單會依 +/- 結尾同時設定 polarity
const PARAM_VARIANTS: { technique: MassTechnique; suffix: string; config: SimulationConfig }[] = [
  {
    technique: 'TOF-SIMS',
    suffix: 'Bi3+_30keV',
    config: { ...UI_BASE['TOF-SIMS'], primaryIon: 'Bi3+', simulationMode: 'Instrument-aware', primaryIonEnergy: 30 },
  },
  {
    technique: 'TOF-SIMS',
    suffix: 'C60+_20keV',
    config: { ...UI_BASE['TOF-SIMS'], primaryIon: 'C60+', simulationMode: 'Instrument-aware', primaryIonEnergy: 20 },
  },
  {
    technique: 'TOF-SIMS',
    suffix: 'Cs+_negative',
    config: { ...UI_BASE['TOF-SIMS'], primaryIon: 'Cs+', simulationMode: 'Instrument-aware', polarity: 'Negative' },
  },
  {
    technique: 'LC-MS/MS',
    suffix: 'ESI+_CE10',
    config: { ...UI_BASE['LC-MS/MS'], ionization: 'ESI+', polarity: 'Positive', collisionEnergy: 10 },
  },
  {
    technique: 'LC-MS/MS',
    suffix: 'ESI-_CE40',
    config: { ...UI_BASE['LC-MS/MS'], ionization: 'ESI-', polarity: 'Negative', collisionEnergy: 40 },
  },
  {
    technique: 'LC-MS/MS',
    suffix: 'APCI+',
    config: { ...UI_BASE['LC-MS/MS'], ionization: 'APCI+', polarity: 'Positive' },
  },
  {
    technique: 'LC-MS/MS',
    suffix: 'CEsweep_10-40_step15',
    config: { ...UI_BASE['LC-MS/MS'], collisionEnergyRange: { start: 10, end: 40, step: 15 } },
  },
  {
    technique: 'GC-MS',
    suffix: 'EI_70eV',
    config: { ...UI_BASE['GC-MS'], ionization: 'EI', electronEnergy: 70 },
  },
  {
    technique: 'GC-MS',
    suffix: 'EI_20eV',
    config: { ...UI_BASE['GC-MS'], ionization: 'EI', electronEnergy: 20 },
  },
  {
    technique: 'GC-MS',
    suffix: 'CI_methane',
    config: { ...UI_BASE['GC-MS'], ionization: 'CI', reagentGas: 'Methane' },
  },
  {
    technique: 'GC-MS',
    suffix: 'CI_ammonia',
    config: { ...UI_BASE['GC-MS'], ionization: 'CI', reagentGas: 'Ammonia' },
  },
];

const PARAM_MOLECULES = ['aspirin', 'butyrophenone', 'bromochlorobenzene'];

interface Case {
  id: string;
  input: string;
  config: Partial<SimulationConfig>;
}

// 所有 image 欄位改存 SHA-256 雜湊（欄位名稱改為 imageHash）；物件 key 依字母排序，陣列順序保留
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const entries: [string, unknown][] = Object.keys(src).map((k) =>
      k === 'image' && typeof src[k] === 'string'
        ? ['imageHash', createHash('sha256').update(src[k] as string).digest('hex')]
        : [k, normalize(src[k])],
    );
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    for (const [k, v] of entries) out[k] = v;
    return out;
  }
  return value;
}

const toJson = (value: unknown) => JSON.stringify(normalize(value), null, 2) + '\n';

async function buildCases(): Promise<Case[]> {
  const RDKit = await getRDKit();
  const ethylAcetate = RDKit.get_mol('CCOC(C)=O');
  const molblock: string = ethylAcetate.get_molblock();
  ethylAcetate.delete();

  const inputs: [string, string][] = [
    ...Object.entries(MOLECULES),
    ['name_aspirin', 'aspirin'],
    ['molfile_ethyl_acetate', molblock],
    ['invalid_input', 'not_a_molecule_xyz'],
  ];

  const cases: Case[] = [];
  for (const [name, input] of inputs) {
    for (const technique of TECHNIQUES) {
      cases.push({ id: `${name}__${techniqueId(technique)}__default`, input, config: { technique } });
    }
  }
  for (const name of PARAM_MOLECULES) {
    for (const v of PARAM_VARIANTS) {
      cases.push({ id: `${name}__${techniqueId(v.technique)}__${v.suffix}`, input: MOLECULES[name], config: v.config });
    }
  }
  return cases;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const cases = await buildCases();
  const index: unknown[] = [];

  for (const c of cases) {
    const t0 = performance.now();
    let result: unknown;
    let error: string | undefined;
    try {
      result = await runMultiPlatformAnalysis(c.input, c.config);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      result = { error };
    }
    const durationMs = Math.round((performance.now() - t0) * 10) / 10;
    writeFileSync(join(OUT_DIR, `${c.id}.json`), toJson(result));

    const candidates = (result as { candidates?: unknown[] }).candidates;
    index.push({
      id: c.id,
      input: c.input,
      config: c.config,
      durationMs,
      candidateCount: Array.isArray(candidates) ? candidates.length : 0,
      error: error !== undefined,
    });
    console.log(`${c.id}\t${durationMs} ms${error ? `\tERROR: ${error}` : ''}`);
  }

  writeFileSync(join(OUT_DIR, '_index.json'), toJson(index));
  console.log(`完成：${cases.length} 個案例`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
