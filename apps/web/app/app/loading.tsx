export default function AppLoading() {
  return (
    <main aria-busy="true" aria-label="Loading tenant workspace" className="page loading-page">
      <header className="page-header loading-header">
        <div className="skeleton skeleton-eyebrow" />
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-copy" />
      </header>
      <section aria-hidden="true" className="loading-metrics">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="loading-metric" key={index}>
            <div className="skeleton skeleton-circle" />
            <div className="skeleton skeleton-label" />
            <div className="skeleton skeleton-value" />
          </div>
        ))}
      </section>
      <section aria-hidden="true" className="loading-grid">
        <div className="loading-panel">
          <div className="skeleton skeleton-section-title" />
          {Array.from({ length: 4 }, (_, index) => (
            <div className="loading-row" key={index}>
              <div className="skeleton skeleton-row-index" />
              <div className="loading-row-copy">
                <div className="skeleton skeleton-row-title" />
                <div className="skeleton skeleton-row-text" />
              </div>
            </div>
          ))}
        </div>
        <div className="loading-panel loading-panel-compact">
          <div className="skeleton skeleton-section-title" />
          <div className="skeleton skeleton-block" />
          <div className="skeleton skeleton-block short" />
        </div>
      </section>
      <span className="sr-only" role="status">
        Loading tenant workspace
      </span>
    </main>
  );
}
