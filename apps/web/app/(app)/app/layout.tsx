import { redirect } from 'next/navigation';
import { getAuthenticatedDashboardSummary } from '../../../lib/dashboard-server';
import { DashboardShell } from './_components/dashboard-shell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { session, summary } = await getAuthenticatedDashboardSummary();
  if (!summary.workspace.profileComplete) redirect('/onboarding');
  return (
    <DashboardShell
      userName={session.user.name ?? session.user.email}
      workspaceName={summary.workspace.name}
      capabilities={summary.capabilities}
      repositoryCount={summary.repositories.length}
      repositories={summary.repositories}
      attention={summary.attention}
      preferredRepositoryId={summary.preferredRepositoryId}
    >
      {children}
    </DashboardShell>
  );
}
