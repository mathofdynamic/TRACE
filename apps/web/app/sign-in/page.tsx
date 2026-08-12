import { safeAuthNext } from '@trace/auth';
import { GithubAuthButton } from '../components/auth-button';
import { AuthShell } from '../components/auth-shell';

export const metadata = { title: 'Sign in — TRACE', robots: { index: false, follow: false } };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const query = await searchParams;
  const requestedNext = Array.isArray(query.next) ? query.next[0] : query.next;
  const next = safeAuthNext(requestedNext);
  return (
    <AuthShell>
      <p className="section-label">TRACE</p>
      <h1>Understand what changed, why it changed, and what needs attention.</h1>
      <p className="auth-intro">Continue with the GitHub account you use for your projects.</p>
      <GithubAuthButton callbackURL={next} />
      <p className="auth-boundary">
        TRACE requests identity access first. You choose repository access during setup.
      </p>
      <p className="auth-privacy">
        TRACE is an early pilot. Review the <a href="/security">current security boundaries</a>.
      </p>
    </AuthShell>
  );
}
