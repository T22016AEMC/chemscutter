import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisResult, FragmentCandidate } from '../../engine/types';
import IonFormula from './IonFormula';
import { defaultFilter, filterCandidates, type CandidateFilter } from './model';
import Depiction, { useDepictions, type Depictions } from './Depiction';
import Spectrum from './Spectrum';
import { parameterRows, recordOnly } from '../../shared/parameters';
import ExportButton from './ExportButton';
import './results.css';

const ranks = { High: '高', Medium: '中', Low: '低' };
const statusNames = { 'Verified Graph Product': '分子圖產物已驗證', Candidate: '候選', 'Approximate pathway': '近似途徑', 'Mechanistic hypothesis': '機制假說' };
const number = (value: number | undefined, digits = 4) => value === undefined ? '未提供' : value.toFixed(digits);
const rawNumber = (value: number | undefined) => value === undefined ? '未提供' : String(value);
const yesNo = (value: boolean | undefined) => value === undefined ? '未提供' : value ? '引擎標示通過' : '引擎標示未通過';

function CandidateDetail({ item, result, depictions }: { item: FragmentCandidate; result: AnalysisResult; depictions: Depictions }) {
  const related = result.structures.find((structure) => structure.id === item.parentStructureId);
  const fields: [string, string][] = [
    ['候選編號', item.id], ['平台／極性', `${item.technique}／${item.polarity === 'Positive' ? '正離子' : '負離子'}`],
    ['離子類型', item.ionType], ['中性分子式', item.neutralFormula || '未提供'],
    ['中性單同位素質量（Da）', rawNumber(item.neutralExactMass)], ['離子精確質量（Da）', rawNumber(item.ionExactMass)],
    ['電荷', String(item.charge)], ['m/z', rawNumber(item.mz)],
    ['離子質量 ÷ |電荷|', item.charge ? `${rawNumber(item.ionExactMass)} ÷ ${Math.abs(item.charge)} = ${rawNumber(item.ionExactMass / Math.abs(item.charge))}` : '電荷為 0，無法相除'],
    ['相容欄位 exactMass（Da）', rawNumber(item.exactMass)], ['前驅 m/z（引擎原值）', rawNumber(item.precursorMz)],
    ['說明', item.explanation || '未提供'], ['機制', item.mechanism || '未提供'],
    ['碎裂途徑', item.fragmentationPathway || '未提供'], ['途徑狀態', item.pathwayStatus ? statusNames[item.pathwayStatus] : '未提供'],
    ['來源規則', item.sourceRule], ['分數', item.heuristicScore === undefined ? '未提供' : `${item.heuristicScore}／100`],
    ['信心標籤', ranks[item.confidence]], ['優先度', ranks[item.priority]],
    ['質量平衡', yesNo(item.massBalanceVerified)], ['質量平衡誤差（Da）', rawNumber(item.massBalanceError)],
    ['中性丟失', item.neutralLoss || '未提供'], ['中性丟失質量（Da）', rawNumber(item.neutralLossMass)],
    ['參數情境', item.parameterContext || '未提供'], ['SMILES', item.smiles || '未提供'],
    ['標準 SMILES', item.canonicalSmiles || '未提供'], ['關聯結構編號', item.parentStructureId || '未提供'],
    ['關聯結構名稱', related?.name || '未提供'],
  ];
  return <section className="candidate-detail" aria-label={`候選 ${item.id} 詳情`}>
    <h4>候選詳情：<IonFormula formula={item.formula} /></h4>
    <p>引擎未提供獨立信心理由。以下說明、機制與途徑狀態均為引擎原始資料，不另推論理由。</p>
    <p>質量與驗證標示直接取自引擎；只展示離子質量除以電荷絕對值，不重算化學質量。</p>
    <Depiction smiles={item.canonicalSmiles || item.smiles} depictions={depictions} large />
    <dl>{fields.map(([label, value]) => <Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>)}</dl>
  </section>;
}

