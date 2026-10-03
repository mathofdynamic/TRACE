import { eq } from 'drizzle-orm';
import { d1Schema, isD1Database, schema } from '@trace/db';
import type { TraceD1Database } from '@trace/db';
import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';
import { createRequestDatabase } from '../../../../lib/request-database';
import { SettingsView, type DeviceItem } from '../_components/settings-view';

export default async function SettingsPage() {
  const { summary, session } = await getAuthenticatedDashboardSummary();
  const { db, client } = await createRequestDatabase();
  let devices: DeviceItem[] = [];
  try {
    const rows = isD1Database(db)
      ? await (db as unknown as TraceD1Database)
          .select()
          .from(d1Schema.cliConnections)
          .where(eq(d1Schema.cliConnections.userId, session.user.id))
          .orderBy(d1Schema.cliConnections.createdAt)
      : await db
          .select()
          .from(schema.cliConnections)
          .where(eq(schema.cliConnections.userId, session.user.id))
          .orderBy(schema.cliConnections.createdAt);
    devices = rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      userId: row.userId,
      label: row.label,
      scopes: row.scopes,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
    }));
  } finally {
    await client.end();
  }
  return <SettingsView summary={summary} session={session} devices={devices} />;
}
