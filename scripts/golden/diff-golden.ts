// 比較 git HEAD 中的 tests/golden/ 與工作目錄中的版本，輸出精簡摘要。
// 執行方式：npm run golden:diff（通常在 npm run golden:generate 之後執行）
// 摘要內容：
// - 有變動的案例數 / 總案例數
// - 每個變動的分子（跨平台與參數合併）：新增與移除的 candidates（極性 + 離子式 + m/z）、detected_groups 的增減
// - 只有分數、優先度或文字變動的候選與其他欄位變動，只統計數量
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = 'tests/golden';

interface Cand {
  polarity: string;
  formula: string;
  mz: number;
  [key: string]: unknown;
}
interface Golden {
  error?: string;
  parent?: { detected_groups?: string[]; [key: string]: unknown };
  candidates?: Cand[];
  [key: string]: unknown;
}

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });

const headIds = new Set(
  git('ls-tree', '-r', '--name-only', 'HEAD', DIR)
    .split('\n')
    .filter((p) => p.endsWith('.json') && !p.endsWith('_index.json'))
    .map((p) => p.replace(/^.*\//, '').replace(/\.json$/, '')),
);
const workIds = new Set(
  readdirSync(join(ROOT, DIR))
    .filter((f) => f.endsWith('.json') && f !== '_index.json')
    .map((f) => f.replace(/\.json$/, '')),
);
const allIds = [...new Set([...headIds, ...workIds])].sort();

const candKey = (c: Cand) => `${c.polarity} ${c.formula} ${c.mz}`;
const multiset = (list: Cand[]) => {
  const m = new Map<string, Cand[]>();
  for (const c of list) {
    const k = candKey(c);
    m.set(k, [...(m.get(k) ?? []), c]);
  }
  return m;
};

interface MolSummary {
  cases: string[];
  added: Map<string, Set<string>>;
  removed: Map<string, Set<string>>;
  groupsAdded: Map<string, Set<string>>;
  groupsRemoved: Map<string, Set<string>>;
  fieldChanged: number;
  otherChanged: number;
}
const byMolecule = new Map<string, MolSummary>();
const summaryOf = (mol: string): MolSummary => {
  let s = byMolecule.get(mol);
  if (!s) {
    s = {
      cases: [],
      added: new Map(),
      removed: new Map(),
      groupsAdded: new Map(),
      groupsRemoved: new Map(),
      fieldChanged: 0,
      otherChanged: 0,
    };
    byMolecule.set(mol, s);
  }
  return s;
};
const note = (m: Map<string, Set<string>>, key: string, caseId: string) => {
  if (!m.has(key)) m.set(key, new Set());
  m.get(key)!.add(caseId);
};

let changedCases = 0;
let newCases = 0;
let removedCases = 0;

for (const id of allIds) {
  const mol = id.split('__')[0];
  const label = id.split('__').slice(1).join('/');
  const oldText = headIds.has(id) ? git('show', `HEAD:${DIR}/${id}.json`) : null;
  const newText = workIds.has(id) ? readFileSync(join(ROOT, DIR, `${id}.json`), 'utf8') : null;
  if (oldText === null) newCases++;
  if (newText === null) removedCases++;
  if (oldText === newText) continue;
  changedCases++;
  const s = summaryOf(mol);
  s.cases.push(id);
  if (oldText === null || newText === null) continue;

  const a = JSON.parse(oldText) as Golden;
  const b = JSON.parse(newText) as Golden;

  // detected_groups
  const ga = new Set(a.parent?.detected_groups ?? []);
  const gb = new Set(b.parent?.detected_groups ?? []);
  for (const g of gb) if (!ga.has(g)) note(s.groupsAdded, g, id);
  for (const g of ga) if (!gb.has(g)) note(s.groupsRemoved, g, id);

  // candidates：以 極性 + 離子式 + m/z 比對
  const ma = multiset(a.candidates ?? []);
  const mb = multiset(b.candidates ?? []);
  let fieldChanged = 0;
  for (const [k, listB] of mb) {
    const listA = ma.get(k);
    if (!listA) {
      note(s.added, k, label);
      continue;
    }
    if (listB.length > listA.length) note(s.added, `${k} (+${listB.length - listA.length})`, label);
    for (let i = 0; i < Math.min(listA.length, listB.length); i++) {
      if (JSON.stringify(listA[i]) !== JSON.stringify(listB[i])) fieldChanged++;
    }
  }
  for (const [k, listA] of ma) {
    const listB = mb.get(k);
    if (!listB) note(s.removed, k, label);
    else if (listA.length > listB.length) note(s.removed, `${k} (-${listA.length - listB.length})`, label);
  }
  s.fieldChanged += fieldChanged;

  // candidates 與 detected_groups 以外的欄位
  const strip = (g: Golden) => {
    const { candidates: _c, ...rest } = g;
    const parent = rest.parent ? { ...rest.parent, detected_groups: undefined } : undefined;
    return JSON.stringify({ ...rest, parent });
  };
  if (strip(a) !== strip(b)) s.otherChanged++;
}

console.log(`標準答案差異（git HEAD → 工作目錄）`);
console.log(`變動案例：${changedCases} / ${allIds.length}（新增 ${newCases}、移除 ${removedCases}）`);

const fmt = (m: Map<string, Set<string>>) =>
  [...m]
    .sort(([x], [y]) => (x < y ? -1 : 1))
    .map(([k, cases]) => `    ${k}  ×${cases.size}`)
    .join('\n');

for (const [mol, s] of [...byMolecule].sort(([x], [y]) => (x < y ? -1 : 1))) {
  console.log(`\n■ ${mol}（${s.cases.length} 個案例）`);
  if (s.groupsAdded.size) console.log(`  detected_groups 新增：\n${fmt(s.groupsAdded)}`);
  if (s.groupsRemoved.size) console.log(`  detected_groups 移除：\n${fmt(s.groupsRemoved)}`);
  if (s.added.size) console.log(`  新增候選：\n${fmt(s.added)}`);
  if (s.removed.size) console.log(`  移除候選：\n${fmt(s.removed)}`);
  if (s.fieldChanged || s.otherChanged) {
    console.log(`  僅欄位變動：候選 ${s.fieldChanged} 筆、其他欄位（structures／signals 等）${s.otherChanged} 個案例`);
  }
}
