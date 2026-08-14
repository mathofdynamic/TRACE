import { and, eq, inArray } from 'drizzle-orm';
import { getTraceSession } from '@trace/auth';
import { schema } from '@trace/db';
import { parseGitHubAppEnv } from '@trace/env';
import { getGitHubRepositoryHead, type GitHubAppConfig } from '@trace/github';
import { createRequestDatabase } from '../../../../lib/request-database';
import { getUserOrganizationIds } from '../../../../lib/workspace';
import { isTrustedBrowserMutation } from '../../../../lib/browser-origin';

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export async function POST(request: Request) {
  const session = await getTraceSession(request.headers);
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
    const repositories = await db
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
      if (isSelected && repository.defaultBranch && githubAppConfig) {
        try {
          remoteHeadSha = await getGitHubRepositoryHead(
            githubAppConfig,
            repository.githubInstallationId,
            repository.owner,
            repository.name,
            repository.defaultBranch,
          );
        } catch {
          // A temporary GitHub metadata failure must not disconnect or block the repository.
        }
      }
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
              repository.githubRepositoryId,
            ),
          ),
        );
    }
    for (const organizationId of organizationIds) {
      await db.insert(schema.auditEvents).values({
        organizationId,
        actorUserId: session.user.id,
        action: 'repositories.selection.updated',
        subjectType: 'github_repository',
      });
    }
    return Response.json({ status: 'saved', selected: body.repositoryIds.length });
  } finally {
    await client.end();
  }
}
