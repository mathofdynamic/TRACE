import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createD1Database } from '@trace/db';
import { describe, expect, it } from 'vitest';
import { persistGitHubInstallationSnapshot } from './github-installation';
import { scopeCanaryInstallationSnapshot } from './production-canary';

const env = {
  TRACE_DEPLOYMENT_ENV: 'production',
  TRACE_CANARY_MODE: 'fixture',
  TRACE_CANARY_GITHUB_OWNER: 'mathofdynamic',
  TRACE_CANARY_GITHUB_REPOSITORY: 'trace-staging-fixture',
  TRACE_CANARY_GITHUB_REPOSITORY_ID: '1378441300',
};

// Execute the actual Drizzle D1 persistence queries against the production SQLite schema.
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

const repo = {
  id: 1378441300,
  owner: 'mathofdynamic',
  name: 'trace-staging-fixture',
  fullName: 'mathofdynamic/trace-staging-fixture',
  defaultBranch: 'main',
  visibility: 'private',
  permissions: { metadata: 'read' },
};

describe('fixture-scoped production installation persistence', () => {
  it.each(['github.connected', 'github.reconciled'] as const)(
    '%s writes only the fixture when the trusted external snapshot contains many repositories',
    async (action) => {
      const sqlite = new DatabaseSync(':memory:');
      try {
        const migrations = new URL('../../../packages/db/drizzle-d1/', import.meta.url);
        for (const file of readdirSync(migrations)
          .filter((file) => file.endsWith('.sql'))
          .sort())
          sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
        sqlite.exec("INSERT INTO users (id,email) VALUES ('u','synthetic@example.invalid')");
        const snapshot = {
          installation: {
            id: 166179374,
            accountLogin: 'mathofdynamic',
            accountType: 'User',
            suspendedAt: null,
            repositorySelection: 'all' as const,
            permissions: {},
          },
          repositories: [repo, { ...repo, id: 9, name: 'other', fullName: 'mathofdynamic/other' }],
        };
        await persistGitHubInstallationSnapshot({
          db: createD1Database(sqliteBinding(sqlite)),
          user: {
            id: 'u',
            name: 'Fixture owner',
            email: 'synthetic@example.invalid',
            image: null,
            githubLogin: 'mathofdynamic',
          },
          snapshot: scopeCanaryInstallationSnapshot(env, snapshot),
          action,
        });
        expect(
          sqlite.prepare('SELECT github_repository_id, full_name FROM github_repositories').all(),
        ).toEqual([
          { github_repository_id: '1378441300', full_name: 'mathofdynamic/trace-staging-fixture' },
        ]);
        expect(
          sqlite.prepare('SELECT github_repository_id FROM github_installation_repositories').all(),
        ).toEqual([{ github_repository_id: '1378441300' }]);
        expect(sqlite.prepare('SELECT action FROM audit_events').all()).toEqual([{ action }]);
        expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      } finally {
        sqlite.close();
      }
    },
  );
});
