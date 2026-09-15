import { getAuthenticatedDashboardSummary } from '../../../../lib/dashboard-server';
import { RulesView } from '../_components/rules-view';

export default async function RulesPage({
  searchParams,
}: {
  searchParams?: Promise<{ repo?: string; severity?: string }>;
}) {
  const { summary } = await getAuthenticatedDashboardSummary();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialSelectedRepoId =
    resolvedSearchParams?.repo ?? summary.preferredRepositoryId ?? 'all';

  return (
    <div className="dashboard-page redesign-page rules-page">
      <RulesView
        rules={summary.rules}
        repositories={summary.repositories}
        changes={summary.latestChanges}
        attention={summary.attention}
        initialSelectedRepoId={initialSelectedRepoId}
      />
    </div>
  );
}
