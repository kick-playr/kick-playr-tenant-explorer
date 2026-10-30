'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="setup-page">
      <div className="setup-card">
        <h1>Unable to load the explorer.</h1>
        <p>Check the server configuration and try again.</p>
        <button className="button primary" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
