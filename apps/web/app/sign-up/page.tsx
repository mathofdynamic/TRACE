import { GithubAuthButton } from '../components/auth-button';
import { AuthShell } from '../components/auth-shell';

export const metadata = {
  title: 'Start with TRACE — TRACE',
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <AuthShell>
      <p className="section-label">Early access</p>
      <h1>Start with TRACE.</h1>
      <p className="auth-intro">
        Create access with GitHub, then choose how you intend to use the product. No repository
        connection is made in this step.
      </p>
      <GithubAuthButton />
      <p className="auth-privacy">
        The current test build uses a signed session cookie and does not persist account or
        onboarding data without a configured database.{' '}
        <a href="https://github.com/mathofdynamic/TRACE/blob/main/SECURITY.md">
          Inspect the security notes.
        </a>
      </p>
    </AuthShell>
  );
}
