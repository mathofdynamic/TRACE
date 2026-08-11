import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { inArray } from 'drizzle-orm';
import { getTraceSession } from '@trace/auth';
import { schema } from '@trace/db';
import { RepositorySelector } from '../../../components/repository-selector';
import { createRequestDatabase } from '../../../../lib/request-database';
import { getUserOrganizationIds } from '../../../../lib/workspace';

type RepositoriesPageProps = {
  searchParams: Promise<{ setup?: string | string[] }>;
};

function setupMessage(value: string | string[] | undefined) {
  const setup = Array.isArray(value) ? value[0] : value;
  return setup === 'connected'
    ? 'GitHub App connected. Choose the repositories TRACE may read.'
    : setup === 'cancelled'
      ? 'GitHub App installation was cancelled.'
      : setup === 'not-configured'
        ? 'GitHub App connection is not configured on this test deployment yet.'
        : setup === 'github-app'
          ? 'GitHub App setup could not be completed. Check the App credentials and try again.'
          : null;
}

export default async function RepositoriesPage({ searchParams }: RepositoriesPageProps) {
  const session = await getTraceSession(await headers());
  if (!session?.user) redirect('/sign-in?next=/app/repositories');
  const query = await searchParams;
  const message = setupMessage(query.setup);
  const { db, client } = await createRequestDatabase();
  try {
    const organizationIds = await getUserOrganizationIds(db, session.user.id);
    const installations = organizationIds.length
      ? await db
          .select({
            id: schema.githubInstallations.id,
            accountLogin: schema.githubInstallations.accountLogin,
            accountType: schema.githubInstallations.accountType,
            state: schema.githubInstallations.state,
          })
          .from(schema.githubInstallations)
          .where(inArray(schema.githubInstallations.organizationId, organizationIds))
      : [];
    const repositories = organizationIds.length
      ? await db
          .select({
            id: schema.githubRepositories.id,
            fullName: schema.githubRepositories.fullName,
            defaultBranch: schema.githubRepositories.defaultBranch,
            visibility: schema.githubRepositories.visibility,
            state: schema.githubRepositories.state,
          })
          .from(schema.githubRepositories)
          .where(inArray(schema.githubRepositories.organizationId, organizationIds))
      : [];
    return (
      <div className="dashboard-page">
        <div className="dashboard-page-header">
          <div>
            <p className="section-label">Step 2 of 2 · GitHub connection</p>
            <h1>Choose the work TRACE can understand.</h1>
            <p>
              Install the TRACE GitHub App, then select repositories. Authentication and repository
              access remain separate permissions.
            </p>
          </div>
          <span className="connection-state">
            {installations.length ? 'Connected' : 'Not connected'}
          </span>
        </div>
        {message ? (
          <p
            className={query.setup === 'connected' ? 'form-success' : 'auth-error-block'}
            role="status"
          >
            {message}
          </p>
        ) : null}
        {!installations.length ? (
          <section className="empty-panel empty-panel--large repository-connect-panel">
            <span aria-hidden="true">↗</span>
            <h2>Connect your GitHub App</h2>
            <p>
              The App must request read-only metadata, contents, pull requests, and issues access.
              TRACE will not request repository write permissions in this step.
            </p>
            <Link
              className="trace-button trace-button--primary"
              href="/api/github/install?next=/app/repositories"
            >
              Install GitHub App
            </Link>
          </section>
        ) : repositories.length ? (
          <>
            <div className="connection-list">
              {installations.map((installation) => (
                <article className="connection-card" key={installation.id}>
                  <span className="card-label">Installation account</span>
                  <strong>{installation.accountLogin}</strong>
                  <small>
                    {installation.accountType} · {installation.state}
                  </small>
                </article>
              ))}
            </div>
            <RepositorySelector repositories={repositories} />
          </>
        ) : (
          <section className="empty-panel empty-panel--large">
            <span aria-hidden="true">◌</span>
            <h2>No repositories were granted</h2>
            <p>Update the GitHub App installation to grant access to at least one repository.</p>
            <Link
              className="trace-button trace-button--secondary"
              href="/api/github/install?next=/app/repositories"
            >
              Update GitHub access
            </Link>
          </section>
        )}
      </div>
    );
  } finally {
    await client.end();
  }
}
