import React, { useState, useRef, useEffect, DragEvent, ClipboardEvent } from 'react';
import { InputMode, AnalysisResult, MassTechnique, SimulationConfig } from '../types';
import { SAMPLE_IMAGE_MOLECULES } from '../sampleImages';
import {
  Image as ImageIcon,
  Upload,
  FileCode2,
  Sparkles,
  ClipboardPaste,
  RefreshCw,
  Check,
  AlertCircle,
  X,
  FileText,
  Copy,
  Layers,
  ArrowRight
} from 'lucide-react';

interface StructureInputZoneProps {
  onAnalysisSuccess: (result: AnalysisResult, originalImg?: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  currentSmiles: string;
  setCurrentSmiles: (smiles: string) => void;
  technique?: MassTechnique;
  simulationConfig?: SimulationConfig;
}

const SAMPLE_CHEMDRAW_MOLFILE = `
  ChemDraw09152602302D

 13 13  0  0  0  0  0  0  0  0999 V2000
   -1.7321    1.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.8660    0.5000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.8660   -0.5000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    1.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.8660    0.5000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.7321    1.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.5981    0.5000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.5981   -0.5000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.7321   -1.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.8660   -0.5000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000   -1.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.8660   -0.5000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000   -2.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  2  3  2  0
  2  4  1  0
  4  5  1  0
  5  6  2  0
  6  7  1  0
  7  8  2  0
  8  9  1  0
  9 10  2  0
 10  5  1  0
 10 11  1  0
 11 12  1  0
 11 13  2  0
M  END`;

const PRESET_MOLECULES = [
  { name: '阿司匹靈 (Aspirin)', smiles: 'CC(=O)Oc1ccccc1C(=O)O', desc: '乙醯水楊酸' },
  { name: '乙酸乙酯 (Ethyl Acetate)', smiles: 'CCOC(=O)C', desc: '典型酯類溶劑' },
  { name: '乙醯胺酚 (Acetaminophen)', smiles: 'CC(=O)Nc1ccc(O)cc1', desc: '常見解熱鎮痛普拿疼' },
  { name: '布洛芬 (Ibuprofen)', smiles: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O', desc: '非類固醇消炎止痛藥' },
  { name: '咖啡因 (Caffeine)', smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C', desc: '天然黃嘌呤生物鹼' }
];

export function StructureInputZone({
  onAnalysisSuccess,
  isLoading,
  setIsLoading,
  currentSmiles,
  setCurrentSmiles,
  technique = 'TOF-SIMS',
  simulationConfig
}: StructureInputZoneProps) {
  const [activeTab, setActiveTab] = useState<InputMode>('image');
  const [chemdrawText, setChemdrawText] = useState('');
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'info' | 'success' | 'error';
    text: string;
  } | null>(null);
  const [copiedSmiles, setCopiedSmiles] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const structureFileInputRef = useRef<HTMLInputElement>(null);

  // 全域快捷鍵監聽：使用者在頁面上任何地方按 Ctrl+V / Cmd+V 都能觸發截圖或文字貼上
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // 若當前焦點在輸入欄內且不是貼圖片，則交由預設處理
      const target = e.target as HTMLElement;
      const isInputFocused =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (e.clipboardData) {
        const items = Array.from(e.clipboardData.items) as DataTransferItem[];
        // 1. 優先檢查是否包含圖片（例如從 ChemDraw 複製圖片或截圖）
        const imageItem = items.find((item) => item.type.startsWith('image/'));
        if (imageItem) {
          e.preventDefault();
          const blob = imageItem.getAsFile();
          if (blob) {
            handleImageFile(blob, '剪貼簿貼上截圖');
            return;
          }
        }

        // 2. 檢查純文字（若非 input 聚焦，或是含有 Molfile 關鍵字）
        const text = e.clipboardData.getData('text/plain');
        if (text && (!isInputFocused || text.includes('M  END') || text.includes('V2000') || text.includes('V3000'))) {
          if (text.includes('M  END') || text.includes('V2000') || text.includes('V3000') || text.includes('<CDXML')) {
            e.preventDefault();
            setActiveTab('chemdraw');
            setChemdrawText(text);
            handleAnalyzeStructure(text, 'ChemDraw/ChemDoodle 剪貼簿');
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste as any);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste as any);
    };
  }, []);

