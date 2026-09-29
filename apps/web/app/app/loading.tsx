export default function AppLoading() {
  return (
    <main aria-busy="true" aria-label="Loading tenant workspace" className="page">
      <div className="page-header">
        <div className="skeleton wide" />
      </div>
      <div className="summary-surface">
        <div className="summary-item"><div className="skeleton" /></div>
        <div className="summary-item"><div className="skeleton" /></div>
      </div>
    </main>
  );
}
