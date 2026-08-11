import { PublicLayout, PageHeader } from '../components/public';

const sections = [
  [
    'PR intelligence',
    'A concise brief for intent, affected surfaces, evidence, findings, incomplete work, and recommended review. The analysis pipeline is planned; this page does not claim a live integration.',
  ],
  [
    'Daily and weekly reports',
    'Reports are designed to summarize meaningful change, decisions, risks, and unresolved coordination questions without turning engineering into individual productivity scores.',
  ],
  [
    'Concurrent-change conflicts',
    'TRACE is intended to reason across active work, not only one pull request at a time. Deterministic overlap and semantic conflict signals will remain separate.',
  ],
  [
    'A durable project record',
    'Decisions, risks, evidence, and reports are meant to live as readable `.trace` artifacts. The dashboard should help people navigate the record, never become its only copy.',
  ],
];

export default function ProductPage() {
  return (
    <PublicLayout>
      <main className="public-container public-page">
        <PageHeader
          eyebrow="Product direction"
          title="A calm system for understanding software change."
          body="TRACE connects change intent to implementation, evidence, impact, decisions, risks, conflicts, and remaining work."
        />
        <div className="product-list">
          {sections.map(([title, body], index) => (
            <article key={title}>
              <span>0{index + 1}</span>
              <div>
                <h2>{title}</h2>
                <p>{body}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="notice-block">
          <strong>Current status</strong>
          <p>
            TRACE is an active implementation project. GitHub connectivity, analysis, reports, and
            synchronization are not yet connected in this build.
          </p>
        </div>
      </main>
    </PublicLayout>
  );
}
