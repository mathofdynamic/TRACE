import Link from 'next/link';
import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';
import { eq } from 'drizzle-orm';
import { schema } from '@trace/db';
import { createRequestDatabase } from '../../../../lib/request-database';
import { ConnectionActions } from './connection-actions';

export default async function SettingsPage() {
  const { summary, session } = await getAuthenticatedDashboardSummary();
  const { db, client } = await createRequestDatabase();
  const connections = await db
    .select()
    .from(schema.cliConnections)
    .where(eq(schema.cliConnections.userId, session.user.id))
    .orderBy(schema.cliConnections.createdAt)
    .finally(async () => client.end());
  const activeConnections = connections.filter((connection) => !connection.revokedAt);
  const revokedConnections = connections.filter((connection) => Boolean(connection.revokedAt));
  return (
    <div className="dashboard-page redesign-page settings-page">
      <header className="redesign-header">
        <div>
          <span className="eyebrow">Settings</span>
          <h1>Workspace and trust boundaries.</h1>
          <p>
            Understand what is connected, what local TRACE sends, and which computers can
            synchronize approved records.
          </p>
        </div>
      </header>
      <div className="settings-layout">
        <section className="redesign-section">
          <span className="eyebrow">Workspace</span>
          <h2>{summary.workspace.name}</h2>
          <dl className="fact-list">
            <div>
              <dt>Usage</dt>
              <dd>{summary.workspace.intendedUsage ?? 'Not set'}</dd>
            </div>
            <div>
              <dt>Execution</dt>
              <dd>{summary.workspace.executionMode ?? 'Local TRACE'}</dd>
            </div>
            <div>
              <dt>Repositories</dt>
              <dd>{summary.repositories.length}</dd>
            </div>
          </dl>
        </section>
        <section className="redesign-section settings-wide" aria-labelledby="connections-title">
          <div className="section-heading-row redesign-section-heading">
            <div>
              <span className="eyebrow">Local TRACE</span>
              <h2 id="connections-title">Authorized computers</h2>
            </div>
            <span className="quiet-count">{activeConnections.length} active</span>
          </div>
          <p className="section-lead">
            This computer can send approved TRACE records to this workspace. Tokens are one-way
            hashes on the server and never include your browser session.
          </p>
          {activeConnections.length ? (
            <ul className="connection-list connection-list-redesign">
              {activeConnections.map((connection) => (
                <li key={connection.id}>
                  <div>
                    <strong>{connection.label}</strong>
                    <span>
                      Workspace: {summary.workspace.name} · Last used{' '}
                      {connection.lastUsedAt?.toLocaleString() ?? 'never'} · expires{' '}
                      {connection.expiresAt.toLocaleDateString()}
                    </span>
                  </div>
                  <ConnectionActions id={connection.id} label={connection.label} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="inline-empty redesign-empty">
              <strong>No active authorized computers</strong>
              <p>
                Run <code>trace login</code> locally to authorize a computer.
              </p>
            </div>
          )}
          {revokedConnections.length ? (
            <details className="technical-details">
              <summary>Revoked computers ({revokedConnections.length})</summary>
              <ul className="connection-list connection-list-redesign">
                {revokedConnections.map((connection) => (
                  <li key={connection.id}>
                    <div>
                      <strong>{connection.label}</strong>
                      <span>
                        Revoked {connection.revokedAt?.toLocaleString() ?? 'recently'} - future sync
                        blocked
                      </span>
                    </div>
                    <span className="state-pill state-tone--danger">Revoked</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
        <section className="redesign-section settings-wide">
          <span className="eyebrow">Privacy and synchronization</span>
          <h2>What local TRACE sends</h2>
          <dl className="fact-list">
            <div>
              <dt>Included</dt>
              <dd>Approved .trace records, projection metadata, checksums, branch, and commit</dd>
            </div>
            <div>
              <dt>Excluded</dt>
              <dd>Source files, code snippets, credentials, and confidential artifacts</dd>
            </div>
            <div>
              <dt>Review before sync</dt>
              <dd>
                <code>trace sync --dry-run</code>
              </dd>
            </div>
          </dl>
        </section>
        <section className="redesign-section">
          <span className="eyebrow">Local execution</span>
          <h2>Analysis stays on your computer.</h2>
          <p className="section-lead">
            Cloud source analysis is not enabled in this environment. TRACE receives only approved
            project knowledge.
          </p>
          <Link className="text-action" href="/docs#local-analysis">
            Learn about local analysis
          </Link>
        </section>
        <section className="redesign-section">
          <span className="eyebrow">Account</span>
          <h2>GitHub access</h2>
          <p className="section-lead">
            Repository access remains limited to the repositories selected during setup.
          </p>
          <a className="trace-button trace-button--secondary" href="/api/auth/sign-out">
            Sign out
          </a>
        </section>
      </div>
    </div>
  );
}