export default function ResultsView({ result, provenance }: { result: AnalysisResult; provenance?: { cid: number; title: string } }) {
  const candidates = result.candidates || [];
  const [filter, setFilter] = useState<CandidateFilter>(defaultFilter);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const scrollSelection = useRef(false);
  const table = useRef<HTMLTableElement>(null);
  const depictions = useDepictions();
  const filtered = useMemo(() => filterCandidates(candidates, filter), [candidates, filter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * 20, currentPage * 20 + 20);
  function update(next: Partial<CandidateFilter>) { setFilter((current) => ({ ...current, ...next })); setPage(0); setSelected(null); }
  function selectPeak(id: string) {
    const index = filtered.findIndex((item) => item.id === id);
    if (index < 0) return;
    scrollSelection.current = true;
    setPage(Math.floor(index / 20)); setSelected(id);
  }
  useEffect(() => {
    if (scrollSelection.current) {
      table.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      scrollSelection.current = false;
    }
  }, [selected, currentPage]);
  return <section className="results" aria-labelledby="results-title">
    <h2 id="results-title">{result.technique} 分析結果</h2>
    <div className="result-summary">
      <p>母分子：<IonFormula formula={result.parent.formula} />；單同位素質量：{number(result.parent.exact_mass)} Da；候選總數：<strong>{candidates.length}</strong>。</p>
      <p>標準化後 SMILES：<code>{result.parent.smiles}</code></p>
      <p>標準化說明：{result.parent.standardization_note || '引擎未回報標準化變動。'}</p>
      <p>被移除成分：{result.parent.removed_components?.join('、') || '無'}</p>
      <details><summary>此次分析的參數與引擎說明</summary>
        <dl>{parameterRows(result.simulationConfig || { technique: result.technique }).map(([label, value]) => <Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>)}</dl>
        <p>模式：{result.simulationModeLabel || '未提供'}{result.technique === 'TOF-SIMS' && `（${recordOnly}）`}；參數情境：{result.parameterContext || '未提供'}</p>
        <p>{result.activeRegimeDescription}</p><p>{result.disclaimer}</p>
      </details>
    </div>
    <p className="score-warning">分數為啟發式可信度，不是訊號強度。信心標籤與質量平衡標示沿用引擎，化學正確性需自行驗證。</p>
    <ExportButton result={result} filtered={filtered} provenance={provenance} />
    {!candidates.length ? <p role="status">這次分析沒有產生候選碎片。</p> : <>
      <div className="result-filters" aria-label="候選篩選與排序">
        <label>搜尋候選<input value={filter.query} onChange={(event) => update({ query: event.target.value })} placeholder="離子式、說明、來源規則…" /></label>
        <label>最低分數<input type="number" min="0" max="100" step="any" value={filter.minScore} onChange={(event) => update({ minScore: Math.max(0, Math.min(100, Number(event.target.value))) })} /></label>
        <label>離子類型<select value={filter.ionType} onChange={(event) => update({ ionType: event.target.value })}><option value="">全部類型</option>{[...new Set(candidates.map((item) => item.ionType))].sort().map((type) => <option key={type}>{type}</option>)}</select></label>
        <label>極性篩選<select value={filter.polarity} onChange={(event) => update({ polarity: event.target.value })}><option value="">正、負離子</option><option value="Positive">正離子</option><option value="Negative">負離子</option></select></label>
        <label>候選排序<select value={filter.sort} onChange={(event) => update({ sort: event.target.value as CandidateFilter['sort'] })}><option value="score-desc">分數：高至低</option><option value="score-asc">分數：低至高</option><option value="mz-asc">m/z：小至大</option><option value="mz-desc">m/z：大至小</option></select></label>
        <button type="button" onClick={() => { setFilter(defaultFilter); setPage(0); setSelected(null); }}>清除篩選</button>
      </div>
      <p role="status">篩選後 {filtered.length}／{candidates.length} 筆。篩選與排序只更新畫面，不重新分析。</p>
      <Spectrum candidates={filtered} selected={selected} onSelect={selectPeak} />
      {!filtered.length ? <p role="status">沒有符合篩選條件的候選，請調整或清除篩選。</p> : <>
        <div className="pagination" aria-label="候選分頁">
          <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>上一頁</button>
          <span>第 {currentPage + 1}／{pageCount} 頁，每頁最多 20 筆</span>
          <button type="button" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>下一頁</button>
        </div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="候選表格，可在容器內水平捲動">
          <table ref={table} className="candidate-table">
            <caption>候選碎片，共 {filtered.length} 筆（總計 {candidates.length} 筆）；點選離子式展開詳情</caption>
            <thead><tr>{['m/z', '離子式', '離子類型／說明', '來源規則', '分數（0–100）', '信心標籤', '結構縮圖'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{visible.map((item) => <Fragment key={item.id}>
              <tr aria-selected={selected === item.id} data-candidate={item.id} onClick={() => setSelected(selected === item.id ? null : item.id)}>
                <td className="number">{item.mz.toFixed(4)}<small className="polarity-label">{item.polarity === 'Positive' ? '正離子 +' : '負離子 −'}</small></td>
                <td><button type="button" className="candidate-toggle" aria-expanded={selected === item.id} onClick={(event) => { event.stopPropagation(); setSelected(selected === item.id ? null : item.id); }} aria-label={`展開候選 ${item.id} 詳情`}><IonFormula formula={item.formula} />{selected === item.id ? ' ▾' : ' ▸'}</button></td>
                <td><strong>{item.ionType}</strong><p className="candidate-explanation">{item.explanation || item.mechanism || '未提供說明'}</p></td>
                <td className="source-rule">{item.sourceRule}</td><td className="number">{item.heuristicScore ?? '未提供'}</td><td>{ranks[item.confidence]}</td>
                <td><Depiction key={item.id} smiles={item.canonicalSmiles || item.smiles} depictions={depictions} /></td>
              </tr>
              {selected === item.id && <tr className="detail-row"><td colSpan={7}><CandidateDetail item={item} result={result} depictions={depictions} /></td></tr>}
            </Fragment>)}</tbody>
          </table>
        </div>
      </>}
    </>}
    {result.sweepResults?.length ? <details className="sweep-results"><summary>{result.technique === 'LC-MS/MS' ? 'CE 掃描結果' : '能量掃描結果'}（引擎既有資料）</summary>
      <p>掃描沿用引擎輸出的各能量候選及相對可能性，不代表各能量重新碎裂或實測強度；不以此取代主表分數。</p>
      {result.sweepResults.map((sweep, index) => <section key={index}><h4>{sweep.parameterLabel}（{sweep.parameterValue}）</h4><p>{sweep.regimeSummary}</p>
        <div className="table-scroll"><table><thead><tr>{['候選編號', '離子類型', '離子式', 'm/z', '優先度', '相對可能性'].map((label) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{sweep.topCandidates.map((item, candidateIndex) => <tr key={`${item.id}-${candidateIndex}`}><td>{item.id}</td><td>{item.ionType}</td><td><IonFormula formula={item.formula} /></td><td>{item.mz.toFixed(4)}</td><td>{ranks[item.priority]}</td><td>{{ Dominant: '主要', Prominent: '明顯', Trace: '微量', Unfavored: '不利' }[item.likelihood]}</td></tr>)}</tbody>
        </table></div></section>)}
    </details> : null}
  </section>;
}
