import React, { useState, useEffect, useMemo } from 'react';
import {
  AnalysisResult,
  StructureItem,
  MassTechnique,
  SimulationConfig
} from './types';
import { StructureInputZone } from './components/StructureInputZone';
import { TechniqueParamForm } from './components/TechniqueParamForm';
import { MassSpectrum } from './components/MassSpectrum';
import { LogicExplanation } from './components/LogicExplanation';
import { StructureModal } from './components/StructureModal';
import { CodeViewerModal } from './components/CodeViewerModal';
import { CheMScutterLogo } from './components/CheMScutterLogo';
import { exportStructuresToExcel } from './utils/excelExport';
import {
  Search,
  Download,
  Check,
  AlertCircle,
  Code2,
  Atom,
  Maximize2,
  Copy,
  ArrowRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  CheckSquare,
  Square,
  FileSpreadsheet,
  Loader2,
  ShieldAlert,
  Gauge,
  ShieldCheck
} from 'lucide-react';

export default function App() {
  // MS Technique & Configuration
  const [technique, setTechnique] = useState<MassTechnique>('TOF-SIMS');
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>({
    technique: 'TOF-SIMS',
    polarity: 'Both',
    primaryIon: 'Generic',
    primaryIonEnergy: 25,
    analyzer: 'TOF',
    simulationMode: 'General'
  });

  const [currentSmiles, setCurrentSmiles] = useState('CC(=O)Oc1ccccc1C(=O)O');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [userOriginalImage, setUserOriginalImage] = useState<string | null>(null);

  // Filter & interaction state
  const [modeFilter, setModeFilter] = useState<'ALL' | 'Positive' | 'Negative'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'High' | 'Medium' | 'Low'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStructure, setSelectedStructure] = useState<StructureItem | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [copiedSmiles, setCopiedSmiles] = useState(false);

  // 碎片多選與 Excel 匯出狀態
  const [selectedStructureIds, setSelectedStructureIds] = useState<Set<string>>(new Set());
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [excelExportStatus, setExcelExportStatus] = useState<string | null>(null);

  // Sorting state for List 1 (Signals) and List 2 (Structures)
  const [signalSortBy, setSignalSortBy] = useState<
    'default' | 'mz_asc' | 'mz_desc' | 'score_desc' | 'score_asc'
  >('mz_asc');
  const [structureSortBy, setStructureSortBy] = useState<
    'default' | 'mass_desc' | 'mass_asc' | 'score_desc' | 'score_asc'
  >('mass_desc');

  // Auto-run on initial mount with Aspirin to provide immediate working preview
  useEffect(() => {
    runAnalysis(currentSmiles, technique, simulationConfig);
  }, []);

  const runAnalysis = async (inputStr: string, tech: MassTechnique, conf: SimulationConfig) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: inputStr,
          technique: tech,
          simulationConfig: { ...conf, technique: tech }
        })
      });
      const json = await res.json();
      if (res.ok && !json.error) {
        setData(json);
        if (json.structures) {
          setSelectedStructureIds(new Set(json.structures.map((s: StructureItem) => s.id)));
        }
      } else {
        setError(json.error || '分析執行失敗');
      }
    } catch (e: any) {
      console.error('Analysis failed:', e);
      setError(e.message || '網絡連線或計算錯誤');
    } finally {
      setLoading(false);
    }
  };

  const handleTechniqueChange = (newTech: MassTechnique) => {
    setTechnique(newTech);
    let newConf: SimulationConfig = { technique: newTech, simulationMode: 'General' };
    if (newTech === 'TOF-SIMS') {
      newConf = {
        technique: 'TOF-SIMS',
        polarity: 'Both',
        primaryIon: 'Generic',
        primaryIonEnergy: 25,
        analyzer: 'TOF',
        simulationMode: 'General'
      };
    } else if (newTech === 'LC-MS/MS') {
      newConf = {
        technique: 'LC-MS/MS',
        polarity: 'Both',
        ionization: 'Auto',
        analyzer: 'QTOF',
        fragmentationMethod: 'CID',
        collisionEnergy: 25,
        simulationMode: 'General'
      };
    } else if (newTech === 'GC-MS') {
      newConf = {
        technique: 'GC-MS',
        polarity: 'Positive',
        ionization: 'EI',
        electronEnergy: 70,
        analyzer: 'Quadrupole',
        simulationMode: 'Instrument-aware'
      };
    }
    setSimulationConfig(newConf);
    if (currentSmiles) {
      runAnalysis(currentSmiles, newTech, newConf);
    }
  };

  const handleConfigChange = (newConfig: SimulationConfig) => {
    setSimulationConfig(newConfig);
    if (currentSmiles) {
      runAnalysis(currentSmiles, technique, newConfig);
    }
  };

  const handleAnalysisSuccess = (result: AnalysisResult, originalImg?: string) => {
    setData(result);
    setError(null);
    setActiveHighlightId(null);
    if (result.structures) {
      setSelectedStructureIds(new Set(result.structures.map((s) => s.id)));
    }
    if (originalImg) {
      setUserOriginalImage(originalImg);
    } else if (result.parent?.detected_format && !result.parent.detected_format.includes('光學辨識')) {
      setUserOriginalImage(null);
    }
  };

  // 選擇或取消選擇單個碎片
  const toggleSelectStructure = (id: string) => {
    setSelectedStructureIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 全選或全部取消全選
  const handleSelectAllStructures = () => {
    if (!data?.structures) return;
    if (selectedStructureIds.size === data.structures.length) {
      setSelectedStructureIds(new Set());
    } else {
      setSelectedStructureIds(new Set(data.structures.map((s) => s.id)));
    }
  };

  // 僅選取碎片（排除 Parent）
  const handleSelectOnlyFragments = () => {
    if (!data?.structures) return;
    const fragmentIds = data.structures.filter((s) => s.id !== 'Parent').map((s) => s.id);
    setSelectedStructureIds(new Set(fragmentIds));
  };

  // 匯出選擇的碎片與結構式為 Excel (.xlsx) 檔案
  const handleExportSelectedToExcel = async (specificList?: StructureItem[]) => {
    if (!data?.structures || data.structures.length === 0) {
      setError('無可匯出的結構資料');
      return;
    }

    let targetStructures: StructureItem[];
    if (specificList && specificList.length > 0) {
      targetStructures = specificList;
    } else {
      targetStructures = sortedStructures.filter((s) => selectedStructureIds.has(s.id));
    }

    if (targetStructures.length === 0) {
      setError('請先在清單二中至少勾選一個欲匯出的碎片或結構');
      return;
    }

    setIsExportingExcel(true);
    setExcelExportStatus('正在準備匯出資料與結構式圖檔...');

    try {
      await exportStructuresToExcel({
        structures: targetStructures,
        parentCompoundName: data.parent?.compound_name,
        parentFormula: data.parent?.formula,
        technique,
        onProgress: (p) => {
          setExcelExportStatus(p.stage);
        }
      });
    } catch (err: any) {
      console.error('Excel export error:', err);
      setError(`匯出 Excel 失敗: ${err?.message || '未知錯誤'}`);
    } finally {
      setIsExportingExcel(false);
      setExcelExportStatus(null);
    }
  };

  const handleExportSingleToExcel = (structure: StructureItem) => {
    handleExportSelectedToExcel([structure]);
  };

  // Precursor ions list
  const precursorSignals = useMemo(() => {
    if (!data?.signals) return [];
    return data.signals.filter(
      (s) =>
        s.parentStructureId === 'Parent' ||
        s.type.includes('前驅') ||
        s.type.includes('准分子') ||
        s.type.includes('分子離子') ||
        s.type.includes('Parent')
    );
  }, [data]);

  // Filtered and sorted signals for List 1
  const filteredAndSortedSignals = useMemo(() => {
    if (!data) return [];
    const filtered = data.signals.filter((item) => {
      const matchesMode = modeFilter === 'ALL' || item.mode === modeFilter;
      const matchesPriority = priorityFilter === 'ALL' || item.priority === priorityFilter;
      const query = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !query ||
        item.formula.toLowerCase().includes(query) ||
        item.adduct.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query) ||
        (item.smiles && item.smiles.toLowerCase().includes(query)) ||
        (item.mechanism && item.mechanism.toLowerCase().includes(query)) ||
        (item.neutralLoss && item.neutralLoss.toLowerCase().includes(query)) ||
        item.mz.toString().includes(query);

      const linkedId =
        item.parentStructureId ||
        (item.type.includes('前驅') || item.type.includes('准分子') || item.type.includes('分子離子')
          ? 'Parent'
          : null);

      const matchesHighlight =
        !activeHighlightId ||
        linkedId === activeHighlightId ||
        item.type.includes(activeHighlightId) ||
        item.id === activeHighlightId;

      return matchesMode && matchesPriority && matchesSearch && matchesHighlight;
    });

    return [...filtered].sort((a, b) => {
      if (signalSortBy === 'mz_asc') return a.mz - b.mz;
      if (signalSortBy === 'mz_desc') return b.mz - a.mz;
      if (signalSortBy === 'score_desc') {
        const sA = a.heuristicScore ?? a.relative_intensity ?? 50;
        const sB = b.heuristicScore ?? b.relative_intensity ?? 50;
        return sB - sA || a.mz - b.mz;
      }
      if (signalSortBy === 'score_asc') {
        const sA = a.heuristicScore ?? a.relative_intensity ?? 50;
        const sB = b.heuristicScore ?? b.relative_intensity ?? 50;
        return sA - sB || a.mz - b.mz;
      }
      return 0;
    });
  }, [data, modeFilter, priorityFilter, searchTerm, activeHighlightId, signalSortBy]);

  // Filtered and sorted structures for List 2
  const sortedStructures = useMemo(() => {
    if (!data?.structures) return [];
    const filtered = data.structures.filter((item) => {
      const matchesMode = modeFilter === 'ALL' || item.mode === modeFilter || item.mode === 'Both';
      const matchesPriority = priorityFilter === 'ALL' || item.priority === priorityFilter;
      const query = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !query ||
        item.formula.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query) ||
        (item.smiles && item.smiles.toLowerCase().includes(query)) ||
        (item.name && item.name.toLowerCase().includes(query)) ||
        (item.mechanism && item.mechanism.toLowerCase().includes(query)) ||
        (item.neutralLoss && item.neutralLoss.toLowerCase().includes(query));

      return matchesMode && matchesPriority && matchesSearch;
    });

    return [...filtered].sort((a, b) => {
      if (structureSortBy === 'mass_desc') return b.exact_mass - a.exact_mass;
      if (structureSortBy === 'mass_asc') return a.exact_mass - b.exact_mass;
      if (structureSortBy === 'score_desc') {
        const sA = a.heuristicScore ?? a.relative_intensity ?? 50;
        const sB = b.heuristicScore ?? b.relative_intensity ?? 50;
        return sB - sA || b.exact_mass - a.exact_mass;
      }
      if (structureSortBy === 'score_asc') {
        const sA = a.heuristicScore ?? a.relative_intensity ?? 50;
        const sB = b.heuristicScore ?? b.relative_intensity ?? 50;
        return sA - sB || a.exact_mass - b.exact_mass;
      }
      if (a.id === 'Parent') return -1;
      if (b.id === 'Parent') return 1;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  }, [data, modeFilter, priorityFilter, searchTerm, structureSortBy]);

  const parentStructure = useMemo(() => {
    return data?.structures?.find((s) => s.id === 'Parent');
  }, [data]);

  const handleCopySmiles = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSmiles(true);
    setTimeout(() => setCopiedSmiles(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* Top Professional App Header — Clean Non-Overlapping Brand & Navigation */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <CheMScutterLogo showText={false} size="md" />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-none">
                  Che<span className="text-blue-600">MS</span>cutter
                </h1>
                <span className="text-xs font-medium text-slate-500 hidden md:inline">
                  TOF-SIMS · LC-MS/MS · GC-MS 多平台候選碎片模擬器
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate mt-1 hidden sm:block">
                以 RDKit 分子圖反應轉換、質量守恆驗證與儀器參數區間為核心之質譜裂解預測系統
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsCodeModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              <Code2 className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">查看架構與引擎邏輯</span>
            </button>

            {data && (
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(data, null, 2)], {
                    type: 'application/json'
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${data.parent?.compound_name || 'chemscutter'}_${technique}_analysis.json`;
                  a.click();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition"
                title="匯出完整分析 JSON"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>JSON</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Important Professional Disclaimer Banner */}
        <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3 shadow-2xs">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <b className="font-bold">重要專業聲明：</b>
            本工具為基於化學結構、RDKit 分子圖轉換、官能基與質譜碎裂規則的候選碎片模擬器。實際 MS spectrum 會受到離子化方式、儀器結構、碰撞能量、source conditions、matrix、樣品狀態與其他實驗條件影響。模擬結果中的「啟發評分 (Heuristic Score, 0-100)」僅代表理論反應路徑之優先度排序，不代表真實實驗峰強度。
          </div>
        </div>

        {/* Step 1 & Step 2: MS Technique & Parameter Configuration Form */}
        <TechniqueParamForm
          technique={technique}
          onTechniqueChange={handleTechniqueChange}
          config={simulationConfig}
          onConfigChange={handleConfigChange}
          disabled={loading}
        />

        {/* Active Instrument Parameter Regime Banner */}
        {data?.activeRegimeDescription && (
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl px-4 py-3 flex items-start sm:items-center justify-between gap-3 text-xs text-blue-950">
            <div className="flex items-start sm:items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-bold">當前生效之物理/化學參數區間 (Active Parameter Regime)：</span>
                <span className="ml-1 text-slate-700">{data.activeRegimeDescription}</span>
              </div>
            </div>
          </div>
        )}

        {/* Core Algorithm & Logic Explanation Banner */}
        <LogicExplanation />

        {/* Step 3: Multi-format Structure Input Zone */}
        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-slate-800 text-white text-xs flex items-center justify-center font-bold">
                3
              </span>
              輸入已知化學結構 (Input Known Chemical Structure)
            </label>
            <span className="text-xs text-slate-500">
              支援 SMILES、ChemDraw Molfile/CDXML、結構截圖 AI 光學辨識
            </span>
          </div>
          <StructureInputZone
            onAnalysisSuccess={handleAnalysisSuccess}
            isLoading={loading}
            setIsLoading={setLoading}
            currentSmiles={currentSmiles}
            setCurrentSmiles={setCurrentSmiles}
            technique={technique}
            simulationConfig={simulationConfig}
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3.5 rounded-xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-600 hover:text-rose-800 font-semibold px-2"
            >
              關閉
            </button>
          </div>
        )}

        {/* Active Analyzed Molecule Overview Card */}
        {data?.parent && (
          <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-4">
                {/* 2D Depiction Thumbnail */}
                <div className="w-20 h-20 bg-slate-50 rounded-lg border border-slate-200 p-1 flex items-center justify-center shrink-0">
                  {parentStructure?.image ? (
                    <img
                      src={parentStructure.image}
                      alt="母分子結構"
                      className="max-h-full max-w-full object-contain mix-blend-multiply cursor-pointer hover:scale-105 transition-transform"
                      onClick={() => parentStructure && setSelectedStructure(parentStructure)}
                      title="點擊放大檢視"
                    />
                  ) : (
                    <Atom className="w-8 h-8 text-slate-400" />
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                    <span className="text-sm font-bold text-slate-900">
                      {data.parent.compound_name || '已知母分子 (Parent Molecule)'}
                    </span>
                    <span>·</span>
                    <span className="font-semibold text-blue-700">{technique}</span>
                    {data.parent.detected_format && (
                      <>
                        <span>·</span>
                        <span>{data.parent.detected_format}</span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                    <div>
                      <span>中性分子式 (Neutral Formula)：</span>
                      <b className="font-mono text-slate-900">{data.parent.formula}</b>
                    </div>
                    <div>
                      <span>中性單同位素質量 (Neutral Exact Mass)：</span>
                      <b className="font-mono text-blue-600">{data.parent.exact_mass.toFixed(4)} Da</b>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-0.5">
                    <span className="font-medium text-slate-700">Canonical SMILES：</span>
                    <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px] text-slate-800 select-all max-w-[280px] sm:max-w-md truncate">
                      {data.parent.smiles}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopySmiles(data.parent!.smiles)}
                      className="text-blue-600 hover:text-blue-800 text-[11px] font-medium inline-flex items-center gap-0.5"
                    >
                      {copiedSmiles ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>{copiedSmiles ? '已複製' : '複製'}</span>
                    </button>
                  </div>

                  {/* Detected functional groups — Clean unboxed metadata with separators */}
                  {data.parent.detected_groups && data.parent.detected_groups.length > 0 && (
                    <div className="pt-2 mt-1 border-t border-slate-100 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                      <span className="text-slate-500 font-medium">RDKit SMARTS 偵測官能基：</span>
                      {data.parent.detected_groups.map((grp, gIdx) => (
                        <React.Fragment key={gIdx}>
                          {gIdx > 0 && <span className="text-slate-300">·</span>}
                          <span className="text-amber-900 font-medium">{grp}</span>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* If user pasted an original screenshot, show side-by-side comparison thumbnail */}
              {userOriginalImage && (
                <div className="flex items-center gap-3 bg-slate-50/80 border border-slate-200 rounded-lg p-2.5 shrink-0 self-stretch sm:self-auto">
                  <div className="text-right hidden sm:block">
                    <div className="text-[11px] font-semibold text-slate-700">原始剪貼簿截圖</div>
                    <div className="text-[10px] text-slate-400">AI 光學辨識來源</div>
                  </div>
                  <div className="w-16 h-16 bg-white rounded border border-slate-200 p-1 flex items-center justify-center overflow-hidden">
                    <img
                      src={userOriginalImage}
                      alt="原始貼上截圖"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                  <div className="w-16 h-16 bg-white rounded border border-blue-200 p-1 flex items-center justify-center">
                    <img
                      src={parentStructure?.image}
                      alt="RDKit 2D 結構"
                      className="max-h-full max-w-full object-contain mix-blend-multiply"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Precursor Ion Prediction Zone */}
        {precursorSignals.length > 0 && (
          <section className="bg-white rounded-xl border border-sky-200 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                預測前驅離子與加合物 (Precursor Ions & Adducts)
              </h3>
              <span className="text-xs text-sky-700 font-medium">
                {technique} 母體離子候選 (嚴格區分 Neutral Mass 與 Ion m/z)
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {precursorSignals.map((p, idx) => (
                <div
                  key={idx}
                  onClick={() => setActiveHighlightId(activeHighlightId === 'Parent' ? null : 'Parent')}
                  className="p-2.5 rounded-lg border border-sky-100 bg-sky-50/40 hover:bg-sky-50 transition cursor-pointer"
                >
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-800">
                    <span>{p.adduct}</span>
                    <span
                      className={`text-[10px] font-semibold ${
                        p.mode === 'Negative' ? 'text-rose-700' : 'text-blue-700'
                      }`}
                    >
                      {p.mode === 'Negative' ? 'z = -1' : 'z = +1'}
                    </span>
                  </div>
                  <div className="font-mono text-sm font-bold text-blue-600 mt-1">
                    m/z {p.mz.toFixed(4)}
                  </div>
                  <div className="text-[11px] text-slate-600 font-mono mt-0.5 truncate" title={p.formula}>
                    離子式: {p.formula}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Candidate Mass Spectrum Graph */}
        {data && (
          <section>
            <MassSpectrum
              signals={data.signals}
              technique={technique}
              parameterContext={
                technique === 'LC-MS/MS'
                  ? `${simulationConfig.ionization || 'Auto'}, ${simulationConfig.analyzer || 'QTOF'} ${simulationConfig.fragmentationMethod || 'CID'}, CE: ${simulationConfig.collisionEnergy ?? 25} eV`
                  : technique === 'GC-MS'
                  ? simulationConfig.ionization === 'CI'
                    ? `CI (${simulationConfig.reagentGas || 'Methane'})`
                    : `EI: ${simulationConfig.electronEnergy ?? 70} eV`
                  : `Primary: ${simulationConfig.primaryIon || 'Generic'} (${simulationConfig.primaryIonEnergy || 25} keV)`
              }
              selectedMz={null}
              onSelectSignal={(sig) => {
                if (sig.parentStructureId) {
                  setActiveHighlightId(
                    activeHighlightId === sig.parentStructureId ? null : sig.parentStructureId
                  );
                } else if (
                  sig.type.includes('前驅') ||
                  sig.type.includes('准分子') ||
                  sig.type.includes('Parent')
                ) {
                  setActiveHighlightId('Parent');
                }
              }}
            />
          </section>
        )}

        {/* Parameter Sweep Results Card (if generated) */}
        {data?.sweepResults && data.sweepResults.length > 0 && (
          <section className="bg-white rounded-xl border border-indigo-200 p-4 shadow-xs">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  能量梯度掃描分析 (Energy Regime Sweep Analysis)
                </h3>
              </div>
              <span className="text-xs text-indigo-700 font-medium">
                展示不同碰撞能 (CE) 或電子能量 (EE) 區間下各反應途徑之消長
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {data.sweepResults.map((swp, sIdx) => (
                <div key={sIdx} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-900">
                      {swp.parameterLabel}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Top {swp.topCandidates.length}
                    </span>
                  </div>
                  {swp.regimeSummary && (
                    <p className="text-[11px] text-slate-500 leading-snug">
                      {swp.regimeSummary}
                    </p>
                  )}
                  <div className="space-y-1 pt-1 border-t border-slate-200/70">
                    {swp.topCandidates.map((tf, tfIdx) => (
                      <div key={tfIdx} className="text-xs flex items-center justify-between font-mono">
                        <span className="text-slate-700 truncate max-w-[140px]" title={`${tf.ionType} (${tf.formula})`}>
                          {tf.ionType} ({tf.formula})
                        </span>
                        <span className="text-blue-600 font-bold">m/z {tf.mz.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Dual Lists Layout (雙清單候選碎片資料展示) */}
        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" id="outputSection">
            {/* List 1: Left Column (清單一：質譜訊號與離子式清單) */}
            <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/70">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                      清單一：{technique} 候選質譜訊號與真實離子式清單
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      明確區分中性質量、離子精確質量、電荷 z 與 m/z，並驗證中性脫除質量守恆
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-blue-700">
                    共 {filteredAndSortedSignals.length} 筆候選訊號
                  </span>
                </div>

                {/* Filter, search and sorting bar */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {/* Polarity Filter */}
                  <div className="flex rounded-md border border-slate-200 bg-white p-0.5 text-xs">
                    {(['ALL', 'Positive', 'Negative'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setModeFilter(m)}
                        className={`px-2 py-1 rounded transition font-medium ${
                          modeFilter === m
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {m === 'ALL' ? '全部極性' : m === 'Positive' ? '正離子 (+)' : '負離子 (-)'}
                      </button>
                    ))}
                  </div>

                  {/* Priority Filter */}
                  <div className="flex rounded-md border border-slate-200 bg-white p-0.5 text-xs">
                    {(['ALL', 'High', 'Medium', 'Low'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriorityFilter(p)}
                        className={`px-2 py-1 rounded transition font-medium ${
                          priorityFilter === p
                            ? 'bg-slate-800 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {p === 'ALL' ? '全部優先度' : p}
                      </button>
                    ))}
                  </div>

                  {/* Search bar */}
                  <div className="relative flex-1 min-w-[130px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="搜尋離子式、SMILES、m/z、機制或中性脫除..."
                      className="w-full pl-7 pr-3 py-1 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* List 1 Sort Controls */}
                  <div className="flex items-center gap-1.5 text-xs bg-slate-100/80 px-2 py-1 rounded-md border border-slate-200/80">
                    <SlidersHorizontal className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-500 font-medium whitespace-nowrap">排序:</span>
                    <select
                      value={signalSortBy}
                      onChange={(e) => setSignalSortBy(e.target.value as any)}
                      className="bg-white text-xs border border-slate-200 rounded px-1.5 py-0.5 font-medium text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="mz_asc">m/z 由小到大 ↑</option>
                      <option value="mz_desc">m/z 由大到小 ↓</option>
                      <option value="score_desc">啟發評分 高至低 ↓</option>
                      <option value="score_asc">啟發評分 低至高 ↑</option>
                      <option value="default">預設順序</option>
                    </select>
                  </div>

                  {activeHighlightId && (
                    <button
                      type="button"
                      onClick={() => setActiveHighlightId(null)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 bg-blue-50 rounded"
                    >
                      清除選取 ({activeHighlightId})
                    </button>
                  )}
                </div>
              </div>

              {/* Signals Table */}
              <div className="overflow-x-auto max-h-[680px] overflow-y-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-100/80 text-slate-600 font-semibold sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">類型 / 反應路徑與中性脫除</th>
                      <th className="py-2.5 px-2">電荷</th>
                      <th className="py-2.5 px-2">離子形式</th>
                      <th className="py-2.5 px-3">真實離子式</th>
                      <th
                        className="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/60 transition select-none"
                        onClick={() => {
                          setSignalSortBy(signalSortBy === 'mz_asc' ? 'mz_desc' : 'mz_asc');
                        }}
                        title="點擊切換 m/z 排序"
                      >
                        <div className="inline-flex items-center gap-1">
                          <span>m/z</span>
                          {signalSortBy === 'mz_asc' ? (
                            <ArrowUp className="w-3 h-3 text-blue-600" />
                          ) : signalSortBy === 'mz_desc' ? (
                            <ArrowDown className="w-3 h-3 text-blue-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th className="py-2.5 px-2 text-center">優先度</th>
                      <th className="py-2.5 px-3 text-right" title="啟發式優先評分 (0-100)，非實驗強度">
                        啟發評分
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100" id="signalsTable">
                    {filteredAndSortedSignals.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          無符合篩選條件的訊號
                        </td>
                      </tr>
                    ) : (
                      filteredAndSortedSignals.map((item, idx) => {
                        const isPrecursor =
                          item.parentStructureId === 'Parent' ||
                          item.type.includes('前驅') ||
                          item.type.includes('准分子') ||
                          item.type.includes('分子離子');
                        const isNegative = item.mode === 'Negative';
                        const linkedStructId =
                          item.parentStructureId || (isPrecursor ? 'Parent' : null);
                        const isHighlighted =
                          activeHighlightId !== null && activeHighlightId === linkedStructId;
                        const score = item.heuristicScore ?? item.relative_intensity ?? 50;
                        const chargeLabel = isNegative ? '-1' : '+1';

                        return (
                          <tr
                            key={idx}
                            onClick={() => {
                              if (linkedStructId) {
                                setActiveHighlightId(
                                  activeHighlightId === linkedStructId ? null : linkedStructId
                                );
                              }
                            }}
                            className={`cursor-pointer transition-colors ${
                              isHighlighted
                                ? 'bg-amber-50 font-medium'
                                : idx % 2 === 0
                                ? 'bg-white hover:bg-slate-50/80'
                                : 'bg-slate-50/40 hover:bg-slate-100/60'
                            }`}
                          >
                            <td className="py-2 px-3 text-slate-700">
                              <div className="inline-flex items-center gap-1.5 font-medium">
                                {isPrecursor ? (
                                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0"></span>
                                ) : (
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                )}
                                <span>{item.type}</span>
                              </div>
                              {item.mechanism && (
                                <div
                                  className="text-[10px] text-slate-500 mt-0.5 leading-tight max-w-[230px] truncate"
                                  title={item.mechanism}
                                >
                                  {item.mechanism}
                                </div>
                              )}
                              {item.neutralLoss && (
                                <div className="text-[10px] text-indigo-700 mt-0.5 font-mono">
                                  中性脫除: -{item.neutralLoss}
                                  {item.neutralLossMass ? ` (${item.neutralLossMass.toFixed(4)} Da)` : ''}
                                  {item.massBalanceVerified ? ' ✓' : ''}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-2 font-mono text-xs">
                              <span
                                className={`font-bold ${
                                  isNegative ? 'text-rose-700' : 'text-emerald-700'
                                }`}
                              >
                                {chargeLabel}
                              </span>
                            </td>
                            <td className="py-2 px-2 font-mono text-slate-800">{item.adduct}</td>
                            <td className="py-2 px-3 font-mono font-bold text-slate-900">
                              <div>{item.formula}</div>
                              {item.smiles && (
                                <div
                                  className="text-[10px] font-normal text-slate-400 truncate max-w-[110px]"
                                  title={`RDKit SMILES: ${item.smiles}`}
                                >
                                  {item.smiles}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-blue-600">
                              <div>{item.mz.toFixed(4)}</div>
                              {item.neutralExactMass !== undefined && (
                                <div
                                  className="text-[9px] font-normal text-slate-400"
                                  title="對應中性物種精確質量 (Neutral Exact Mass)"
                                >
                                  M⁰: {item.neutralExactMass.toFixed(4)}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span
                                className={`text-[11px] font-bold ${
                                  item.priority === 'High'
                                    ? 'text-emerald-700'
                                    : item.priority === 'Medium'
                                    ? 'text-blue-700'
                                    : 'text-slate-500'
                                }`}
                              >
                                {item.priority || 'High'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="inline-flex items-center justify-end gap-1.5 font-mono">
                                <div className="w-10 bg-slate-100 rounded-full h-1.5 overflow-hidden hidden sm:block">
                                  <div
                                    className="bg-amber-500 h-full rounded-full"
                                    style={{ width: `${Math.min(100, score)}%` }}
                                  />
                                </div>
                                <span className="font-semibold text-amber-700 min-w-[28px] text-right">
                                  {score.toFixed(0)}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* List 2: Right Column (清單二：碎片與分子式對應結構式清單) */}
            <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                      清單二：{technique} 真實分子圖碎片結構式清單
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      所有結構皆由 RDKit 分子圖轉換產生並驗證電荷與化學式一致性 (支援內嵌圖片匯出 Excel)
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="font-semibold text-emerald-700">
                      共 {sortedStructures.length} 個結構
                    </span>
                    <span>·</span>
                    <span className="font-semibold text-blue-700">
                      已選 {selectedStructureIds.size} 個
                    </span>
                  </div>
                </div>

                {/* 碎片勾選快速操作列 & Excel 匯出按鈕 */}
                <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-200/60">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      id="select-all-structures-btn"
                      onClick={handleSelectAllStructures}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                      title="切換全選或全部取消"
                    >
                      {selectedStructureIds.size === (data?.structures?.length || 0) &&
                      data?.structures?.length ? (
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>
                        {selectedStructureIds.size === (data?.structures?.length || 0) &&
                        data?.structures?.length
                          ? '全部取消'
                          : '全選結構'}
                      </span>
                    </button>

                    <button
                      type="button"
                      id="select-only-fragments-btn"
                      onClick={handleSelectOnlyFragments}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                      title="僅選取切割碎片（排除母分子）"
                    >
                      <span>僅選碎片</span>
                    </button>

                    {selectedStructureIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedStructureIds(new Set())}
                        className="text-xs text-slate-500 hover:text-rose-600 px-1.5 py-0.5 transition"
                      >
                        清空勾選
                      </button>
                    )}
                  </div>

                  {/* 匯出 EXCEL 按鈕 */}
                  <button
                    type="button"
                    id="export-selected-excel-btn"
                    onClick={() => handleExportSelectedToExcel()}
                    disabled={isExportingExcel || selectedStructureIds.size === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition shadow-xs"
                    title="將勾選的碎片包含結構式影像一起匯出成 Excel (.xlsx)"
                  >
                    {isExportingExcel ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    )}
                    <span>匯出所選 Excel ({selectedStructureIds.size})</span>
                  </button>
                </div>

                {/* 匯出中狀態提示 */}
                {excelExportStatus && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 shrink-0" />
                    <span>{excelExportStatus}</span>
                  </div>
                )}

                {/* List 2 Sort & Display Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5 text-xs bg-slate-100/80 px-2 py-1 rounded-md border border-slate-200/80">
                    <SlidersHorizontal className="w-3 h-3 text-slate-500" />
                    <span className="text-slate-600 font-medium whitespace-nowrap">排序:</span>
                    <select
                      value={structureSortBy}
                      onChange={(e) => setStructureSortBy(e.target.value as any)}
                      className="bg-white text-xs border border-slate-200 rounded px-1.5 py-0.5 font-medium text-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="mass_desc">精確質量 高至低 ↓</option>
                      <option value="mass_asc">精確質量 低至高 ↑</option>
                      <option value="score_desc">啟發評分 高至低 ↓</option>
                      <option value="score_asc">啟發評分 低至高 ↑</option>
                      <option value="default">預設原始順序 (母分子優先)</option>
                    </select>
                  </div>

                  {activeHighlightId && (
                    <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                      高亮選取: {activeHighlightId}
                    </span>
                  )}
                </div>
              </div>

              {/* Grid of Structure Cards */}
              <div className="p-4 max-h-[680px] overflow-y-auto">
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3.5"
                  id="structuresGrid"
                >
                  {sortedStructures.map((item) => {
                    const isParent = item.id === 'Parent';
                    const isSelected = activeHighlightId === item.id;
                    const isChecked = selectedStructureIds.has(item.id);
                    const score =
                      item.heuristicScore ?? item.relative_intensity ?? (isParent ? 100 : 50);

                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          setActiveHighlightId(isSelected ? null : item.id);
                        }}
                        className={`group relative rounded-xl border p-3 flex flex-col justify-between transition-all cursor-pointer ${
                          isSelected
                            ? 'border-amber-400 bg-amber-50/40 shadow-xs ring-2 ring-amber-300'
                            : isChecked
                            ? 'border-emerald-300 bg-emerald-50/15 hover:border-emerald-400 hover:shadow-xs'
                            : isParent
                            ? 'border-blue-300 bg-blue-50/20 hover:border-blue-400 hover:shadow-xs'
                            : 'border-slate-200 bg-slate-50/30 hover:border-slate-300 hover:bg-white hover:shadow-xs'
                        }`}
                      >
                        {/* Top controls: Checkbox, ID & Priority text, Action buttons */}
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5 text-xs">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectStructure(item.id);
                              }}
                              className={`p-0.5 rounded transition ${
                                isChecked
                                  ? 'text-emerald-600 hover:text-emerald-700'
                                  : 'text-slate-400 hover:text-slate-600'
                              }`}
                              title={isChecked ? '取消勾選此碎片' : '勾選此碎片以供匯出'}
                            >
                              {isChecked ? (
                                <CheckSquare className="w-4 h-4 fill-emerald-50 text-emerald-600" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>

                            <span
                              className={`text-[11px] font-bold font-mono ${
                                isParent ? 'text-blue-700' : 'text-slate-700'
                              }`}
                            >
                              {item.id}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span
                              className={`text-[10px] font-semibold ${
                                item.priority === 'High'
                                  ? 'text-emerald-700'
                                  : item.priority === 'Medium'
                                  ? 'text-blue-700'
                                  : 'text-slate-500'
                              }`}
                            >
                              {item.priority || 'High'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExportSingleToExcel(item);
                              }}
                              className="text-slate-400 hover:text-emerald-600 p-0.5 rounded transition"
                              title="單獨匯出此碎片與結構式 Excel"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStructure(item);
                              }}
                              className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition"
                              title="放大檢視結構與完整質量資訊"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* 2D Chemical Structure Image */}
                        <div className="w-full h-36 bg-white rounded-lg border border-slate-100 flex items-center justify-center p-2 mb-2 relative">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="max-h-full max-w-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-xs text-slate-400">無結構圖像</span>
                          )}
                        </div>

                        {/* Title and metadata */}
                        <div className="space-y-1 text-left">
                          <div
                            className={`text-xs font-bold truncate ${
                              isParent ? 'text-blue-700' : 'text-slate-800'
                            }`}
                            title={item.name}
                          >
                            {item.name}
                          </div>
                          <div className="text-xs text-slate-600 flex items-center justify-between">
                            <span>化學/離子式:</span>
                            <b className="font-mono text-slate-900">{item.formula}</b>
                          </div>
                          <div className="text-xs text-slate-600 flex items-center justify-between">
                            <span>{item.charge ? `m/z (z=${item.charge > 0 ? `+${item.charge}` : item.charge}):` : '精確質量:'}</span>
                            <span className="font-mono font-bold text-blue-600">
                              {item.exact_mass.toFixed(4)} Da
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center justify-between">
                            <span>啟發評分:</span>
                            <span className="font-mono font-semibold text-amber-700">
                              {score.toFixed(0)} / 100
                            </span>
                          </div>
                          {item.neutralLoss && (
                            <div className="text-[10px] text-indigo-700 font-mono truncate">
                              脫除: -{item.neutralLoss}
                              {item.neutralLossMass ? ` (${item.neutralLossMass.toFixed(2)} Da)` : ''}
                            </div>
                          )}
                          {item.mechanism && (
                            <div
                              className="pt-1.5 text-[10px] text-slate-500 truncate border-t border-slate-100"
                              title={item.mechanism}
                            >
                              {item.mechanism}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Structure Zoom Modal */}
      {selectedStructure && (
        <StructureModal
          structure={selectedStructure}
          onClose={() => setSelectedStructure(null)}
          signals={data?.signals || []}
          isSelected={selectedStructureIds.has(selectedStructure.id)}
          onToggleSelect={toggleSelectStructure}
          onExportSingle={handleExportSingleToExcel}
        />
      )}

      {/* Code Viewer Modal */}
      <CodeViewerModal
        isOpen={isCodeModalOpen}
        onClose={() => setIsCodeModalOpen(false)}
      />

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 px-6 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <img
            src="/chemscutter_icon.jpg"
            alt="CheMScutter icon"
            referrerPolicy="no-referrer"
            className="w-4 h-4 rounded object-cover"
          />
          <span className="font-semibold text-slate-700">CheMScutter</span>
          <span>· TOF-SIMS / LC-MS/MS / GC-MS 多平台 MS Fragment Simulator</span>
        </div>
        <div className="text-slate-400">
          以 RDKit 分子圖反應與質量守恆驗證為核心 · 輔助送測前候選碎片預測與判讀
        </div>
      </footer>
    </div>
  );
}
