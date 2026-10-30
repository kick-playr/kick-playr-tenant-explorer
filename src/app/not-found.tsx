import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="setup-page">
      <div className="setup-card">
        <h1>Page not found.</h1>
        <Link className="button primary" href="/">
          Back to tenants
        </Link>
      </div>
    </main>
  );
}
