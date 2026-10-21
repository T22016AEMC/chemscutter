import { useState } from 'react';
import type { FragmentCandidate } from '../../engine/types';
import { fullMzRange, groupPolarity, peakLabels, plotX, plotY, validRange, type MzRange } from './model';
export default function Spectrum({ candidates, selected, onSelect }: { candidates: FragmentCandidate[]; selected: string | null; onSelect: (id: string) => void }) {
  const [zoom, setZoom] = useState<MzRange | null>(null);
  const [min, setMin] = useState('0');
  const [max, setMax] = useState('');
  const [error, setError] = useState('');
  const [hover, setHover] = useState<FragmentCandidate | null>(null);
  const range = zoom || fullMzRange(candidates);
  const groups = groupPolarity(candidates);
  return <section className="spectrum" aria-labelledby="spectrum-title">
    <h3 id="spectrum-title">候選質譜棒狀圖</h3>
    <p className="score-warning">分數為啟發式可信度，不是訊號強度。棒高為引擎分數（0–100），不代表實驗質譜。</p>
    <form className="zoom-controls" onSubmit={(event) => {
      event.preventDefault();
      const next = min.trim() && max.trim() ? validRange(Number(min), Number(max)) : null;
      if (!next) { setError('請輸入有效範圍：起點須至少為 0，終點須大於起點。'); return; }
      setZoom(next); setError('');
    }}>
      <label>m/z 起點<input type="number" min="0" step="any" value={min} onChange={(event) => setMin(event.target.value)} /></label>
      <label>m/z 終點<input type="number" min="0" step="any" placeholder={range[1].toFixed(2)} value={max} onChange={(event) => setMax(event.target.value)} /></label>
      <button type="submit">套用 m/z 範圍</button>
      <button type="button" onClick={() => { setZoom(null); setMin('0'); setMax(''); setError(''); }}>重設範圍</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    <p role="status">顯示 m/z {range[0].toFixed(2)}–{range[1].toFixed(2)}。點擊棒或以 Tab、Enter 選擇候選；選取後以圓點及粗線標示。</p>
    {(['Positive', 'Negative'] as const).map((polarity) => {
      const items = groups[polarity].filter((item) => item.mz >= range[0] && item.mz <= range[1] && item.heuristicScore !== undefined);
      const labels = peakLabels(items, range);
      const name = polarity === 'Positive' ? '正離子（+，實線）' : '負離子（−，虛線）';
      return <div key={polarity} className={`spectrum-group ${polarity}`}>
        <h4>{name}</h4>
        {items.length ? <svg viewBox="0 0 900 280" role="group" aria-label={`${name}候選圖`}>
          {[0, 25, 50, 75, 100].map((score) => <g key={score} className="axis">
            <line x1="55" x2="845" y1={plotY(score)} y2={plotY(score)} /><text x="45" y={plotY(score) + 4} textAnchor="end">{score}</text>
          </g>)}
          <text x="12" y="23">分數</text><text x="855" y="260">m/z</text>
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const mz = range[0] + (range[1] - range[0]) * index / 5;
            return <text key={index} x={plotX(mz, range)} y="245" textAnchor="middle" className="tick">{mz.toFixed(1)}</text>;
          })}
          {items.map((item) => {
            const active = item.id === selected;
            const x = plotX(item.mz, range), y = plotY(item.heuristicScore!);
            const title = `m/z ${item.mz.toFixed(4)}，${item.formula}，分數 ${item.heuristicScore}`;
            return <g key={item.id} role="button" tabIndex={0} aria-label={title} aria-pressed={active} data-candidate={item.id}
              className={`peak ${active ? 'selected' : ''}`} onClick={() => onSelect(item.id)}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(item.id); } }}
              onMouseEnter={() => setHover(item)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(item)} onBlur={() => setHover(null)}>
              <title>{title}</title>
              <line x1={x} x2={x} y1="225" y2={y} className="peak-hit" />
              <line x1={x} x2={x} y1="225" y2={y} className="peak-line" />
              {active && <circle cx={x} cy={y} r="5" />}
              {(labels.has(item.id) || active) && <text x={x} y={active ? 16 : 33} textAnchor="middle" className="peak-label">{active ? '● ' : ''}{item.mz.toFixed(4)}</text>}
            </g>;
          })}
        </svg> : <p>此極性在目前範圍內沒有可繪製的候選。</p>}
      </div>;
    })}
    <p className="peak-tooltip" role="status">{hover ? `m/z ${hover.mz.toFixed(4)}；離子式 ${hover.formula}；分數 ${hover.heuristicScore}` : '將滑鼠移至棒上，可查看 m/z、離子式與分數。'}</p>
    {candidates.some((item) => item.heuristicScore === undefined) && <p>未提供分數的候選仍列於表格，不繪製棒高。</p>}
  </section>;
}
