import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import type { AnalysisResult, MassTechnique } from '../engine/types';
import { getProfileForConfig } from '../engine/platform/instrumentProfiles';
import { createAnalysisWorker } from '../worker/client';
import { techniques, type AnalysisRequest, type AnalysisResponse } from '../worker/protocol';
import './analysis.css';

export default function AnalysisPanel() {
  const [smiles, setSmiles] = useState('CCOC(C)=O');
  const [technique, setTechnique] = useState<MassTechnique>('TOF-SIMS');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const config = getProfileForConfig(technique).defaultConfig;

  useEffect(() => () => workerRef.current?.terminate(), []);

  function workerFailed() {
    workerRef.current?.terminate();
    workerRef.current = null;
    setBusy(false);
    setError('背景分析中斷，請再試一次。若仍無法分析，請重新整理頁面。');
  }

  function analyze(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setResult(null);
    if (!smiles.trim()) {
      setError('請輸入 SMILES。');
      return;
    }
    setBusy(true);
    try {
      if (!workerRef.current) {
        const worker = createAnalysisWorker();
        worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
          const response = event.data;
          if (response.id !== requestId.current) return;
          setBusy(false);
          if (response.type === 'result') {
            setResult(response.result);
          } else {
            setError(response.message);
            if (response.code === 'ENGINE_LOAD_FAILED') {
              worker.terminate();
              workerRef.current = null;
            }
          }
        };
        worker.onerror = workerFailed;
        worker.onmessageerror = workerFailed;
        workerRef.current = worker;
      }
      const request: AnalysisRequest = { type: 'analyze', id: ++requestId.current, smiles, technique };
      workerRef.current.postMessage(request);
    } catch {
      workerFailed();
    }
  }

  return (
    <>
      <section className="analysis-panel" aria-labelledby="analysis-title">
        <h2 id="analysis-title">SMILES 測試區</h2>
        <p>輸入結構並選擇平台，查看候選碎片。範例為乙酸乙酯。</p>
        <form onSubmit={analyze} noValidate>
          <label htmlFor="smiles">SMILES</label>
          <input id="smiles" value={smiles} onChange={(event) => setSmiles(event.target.value)}
            disabled={busy} spellCheck={false} autoComplete="off" aria-describedby="smiles-help" />
          <small id="smiles-help">例如 CCOC(C)=O；若無法辨識，請檢查 SMILES 的內容。</small>
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
          <button type="submit" disabled={busy}>{busy ? '分析中…' : '開始分析'}</button>
        </form>
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
