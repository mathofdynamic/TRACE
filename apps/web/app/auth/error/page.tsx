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
  return (
    <AuthShell>
      <p className="section-label">Authentication</p>
      <h1>
        {isAppError
          ? 'We could not connect the GitHub App.'
          : 'We could not complete GitHub sign-in.'}
      </h1>
      <p className="auth-intro">
        {isAppError
          ? 'The installation callback could not verify your GitHub App access. No partial repository connection was saved.'
          : 'The test OAuth flow could not validate the callback or retrieve your GitHub profile. No partial account state was presented.'}
      </p>
      <div className="auth-error-block" role="alert">
        {isAppError
          ? 'Check the GitHub App configuration, then try again.'
          : 'Check the GitHub OAuth configuration, then try again.'}
      </div>
      <Link className="trace-button trace-button--secondary" href="/sign-in">
        Return to sign in
      </Link>
    </AuthShell>
  );
}
