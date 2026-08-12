'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';

type Repository = {
  id: string;
  fullName: string;
  defaultBranch: string | null;
  visibility: string | null;
  state: string;
};

export function RepositorySelector({ repositories }: { repositories: Repository[] }) {
  const [selected, setSelected] = useState(
    () =>
      new Set(
        repositories
          .filter((repository) => repository.state === 'active')
          .map((repository) => repository.id),
      ),
  );
  const [status, setStatus] = useState<'idle' | 'loading' | 'saved' | 'error'>('idle');

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setStatus('idle');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('loading');
    try {
      const response = await fetch('/api/github/repositories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repositoryIds: Array.from(selected) }),
      });
      setStatus(response.ok ? 'saved' : 'error');
    } catch {
      setStatus('error');
    }
  }

  const selectedRepositories = repositories.filter((repository) => selected.has(repository.id));

  if (status === 'saved' && selectedRepositories.length) {
    const firstRepository = selectedRepositories[0]!;
    return (
      <section className="repository-success" aria-live="polite">
        <span className="success-mark" aria-hidden="true">
          ✓
        </span>
        <p className="section-label">Setup complete</p>
        <h2>TRACE is connected.</h2>
        <p>
          {selectedRepositories.length === 1
            ? `${firstRepository.fullName} is now part of your workspace.`
            : `${selectedRepositories.length} repositories are now part of your workspace.`}
        </p>
        <div className="repository-success__state">
          <strong>{firstRepository.fullName}</strong>
          <span>Connected · {firstRepository.defaultBranch ?? 'default branch'}</span>
        </div>
        <div className="repository-success__next">
          <div>
            <strong>Next: build the project record locally</strong>
            <p>Cloud analysis is not enabled in this environment. The local CLI is available.</p>
          </div>
          <code>trace analyze changes</code>
        </div>
        <div className="repository-success__actions">
          <Link
            className="trace-button trace-button--primary"
            href={`/app/repositories/${firstRepository.id}`}
          >
            Open repository
          </Link>
          <Link className="trace-button trace-button--secondary" href="/app">
            Go to overview
          </Link>
          <Link className="text-action" href="/docs#local-analysis">
            View local setup
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form className="repository-selection" onSubmit={save}>
      <div className="repository-selection__header">
        <div>
          <p className="section-label">Choose repository</p>
          <h2>Which projects should TRACE understand?</h2>
          <p>You can change this selection later. TRACE receives read-only repository access.</p>
        </div>
        <span className="connection-state">{selected.size} selected</span>
      </div>
      <fieldset className="repository-list">
        <legend className="sr-only">Repositories available through GitHub</legend>
        {repositories.map((repository) => (
          <label className="repository-row" key={repository.id}>
            <input
              type="checkbox"
              checked={selected.has(repository.id)}
              onChange={() => toggle(repository.id)}
            />
            <span className="repository-row__main">
              <strong>{repository.fullName}</strong>
              <small>
                {repository.visibility ?? 'repository'}
                {repository.defaultBranch ? ` · ${repository.defaultBranch}` : ''}
              </small>
            </span>
            <span className="repository-row__state">
              {selected.has(repository.id) ? 'Active' : 'Available'}
            </span>
          </label>
        ))}
      </fieldset>
      <button
        className="trace-button trace-button--primary"
        type="submit"
        disabled={status === 'loading'}
      >
        {status === 'loading' ? 'Connecting repositories…' : 'Finish setup'}
      </button>
      {status === 'saved' ? (
        <p className="form-success" role="status">
          Repository selection cleared.
        </p>
      ) : null}
      {status === 'error' ? (
        <p className="auth-error" role="alert">
          We could not save this selection. Your choices are still here; try again.
        </p>
      ) : null}
    </form>
  );
}
