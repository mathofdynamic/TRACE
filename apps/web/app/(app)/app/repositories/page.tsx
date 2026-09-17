import { headers } from 'next/headers';
import Link from 'next/link';
import { inArray } from 'drizzle-orm';
import { d1Schema, isD1Database, schema } from '@trace/db';
import type { TraceD1Database } from '@trace/db';
import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';
import { createRequestDatabase } from '../../../../lib/request-database';
import { getUserOrganizationIds } from '../../../../lib/workspace';
import { RepositorySelector } from '../../../components/repository-selector';
import { SetupProgress } from '../../../components/setup-progress';

type RepositoriesPageProps = {
  searchParams: Promise<{ setup?: string | string[] }>;
};

function setupMessage(value: string | string[] | undefined) {
  const setup = Array.isArray(value) ? value[0] : value;
  return setup === 'connected'
    ? 'GitHub connected. TRACE has discovered the repositories in your workspace.'
    : setup === 'cancelled'
      ? 'GitHub App installation was cancelled.'
      : setup === 'not-configured'
        ? 'Repository connection is not configured in this environment yet.'
        : setup === 'github-app'
          ? 'We could not finish connecting GitHub. Your account is still signed in.'
          : null;
}

export default async function RepositoriesPage({ searchParams }: RepositoriesPageProps) {
  const { summary, session } = await getAuthenticatedDashboardSummary();
  const query = await searchParams;
  const message = setupMessage(query.setup);
  const { db, client } = await createRequestDatabase();
  try {
    const organizationIds = await getUserOrganizationIds(db, session.user.id);
    const installations = isD1Database(db)
      ? organizationIds.length
        ? await (db as unknown as TraceD1Database)
            .select({
              id: d1Schema.githubInstallations.id,
              accountLogin: d1Schema.githubInstallations.accountLogin,
              accountType: d1Schema.githubInstallations.accountType,
              state: d1Schema.githubInstallations.state,
            })
            .from(d1Schema.githubInstallations)
            .where(inArray(d1Schema.githubInstallations.organizationId, organizationIds))
        : []
      : organizationIds.length
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
    const repositories = summary.repositoryCatalog;
    const activeRepositories = repositories.filter((repository) => repository.state === 'active');
    const currentStep = activeRepositories.length ? 4 : installations.length ? 3 : 2;
    return (
      <div className="dashboard-page redesign-page repositories-page">
        <SetupProgress current={currentStep} />
        {!installations.length ? (
          <section className="empty-panel empty-panel--large repository-connect-panel">
            <span aria-hidden="true">?</span>
            <h1>Connect your repositories.</h1>
            <p>
              Connect GitHub to choose the repositories TRACE may read. No source write access is
              requested.
            </p>
            <Link
              className="trace-button trace-button--primary"
              href="/api/github/install?next=/app/repositories"
            >
              Connect GitHub
            </Link>
            <details className="access-disclosure">
              <summary>What TRACE can access</summary>
              <p>
                Repository metadata, pull requests, issues, and approved project records for
                selected repositories.
              </p>
            </details>
          </section>
        ) : (
          <RepositorySelector
            repositories={repositories}
            attention={summary.attention}
            reports={summary.latestReports}
            installations={installations}
            workspaceName={summary.workspace.name}
            setupMessage={message}
            setupStatus={Array.isArray(query.setup) ? query.setup[0] : query.setup}
          />
        )}
      </div>
    );
  } finally {
    await client.end();
  }
}
