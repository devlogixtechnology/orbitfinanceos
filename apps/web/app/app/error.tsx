"use client";

export default function AppError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <main className="page">
      <header className="page-header">
        <h1>Workspace unavailable</h1>
        <p>The tenant workspace could not be loaded. No financial state was changed.</p>
      </header>
      <div className="inline-alert" role="alert">
        <strong>Request failed</strong>
        Reference: {error.digest ?? "not available"}
      </div>
      <button className="empty-action" onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
