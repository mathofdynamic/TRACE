'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ConnectionActions({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function rename() {
    const next = window.prompt('Connection name', label)?.trim();
    if (!next || next === label) return;
    setPending(true);
    setError(null);
    const response = await fetch(`/api/cli/connections/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: next }),
    });
    setPending(false);
    if (!response.ok) return setError('Could not rename this connection.');
    router.refresh();
  }
  async function revoke() {
    if (!window.confirm(`Revoke “${label}”? Local sync from that device will stop immediately.`))
      return;
    setPending(true);
    setError(null);
    const response = await fetch(`/api/cli/connections/${id}`, { method: 'DELETE' });
    setPending(false);
    if (!response.ok) return setError('Could not revoke this connection.');
    router.refresh();
  }
  return (
    <div className="connection-actions">
      <button type="button" onClick={rename} disabled={pending}>
        Rename
      </button>
      <button type="button" onClick={revoke} disabled={pending}>
        Revoke
      </button>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  );
}
