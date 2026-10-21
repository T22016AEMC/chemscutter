import AnalysisPanel from './ui/AnalysisPanel';

export default function App() {
  return (
    <main>
      <header className="site-header">
        <img src={`${import.meta.env.BASE_URL}chemscutter_icon.jpg`} alt="CheMScutter 標誌" width="64" height="64" />
        <div><h1>CheMScutter</h1><p>多平台質譜候選碎片模擬</p></div>
      </header>
      <p className="version">
        <small>
          版本 {__GIT_COMMIT__}・建置時間 {__BUILD_TIME__}
        </small>
      </p>
      <AnalysisPanel />
    </main>
  );
}
