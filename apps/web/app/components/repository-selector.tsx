'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

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
    const response = await fetch('/api/github/repositories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repositoryIds: Array.from(selected) }),
    });
    setStatus(response.ok ? 'saved' : 'error');
  }

  return (
    <form className="repository-selection" onSubmit={save}>
      <div className="repository-selection__header">
        <div>
          <p className="section-label">Repository access</p>
          <h2>Select the repositories TRACE may read.</h2>
          <p>
            Only selected repositories become active TRACE sources. The app requests no source write
            access.
          </p>
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
        {status === 'loading' ? 'Saving…' : 'Save repository selection'}
      </button>
      {status === 'saved' ? (
        <p className="form-success" role="status">
          Repository access saved.
        </p>
      ) : null}
      {status === 'error' ? (
        <p className="auth-error" role="alert">
          Could not save repository access. Try again.
        </p>
      ) : null}
    </form>
  );
}
