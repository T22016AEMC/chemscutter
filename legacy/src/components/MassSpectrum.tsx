import React, { useState, useRef } from 'react';
import { SignalItem } from '../types';
import { ZoomIn, ZoomOut, RotateCcw, Info } from 'lucide-react';

interface MassSpectrumProps {
  signals: SignalItem[];
  onSelectMz?: (mz: number) => void;
  onSelectSignal?: (sig: SignalItem) => void;
  selectedFormula?: string | null;
  selectedMz?: number | null;
  technique?: string;
  parameterContext?: string;
}

export const MassSpectrum: React.FC<MassSpectrumProps> = ({
  signals,
  onSelectMz,
  onSelectSignal,
  selectedFormula,
  selectedMz,
  technique = 'MS',
  parameterContext
}) => {
  const [polarity, setPolarity] = useState<'Positive' | 'Negative'>('Positive');
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null);
  const [hoveredSignal, setHoveredSignal] = useState<{ signal: SignalItem; x: number; y: number } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  const filteredSignals = signals.filter(s => s.mode === polarity);

  const allMz = filteredSignals.map(s => s.mz);
  const defaultMinMz = allMz.length > 0 ? Math.max(0, Math.floor(Math.min(...allMz) * 0.9)) : 0;
  const defaultMaxMz = allMz.length > 0 ? Math.ceil(Math.max(...allMz) * 1.1) : 500;

  const minMz = zoomRange ? zoomRange[0] : defaultMinMz;
  const maxMz = zoomRange ? zoomRange[1] : defaultMaxMz;

  const visibleSignals = filteredSignals.filter(s => s.mz >= minMz && s.mz <= maxMz);
  const maxScore = 100;

  const width = 800;
  const height = 300;
  const padding = { top: 30, right: 30, bottom: 45, left: 60 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const getX = (mz: number) => {
    if (maxMz === minMz) return padding.left + plotWidth / 2;
    return padding.left + ((mz - minMz) / (maxMz - minMz)) * plotWidth;
  };

  const getScore = (s: SignalItem) => {
    if (typeof s.heuristicScore === 'number') return s.heuristicScore;
    if (typeof s.relative_intensity === 'number') return s.relative_intensity;
    if (s.priority === 'High') return 90;
    if (s.priority === 'Medium') return 60;
    return 30;
  };

  const getY = (score: number) => {
    return padding.top + plotHeight - (Math.min(100, Math.max(5, score)) / maxScore) * plotHeight;
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    if (x >= padding.left && x <= width - padding.right) {
      setDragStart(x);
      setDragCurrent(x);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragStart === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.max(padding.left, Math.min(width - padding.right, ((e.clientX - rect.left) / rect.width) * width));
    setDragCurrent(x);
  };

  const handleMouseUp = () => {
    if (dragStart !== null && dragCurrent !== null) {
      const startX = Math.min(dragStart, dragCurrent);
      const endX = Math.max(dragStart, dragCurrent);

      if (endX - startX > 10) {
        const newMinMz = minMz + ((startX - padding.left) / plotWidth) * (maxMz - minMz);
        const newMaxMz = minMz + ((endX - padding.left) / plotWidth) * (maxMz - minMz);
        setZoomRange([Math.max(0, newMinMz), newMaxMz]);
      }
    }
    setDragStart(null);
    setDragCurrent(null);
  };

  const handleResetZoom = () => setZoomRange(null);

  const handleZoomIn = () => {
    const range = maxMz - minMz;
    const center = minMz + range / 2;
    const newRange = range * 0.6;
    setZoomRange([Math.max(0, center - newRange / 2), center + newRange / 2]);
  };

  const handleZoomOut = () => {
    const range = maxMz - minMz;
    const center = minMz + range / 2;
    const newRange = range * 1.5;
    setZoomRange([Math.max(0, center - newRange / 2), center + newRange / 2]);
  };

  const xTicks = [];
  const numXTicks = 10;
  const step = (maxMz - minMz) / numXTicks;
  if (step > 0) {
    for (let i = 0; i <= numXTicks; i++) {
      xTicks.push(minMz + i * step);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-900">
              {technique} 候選離子模擬棒狀圖 (Candidate Stick Plot)
            </h3>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200 rounded-md">
              Heuristic Score (非實驗絕對強度)
            </span>
            {parameterContext && (
              <span className="px-2 py-0.5 text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200 rounded-md">
                {parameterContext}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Y 軸高度代表基於鍵結活性、離子穩定度與儀器參數區間之啟發式合理性評分 (0–100)，而非實驗檢出器絕對訊號強度。可拖曳滑鼠縮放 m/z 範圍。
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => { setPolarity('Positive'); setZoomRange(null); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                polarity === 'Positive'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              正離子模式 (+)
            </button>
            <button
              type="button"
              onClick={() => { setPolarity('Negative'); setZoomRange(null); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                polarity === 'Negative'
                  ? 'bg-white text-amber-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              負離子模式 (-)
            </button>
          </div>

          <div className="flex items-center gap-1 border border-slate-200 rounded-xl p-1">
            <button type="button" onClick={handleZoomIn} className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors" title="放大">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button type="button" onClick={handleZoomOut} className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors" title="縮小">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button type="button" onClick={handleResetZoom} disabled={!zoomRange} className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40" title="重設縮放">
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-slate-600">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span>
          <span>High Priority (評分 ≥ 75)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
          <span>Medium Priority (評分 45–74)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block"></span>
          <span>Low / 次要路徑 (評分 &lt; 45)</span>
        </div>
      </div>

      <div className="relative w-full overflow-hidden select-none">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto cursor-crosshair bg-slate-50/50 rounded-xl border border-slate-100"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            handleMouseUp();
            setHoveredSignal(null);
          }}
        >
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map(tick => {
            const y = getY(tick);
            return (
              <g key={tick}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="4 4"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="text-[10px] fill-slate-400 font-mono"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* X-axis ticks */}
          {xTicks.map((tick, i) => {
            const x = getX(tick);
            return (
              <g key={i}>
                <line
                  x1={x}
                  y1={height - padding.bottom}
                  x2={x}
                  y2={height - padding.bottom + 5}
                  stroke="#94a3b8"
                />
                <text
                  x={x}
                  y={height - padding.bottom + 18}
                  textAnchor="middle"
                  className="text-[10px] fill-slate-500 font-mono"
                >
                  {tick.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Axes */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={height - padding.bottom}
            stroke="#94a3b8"
            strokeWidth="1.5"
          />
          <line
            x1={padding.left}
            y1={height - padding.bottom}
            x2={width - padding.right}
            y2={height - padding.bottom}
            stroke="#94a3b8"
            strokeWidth="1.5"
          />

          {/* Axis Labels */}
          <text
            x={width / 2}
            y={height - 6}
            textAnchor="middle"
            className="text-xs fill-slate-600 font-medium"
          >
            m/z (Ion Exact Mass / |z|)
          </text>
          <text
            x={-height / 2}
            y={16}
            transform="rotate(-90)"
            textAnchor="middle"
            className="text-xs fill-slate-600 font-medium"
          >
            Heuristic Score (0–100)
          </text>

          {/* Signals */}
          {visibleSignals.map((signal, i) => {
            const x = getX(signal.mz);
            const score = getScore(signal);
            const y = getY(score);
            const isSelected =
              (selectedFormula && selectedFormula === signal.formula) ||
              (selectedMz !== null && selectedMz !== undefined && Math.abs(selectedMz - signal.mz) < 0.01);
            const isHovered = hoveredSignal?.signal === signal;

            const getStrokeColor = () => {
              if (isSelected) return '#2563eb';
              if (isHovered) return '#4f46e5';
              if (signal.priority === 'High') return polarity === 'Positive' ? '#059669' : '#d97706';
              if (signal.priority === 'Medium') return '#3b82f6';
              return '#94a3b8';
            };

            return (
              <g
                key={i}
                className="cursor-pointer transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectMz?.(signal.mz);
                  onSelectSignal?.(signal);
                }}
                onMouseEnter={() => setHoveredSignal({ signal, x, y })}
                onMouseLeave={() => setHoveredSignal(null)}
              >
                <line
                  x1={x}
                  y1={height - padding.bottom}
                  x2={x}
                  y2={y}
                  stroke="transparent"
                  strokeWidth="10"
                />
                <line
                  x1={x}
                  y1={height - padding.bottom}
                  x2={x}
                  y2={y}
                  stroke={getStrokeColor()}
                  strokeWidth={isSelected || isHovered ? '3' : signal.priority === 'High' ? '2.5' : '1.5'}
                />
                {(isSelected || isHovered || signal.priority === 'High' || visibleSignals.length < 18) && (
                  <text
                    x={x}
                    y={y - 6}
                    textAnchor="middle"
                    className={`text-[10px] font-mono ${
                      isSelected || isHovered ? 'fill-indigo-600 font-bold' : 'fill-slate-600'
                    }`}
                  >
                    {signal.mz.toFixed(2)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Drag selection box */}
          {dragStart !== null && dragCurrent !== null && (
            <rect
              x={Math.min(dragStart, dragCurrent)}
              y={padding.top}
              width={Math.abs(dragCurrent - dragStart)}
              height={plotHeight}
              fill="rgba(79, 70, 229, 0.1)"
              stroke="rgba(79, 70, 229, 0.4)"
              strokeWidth="1"
            />
          )}
        </svg>

        {/* Tooltip */}
        {hoveredSignal && (
          <div
            className="absolute pointer-events-none bg-slate-900 text-white p-3 rounded-xl shadow-lg text-xs z-10 transform -translate-x-1/2 -translate-y-full"
            style={{
              left: `${(hoveredSignal.x / width) * 100}%`,
              top: `${Math.max(12, (hoveredSignal.y / height) * 100 - 5)}%`,
              minWidth: '200px'
            }}
          >
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="font-bold text-emerald-400 font-mono">{hoveredSignal.signal.formula}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-200">
                評分: {getScore(hoveredSignal.signal).toFixed(0)}/100
              </span>
            </div>
            <div className="font-mono text-slate-200">m/z: {hoveredSignal.signal.mz.toFixed(4)}</div>
            {hoveredSignal.signal.adduct && (
              <div className="text-slate-300 mt-0.5">
                離子型態: {hoveredSignal.signal.adduct}
                {hoveredSignal.signal.charge !== undefined
                  ? ` (z = ${hoveredSignal.signal.charge > 0 ? `+${hoveredSignal.signal.charge}` : hoveredSignal.signal.charge})`
                  : ''}
              </div>
            )}
            {hoveredSignal.signal.neutralLoss && (
              <div className="text-amber-300 mt-0.5">中性脫除: -{hoveredSignal.signal.neutralLoss}</div>
            )}
            {hoveredSignal.signal.mechanism && (
              <div className="text-slate-400 truncate max-w-[240px] mt-0.5">{hoveredSignal.signal.mechanism}</div>
            )}
            {hoveredSignal.signal.pathwayStatus && (
              <div className="text-[10px] text-sky-300 mt-1 border-t border-slate-700 pt-1">
                狀態: {hoveredSignal.signal.pathwayStatus}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200/70">
        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>
          <strong>說明：</strong>棒狀圖高度反映化學裂解路徑合理性與儀器參數區間相容性之啟發評分 (Heuristic Score 0–100)，不代表實驗質譜儀之真實相對強度。點擊峰值可與下方清單連動高亮。
        </span>
      </div>
    </div>
  );
};
