import AnalysisPanel from './ui/AnalysisPanel';

export default function App() {
  return (
    <main>
      <h1>CheMScutter</h1>
      <p>質譜候選碎片模擬器</p>
      <p className="version">
        <small>
          版本 {__GIT_COMMIT__}・建置時間 {__BUILD_TIME__}
        </small>
      </p>
      <AnalysisPanel />
    </main>
  );
}
