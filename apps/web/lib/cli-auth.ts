import { createHash, randomBytes } from 'node:crypto';
import { and, count, eq, gt, gte, isNull } from 'drizzle-orm';
import { schema } from '@trace/db';
import type { RequestDatabase } from './workspace';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEVICE_TTL_MS = 10 * 60 * 1000;
const DEVICE_RATE_WINDOW_MS = 10 * 60 * 1000;
const DEVICE_RATE_LIMIT = 10;

export const CLI_SCOPES = ['repository:read', 'sync:write'] as const;

export function hashCredential(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function randomToken(prefix: string, bytes = 32) {
  return `${prefix}_${randomBytes(bytes).toString('base64url')}`;
}

function userCode() {
  return (
    randomBytes(5)
      .toString('hex')
      .toUpperCase()
      .match(/.{1,4}/g)
      ?.join('-') ?? 'INVALID'
  );
}

export async function createDeviceAuthorization(
  db: RequestDatabase,
  label: string,
  requestKey: string,
) {
  const requestKeyHash = hashCredential(requestKey);
  const [recent] = await db
    .select({ value: count() })
    .from(schema.cliDeviceAuthorizations)
    .where(
      and(
        eq(schema.cliDeviceAuthorizations.requestKeyHash, requestKeyHash),
        gte(schema.cliDeviceAuthorizations.createdAt, new Date(Date.now() - DEVICE_RATE_WINDOW_MS)),
      ),
    );
  if ((recent?.value ?? 0) >= DEVICE_RATE_LIMIT) throw new DeviceAuthorizationRateLimitError();
  const deviceCode = randomToken('trcd');
  const code = userCode();
  const expiresAt = new Date(Date.now() + DEVICE_TTL_MS);
  await db.insert(schema.cliDeviceAuthorizations).values({
    deviceCodeHash: hashCredential(deviceCode),
    userCodeHash: hashCredential(code),
    requestKeyHash,
    deviceLabel: label.trim().slice(0, 80) || 'TRACE CLI',
    expiresAt,
  });
  return { deviceCode, userCode: code, expiresAt };
}

export class DeviceAuthorizationRateLimitError extends Error {}

export async function approveDeviceAuthorization(
  db: RequestDatabase,
  input: { code: string; userId: string; organizationId: string },
) {
  const now = new Date();
  const [authorization] = await db
    .select()
    .from(schema.cliDeviceAuthorizations)
    .where(
      and(
        eq(schema.cliDeviceAuthorizations.userCodeHash, hashCredential(input.code)),
        eq(schema.cliDeviceAuthorizations.status, 'pending'),
        gt(schema.cliDeviceAuthorizations.expiresAt, now),
      ),
    )
    .limit(1);
  if (!authorization) return null;

  const [approved] = await db
    .update(schema.cliDeviceAuthorizations)
    .set({
      status: 'approved',
      approvedOrganizationId: input.organizationId,
      approvedUserId: input.userId,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.cliDeviceAuthorizations.id, authorization.id),
        eq(schema.cliDeviceAuthorizations.status, 'pending'),
      ),
    )
    .returning({ id: schema.cliDeviceAuthorizations.id });
  return approved ?? null;
}

export async function consumeDeviceAuthorization(db: RequestDatabase, deviceCode: string) {
  const [authorization] = await db
    .select()
    .from(schema.cliDeviceAuthorizations)
    .where(
      and(
        eq(schema.cliDeviceAuthorizations.deviceCodeHash, hashCredential(deviceCode)),
        gt(schema.cliDeviceAuthorizations.expiresAt, new Date()),
        isNull(schema.cliDeviceAuthorizations.consumedAt),
      ),
    )
    .limit(1);
  if (!authorization) return { status: 'expired' as const };
  if (
    authorization.status !== 'approved' ||
    !authorization.approvedOrganizationId ||
    !authorization.approvedUserId
  ) {
    return { status: 'pending' as const };
  }

  const token = randomToken('trc');
  const connection = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(schema.cliDeviceAuthorizations)
      .set({ status: 'issuing', updatedAt: new Date() })
      .where(
        and(
          eq(schema.cliDeviceAuthorizations.id, authorization.id),
          eq(schema.cliDeviceAuthorizations.status, 'approved'),
          gt(schema.cliDeviceAuthorizations.expiresAt, new Date()),
          isNull(schema.cliDeviceAuthorizations.consumedAt),
        ),
      )
      .returning({ id: schema.cliDeviceAuthorizations.id });
    if (!claimed) return null;
    const [created] = await tx
      .insert(schema.cliConnections)
      .values({
        organizationId: authorization.approvedOrganizationId!,
        userId: authorization.approvedUserId!,
        label: authorization.deviceLabel,
        tokenHash: hashCredential(token),
        scopes: [...CLI_SCOPES],
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      })
      .returning({ id: schema.cliConnections.id });
    if (!created) throw new Error('CLI connection could not be created.');
    await tx
      .update(schema.cliDeviceAuthorizations)
      .set({ consumedAt: new Date(), status: 'consumed', updatedAt: new Date() })
      .where(eq(schema.cliDeviceAuthorizations.id, authorization.id));
    return created;
  });
  if (!connection) return { status: 'pending' as const };
  return { status: 'approved' as const, token, connectionId: connection.id };
}

export async function authenticateCliRequest(
  db: RequestDatabase,
  request: Request,
  requiredScope?: (typeof CLI_SCOPES)[number],
) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  if (!token.startsWith('trc_')) return null;
  const [connection] = await db
    .select()
    .from(schema.cliConnections)
    .where(
      and(
        eq(schema.cliConnections.tokenHash, hashCredential(token)),
        isNull(schema.cliConnections.revokedAt),
        gt(schema.cliConnections.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!connection) return null;
  if (requiredScope && !connection.scopes.includes(requiredScope)) return null;
  await db
    .update(schema.cliConnections)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.cliConnections.id, connection.id));
  return connection;
}

export function syncIdempotencyKey(repositoryId: string, manifestHash: string) {
  return hashCredential(`${repositoryId}:${manifestHash}:0.1`);
}
