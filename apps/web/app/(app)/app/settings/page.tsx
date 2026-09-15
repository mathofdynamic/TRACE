import { eq } from 'drizzle-orm';
import { schema } from '@trace/db';
import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';
import { createRequestDatabase } from '../../../../lib/request-database';
import { SettingsView, type DeviceItem } from '../_components/settings-view';

export default async function SettingsPage() {
  const { summary, session } = await getAuthenticatedDashboardSummary();
  const { db, client } = await createRequestDatabase();
  let devices: DeviceItem[] = [];
  try {
    const rows = await db
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
