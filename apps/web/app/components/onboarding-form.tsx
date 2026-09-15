'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Usage = 'individual' | 'team' | 'organization';

export function OnboardingForm() {
  const router = useRouter();
  const [usage, setUsage] = useState<Usage>('individual');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('loading');
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intendedUsage: usage }),
      });
      if (!response.ok) {
        setStatus('error');
        return;
      }
      router.replace('/app/repositories');
      router.refresh();
    } catch {
      setStatus('error');
    }
  }

  return (
    <form className="onboarding-form" onSubmit={save}>
      <fieldset>
        <legend>How will you use TRACE?</legend>
        {(['individual', 'team', 'organization'] as const).map((value) => (
          <label className="choice-row" key={value}>
            <input
              type="radio"
              name="usage"
              value={value}
              checked={usage === value}
              onChange={() => setUsage(value)}
            />
            <span>
              <strong>{value.charAt(0).toUpperCase() + value.slice(1)}</strong>
              <small>
                {value === 'individual'
                  ? 'Personal project memory and local analysis.'
                  : value === 'team'
                    ? 'Shared coordination across a small team.'
                    : 'Governed work across multiple teams.'}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
      <button
        className="trace-button trace-button--primary"
        type="submit"
        disabled={status === 'loading'}
      >
        {status === 'loading' ? 'Saving workspace…' : 'Continue to GitHub'}
      </button>
      {status === 'error' ? (
        <p className="auth-error" role="alert">
          We could not save this workspace. Your choices are still here; try again.
        </p>
      ) : null}
    </form>
  );
}
