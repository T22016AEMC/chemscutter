import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult, MassTechnique } from '../engine/types';
import { getProfileForConfig } from '../engine/platform/instrumentProfiles';
import { createAnalysisWorker } from '../worker/client';
import { techniques } from '../worker/protocol';
import type { StructureRequest, StructureResponse } from '../worker/structureSession';
import type { PreparedStructure } from '../engine/chem/prepareStructure';
import { FRAME_CHANNEL, fromExpectedWindow, isFrameResponse, type FrameRequest, type FrameResponse } from '../shared/ketcherProtocol';
import { confirmationLines } from './confirmation';
import './analysis.css';

export default function AnalysisPanel() {
  const [smiles, setSmiles] = useState('CCOC(C)=O');
  const [technique, setTechnique] = useState<MassTechnique>('TOF-SIMS');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
  const config = getProfileForConfig(technique).defaultConfig;

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
      sendFrame({ channel: FRAME_CHANNEL, type: 'load', id: loadId.current, input: smiles });
    }, 350);
    return () => clearTimeout(timer);
  }, [smiles, ready]);

  function sendFrame(request: FrameRequest) {
    iframe.current?.contentWindow?.postMessage(request, location.origin);
  }

  function invalidate() {
    exportId.current = 0;
    setPrepared(null);
    preparationId.current = 0;
    ++requestId.current;
    setResult(null);
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
    setBusy(true);
    setError('');
    try { sendWorker({ type: 'run-prepared', id: ++requestId.current, preparationId: id, confirmed, technique }); }
    catch { workerFailed(); }
  }

  workerHandler.current = (response) => {
    if (response.id !== requestId.current) return;
    setBusy(false);
    if (response.type === 'prepared') {
      preparationId.current = response.id;
      if (response.structure.multipleComponents) setPrepared(response.structure);
      else runPrepared(false, response.id);
    } else if (response.type === 'result') setResult(response.result);
    else {
      setError(response.message);
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
      invalidate();
      setSynced(true);
      setError('');
    } else if (response.type === 'loaded' && response.id === loadId.current) {
      setSynced(true);
      setError('');
    } else if (response.type === 'structure' && response.id === exportId.current) {
      try { sendWorker({ type: 'prepare', id: ++requestId.current, input: response.structure.molfile }); }
      catch { workerFailed(); }
    } else if (response.type === 'error' && (response.id === null || response.id === loadId.current || response.id === exportId.current)) {
      setBusy(false);
      setError(response.message);
      if (response.id === loadId.current) setSynced(false);
    }
  };

  function workerFailed() {
    workerRef.current?.terminate();
    workerRef.current = null;
    setBusy(false);
    setError('背景分析中斷，請再試一次。若仍無法分析，請重新整理頁面。');
  }

  function analyze() {
    if (busy) return;
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

  return (
    <>
      <section className="analysis-panel" aria-labelledby="analysis-title">
        <h2 id="analysis-title">結構輸入與分析</h2>
        <p>繪圖或貼上 SMILES／Molfile，先在 Ketcher 確認結構，再取得結構進行分析。範例為乙酸乙酯。</p>
        <p>結構資料只在瀏覽器內處理，不會送到外部服務。繪圖器保留英文介面。</p>
        <div className="input-controls">
          <label htmlFor="smiles">SMILES／Molfile</label>
          <textarea id="smiles" rows={4} value={smiles} onChange={(event) => { invalidate(); setSynced(false); setSmiles(event.target.value); }}
            disabled={busy} spellCheck={false} autoComplete="off" aria-describedby="smiles-help" />
          <small id="smiles-help">例如 CCOC(C)=O；文字會同步載入已開啟的 Ketcher。也可直接在繪圖器繪圖或貼上結構。</small>
          {!open && <button type="button" onClick={() => { openedAt.current = performance.now(); setOpen(true); setFrameStatus('正在載入繪圖器與本機 WASM…'); }}>開啟 Ketcher 繪圖區</button>}
          {open && <div className="ketcher-container"><iframe ref={iframe} title="Ketcher 結構繪圖器" src={`${import.meta.env.BASE_URL}ketcher/`}
            onError={() => setError('繪圖器載入失敗，請重新整理後再試。')} /></div>}
          <p role="status">{frameStatus}</p>
          <label htmlFor="technique">分析平台</label>
          <select id="technique" value={technique} disabled={busy}
            onChange={(event) => setTechnique(event.target.value as MassTechnique)}>
            {techniques.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <div className="parameters">
            <h3>目前使用的參數</h3>
            <p>分析器：{config.analyzer}；極性：{config.polarity === 'Both' ? '正、負離子' : '正離子'}；
              模式：{config.simulationMode === 'General' ? '通用' : '儀器參數模式'}。</p>
            {technique === 'TOF-SIMS' && <p>一次離子：{config.primaryIon}；能量：{config.primaryIonEnergy} keV。</p>}
            {technique === 'LC-MS/MS' && <>
              <p>游離方式：自動；碎裂方式：{config.fragmentationMethod}；碰撞能量 CE：{config.collisionEnergy} eV。</p>
              <p>CE 掃描：10、25、40 eV（間隔 15 eV）。目前沿用引擎預設，與舊版介面的 QTOF、CE 25 eV 及掃描間隔 10 eV 不同。</p>
            </>}
            {technique === 'GC-MS' && <p>游離方式：{config.ionization}；電子能量：{config.electronEnergy} eV。</p>}
          </div>
          <button type="button" disabled={busy || !ready || !synced} onClick={analyze}>{busy ? '處理中…' : '從 Ketcher 取得結構並分析'}</button>
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
        {error && <p role="alert" className="error">{error}</p>}
      </section>
      {result && <section className="results" aria-labelledby="results-title">
        <h2 id="results-title">{result.technique} 分析結果</h2>
        <p>母體化學式：{result.parent.formula}；精確質量：{result.parent.exact_mass.toFixed(4)} Da。</p>
        <p className="result-note">分數為候選優先評分（0–100），不代表實測峰強度。化學正確性需自行驗證。</p>
        {result.candidates?.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="候選碎片表格，可水平捲動">
          <table>
            <caption>候選碎片，共 {result.candidates.length} 筆</caption>
            <thead><tr><th scope="col">m/z</th><th scope="col">化學式</th><th scope="col">說明</th><th scope="col">分數</th></tr></thead>
            <tbody>{result.candidates.map((candidate, index) => <tr key={`${candidate.id}-${index}`}>
              <td className="number">{candidate.mz.toFixed(4)}</td>
              <td className="formula">{candidate.formula}</td>
              <td>{candidate.explanation || candidate.mechanism}</td>
              <td className="number">{candidate.heuristicScore ?? '—'}</td>
            </tr>)}</tbody>
          </table>
        </div> : <p>這次分析沒有產生候選碎片。</p>}
      </section>}
    </>
  );
}
