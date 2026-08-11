import Link from 'next/link';
import { GithubAuthButton } from '../components/auth-button';
import { AuthShell } from '../components/auth-shell';

export const metadata = { title: 'Sign in — TRACE', robots: { index: false, follow: false } };

export default function SignInPage() {
  return (
    <AuthShell>
      <p className="section-label">TRACE access</p>
      <h1>Sign in to continue.</h1>
      <p className="auth-intro">
        Use your GitHub identity to enter the TRACE workspace. GitHub App installation is a separate
        step and is not requested here.
      </p>
      <GithubAuthButton />
      <p className="auth-privacy">
        By continuing, you acknowledge that TRACE is an experimental product.{' '}
        <Link href="/security">Read the current security boundaries.</Link>
      </p>
      <p className="auth-switch">
        New to TRACE? <Link href="/sign-up">Start with the early build.</Link>
      </p>
    </AuthShell>
  );
}
