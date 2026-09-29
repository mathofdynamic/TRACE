import {
  productionApplicationTables,
  type ProductionApplicationCounts,
} from './production-canary-d1.js';
import { productionFixtureD1State } from './production-fixture-d1-state.js';

export const productionFixtureOAuthDiagnosticWindow = {
  start: Date.parse('2026-09-29T14:12:00.000Z'),
  end: Date.parse('2026-09-29T14:33:00.000Z'),
} as const;

export const productionFixtureOAuthDiagnosticEndpoints = {
  cloudflareOrigin: 'https://api.cloudflare.com',
  healthUrl: productionFixtureD1State.healthUrl,
} as const;

export type TimestampRange = {
  count: number;
  min: number | null;
  max: number | null;
};

export type ProductionFixtureOAuthDiagnostic = {
  observedAtUtc: string;
  counts: ProductionApplicationCounts;
  totalAccountRows: number;
  githubAccountRows: number;
  expectedGitHubLoginRows: number;
  unexpectedGitHubAccountRows: number;
  expectedAccountUserLinks: number;
  expectedAccountSessionLinks: number;
  expectedActiveSessionLinks: number;
  expectedExpiredSessionLinks: number;
  accountTimestamps: TimestampRange;
  accountUpdatedTimestamps: TimestampRange;
  userTimestamps: TimestampRange;
  sessionTimestamps: TimestampRange;
  foreignKeyViolations: number;
  queueBacklogCount: number | null;
  healthStatus: number | null;
};