  // 處理圖片檔案（無論來自拖曳、點擊上傳或剪貼簿）
  const handleImageFile = (file: File, label = file.name) => {
    if (!file.type.startsWith('image/')) {
      setStatusMessage({ type: 'error', text: '請上傳標準圖片檔案 (PNG, JPG, SVG, WEBP)' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Data = e.target?.result as string;
      setPastedImage(base64Data);
      setImageFileName(label);
      setActiveTab('image');
      recognizeAndAnalyzeImage(base64Data, label);
    };
    reader.readAsDataURL(file);
  };

  // 呼叫後端 API 執行光學結構式辨識 (OCSR)
  const recognizeAndAnalyzeImage = async (base64Img: string, label: string) => {
    setIsLoading(true);
    setStatusMessage({
      type: 'info',
      text: `已偵測到「${label}」，正在使用 AI 進行化學結構式光學辨識 (${technique})...`
    });

    try {
      const res = await fetch('/api/recognize-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Img,
          technique,
          simulationConfig: {
            ...simulationConfig,
            technique
          }
        })
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || '圖片結構辨識失敗');
      }

      setCurrentSmiles(json.smiles);
      const parentName = json.name ? `【${json.name}】` : '';
      setStatusMessage({
        type: 'success',
        text: `AI 光學辨識成功！${parentName} SMILES: ${json.smiles}，已載入 ${technique} 模擬候選清單！`
      });

      if (json.analysisResult) {
        onAnalysisSuccess(json.analysisResult, base64Img);
      }
    } catch (err: any) {
      console.error('Image recognition failed:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || '無法從圖片辨識出化學分子，請確認截圖清晰度。'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 呼叫後端分析結構（文字、Molfile 或 SMILES）
  const handleAnalyzeStructure = async (rawInput: string, sourceLabel = '結構式') => {
    const input = rawInput.trim();
    if (!input) {
      setStatusMessage({ type: 'error', text: '請輸入或貼上化學結構！' });
      return;
    }

    setIsLoading(true);
    setStatusMessage({
      type: 'info',
      text: `正在解析 ${sourceLabel} 並計算 ${technique} 候選碎片訊號...`
    });

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input,
          technique,
          simulationConfig: {
            ...simulationConfig,
            technique
          }
        })
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || '結構解析失敗');
      }

      if (json.parent?.smiles) {
        setCurrentSmiles(json.parent.smiles);
      }

      const formatLabel = json.parent?.detected_format || '化學結構';
      setStatusMessage({
        type: 'success',
        text: `已成功解析 ${formatLabel}！產生 ${json.signals?.length || 0} 個 ${technique} 質譜訊號與 ${json.structures?.length || 0} 個對應碎片結構。`
      });

      onAnalysisSuccess(json);
    } catch (err: any) {
      console.error('Analysis error:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || '化學結構無效或計算出錯，請確認格式。'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 處理結構檔案上傳 (.mol, .sdf, .cdxml, .smi, .txt)
  const handleStructureFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setChemdrawText(content);
        setActiveTab('chemdraw');
        handleAnalyzeStructure(content, `檔案 [${file.name}]`);
      }
    };
    reader.readAsText(file);
  };

  // 拖曳處理
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const isImg = file.type.startsWith('image/') || /\.(png|jpe?g|svg|webp|bmp)$/i.test(file.name);
      if (isImg) {
        handleImageFile(file);
      } else {
        handleStructureFileUpload(file);
      }
    }
  };

  // 複製 SMILES
  const handleCopySmiles = () => {
    if (!currentSmiles) return;
    navigator.clipboard.writeText(currentSmiles);
    setCopiedSmiles(true);
    setTimeout(() => setCopiedSmiles(false), 2000);
  };

  // 檢測 ChemDraw 文字框的格式
  const detectedChemdrawFormat = React.useMemo(() => {
    const text = chemdrawText.trim();
    if (!text) return null;
    if (text.includes('V2000')) return 'ChemDraw/ChemDoodle Molfile (V2000)';
    if (text.includes('V3000')) return 'ChemDraw/ChemDoodle Molfile (V3000)';
    if (text.includes('M  END')) return 'MDL Molfile';
    if (text.includes('<CDXML') || (text.startsWith('<?xml') && text.includes('CDXML'))) return 'ChemDraw XML (CDXML)';
    if (text.startsWith('{') && text.includes('"m":')) return 'ChemDoodle Web JSON';
    return 'SMILES / 化學代碼';
  }, [chemdrawText]);

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-xs mb-6 overflow-hidden">
      {/* 頂部功能導航標籤 (Tabs) */}
      <div className="bg-slate-50/80 border-b border-slate-200 px-4 pt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            id="tab-image-input"
            onClick={() => setActiveTab('image')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-t-lg transition border-t border-x -mb-px ${
              activeTab === 'image'
                ? 'bg-white text-blue-600 border-slate-200 border-b-white shadow-2xs'
                : 'text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <ImageIcon className="w-4 h-4 text-blue-600" />
            <span>貼上結構截圖 / 圖片</span>
            <span className="hidden sm:inline-block px-1.5 py-0.2 bg-blue-100/70 text-blue-800 text-[10px] font-mono rounded">
              Ctrl+V
            </span>
          </button>

          <button
            type="button"
            id="tab-chemdraw-input"
            onClick={() => setActiveTab('chemdraw')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-t-lg transition border-t border-x -mb-px ${
              activeTab === 'chemdraw'
                ? 'bg-white text-blue-600 border-slate-200 border-b-white shadow-2xs'
                : 'text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <FileCode2 className="w-4 h-4 text-emerald-600" />
            <span>ChemDraw / ChemDoodle 貼上</span>
            <span className="hidden md:inline-block px-1.5 py-0.2 bg-emerald-100/70 text-emerald-800 text-[10px] rounded">
              .mol / .cdxml
            </span>
          </button>

          <button
            type="button"
            id="tab-smiles-input"
            onClick={() => setActiveTab('smiles')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-t-lg transition border-t border-x -mb-px ${
              activeTab === 'smiles'
                ? 'bg-white text-blue-600 border-slate-200 border-b-white shadow-2xs'
                : 'text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <FileText className="w-4 h-4 text-purple-600" />
            <span>SMILES 輸入 / 預設分子</span>
          </button>
        </div>

        {/* 提示訊息 */}
        <div className="text-[11px] text-slate-400 hidden lg:flex items-center gap-1.5 py-1">
          <ClipboardPaste className="w-3.5 h-3.5 text-slate-400" />
          <span>在視窗任一處按 Ctrl+V 即可自動貼入圖片或 ChemDraw 結構</span>
        </div>
      </div>

      {/* 標籤頁本體內容 */}
      <div className="p-5">
        {/* ======================= Tab 1: 圖片貼上與光學辨識 ======================= */}
        {activeTab === 'image' && (
          <div className="space-y-4">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[160px] ${
                isDragOver
                  ? 'border-blue-500 bg-blue-50/50 scale-[0.99]'
                  : pastedImage
                  ? 'border-slate-300 bg-slate-50/30 hover:bg-slate-50'
                  : 'border-slate-300 bg-slate-50/60 hover:border-blue-400 hover:bg-blue-50/20'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleImageFile(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              {pastedImage ? (
                <div className="flex flex-col md:flex-row items-center gap-6 w-full max-w-2xl mx-auto py-2">
                  <div className="relative group shrink-0">
                    <img
                      src={pastedImage}
                      alt="貼上的化學結構式截圖"
                      className="w-36 h-36 object-contain bg-white rounded-lg border border-slate-200 p-1.5 shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPastedImage(null);
                        setImageFileName('');
                        setStatusMessage(null);
                      }}
                      className="absolute -top-2 -right-2 p-1 bg-red-600 text-white rounded-full shadow-xs hover:bg-red-700 transition"
                      title="清除當前圖片"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 text-left space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded">
                        📷 當前結構式截圖
                      </span>
                      <span className="text-xs text-slate-500 truncate max-w-[200px]">
                        {imageFileName || '剪貼簿圖片'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600">
                      AI 光學化學辨識系統已將此圖轉換為規範化結構式，並同步更新 TOF-SIMS 碎裂計算。
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          recognizeAndAnalyzeImage(pastedImage, imageFileName || '結構截圖');
                        }}
                        disabled={isLoading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-semibold rounded-lg shadow-2xs transition"
                      >
                        {isLoading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>AI 辨識運算中...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>重新辨識並計算</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition"
                      >
                        <Upload className="w-3.5 h-3.5 text-slate-500" />
                        <span>更換另一張圖片</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 py-3">
                  <div className="w-12 h-12 rounded-full bg-blue-100/80 text-blue-600 flex items-center justify-center mx-auto shadow-2xs">
                    <ClipboardPaste className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-800">
                      直接在此按 <kbd className="px-2 py-0.5 bg-slate-200 border border-slate-300 rounded text-xs font-mono text-slate-700">Ctrl + V</kbd> 貼上結構式截圖
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      或將 ChemDraw 另存的圖片、論文截圖拖曳至此，或點擊瀏覽檔案 (PNG, JPG, SVG, WEBP)
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1 text-[11px] text-blue-600 font-medium bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200/60">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>內建 AI 光學化學辨識 (OCSR)，即時將圖片轉化為分子圖並計算 TOF-SIMS 碎裂</span>
                  </div>
                </div>
              )}
            </div>

            {/* 快速載入測試結構截圖 */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  快速測試化學結構圖（點選即自動載入並由 AI 光學辨識）：
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {SAMPLE_IMAGE_MOLECULES.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => {
                      setPastedImage(sample.dataUrl);
                      setImageFileName(sample.name);
                      recognizeAndAnalyzeImage(sample.dataUrl, sample.name);
                    }}
                    disabled={isLoading}
                    className="flex items-center gap-2.5 p-2 bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 rounded-lg text-left transition group disabled:opacity-60 cursor-pointer shadow-2xs"
                  >
                    <img
                      src={sample.dataUrl}
                      alt={sample.name}
                      className="w-12 h-12 object-contain bg-white rounded border border-slate-200 p-1 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-800 group-hover:text-blue-600 truncate">
                        {sample.name}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {sample.formula} · {sample.desc}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ======================= Tab 2: ChemDraw / ChemDoodle 貼上 ======================= */}
        {activeTab === 'chemdraw' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label htmlFor="chemdraw-input" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  從 ChemDraw 或 ChemDoodle 複製的結構式資料 (Molfile / CDXML)
                </label>
                {detectedChemdrawFormat && (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] font-semibold rounded-md border border-emerald-200">
                    {detectedChemdrawFormat}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setChemdrawText(SAMPLE_CHEMDRAW_MOLFILE);
                    handleAnalyzeStructure(SAMPLE_CHEMDRAW_MOLFILE, 'ChemDraw 阿司匹靈範例');
                  }}
                  className="text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200 px-2.5 py-1 rounded-md transition"
                >
                  載入 ChemDraw 範例 (阿司匹靈)
                </button>
                <button
                  type="button"
                  onClick={() => structureFileInputRef.current?.click()}
                  className="text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-md transition flex items-center gap-1"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>上傳 .mol / .cdxml 檔</span>
                </button>
                <input
                  ref={structureFileInputRef}
                  type="file"
                  accept=".mol,.sdf,.cdxml,.smi,.txt"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleStructureFileUpload(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
              </div>
            </div>

            <div className="relative">
              <textarea
                id="chemdraw-input"
                rows={5}
                value={chemdrawText}
                onChange={(e) => setChemdrawText(e.target.value)}
                placeholder="在 ChemDraw 選取結構按 Ctrl+C，或按「Copy As > Molfile」後直接在次處按 Ctrl+V 貼上...&#10;支援 MDL Molfile V2000 / V3000、ChemDraw XML (CDXML) 或 ChemDoodle JSON"
                className="w-full p-3 font-mono text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 bg-slate-50/40 leading-relaxed"
              />
              {chemdrawText && (
                <button
                  type="button"
                  onClick={() => setChemdrawText('')}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 text-xs"
                >
                  清除
                </button>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                id="analyze-chemdraw-btn"
                onClick={() => handleAnalyzeStructure(chemdrawText, 'ChemDraw/ChemDoodle 貼上內容')}
                disabled={isLoading || !chemdrawText.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-300 text-white text-xs sm:text-sm font-semibold rounded-lg shadow-xs transition"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>解析計算中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>解析 ChemDraw 並計算碎裂</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ======================= Tab 3: SMILES 手動輸入與預設範例 ======================= */}
        {activeTab === 'smiles' && (
          <div className="space-y-3">
            <label htmlFor="smiles-direct-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              輸入 SMILES 分子結構式 (Molecular SMILES)
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <input
                  id="smiles-direct-input"
                  type="text"
                  value={currentSmiles}
                  onChange={(e) => setCurrentSmiles(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAnalyzeStructure(currentSmiles, 'SMILES');
                  }}
                  placeholder="輸入 SMILES (例如阿司匹靈: CC(=O)Oc1ccccc1C(=O)O 或 乙酸乙酯: CCOC(=O)C)"
                  className="w-full pl-3.5 pr-10 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-slate-50/50"
                />
                {currentSmiles && (
                  <button
                    type="button"
                    onClick={() => setCurrentSmiles('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-medium"
                  >
                    清除
                  </button>
                )}
              </div>
              <button
                type="button"
                id="analyze-smiles-btn"
                onClick={() => handleAnalyzeStructure(currentSmiles, 'SMILES')}
                disabled={isLoading || !currentSmiles.trim()}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300 text-white text-sm font-semibold rounded-lg shadow-xs transition shrink-0"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>計算中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>開始分析</span>
                  </>
                )}
              </button>
            </div>

            {/* 快速載入常用分子範例 */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-slate-400 font-medium mr-1">快速載入預設範例：</span>
              {PRESET_MOLECULES.map((mol) => {
                const isActive = currentSmiles === mol.smiles;
                return (
                  <button
                    key={mol.name}
                    type="button"
                    onClick={() => {
                      setCurrentSmiles(mol.smiles);
                      handleAnalyzeStructure(mol.smiles, mol.name);
                    }}
                    className={`text-xs px-2.5 py-1 rounded-md transition font-medium border ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {mol.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 狀態與解析通知 Banner */}
        {statusMessage && (
          <div
            className={`mt-4 p-3 rounded-lg text-xs flex items-start gap-2.5 border transition ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50/90 text-emerald-800 border-emerald-200'
                : statusMessage.type === 'error'
                ? 'bg-red-50/90 text-red-800 border-red-200'
                : 'bg-blue-50/90 text-blue-800 border-blue-200'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : statusMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            ) : (
              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0 mt-0.5" />
            )}
            <div className="flex-1 leading-relaxed">{statusMessage.text}</div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 當前分析分子資訊摘要列 */}
        {currentSmiles && (
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-700">當前分子規範化 SMILES：</span>
              <code className="px-2 py-0.5 bg-slate-100 text-slate-800 font-mono rounded border border-slate-200 select-all">
                {currentSmiles}
              </code>
              <button
                type="button"
                onClick={handleCopySmiles}
                className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium ml-1"
                title="複製 SMILES"
              >
                {copiedSmiles ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-600">已複製</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>複製</span>
                  </>
                )}
              </button>
            </div>

            <div className="text-[11px] text-slate-400">
              支援單鍵斷裂模擬 • TOF-SIMS 正負離子模式
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
