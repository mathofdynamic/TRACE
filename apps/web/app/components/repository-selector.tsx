'use client';

import { useMemo, useState } from 'react';
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
  const [query, setQuery] = useState('');
  const selectedRepositories = repositories.filter((repository) => selected.has(repository.id));
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return repositories.filter(
      (repository) => !normalized || repository.fullName.toLowerCase().includes(normalized),
    );
  }, [query, repositories]);

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

  if (status === 'saved' && selectedRepositories.length) {
    const firstRepository = selectedRepositories[0]!;
    return (
      <section className="repository-success" aria-live="polite">
        <span className="success-mark" aria-hidden="true">
          OK
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
          <span>Connected - {firstRepository.defaultBranch ?? 'default branch'}</span>
        </div>
        <div className="repository-success__next">
          <div>
            <strong>Next: build the project record locally</strong>
            <p>Cloud analysis is not enabled in this environment. The local CLI is available.</p>
          </div>
          <code>trace analyze</code>
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

  const selectionForm = (
    <form className="repository-selection" onSubmit={save}>
      <div className="repository-selection__header">
        <div>
          <p className="section-label">Repository access</p>
          <h2>Which projects should TRACE understand?</h2>
          <p>Choose access once; everyday work starts from the project context in the top bar.</p>
        </div>
        <span className="connection-state">{selected.size} selected</span>
      </div>
      <fieldset className="repository-list">
        <legend className="sr-only">Repositories available through GitHub</legend>
        {filtered.map((repository) => (
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
                {repository.defaultBranch ? ` - ${repository.defaultBranch}` : ''}
              </small>
            </span>
            <span className="repository-row__state">
              {selected.has(repository.id) ? 'Connected' : 'Available'}
            </span>
          </label>
        ))}
      </fieldset>
      <button
        className="trace-button trace-button--primary"
        type="submit"
        disabled={status === 'loading'}
      >
        {status === 'loading' ? 'Saving access...' : 'Save repository access'}
      </button>
      {status === 'error' ? (
        <p className="auth-error" role="alert">
          We could not save this selection. Your choices are still here; try again.
        </p>
      ) : null}
    </form>
  );

  return (
    <div className="repository-discovery">
      <label className="repository-search-field">
        <span className="sr-only">Search repositories</span>
        <input
          className="trace-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search repositories..."
        />
      </label>
      {selectedRepositories.length ? (
        <section className="repository-discovery__group">
          <div className="section-heading-row redesign-section-heading">
            <div>
              <span className="eyebrow">With TRACE access</span>
              <h2>Projects in this workspace</h2>
            </div>
            <span className="quiet-count">{selectedRepositories.length}</span>
          </div>
          {selectedRepositories
            .filter(
              (repository) =>
                !query.trim() ||
                repository.fullName.toLowerCase().includes(query.trim().toLowerCase()),
            )
            .map((repository) => (
              <div className="redesign-list-row" key={repository.id}>
                <div>
                  <strong>{repository.fullName}</strong>
                  <small>Connected - {repository.defaultBranch ?? 'default branch'}</small>
                </div>
                <Link href={`/app/repositories/${repository.id}`}>Open project</Link>
              </div>
            ))}
        </section>
      ) : null}
      <details className="repository-access-details" open={!selectedRepositories.length}>
        <summary>
          {selectedRepositories.length ? 'Adjust repository access' : 'Choose repositories'}
        </summary>
        {selectionForm}
      </details>
    </div>
  );
}
