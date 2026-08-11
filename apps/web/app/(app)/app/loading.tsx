export default function DashboardLoading() {
  return (
    <div className="dashboard-loading" role="status" aria-label="Loading workspace view">
      <div className="dashboard-loading__eyebrow" />
      <div className="dashboard-loading__title" />
      <div className="dashboard-loading__copy" />
      <div className="dashboard-loading__grid">
        <div />
        <div />
        <div />
      </div>
      <span className="sr-only">Loading workspace view…</span>
    </div>
  );
}
