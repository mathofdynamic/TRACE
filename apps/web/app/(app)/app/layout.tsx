import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTraceSession } from '@trace/auth';
import { DashboardShell } from './_components/dashboard-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getTraceSession(await headers());
  if (!session?.user) redirect('/sign-in?next=/app');
  return (
    <DashboardShell userName={session.user.name ?? session.user.email}>{children}</DashboardShell>
  );
}
