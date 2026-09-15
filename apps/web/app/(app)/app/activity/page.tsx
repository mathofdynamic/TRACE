import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';
import { ActivityView } from '../_components/activity-view';

export default async function ActivityPage({
  searchParams,
}: {
  searchParams?: Promise<{ repo?: string; category?: string; q?: string }>;
}) {
  const { summary } = await getAuthenticatedDashboardSummary();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialSelectedRepoId = resolvedSearchParams?.repo ?? 'all';
  const initialCategory = resolvedSearchParams?.category ?? 'all';

  return (
    <div className="dashboard-page redesign-page activity-page">
      <ActivityView
        activities={summary.activity}
        repositories={summary.repositories}
        initialSelectedRepoId={initialSelectedRepoId}
        initialCategory={initialCategory}
      />
    </div>
  );
}
