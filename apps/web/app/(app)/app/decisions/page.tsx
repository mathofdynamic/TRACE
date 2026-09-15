import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';
import { DecisionsView } from '../_components/decisions-view';

export default async function DecisionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ repo?: string }>;
}) {
  const { summary } = await getAuthenticatedDashboardSummary();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialSelectedRepoId =
    resolvedSearchParams?.repo ?? summary.preferredRepositoryId ?? 'all';

  return (
    <div className="dashboard-page redesign-page decisions-page">
      <DecisionsView
        decisions={summary.decisions}
        repositories={summary.repositories}
        changes={summary.latestChanges}
        attention={summary.attention}
        initialSelectedRepoId={initialSelectedRepoId}
      />
    </div>
  );
}
