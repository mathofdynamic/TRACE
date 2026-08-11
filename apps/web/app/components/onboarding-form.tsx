'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Usage = 'individual' | 'team' | 'organization';
type Mode = 'cloud' | 'local' | 'hybrid' | 'undecided';

export function OnboardingForm() {
  const router = useRouter();
  const [usage, setUsage] = useState<Usage>('individual');
  const [mode, setMode] = useState<Mode>('undecided');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    void fetch('/api/onboarding').then(async (response) => {
      if (!response.ok) return;
      const data = (await response.json()) as {
        profile?: { intendedUsage?: Usage; executionMode?: Mode } | null;
      };
      if (data.profile?.intendedUsage) setUsage(data.profile.intendedUsage);
      if (data.profile?.executionMode) setMode(data.profile.executionMode);
    });
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('loading');
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intendedUsage: usage, executionMode: mode }),
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
      <fieldset>
        <legend>Preferred execution mode</legend>
        <div className="choice-grid">
          {(['cloud', 'local', 'hybrid', 'undecided'] as const).map((value) => (
            <label className="choice-tile" key={value}>
              <input
                type="radio"
                name="mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              <span>{value.charAt(0).toUpperCase() + value.slice(1)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <button
        className="trace-button trace-button--primary"
        type="submit"
        disabled={status === 'loading'}
      >
        {status === 'loading' ? 'Saving workspace…' : 'Save and continue'}
      </button>
      {status === 'error' ? (
        <p className="auth-error" role="alert">
          Could not save onboarding choices. Try again.
        </p>
      ) : null}
    </form>
  );
}
