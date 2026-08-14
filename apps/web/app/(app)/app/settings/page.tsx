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
  return (
    <div className="dashboard-page">
      <div className="dashboard-page-header">
        <div>
          <p className="section-label">Settings</p>
          <h1>Workspace and data boundaries.</h1>
          <p>Only configuration backed by the current account and database is shown.</p>
        </div>
      </div>
      <div className="settings-sections">
        <section className="dashboard-card">
          <span className="card-label">Workspace</span>
          <h2>{summary.workspace.name}</h2>
          <dl className="state-list">
            <div>
              <dt>Usage</dt>
              <dd>{summary.workspace.intendedUsage ?? 'Not set'}</dd>
            </div>
            <div>
              <dt>Execution preference</dt>
              <dd>{summary.workspace.executionMode ?? 'Undecided'}</dd>
            </div>
            <div>
              <dt>Repositories</dt>
              <dd>{summary.repositories.length}</dd>
            </div>
          </dl>
        </section>
        <section className="dashboard-card settings-wide">
          <span className="card-label">Local CLI connections</span>
          <h2>Devices allowed to sync approved artifacts</h2>
          <p className="card-muted">
            Tokens are stored only as one-way hashes on the server. They are scoped to repository
            discovery and artifact sync, expire automatically, and do not include your browser
            session.
          </p>
          {connections.filter((connection) => !connection.revokedAt).length ? (
            <ul className="connection-list">
              {connections
                .filter((connection) => !connection.revokedAt)
                .map((connection) => (
                  <li key={connection.id}>
                    <div>
                      <strong>{connection.label}</strong>
                      <span>
                        Last used {connection.lastUsedAt?.toLocaleString() ?? 'never'} · Expires{' '}
                        {connection.expiresAt.toLocaleDateString()}
                      </span>
                    </div>
                    <ConnectionActions id={connection.id} label={connection.label} />
                  </li>
                ))}
            </ul>
          ) : (
            <div className="inline-empty">
              <strong>No active CLI connections</strong>
              <p>
                Run <code>trace login</code> in a repository to connect a terminal.
              </p>
            </div>
          )}
        </section>
        <section className="dashboard-card settings-wide">
          <span className="card-label">Privacy boundary</span>
          <h2>What local sync sends</h2>
          <dl className="state-list">
            <div>
              <dt>Included</dt>
              <dd>Approved .trace Markdown, projection metadata, checksums, branch, commit</dd>
            </div>
            <div>
              <dt>Excluded</dt>
              <dd>Source files, code snippets, credentials, confidential/restricted artifacts</dd>
            </div>
            <div>
              <dt>Review</dt>
              <dd>
                <code>trace sync --dry-run</code>
              </dd>
            </div>
          </dl>
        </section>
        <section className="dashboard-card">
          <span className="card-label">Analysis boundary</span>
          <h2>Local execution available</h2>
          <p className="card-muted">
            Cloud analysis is not enabled in this environment. Source code is not uploaded through
            the current dashboard flow.
          </p>
          <Link className="text-action" href="/docs#local-analysis">
            Local setup
          </Link>
        </section>
        <section className="dashboard-card">
          <span className="card-label">Account</span>
          <h2>GitHub session</h2>
          <p className="card-muted">
            Repository access is managed separately and remains limited to the repositories selected
            during setup.
          </p>
          <a className="trace-button trace-button--secondary" href="/api/auth/sign-out">
            Sign out
          </a>
        </section>
      </div>
    </div>
  );
}
