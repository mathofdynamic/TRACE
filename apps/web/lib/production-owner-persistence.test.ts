import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import {
  createD1Database,
  createD1GitHubIngestionStore,
  isD1SelectedOwnerWebhookEvent,
  applyD1OwnerInstallationBoundary,
} from '@trace/db';
import { describe, expect, it, vi } from 'vitest';
import {
  persistGitHubInstallationSnapshot,
  assertPersistedInstallationCatalog,
} from './github-installation';
import { scopeCanaryInstallationSnapshot } from './production-canary';
import { processGitHubWebhookEvent } from '@trace/core';
import { enqueueD1Webhook } from './d1-webhook-queue';
function sqliteBinding(sqlite: DatabaseSync) {
  function prepare(sql: string, params: SQLInputValue[] = []) {
    const statement = sqlite.prepare(sql);
    return {
      bind: (...values: SQLInputValue[]) => prepare(sql, values),
      raw: async () => {
        return statement.all(...params).map((row) => Object.values(row));
      },
      all: async () => ({ success: true, results: statement.all(...params) }),
      run: async () => ({ success: true, results: [], meta: statement.run(...params) }),
    };
  }
  return {
    prepare,
    batch: async (statements: ReturnType<typeof prepare>[]) => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as Parameters<typeof createD1Database>[0];
}

it('owner catalog remains inactive until explicit selection; inactive intake has zero delivery/Queue/projection side effects', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const migrations = new URL('../../../packages/db/drizzle-d1/', import.meta.url);
    for (const file of readdirSync(migrations)
      .filter((f) => f.endsWith('.sql'))
      .sort())
      sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
    sqlite.exec("INSERT INTO users (id,email) VALUES ('u','synthetic@example.invalid')");
    const db = createD1Database(sqliteBinding(sqlite));
    const repo = {
      id: 9,
      owner: 'mathofdynamic',
      name: 'TRACE',
      fullName: 'mathofdynamic/TRACE',
      defaultBranch: 'main',
      visibility: 'private',
      permissions: {},
    };
    const snapshot = {
      installation: {
        id: 166179374,
        accountLogin: 'mathofdynamic',
        accountType: 'User',
        suspendedAt: null,
        repositorySelection: 'all' as const,
        permissions: {},
      },
      repositories: [repo, { ...repo, id: 10, name: 'other', fullName: 'mathofdynamic/other' }],
    };
    await persistGitHubInstallationSnapshot({
      db,
      user: {
        id: 'u',
        name: 'Owner',
        email: 'synthetic@example.invalid',
        image: null,
        githubLogin: 'mathofdynamic',
      },
      snapshot: scopeCanaryInstallationSnapshot(
        { TRACE_DEPLOYMENT_ENV: 'production', TRACE_CANARY_MODE: 'owner' },
        snapshot,
      ),
      action: 'github.reconciled',
    });
    expect(sqlite.prepare('SELECT state FROM github_repositories').all()).toEqual([
      { state: 'available' },
      { state: 'available' },
    ]);
    expect(sqlite.prepare('SELECT selected FROM github_installation_repositories').all()).toEqual([
      { selected: 0 },
      { selected: 0 },
    ]);
    const event = {
      type: 'IssueUpdated' as const,
      installationId: 166179374,
      repositoryId: 9,
      issueId: 99,
      number: 1,
      action: 'opened',
    };
    const send = vi.fn(async (_message: unknown) => undefined);
    const input = {
      db,
      ownerMode: true,
      queue: { send },
      deliveryId: 'owner-delivery',
      eventName: 'issues',
      action: 'opened',
      normalized: event,
      payloadSha256: 'hash',
    };
    expect(await enqueueD1Webhook(input)).toMatchObject({
      accepted: true,
      ignored: true,
      queued: false,
    });
    expect(send).not.toHaveBeenCalled();
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM github_webhook_deliveries').get()).toEqual(
      { count: 0 },
    );
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM github_issues').get()).toEqual({
      count: 0,
    });
    sqlite.exec(
      "UPDATE github_repositories SET state='active' WHERE github_repository_id='9'; UPDATE github_installation_repositories SET selected=1 WHERE github_repository_id='9'",
    );
    await processGitHubWebhookEvent(createD1GitHubIngestionStore(db), {
      type: 'RepositoryConnected',
      installationId: 166179374,
      repositoryId: 9,
      owner: 'mathofdynamic',
      name: 'TRACE',
      fullName: 'mathofdynamic/TRACE',
    });
    expect(
      sqlite.prepare("SELECT state FROM github_repositories WHERE github_repository_id='9'").get(),
    ).toEqual({ state: 'active' });
    expect(await isD1SelectedOwnerWebhookEvent(db, event)).toBe(true);
    expect(await isD1SelectedOwnerWebhookEvent(db, { ...event, installationId: 9 })).toBe(false);
    expect(await isD1SelectedOwnerWebhookEvent(db, { ...event, repositoryId: 10 })).toBe(false);
    expect(await enqueueD1Webhook(input)).toMatchObject({ accepted: true, queued: true });
    expect(send).toHaveBeenCalledTimes(1);
    await applyD1OwnerInstallationBoundary(db, 'installation_repositories', {
      installation: { id: 166179374, account: { login: 'mathofdynamic' } },
      action: 'removed',
      repositories_removed: [{ id: 9 }],
    });
    expect(await isD1SelectedOwnerWebhookEvent(db, event)).toBe(false);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM github_issues').get()).toEqual({
      count: 0,
    });

    expect(await enqueueD1Webhook({ ...input, deliveryId: 'after-deselection' })).toMatchObject({
      ignored: true,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM github_webhook_deliveries').get()).toEqual(
      { count: 1 },
    );
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    sqlite.close();
  }
});

