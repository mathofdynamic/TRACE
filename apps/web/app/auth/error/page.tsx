import Link from 'next/link';
import { AuthShell } from '../../components/auth-shell';

export const metadata = {
  title: 'Authentication error — TRACE',
  robots: { index: false, follow: false },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; setup?: string }>;
}) {
  const query = await searchParams;
  const isAppError =
    query.reason?.startsWith('github-app') || query.setup?.startsWith('github-app');
  const diagnostic = isAppError
    ? (query.reason ?? query.setup ?? 'github-app')
    : (query.reason ?? 'github-oauth');
  return (
    <AuthShell>
      <p className="section-label">Connection interrupted</p>
      <h1>
        {isAppError
          ? 'We could not connect the GitHub App.'
          : 'We could not complete GitHub sign-in.'}
      </h1>
      <p className="auth-intro">
        {isAppError
          ? 'Your TRACE account is still signed in, and no partial repository connection was saved.'
          : 'GitHub did not complete the account connection. No partial TRACE session was created.'}
      </p>
      <div className="auth-error-block" role="alert">
        {isAppError
          ? 'Return to repository setup and try connecting GitHub again.'
          : 'Return to sign in and try GitHub again.'}
      </div>
      <div className="error-actions error-actions--left">
        <Link
          className="trace-button trace-button--primary"
          href={isAppError ? '/app/repositories' : '/sign-in'}
        >
          {isAppError ? 'Try repository setup again' : 'Try GitHub again'}
        </Link>
        <Link className="trace-button trace-button--secondary" href="/">
          Back to TRACE
        </Link>
      </div>
      <details className="technical-details">
        <summary>Technical details</summary>
        <code>{diagnostic}</code>
      </details>
    </AuthShell>
  );
}
