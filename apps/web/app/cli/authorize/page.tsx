import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { safeAuthNext } from '@trace/auth';
import { d1Schema, isD1Database, schema } from '@trace/db';
import type { TraceD1Database } from '@trace/db';
import { headers } from 'next/headers';
import { createRequestDatabase, getRequestTraceSession } from '../../../lib/request-database';

export default async function CliAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const code = typeof parameters.code === 'string' ? parameters.code.toUpperCase() : '';
  const approved = parameters.approved === '1';
  const error = typeof parameters.error === 'string' ? parameters.error : null;
  const session = await getRequestTraceSession(await headers());
  if (!session?.user) {
    redirect(`/sign-in?next=${encodeURIComponent(safeAuthNext(`/cli/authorize?code=${code}`))}`);
  }
  const { db, client } = await createRequestDatabase();
  try {
    const organizations = isD1Database(db)
      ? await (db as unknown as TraceD1Database)
          .select({ id: d1Schema.organizations.id, name: d1Schema.organizations.name })
          .from(d1Schema.memberships)
          .innerJoin(
            d1Schema.organizations,
            eq(d1Schema.memberships.organizationId, d1Schema.organizations.id),
          )
          .where(eq(d1Schema.memberships.userId, session.user.id))
      : await db
          .select({ id: schema.organizations.id, name: schema.organizations.name })
          .from(schema.memberships)
          .innerJoin(
            schema.organizations,
            eq(schema.memberships.organizationId, schema.organizations.id),
          )
          .where(eq(schema.memberships.userId, session.user.id));
    return (
      <main className="auth-page">
        <section className="auth-card cli-auth-card">
          <p className="section-label">TRACE CLI</p>
          <h1>{approved ? 'Connection approved.' : 'Connect this terminal.'}</h1>
          <p>
            {approved
              ? 'Return to the terminal. It will finish signing in without exposing your browser session.'
              : 'Confirm the code shown by TRACE CLI. This grants repository discovery and artifact sync only.'}
          </p>
          {error ? (
            <p className="form-error">That code is invalid or expired. Start trace login again.</p>
          ) : null}
          {!approved ? (
            <form action="/api/cli/device/confirm" method="post" className="cli-auth-form">
              <label htmlFor="code">Device code</label>
              <input
                id="code"
                name="code"
                defaultValue={code}
                required
                maxLength={20}
                autoComplete="one-time-code"
              />
              <label htmlFor="organizationId">Workspace</label>
              <select
                id="organizationId"
                name="organizationId"
                required
                defaultValue={organizations[0]?.id}
              >
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
              <button
                className="trace-button trace-button--primary"
                type="submit"
                disabled={!organizations.length}
              >
                Approve connection
              </button>
            </form>
          ) : (
            <Link className="trace-button trace-button--secondary" href="/app/settings">
              Manage connections
            </Link>
          )}
          <details>
            <summary>What this allows</summary>
            <p>
              Discover repositories already granted to TRACE and upload approved, source-free .trace
              artifacts. It does not upload source code or inherit your browser session.
            </p>
          </details>
        </section>
      </main>
    );
  } finally {
    await client.end();
  }
}
