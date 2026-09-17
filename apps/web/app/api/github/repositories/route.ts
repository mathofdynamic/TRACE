import { and, eq, inArray } from 'drizzle-orm';
import { d1Schema, isD1Database, schema } from '@trace/db';
import type { TraceD1Database } from '@trace/db';
import { parseGitHubAppEnv } from '@trace/env';
import { getGitHubRepositoryHead, type GitHubAppConfig } from '@trace/github';
import { createRequestDatabase, getRequestTraceSession } from '../../../../lib/request-database';
import { getUserOrganizationIds } from '../../../../lib/workspace';
import { isTrustedBrowserMutation } from '../../../../lib/browser-origin';

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export async function POST(request: Request) {
  const session = await getRequestTraceSession(request.headers);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  if (!isTrustedBrowserMutation(request))
    return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403 });

  let body: { repositoryIds?: unknown };
  try {
    body = (await request.json()) as { repositoryIds?: unknown };
  } catch {
    return Response.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }
  if (
    !Array.isArray(body.repositoryIds) ||
    body.repositoryIds.length > 500 ||
    !body.repositoryIds.every(isUuid)
  ) {
    return Response.json({ error: 'Repository selection is invalid.' }, { status: 400 });
  }

  const { db, client } = await createRequestDatabase();
  try {
    const organizationIds = await getUserOrganizationIds(db, session.user.id);
    if (!organizationIds.length) {
      return Response.json(
        { error: 'Connect a GitHub App before selecting repositories.' },
        { status: 409 },
      );
    }
    const repositories = isD1Database(db)
      ? await (db as unknown as TraceD1Database)
          .select({
            id: d1Schema.githubRepositories.id,
            installationId: d1Schema.githubRepositories.installationId,
            githubRepositoryId: d1Schema.githubRepositories.githubRepositoryId,
            githubInstallationId: d1Schema.githubInstallations.githubInstallationId,
            owner: d1Schema.githubRepositories.owner,
            name: d1Schema.githubRepositories.name,
            defaultBranch: d1Schema.githubRepositories.defaultBranch,
            state: d1Schema.githubRepositories.state,
          })
          .from(d1Schema.githubRepositories)
          .innerJoin(
            d1Schema.githubInstallations,
            eq(d1Schema.githubRepositories.installationId, d1Schema.githubInstallations.id),
          )
          .where(inArray(d1Schema.githubRepositories.organizationId, organizationIds))
      : await db
          .select({
            id: schema.githubRepositories.id,
            installationId: schema.githubRepositories.installationId,
            githubRepositoryId: schema.githubRepositories.githubRepositoryId,
            githubInstallationId: schema.githubInstallations.githubInstallationId,
            owner: schema.githubRepositories.owner,
            name: schema.githubRepositories.name,
            defaultBranch: schema.githubRepositories.defaultBranch,
            state: schema.githubRepositories.state,
          })
          .from(schema.githubRepositories)
          .innerJoin(
            schema.githubInstallations,
            eq(schema.githubRepositories.installationId, schema.githubInstallations.id),
          )
          .where(inArray(schema.githubRepositories.organizationId, organizationIds));
    const allowedIds = new Set(repositories.map((repository) => repository.id));
    if (body.repositoryIds.some((id) => !allowedIds.has(id))) {
      return Response.json({ error: 'A repository is outside your workspace.' }, { status: 403 });
    }

    const selected = new Set(body.repositoryIds);
    const now = new Date();
    let githubAppConfig: GitHubAppConfig | null = null;
    try {
      const appEnv = parseGitHubAppEnv();
      githubAppConfig = {
        appId: appEnv.GITHUB_APP_ID,
        privateKey: appEnv.GITHUB_APP_PRIVATE_KEY,
        clientId: appEnv.GITHUB_APP_CLIENT_ID,
        clientSecret: appEnv.GITHUB_APP_CLIENT_SECRET,
      };
    } catch {
      // Repository selection remains available when the optional GitHub App refresh is not configured.
    }
    for (const repository of repositories) {
      const isSelected = selected.has(repository.id);
      let remoteHeadSha: string | null = null;
      const installationId = Number(repository.githubInstallationId);
      if (
        isSelected &&
        repository.defaultBranch &&
        githubAppConfig &&
        Number.isSafeInteger(installationId) &&
        installationId > 0
      ) {
        try {
          remoteHeadSha = await getGitHubRepositoryHead(
            githubAppConfig,
            installationId,
            repository.owner,
            repository.name,
            repository.defaultBranch,
          );
        } catch {
          // A temporary GitHub metadata failure must not disconnect or block the repository.
        }
      }
      if (isD1Database(db)) {
        const d1 = db as unknown as TraceD1Database;
        await d1
          .update(d1Schema.githubRepositories)
          .set({
            state: isSelected ? 'active' : 'available',
            disconnectedAt: isSelected ? null : repository.state === 'active' ? now : null,
            ...(remoteHeadSha ? { remoteHeadSha } : {}),
            updatedAt: now,
          })
          .where(eq(d1Schema.githubRepositories.id, repository.id));
        await d1
          .update(d1Schema.githubInstallationRepositories)
          .set({ selected: isSelected, updatedAt: now })
          .where(
            and(
              eq(d1Schema.githubInstallationRepositories.installationId, repository.installationId),
              eq(
                d1Schema.githubInstallationRepositories.githubRepositoryId,
                String(repository.githubRepositoryId),
              ),
            ),
          );
      } else {
        await db
          .update(schema.githubRepositories)
          .set({
            state: isSelected ? 'active' : 'available',
            disconnectedAt: isSelected ? null : repository.state === 'active' ? now : null,
            ...(remoteHeadSha ? { remoteHeadSha } : {}),
            updatedAt: now,
          })
          .where(eq(schema.githubRepositories.id, repository.id));
        await db
          .update(schema.githubInstallationRepositories)
          .set({ selected: isSelected, updatedAt: now })
          .where(
            and(
              eq(schema.githubInstallationRepositories.installationId, repository.installationId),
              eq(
                schema.githubInstallationRepositories.githubRepositoryId,
                Number(repository.githubRepositoryId),
              ),
            ),
          );
      }
    }
    for (const organizationId of organizationIds) {
      if (isD1Database(db)) {
        await (db as unknown as TraceD1Database).insert(d1Schema.auditEvents).values({
          organizationId,
          actorUserId: session.user.id,
          action: 'repositories.selection.updated',
          subjectType: 'github_repository',
        });
      } else {
        await db.insert(schema.auditEvents).values({
          organizationId,
          actorUserId: session.user.id,
          action: 'repositories.selection.updated',
          subjectType: 'github_repository',
        });
      }
    }
    return Response.json({ status: 'saved', selected: body.repositoryIds.length });
  } finally {
    await client.end();
  }
}