it.each([92, 102])(
  'persists the complete %i-repository catalog atomically and detects a failed final upsert',
  async (size) => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      const migrations = new URL('../../../packages/db/drizzle-d1/', import.meta.url);
      for (const file of readdirSync(migrations)
        .filter((file) => file.endsWith('.sql'))
        .sort())
        sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
      sqlite.exec("INSERT INTO users (id,email) VALUES ('u','synthetic@example.invalid')");
      const repositories = Array.from({ length: size }, (_, index) => ({
        id: 100000 + index,
        owner: 'mathofdynamic',
        name: `synthetic-${index}`,
        fullName: `mathofdynamic/synthetic-${index}`,
        defaultBranch: 'main',
        visibility: 'private',
        permissions: { metadata: 'read' },
      }));
      const snapshot = {
        installation: {
          id: 166179374,
          accountLogin: 'mathofdynamic',
          accountType: 'User',
          suspendedAt: null,
          permissions: {},
        },
        repositories,
      };
      const input = {
        db: createD1Database(sqliteBinding(sqlite)),
        user: {
          id: 'u',
          name: 'Owner',
          email: 'synthetic@example.invalid',
          image: null,
          githubLogin: 'mathofdynamic',
        },
        snapshot,
        action: 'github.reconciled' as const,
        ownerMode: true,
      };
      await persistGitHubInstallationSnapshot(input);
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM github_repositories').get()).toEqual({
        count: size,
      });
      expect(
        sqlite.prepare('SELECT COUNT(*) AS count FROM github_installation_repositories').get(),
      ).toEqual({ count: size });
      sqlite.exec(
        `CREATE TRIGGER fail_last BEFORE UPDATE ON github_repositories WHEN NEW.github_repository_id='${100000 + size - 1}' BEGIN SELECT RAISE(ABORT,'synthetic final upsert failure'); END`,
      );
      const changed = {
        ...snapshot,
        repositories: repositories.map((repo, index) =>
          index === 0 ? { ...repo, name: 'renamed', fullName: 'mathofdynamic/renamed' } : repo,
        ),
      };
      await expect(
        persistGitHubInstallationSnapshot({ ...input, snapshot: changed }),
      ).rejects.toThrow();
      expect(
        sqlite
          .prepare("SELECT full_name FROM github_repositories WHERE github_repository_id='100000'")
          .get(),
      ).toEqual({ full_name: 'mathofdynamic/synthetic-0' });
      expect(
        sqlite
          .prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action='github.reconciled'")
          .get(),
      ).toEqual({ count: 1 });
      expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(() =>
        assertPersistedInstallationCatalog(
          snapshot,
          repositories.slice(0, size - 1).map((repo) => ({
            providerId: String(repo.id),
            fullName: repo.fullName,
            organizationId: 'workspace',
            installationId: 'installation',
            accessInstallationId: 'installation',
          })),
          'installation',
          'workspace',
        ),
      ).toThrow(/incomplete/);
    } finally {
      sqlite.close();
    }
  },
);
