import React from 'react';
import { StructureItem, SignalItem } from '../types';
import { X, Copy, Check, Download, CheckSquare, Square, ShieldCheck } from 'lucide-react';

interface Props {
  structure: StructureItem | null;
  onClose: () => void;
  signals: SignalItem[];
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onExportSingle?: (structure: StructureItem) => void;
}

export const StructureModal: React.FC<Props> = ({
  structure,
  onClose,
  signals,
  isSelected,
  onToggleSelect,
  onExportSingle
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!structure) return null;

  const handleCopySmiles = () => {
    if (structure.smiles) {
      navigator.clipboard.writeText(structure.smiles);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Find signals associated with this structure via parentStructureId or ID match
  const associatedSignals = signals.filter((s) => {
    if (s.parentStructureId) {
      return s.parentStructureId === structure.id;
    }
    if (structure.id === 'Parent') {
      return s.type.includes('准分子') || s.type.includes('前驅') || s.type.includes('分子離子');
    }
    return s.type.includes(structure.id) || s.id === structure.id;
  });

  const scoreVal = structure.heuristicScore ?? structure.relative_intensity ?? 80;
  const neutralMass = structure.neutralExactMass ?? structure.exact_mass;
  const ionMass = structure.ionExactMass ?? structure.exact_mass;
  const chargeVal = structure.charge ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div
        id="structure-detail-modal"
        className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
              <span className="font-semibold text-blue-700">{structure.id}</span>
              {structure.pathwayStatus && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-sans font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {structure.pathwayStatus}
                  </span>
                </>
              )}
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              {structure.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Structure image preview */}
          <div className="flex justify-center bg-slate-50 rounded-xl p-4 border border-slate-200/80">
            <img
              src={structure.image}
              alt={structure.name}
              className="max-h-52 max-w-full object-contain"
            />
          </div>

          {/* Properties grid: Formula, Neutral Mass, Ion Mass / Charge, Heuristic Score */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-sm">
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <span className="text-[11px] text-slate-500 block">化學/離子式 (Formula)</span>
              <span className="font-bold text-slate-900 font-mono text-sm">{structure.formula}</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <span className="text-[11px] text-slate-500 block">中性質量 (Neutral Mass)</span>
              <span className="font-bold text-slate-800 font-mono text-sm">{neutralMass.toFixed(4)} Da</span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <span className="text-[11px] text-slate-500 block">
                {chargeVal !== 0 ? `離子 m/z (z=${chargeVal > 0 ? `+${chargeVal}` : chargeVal})` : '離子/單同位素質量'}
              </span>
              <span className="font-bold text-blue-600 font-mono text-sm">
                {(structure.mz ?? ionMass).toFixed(4)}
              </span>
            </div>
            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              <span className="text-[11px] text-slate-500 block" title="啟發式規則優先度評分 (0-100)，非實驗相對強度">
                啟發評分 (Heuristic)
              </span>
              <span className="font-bold text-amber-700 font-mono text-sm">
                {scoreVal.toFixed(0)} / 100
              </span>
            </div>
          </div>

          {/* Neutral Loss & Mass Balance Verification */}
          {structure.neutralLoss && (
            <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg px-3.5 py-2.5 text-xs flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="font-semibold text-indigo-950">對應中性脫除 (Neutral Loss)：</span>
                <span className="font-mono font-bold text-indigo-700 ml-1">
                  -{structure.neutralLoss}
                  {structure.neutralLossMass ? ` (${structure.neutralLossMass.toFixed(4)} Da)` : ''}
                </span>
              </div>
              {structure.massBalanceVerified && (
                <span className="text-[11px] text-emerald-700 font-medium">
                  ✓ 質量與原子數守恆已驗證
                </span>
              )}
            </div>
          )}

          {/* Mode & Fragmentation Mechanism info */}
          {structure.mechanism && (
            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-blue-950">質譜裂解機制與反應途徑：</span>
                {structure.mode && (
                  <span className="text-[11px] font-medium text-slate-600">
                    極性：{structure.mode === 'Both' ? '正/負雙極性' : structure.mode === 'Negative' ? '負離子 (-)' : '正離子 (+)'}
                  </span>
                )}
              </div>
              <p className="text-slate-700 leading-relaxed">
                {structure.mechanism}
              </p>
            </div>
          )}

          {/* Canonical SMILES */}
          {structure.smiles && (
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>RDKit 規範化結構編碼 (Canonical SMILES)</span>
                <button
                  type="button"
                  onClick={handleCopySmiles}
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? '已複製' : '複製 SMILES'}
                </button>
              </div>
              <div className="font-mono text-xs bg-slate-900 text-slate-100 p-2.5 rounded-lg break-all select-all">
                {structure.canonicalSmiles || structure.smiles}
              </div>
            </div>
          )}

          {/* Associated Candidate Ion Signals */}
          {associatedSignals.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                關聯候選離子訊號 (Associated Candidate Ions)
              </h4>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {associatedSignals.map((sig, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-slate-50 px-3 py-1.5 rounded text-xs border border-slate-200/60"
                  >
                    <span className="font-medium text-slate-800">{sig.adduct}</span>
                    <span className="font-mono text-slate-600">{sig.formula}</span>
                    <span className="font-mono font-bold text-blue-600">m/z {sig.mz.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {onToggleSelect && (
              <button
                type="button"
                onClick={() => onToggleSelect(structure.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                  isSelected
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                <span>{isSelected ? '已加入匯出清單' : '加入匯出勾選'}</span>
              </button>
            )}

            {onExportSingle && (
              <button
                type="button"
                onClick={() => onExportSingle(structure)}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold transition shadow-2xs"
                title="立即將此碎片與結構圖匯出為 Excel 檔"
              >
                <Download className="w-3.5 h-3.5 text-emerald-700" />
                <span>匯出此結構 Excel</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium rounded-lg transition"
          >
            關閉視窗
          </button>
        </div>
      </div>
    </div>
  );
};
