import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult } from '../engine/types';
import { defaultConfig, parametersChanged, toDraft, toEngineConfig, validateParameters } from '../shared/parameters';
import ParameterForm from './ParameterForm';
import { createAnalysisWorker } from '../worker/client';
import type { StructureRequest, StructureResponse } from '../worker/structureSession';
import type { PreparedStructure } from '../engine/chem/prepareStructure';
import { FRAME_CHANNEL, fromExpectedWindow, isFrameResponse, type FrameRequest, type FrameResponse } from '../shared/ketcherProtocol';
import { confirmationLines } from './confirmation';
import PubChemSearch from './PubChemSearch';
import ResultsView from './results/ResultsView';
import { compoundUrl, type PubChemCompound } from './pubchem';
import './analysis.css';

export default function AnalysisPanel() {
  const [smiles, setSmiles] = useState('CCOC(C)=O');
  const [drawingInput, setDrawingInput] = useState({ value: 'CCOC(C)=O' });
  const [selectedCompound, setSelectedCompound] = useState<PubChemCompound | null>(null);
  const [draft, setDraft] = useState(() => toDraft(defaultConfig('TOF-SIMS')));
  const technique = draft.technique;
  const [resultConfig, setResultConfig] = useState(() => defaultConfig('TOF-SIMS'));
  const runConfig = useRef(resultConfig);
  const confirmedInput = useRef(false);
  const [resultSource, setResultSource] = useState<{ cid: number; title: string } | undefined>();
  const runSource = useRef<{ cid: number; title: string } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errorDetails, setErrorDetails] = useState('');
  const [drawingError, setDrawingError] = useState('');
  const [drawingDetails, setDrawingDetails] = useState('');
  const [textPreview, setTextPreview] = useState<PreparedStructure | null>(null);
  const source = useRef<'text' | 'drawing'>('text');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [synced, setSynced] = useState(false);
  const [frameStatus, setFrameStatus] = useState('');
  const [prepared, setPrepared] = useState<PreparedStructure | null>(null);
  const preparationId = useRef(0);
  const iframe = useRef<HTMLIFrameElement>(null);
  const frameId = useRef(0);
  const loadId = useRef(0);
  const exportId = useRef(0);
  const openedAt = useRef(0);
  const frameHandler = useRef<(message: FrameResponse) => void>(() => {});
  const workerHandler = useRef<(message: StructureResponse) => void>(() => {});
  const validParameters = !Object.keys(validateParameters(draft)).length;

  useEffect(() => () => workerRef.current?.terminate(), []);
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (fromExpectedWindow(event, location.origin, iframe.current?.contentWindow) && isFrameResponse(event.data)) frameHandler.current(event.data);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);

  useEffect(() => {
    if (!ready) return;
    setSynced(false);
    const timer = setTimeout(() => {
      loadId.current = ++frameId.current;
      sendFrame({ channel: FRAME_CHANNEL, type: 'load', id: loadId.current, input: drawingInput.value });
    }, 350);
    return () => clearTimeout(timer);
  }, [drawingInput, ready]);

  function sendFrame(request: FrameRequest) {
    iframe.current?.contentWindow?.postMessage(request, location.origin);
  }

  function openDrawing() {
    if (open) return;
    openedAt.current = performance.now();
    setOpen(true);
    setFrameStatus('正在載入繪圖器與本機 WASM…');
  }

  function selectCompound(compound: PubChemCompound) {
    invalidate();
    source.current = 'drawing';
    loadId.current = 0;
    setSynced(false);
    setSelectedCompound(compound);
    setDrawingInput({ value: compound.smiles });
    openDrawing();
  }

  function invalidate() {
    confirmedInput.current = false;
    exportId.current = 0;
    setPrepared(null);
    preparationId.current = 0;
    ++requestId.current;
    setResult(null);
    setTextPreview(null);
    setError('');
    setBusy(false);
    workerRef.current?.postMessage({ type: 'invalidate', id: requestId.current } satisfies StructureRequest);
  }

  function sendWorker(request: StructureRequest) {
    if (!workerRef.current) {
      const worker = createAnalysisWorker();
      worker.onmessage = (event: MessageEvent<StructureResponse>) => workerHandler.current(event.data);
      worker.onerror = workerFailed;
      worker.onmessageerror = workerFailed;
      workerRef.current = worker;
    }
    workerRef.current.postMessage(request);
  }

  function runPrepared(confirmed: boolean, id = preparationId.current) {
    if (!validParameters) { setError('儀器參數尚未通過驗證，請修正標示的欄位。'); return; }
    runConfig.current = toEngineConfig(draft);
    confirmedInput.current = confirmed;
    runSource.current = source.current === 'drawing' && selectedCompound ? { cid: selectedCompound.cid, title: selectedCompound.title } : undefined;
    setBusy(true);
    setError('');
    try { sendWorker({ type: 'run-prepared', id: ++requestId.current, preparationId: id, confirmed, technique, config: runConfig.current }); }
    catch { workerFailed(); }
  }

  workerHandler.current = (response) => {
    if (response.id !== requestId.current) return;
    setBusy(false);
    if (response.type === 'prepared') {
      preparationId.current = response.id;
      if (source.current === 'text') setTextPreview(response.structure);
      if (response.structure.multipleComponents) setPrepared(response.structure);
      else runPrepared(false, response.id);
    } else if (response.type === 'result') { setResult(response.result); setResultConfig(runConfig.current); setResultSource(runSource.current); }
    else {
      setError(response.message);
      setErrorDetails(response.details || '來源：Worker 流程；RDKit 未提供額外訊息。');
      if (response.code === 'ENGINE_LOAD_FAILED') {
        workerRef.current?.terminate();
        workerRef.current = null;
      }
    }
  };

  frameHandler.current = (response) => {
    if (response.type === 'ready') {
      setReady(true);
      setFrameStatus(`繪圖器已就緒，首次載入耗時 ${((performance.now() - openedAt.current) / 1000).toFixed(2)} 秒。`);
    } else if (response.type === 'changed') {
      if (source.current === 'drawing') invalidate();
      setSelectedCompound(null);
      setSynced(true);
      setDrawingError('');
    } else if (response.type === 'loaded' && response.id === loadId.current) {
      setSynced(true);
      setDrawingError('');
    } else if (response.type === 'structure' && response.id === exportId.current) {
      try { sendWorker({ type: 'prepare', id: ++requestId.current, input: response.structure.molfile, source: 'drawing' }); }
      catch { workerFailed(); }
    } else if (response.type === 'error' && (response.id === null || response.id === loadId.current || response.id === exportId.current)) {
      if (source.current === 'drawing') setBusy(false);
      setDrawingError(response.message);
      setDrawingDetails(response.details || '來源：Ketcher；RDKit 尚未執行。');
      if (response.id === loadId.current) setSynced(false);
    }
  };

  function workerFailed() {
    workerRef.current?.terminate();
    workerRef.current = null;
    setBusy(false);
    setError('背景分析中斷，請再試一次。若仍無法分析，請重新整理頁面。');
    setErrorDetails('來源：Worker 通訊；未取得 RDKit 原始訊息。');
  }

  function analyze() {
    if (busy) return;
    if (!validParameters) { setError('儀器參數尚未通過驗證，請修正標示的欄位。'); return; }
    source.current = 'drawing';
    setTextPreview(null);
    setError('');
    setResult(null);
    setPrepared(null);
    setBusy(true);
    try {
      exportId.current = ++frameId.current;
      sendFrame({ channel: FRAME_CHANNEL, type: 'export', id: exportId.current });
    } catch {
      workerFailed();
    }
  }

  function analyzeText() {
    if (busy) return;
    if (!validParameters) { setError('儀器參數尚未通過驗證，請修正標示的欄位。'); return; }
    invalidate();
    source.current = 'text';
    setBusy(true);
    try { sendWorker({ type: 'prepare', id: ++requestId.current, input: smiles, source: 'text' }); }
    catch { workerFailed(); }
  }

  return (
    <>
      <section className="analysis-panel" aria-labelledby="analysis-title">
        <h2 id="analysis-title">結構輸入與分析</h2>
        <p>貼上 SMILES／Molfile 可直接分析，也可選用 Ketcher 繪圖。兩種操作分別使用文字欄位與繪圖區的內容。範例為乙酸乙酯。</p>
        <p>結構驗證與分析只在瀏覽器內執行；名稱查詢會把名稱送到 PubChem。繪圖器保留英文介面。</p>
        <div className="input-controls">
          <PubChemSearch onSelect={selectCompound} disabled={busy} />
          <label htmlFor="smiles">SMILES／Molfile</label>
          <textarea id="smiles" rows={4} value={smiles} onChange={(event) => { invalidate(); source.current = 'text'; loadId.current = 0; setSynced(false); setSelectedCompound(null); setSmiles(event.target.value); setDrawingInput({ value: event.target.value }); }}
            disabled={busy} spellCheck={false} autoComplete="off" aria-describedby="smiles-help" />
          <small id="smiles-help">例如 CCOC(C)=O；直接分析使用此欄位，不需開啟 Ketcher。繪圖區已開啟時，文字也會同步載入。</small>
          <button type="button" disabled={busy} onClick={analyzeText}>直接分析</button>
          <small>使用文字欄位；目前平台：{technique}。{!smiles.trim() && '欄位空白，請先貼上 SMILES／Molfile。'}</small>
          {error && <div className="error"><p role="alert">{error}</p>
            <details><summary>技術細節</summary><pre>{errorDetails || '未提供額外訊息。'}</pre></details>
          </div>}
          {textPreview && <figure className="text-preview">
            <img src={textPreview.retainedImage} alt="RDKit 驗證後實際分析的結構" />
            <figcaption>實際分析的 SMILES：{textPreview.retainedSmiles}
              {textPreview.standardization_note && <p>{textPreview.standardization_note}</p>}
            </figcaption>
          </figure>}
          {!open && <button type="button" onClick={openDrawing}>開啟 Ketcher 繪圖區</button>}
          {selectedCompound && <div className="pubchem-selected" role="status">
            <p>繪圖區查詢來源：<a href={compoundUrl(selectedCompound.cid)} target="_blank" rel="noopener noreferrer">PubChem CID {selectedCompound.cid}</a>，{selectedCompound.title}；分子式：{selectedCompound.formula}。</p>
            <p>正式名稱（IUPAC）：{selectedCompound.name}。採用欄位：{selectedCompound.smilesField}。</p>
            <p>請確認下方 Ketcher 顯示的結構，再按「從 Ketcher 取得結構並分析」。查詢結果不會填入上方文字欄位；「直接分析」仍只使用您自行貼入的文字。</p>
          </div>}
          {open && <div className="ketcher-container"><iframe ref={iframe} title="Ketcher 結構繪圖器" src={`${import.meta.env.BASE_URL}ketcher/`}
            onError={() => { setDrawingError('繪圖器載入失敗，請重新整理後再試。'); setDrawingDetails('來源：iframe 載入；不影響文字直接分析。'); }} /></div>}
          <p role="status">{frameStatus}</p>
          {drawingError && <div className="error"><p role="alert">繪圖區：{drawingError}</p>
            <details><summary>繪圖區技術細節</summary><pre>{drawingDetails}</pre></details>
          </div>}
          <ParameterForm draft={draft} onChange={setDraft} disabled={busy} />
          <button type="button" disabled={busy || !ready || !synced} onClick={analyze}>{busy ? '處理中…' : '從 Ketcher 取得結構並分析'}</button>
          <small>使用繪圖區內容。{!open ? '請先開啟 Ketcher；文字欄位可使用「直接分析」。' : !ready ? '繪圖器正在載入，請稍候。' : !synced ? '繪圖區尚未同步完成，請先處理匯入訊息。' : ''}</small>
          {prepared?.multipleComponents && <section className="component-confirmation" aria-labelledby="confirmation-title">
            <h3 id="confirmation-title">請確認實際分析的成分</h3>
            <img src={prepared.retainedImage} alt="實際將被分析的保留成分結構" />
            {confirmationLines(prepared).map((line) => <p key={line}>{line}</p>)}
            <button type="button" disabled={busy} onClick={() => runPrepared(true)}>確認，只分析保留的成分</button>
          </section>}
        </div>
        <p role="status" aria-live="polite">
          {busy ? '正在載入分析引擎並計算候選碎片，請稍候…' : result ? `分析完成：${result.technique}，共 ${result.candidates?.length ?? 0} 筆候選。` : ''}
        </p>
      </section>
      {result && <>
        {parametersChanged(draft, resultConfig) && <div className="parameter-stale" role="status"><p>參數已變更，結果尚未更新。</p><button type="button" disabled={busy} onClick={() => runPrepared(confirmedInput.current)}>重新分析</button></div>}
        <ResultsView key={result.technique + requestId.current} result={result} provenance={resultSource} />
      </>}
    </>
  );
}
