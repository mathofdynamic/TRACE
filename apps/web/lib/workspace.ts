import { eq } from 'drizzle-orm';
import type { TraceUser } from '@trace/auth';
import { schema } from '@trace/db';
import type { createDatabaseClient } from '@trace/db';

export type RequestDatabase = Awaited<ReturnType<typeof createDatabaseClient>>['db'];

function workspaceSlug(accountLogin: string, accountType: string) {
  const normalized = accountLogin
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const type = accountType.toLowerCase() === 'organization' ? 'organization' : 'user';
  return `github-${type}-${normalized || 'account'}`;
}

export async function ensureGitHubWorkspace(
  db: RequestDatabase,
  user: TraceUser,
  account: { login: string; type: string },
) {
  const slug = workspaceSlug(account.login, account.type);
  let [organization] = await db
    .select({ id: schema.organizations.id, name: schema.organizations.name })
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, slug))
    .limit(1);

  if (!organization) {
    await db
      .insert(schema.organizations)
      .values({ name: `${account.login} on GitHub`, slug })
      .onConflictDoNothing({ target: schema.organizations.slug });
    [organization] = await db
      .select({ id: schema.organizations.id, name: schema.organizations.name })
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, slug))
      .limit(1);
  }

  if (!organization) throw new Error('TRACE workspace could not be created.');

  await db
    .insert(schema.memberships)
    .values({ organizationId: organization.id, userId: user.id, role: 'owner' })
    .onConflictDoNothing({
      target: [schema.memberships.organizationId, schema.memberships.userId],
    });

  return organization;
}

export async function getUserOrganizationIds(db: RequestDatabase, userId: string) {
  const memberships = await db
    .select({ organizationId: schema.memberships.organizationId })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, userId));
  return memberships.map((membership) => membership.organizationId);
}
