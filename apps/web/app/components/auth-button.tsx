'use client';

import { useState } from 'react';

export function GithubAuthButton({ callbackURL = '/onboarding' }: { callbackURL?: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  async function startSignIn() {
    setState('loading');
    try {
      const next = encodeURIComponent(callbackURL);
      window.location.assign(`/api/auth/github?next=${next}`);
    } catch {
      setState('error');
    }
  }

  return (
    <div className="auth-action">
      <button
        className="trace-button trace-button--primary auth-github"
        type="button"
        onClick={startSignIn}
        disabled={state === 'loading'}
        aria-busy={state === 'loading'}
      >
        {state === 'loading' ? 'Connecting to GitHub…' : 'Continue with GitHub'}
      </button>
      {state === 'error' ? (
        <div className="auth-error-box" role="alert">
          <p className="auth-error">
            GitHub sign-in is unavailable. Check the configured OAuth callback and try again.
          </p>
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {state === 'loading' ? 'Opening GitHub authorization' : ''}
      </span>
    </div>
  );
}
