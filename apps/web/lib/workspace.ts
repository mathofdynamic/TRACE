import { eq } from 'drizzle-orm';
import type { TraceUser } from '@trace/auth';
import { d1Schema, isD1Database, schema } from '@trace/db';
import type { RequestDatabase } from './request-database';

export type { RequestDatabase } from './request-database';

export type WorkspaceOrganization = { id: string; name: string };

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
  if (isD1Database(db)) {
    const d1 = db;
    const slug = workspaceSlug(account.login, account.type);
    let [organization] = await d1
      .select({ id: d1Schema.organizations.id, name: d1Schema.organizations.name })
      .from(d1Schema.organizations)
      .where(eq(d1Schema.organizations.slug, slug))
      .limit(1);

    if (!organization) {
      await d1
        .insert(d1Schema.organizations)
        .values({ name: `${account.login} on GitHub`, slug })
        .onConflictDoNothing({ target: d1Schema.organizations.slug });
      [organization] = await d1
        .select({ id: d1Schema.organizations.id, name: d1Schema.organizations.name })
        .from(d1Schema.organizations)
        .where(eq(d1Schema.organizations.slug, slug))
        .limit(1);
    }
    if (!organization) throw new Error('TRACE workspace could not be created.');

    await d1
      .insert(d1Schema.memberships)
      .values({ organizationId: organization.id, userId: user.id, role: 'owner' })
      .onConflictDoNothing({
        target: [d1Schema.memberships.organizationId, d1Schema.memberships.userId],
      });
    return organization;
  }

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
  if (isD1Database(db)) {
    const memberships = await db
      .select({ organizationId: d1Schema.memberships.organizationId })
      .from(d1Schema.memberships)
      .where(eq(d1Schema.memberships.userId, userId));
    return memberships.map((membership) => membership.organizationId);
  }

  const memberships = await db
    .select({ organizationId: schema.memberships.organizationId })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, userId));
  return memberships.map((membership) => membership.organizationId);
}
