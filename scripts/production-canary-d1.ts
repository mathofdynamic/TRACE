export const productionApplicationTables = [
  'accounts',
  'analysis_findings',
  'analysis_runs',
  'audit_events',
  'cli_connections',
  'cli_device_authorizations',
  'github_installation_repositories',
  'github_installations',
  'github_issues',
  'github_pull_requests',
  'github_repositories',
  'github_webhook_deliveries',
  'memberships',
  'onboarding_profiles',
  'organizations',
  'sessions',
  'sync_operations',
  'sync_uploads',
  'synced_artifacts',
  'system_jobs',
  'users',
  'verifications',
] as const;

export type ProductionApplicationCounts = Record<
  (typeof productionApplicationTables)[number],
  number
>;

export function buildProductionApplicationCountsSql() {
  return `SELECT 1 AS ok, ${productionApplicationTables
    .map((table) => `(SELECT COUNT(*) FROM "${table}") AS "${table}"`)
    .join(', ')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseProductionApplicationCountsResult(
  result: unknown,
): ProductionApplicationCounts {
  if (!Array.isArray(result) || result.length !== 1) {
    throw new Error('Production D1 application count query returned an invalid result set.');
  }
  const query = result[0];
  if (!isRecord(query) || !Array.isArray(query.results) || query.results.length !== 1) {
    throw new Error('Production D1 application count query did not return one row.');
  }
  const row = query.results[0];
  if (!isRecord(row) || row.ok !== 1) {
    throw new Error('Production D1 application count query did not confirm SELECT 1.');
  }

  const counts = {} as ProductionApplicationCounts;
  for (const table of productionApplicationTables) {
    const count = row[table];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Production D1 application count is missing or invalid: ${table}.`);
    }
    counts[table] = count;
  }
  return counts;
}

export function assertProductionApplicationCountsEmpty(counts: ProductionApplicationCounts) {
  for (const table of productionApplicationTables) {
    if (counts[table] !== 0) {
      throw new Error(`Production D1 application table is not empty: ${table}.`);
    }
  }
}
