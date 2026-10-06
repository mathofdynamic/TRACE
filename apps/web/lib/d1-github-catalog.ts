import type { TraceD1Database } from '@trace/db';
import type { GitHubRepositorySnapshot } from '@trace/github';

// JSON is one bound parameter, not interpolated SQL. SQLite performs the set-based
// writes inside the same native D1 batch as the installation state transition.
const repositoryUpsert = `
INSERT INTO github_repositories
  (id, organization_id, installation_id, github_repository_id, owner, name,
   full_name, default_branch, visibility, state, last_synchronized_at, created_at, updated_at)
SELECT json_extract(value, '$.id'), ?, ?, json_extract(value, '$.providerId'),
       json_extract(value, '$.owner'), json_extract(value, '$.name'),
       json_extract(value, '$.fullName'), json_extract(value, '$.defaultBranch'),
       json_extract(value, '$.visibility'), 'available', ?, ?, ?
FROM json_each(?) WHERE 1
ON CONFLICT(github_repository_id) DO UPDATE SET
  organization_id=excluded.organization_id, installation_id=excluded.installation_id,
  owner=excluded.owner, name=excluded.name, full_name=excluded.full_name,
  default_branch=excluded.default_branch, visibility=excluded.visibility,
  last_synchronized_at=excluded.last_synchronized_at, disconnected_at=NULL,
  updated_at=excluded.updated_at`;

const accessUpsert = `
INSERT INTO github_installation_repositories
  (id, installation_id, github_repository_id, permissions, created_at, updated_at)
SELECT json_extract(value, '$.accessId'), ?, json_extract(value, '$.providerId'),
       json_extract(value, '$.permissions'), ?, ?
FROM json_each(?) WHERE 1
ON CONFLICT(installation_id, github_repository_id) DO UPDATE SET
  permissions=excluded.permissions, updated_at=excluded.updated_at`;

export function d1CatalogStatements(
  db: TraceD1Database,
  repositories: GitHubRepositorySnapshot[],
  workspaceId: string,
  installationId: string,
  now: Date,
  ownerMode: boolean,
) {
  const payload = JSON.stringify(
    repositories.map((repository) => ({
      id: crypto.randomUUID(),
      accessId: crypto.randomUUID(),
      providerId: String(repository.id),
      owner: repository.owner,
      name: repository.name,
      fullName: repository.fullName,
      defaultBranch: repository.defaultBranch ?? null,
      visibility: repository.visibility ?? null,
      permissions: repository.permissions ?? null,
    })),
  );
  const timestamp = now.getTime();
  const client = db.$client;
  const statements = [
    client
      .prepare(repositoryUpsert)
      .bind(workspaceId, installationId, timestamp, timestamp, timestamp, payload),
    client.prepare(accessUpsert).bind(installationId, timestamp, timestamp, payload),
  ];
  if (ownerMode) {
    statements.push(
      client
        .prepare(
          `UPDATE github_installation_repositories SET selected=0, updated_at=?
        WHERE installation_id=? AND github_repository_id NOT IN
          (SELECT json_extract(value, '$.providerId') FROM json_each(?))`,
        )
        .bind(timestamp, installationId, payload),
      client
        .prepare(
          `UPDATE github_repositories SET state='available', disconnected_at=?, updated_at=?
        WHERE installation_id=? AND github_repository_id NOT IN
          (SELECT json_extract(value, '$.providerId') FROM json_each(?))`,
        )
        .bind(timestamp, timestamp, installationId, payload),
    );
  }
  return statements;
}