type CloudflareEnvelope<T> = { success?: unknown; result?: T };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredCount(value: unknown, field: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Production OAuth diagnostic returned an invalid ${field}.`);
  }
  return value;
}

function optionalTimestamp(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  const timestamp =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^-?\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(timestamp)) {
    throw new Error(`Production OAuth diagnostic returned an invalid ${field} timestamp.`);
  }
  return timestamp;
}

function parseSingleSelectRow(result: unknown, queryName: string) {
  if (!Array.isArray(result) || result.length !== 1) {
    throw new Error(`Production OAuth diagnostic ${queryName} returned an invalid result set.`);
  }
  const query = result[0];
  if (!isRecord(query) || !Array.isArray(query.results) || query.results.length !== 1) {
    throw new Error(`Production OAuth diagnostic ${queryName} did not return one row.`);
  }
  const row = query.results[0];
  if (!isRecord(row) || row.ok !== 1) {
    throw new Error(`Production OAuth diagnostic ${queryName} did not confirm SELECT 1.`);
  }
  return row;
}

export function buildProductionFixtureOAuthAccountSummarySql() {
  return `SELECT 1 AS ok,
    COUNT(*) AS total_account_rows,
    COALESCE(SUM(CASE WHEN lower(provider_id) = 'github' THEN 1 ELSE 0 END), 0) AS github_account_rows,
    COALESCE(SUM(CASE WHEN lower(provider_id) = 'github' AND lower(account_id) = lower(?) THEN 1 ELSE 0 END), 0) AS expected_github_login_rows,
    COALESCE(SUM(CASE WHEN lower(provider_id) = 'github' AND lower(account_id) <> lower(?) THEN 1 ELSE 0 END), 0) AS unexpected_github_account_rows
    FROM accounts`;
}

export function buildProductionFixtureOAuthLinksSql() {
  const expectedAccountMatch = "lower(a.provider_id) = 'github' AND lower(a.account_id) = lower(?)";
  const expectedAccountRows = `SELECT a.user_id, a.created_at, a.updated_at FROM accounts a WHERE ${expectedAccountMatch}`;
  const expectedAccountUserRows = `SELECT u.id, u.created_at, u.updated_at FROM (${expectedAccountRows}) a JOIN users u ON u.id = a.user_id`;
  const expectedAccountSessionRows = `SELECT s.id, s.created_at, s.updated_at, s.expires_at FROM (${expectedAccountRows}) a JOIN sessions s ON s.user_id = a.user_id`;
  return `SELECT 1 AS ok,
      (SELECT COUNT(*) FROM (${expectedAccountRows}) ea) AS expected_account_rows,
      (SELECT COUNT(*) FROM (${expectedAccountUserRows})) AS expected_account_user_links,
      (SELECT COUNT(*) FROM (${expectedAccountSessionRows})) AS expected_account_session_links,
      (SELECT COUNT(*) FROM (${expectedAccountSessionRows}) WHERE expires_at > ?) AS expected_active_session_links,
      (SELECT COUNT(*) FROM (${expectedAccountSessionRows}) WHERE expires_at <= ?) AS expected_expired_session_links,
      (SELECT COUNT(DISTINCT id) FROM (${expectedAccountUserRows})) AS expected_user_rows,
      (SELECT COUNT(DISTINCT id) FROM (${expectedAccountSessionRows})) AS expected_session_rows,
      (SELECT MIN(created_at) FROM (${expectedAccountRows})) AS account_created_min,
      (SELECT MAX(created_at) FROM (${expectedAccountRows})) AS account_created_max,
      (SELECT MIN(updated_at) FROM (${expectedAccountRows})) AS account_updated_min,
      (SELECT MAX(updated_at) FROM (${expectedAccountRows})) AS account_updated_max,
      (SELECT MIN(created_at) FROM (${expectedAccountUserRows})) AS user_created_min,
      (SELECT MAX(created_at) FROM (${expectedAccountUserRows})) AS user_created_max,
      (SELECT MIN(created_at) FROM (${expectedAccountSessionRows})) AS session_created_min,
      (SELECT MAX(created_at) FROM (${expectedAccountSessionRows})) AS session_created_max`;
}

export function buildProductionFixtureOAuthLinksParams(now: number) {
  return [
    productionFixtureD1State.githubLogin,
    productionFixtureD1State.githubLogin,
    productionFixtureD1State.githubLogin,
    productionFixtureD1State.githubLogin,
    now,
    productionFixtureD1State.githubLogin,
    now,
    ...Array.from({ length: 10 }, () => productionFixtureD1State.githubLogin),
  ] as const;
}

export function parseProductionFixtureOAuthAccountSummary(result: unknown) {
  const row = parseSingleSelectRow(result, 'account summary');
  return {
    totalAccountRows: requiredCount(row.total_account_rows, 'total account row count'),
    githubAccountRows: requiredCount(row.github_account_rows, 'GitHub account row count'),
    expectedGitHubLoginRows: requiredCount(
      row.expected_github_login_rows,
      'expected GitHub login row count',
    ),
    unexpectedGitHubAccountRows: requiredCount(
      row.unexpected_github_account_rows,
      'unexpected GitHub account row count',
    ),
  } as const;
}

export function parseProductionFixtureOAuthLinks(result: unknown) {
  const row = parseSingleSelectRow(result, 'identity link summary');
  return {
    expectedAccountUserLinks: requiredCount(
      row.expected_account_user_links,
      'expected account/user link count',
    ),
    expectedAccountSessionLinks: requiredCount(
      row.expected_account_session_links,
      'expected account/session link count',
    ),
    expectedActiveSessionLinks: requiredCount(
      row.expected_active_session_links,
      'expected active session link count',
    ),
    expectedExpiredSessionLinks: requiredCount(
      row.expected_expired_session_links,
      'expected expired session link count',
    ),
    accountTimestamps: {
      count: requiredCount(row.expected_account_rows, 'expected account row count'),
      min: optionalTimestamp(row.account_created_min, 'account created-at minimum'),
      max: optionalTimestamp(row.account_created_max, 'account created-at maximum'),
    },
    accountUpdatedTimestamps: {
      count: requiredCount(row.expected_account_rows, 'expected account row count'),
      min: optionalTimestamp(row.account_updated_min, 'account updated-at minimum'),
      max: optionalTimestamp(row.account_updated_max, 'account updated-at maximum'),
    },
    userTimestamps: {
      count: requiredCount(row.expected_user_rows, 'expected linked user row count'),
      min: optionalTimestamp(row.user_created_min, 'user created-at minimum'),
      max: optionalTimestamp(row.user_created_max, 'user created-at maximum'),
    },
    sessionTimestamps: {
      count: requiredCount(row.expected_session_rows, 'expected linked session row count'),
      min: optionalTimestamp(row.session_created_min, 'session created-at minimum'),
      max: optionalTimestamp(row.session_created_max, 'session created-at maximum'),
    },
  } as const;
}

export function parseProductionFixtureForeignKeyViolations(result: unknown) {
  if (
    !Array.isArray(result) ||
    result.length !== 1 ||
    !isRecord(result[0]) ||
    !Array.isArray(result[0].results)
  ) {
    throw new Error(
      'Production OAuth diagnostic foreign-key query returned an invalid result set.',
    );
  }
  return result[0].results.length;
}

export function parseProductionFixtureQueueBacklog(value: unknown) {
  if (!isRecord(value)) return null;
  return typeof value.backlog_count === 'number' &&
    Number.isSafeInteger(value.backlog_count) &&
    value.backlog_count >= 0
    ? value.backlog_count
    : null;
}

function statusAfter(range: TimestampRange, boundary: number): 'YES' | 'NO' | 'UNKNOWN' {
  if (range.count === 0 || range.min === null || range.max === null) return 'UNKNOWN';
  if (range.min > boundary) return 'YES';
  if (range.max <= boundary) return 'NO';
  return 'UNKNOWN';
}

function statusBefore(range: TimestampRange, boundary: number): 'YES' | 'NO' | 'UNKNOWN' {
  if (range.count === 0 || range.min === null || range.max === null) return 'UNKNOWN';
  if (range.max < boundary) return 'YES';
  if (range.min >= boundary) return 'NO';
  return 'UNKNOWN';
}

function statusInWindow(range: TimestampRange): 'IN' | 'OUT' | 'PARTIAL' | 'UNKNOWN' {
  const { start, end } = productionFixtureOAuthDiagnosticWindow;
  if (range.count === 0 || range.min === null || range.max === null) return 'UNKNOWN';
  if (range.min > start && range.max < end) return 'IN';
  if (range.max <= start || range.min >= end) return 'OUT';
  return 'PARTIAL';
}

export function classifyProductionFixtureOAuthWindow(input: {
  accountTimestamps: TimestampRange;
  userTimestamps: TimestampRange;
  sessionTimestamps: TimestampRange;
}): 'YES' | 'NO' | 'PARTIAL' | 'UNKNOWN' {
  const ranges = [input.accountTimestamps, input.userTimestamps, input.sessionTimestamps];
  const totalRows = ranges.reduce((sum, range) => sum + range.count, 0);
  if (totalRows === 0) return 'NO';
  if (ranges.some((range) => range.count === 0)) return 'PARTIAL';
  const statuses = ranges.map(statusInWindow);
  if (statuses.every((status) => status === 'IN')) return 'YES';
  if (statuses.every((status) => status === 'OUT')) return 'NO';
  if (statuses.includes('UNKNOWN')) return 'UNKNOWN';
  return 'PARTIAL';
}

function formatTimestamp(value: number | null) {
  if (value === null) return 'NOT_AVAILABLE';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'NOT_AVAILABLE' : date.toISOString();
}

function formatTimestampRange(range: TimestampRange) {
  if (range.count === 0 || range.min === null || range.max === null) return 'NOT_AVAILABLE';
  const min = formatTimestamp(range.min);
  const max = formatTimestamp(range.max);
  return min === max ? min : `MIN=${min};MAX=${max}`;
}

export function formatProductionFixtureOAuthDiagnostic(
  diagnostic: ProductionFixtureOAuthDiagnostic,
  options: { includeApplicationCounts?: boolean } = {},
) {
  const { start, end } = productionFixtureOAuthDiagnosticWindow;
  const includeApplicationCounts = options.includeApplicationCounts ?? true;
  return [
    `DIAGNOSTIC_RESULT=${diagnostic.queueBacklogCount === null || diagnostic.healthStatus === null ? 'PARTIAL' : 'COMPLETE'}`,
    `OBSERVED_AT_UTC=${diagnostic.observedAtUtc}`,
    `OBSERVED_WINDOW_START_UTC=${new Date(start).toISOString()}`,
    `OBSERVED_WINDOW_END_UTC=${new Date(end).toISOString()}`,
    ...(includeApplicationCounts
      ? [
          `APPLICATION_TABLES=${productionApplicationTables.length}`,
          ...productionApplicationTables.map(
            (table) => `${table.toUpperCase()}=${diagnostic.counts[table]}`,
          ),
        ]
      : []),
    `TOTAL_ACCOUNT_ROWS=${diagnostic.totalAccountRows}`,
    `GITHUB_ACCOUNT_ROWS=${diagnostic.githubAccountRows}`,
    `EXPECTED_GITHUB_LOGIN_ROWS=${diagnostic.expectedGitHubLoginRows}`,
    `UNEXPECTED_GITHUB_ACCOUNT_ROWS=${diagnostic.unexpectedGitHubAccountRows}`,
    `PROVIDER=${diagnostic.expectedGitHubLoginRows > 0 ? 'github' : 'NOT_FOUND'}`,
    `EXPECTED_LOGIN_MATCH=${diagnostic.expectedGitHubLoginRows > 0 ? 'YES' : 'NO'}`,
    `ACCOUNT_CREATED_AT=${formatTimestampRange(diagnostic.accountTimestamps)}`,
    `ACCOUNT_CREATED_AT_MIN=${formatTimestamp(diagnostic.accountTimestamps.min)}`,
    `ACCOUNT_CREATED_AT_MAX=${formatTimestamp(diagnostic.accountTimestamps.max)}`,
    `ACCOUNT_UPDATED_AT=${formatTimestampRange(diagnostic.accountUpdatedTimestamps)}`,
    `USER_CREATED_AT=${formatTimestampRange(diagnostic.userTimestamps)}`,
    `SESSION_CREATED_AT=${formatTimestampRange(diagnostic.sessionTimestamps)}`,
    `EXPECTED_ACCOUNT_USER_LINKS=${diagnostic.expectedAccountUserLinks}`,
    `EXPECTED_ACCOUNT_SESSION_LINKS=${diagnostic.expectedAccountSessionLinks}`,
    `EXPECTED_ACTIVE_SESSION_LINKS=${diagnostic.expectedActiveSessionLinks}`,
    `EXPECTED_EXPIRED_SESSION_LINKS=${diagnostic.expectedExpiredSessionLinks}`,
    `ACCOUNT_CREATED_AFTER_LAST_CLEAN=${statusAfter(diagnostic.accountTimestamps, start)}`,
    `ACCOUNT_CREATED_BEFORE_FAILED_CHECK=${statusBefore(diagnostic.accountTimestamps, end)}`,
    `USER_CREATED_AFTER_LAST_CLEAN=${statusAfter(diagnostic.userTimestamps, start)}`,
    `USER_CREATED_BEFORE_FAILED_CHECK=${statusBefore(diagnostic.userTimestamps, end)}`,
    `SESSION_CREATED_AFTER_LAST_CLEAN=${statusAfter(diagnostic.sessionTimestamps, start)}`,
    `SESSION_CREATED_BEFORE_FAILED_CHECK=${statusBefore(diagnostic.sessionTimestamps, end)}`,
    `OAUTH_ROWS_CREATED_IN_OBSERVED_WINDOW=${classifyProductionFixtureOAuthWindow(diagnostic)}`,
    `FOREIGN_KEY_VIOLATIONS=${diagnostic.foreignKeyViolations}`,
    `QUEUE_BACKLOG_COUNT=${diagnostic.queueBacklogCount ?? 'UNKNOWN'}`,
    `PRODUCTION_HEALTH=${diagnostic.healthStatus === null ? 'UNKNOWN' : diagnostic.healthStatus}`,
    'EMAIL_EXPOSED=NO',
    'SESSION_TOKEN_EXPOSED=NO',
    'OAUTH_TOKEN_EXPOSED=NO',
    'SECRET_EXPOSED=NO',
  ].join('\n');
}
