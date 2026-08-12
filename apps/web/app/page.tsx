import Link from 'next/link';
import { PublicLayout, SectionLabel } from './components/public';

const capabilities = [
  [
    '01',
    'Understand change',
    'Connect what changed to intent, evidence, affected systems, and unfinished work.',
  ],
  [
    '02',
    'See parallel work',
    'Surface possible conflicts across active changes before coordination becomes expensive.',
  ],
  [
    '03',
    'Keep the record',
    'Preserve decisions, risks, and reports as readable repository artifacts, not dashboard-only state.',
  ],
];

export default function HomePage() {
  return (
    <PublicLayout>
      <main>
        <section className="hero public-container">
          <div className="hero__copy">
            <SectionLabel>Change intelligence for human and AI software teams</SectionLabel>
            <h1>Git is the history of code. TRACE is the history of understanding.</h1>
            <p>
              TRACE connects intent, changes, decisions, evidence, risks, and active-work conflicts
              — then keeps the durable record portable inside `.trace`.
            </p>
            <div className="hero__actions">
              <Link className="trace-button trace-button--primary" href="/sign-in">
                Start with TRACE
              </Link>
              <Link className="trace-button trace-button--secondary" href="/specification">
                Explore `.trace`
              </Link>
            </div>
            <p className="hero__caption">
              Early implementation. Public claims are deliberately limited to what exists.
            </p>
          </div>
          <div className="change-flow" aria-label="TRACE change intelligence flow">
            <div className="change-flow__header">
              <span>TRACE / evidence path</span>
              <span className="trace-badge trace-badge--info">Concept</span>
            </div>
            <div className="flow-node flow-node--active">
              <strong>Goal</strong>
              <span>Why this change exists</span>
            </div>
            <div className="flow-line" aria-hidden="true" />
            <div className="flow-node">
              <strong>Pull request</strong>
              <span>What is being changed</span>
            </div>
            <div className="flow-line" aria-hidden="true" />
            <div className="flow-node">
              <strong>Evidence</strong>
              <span>What can be verified</span>
            </div>
            <div className="flow-line" aria-hidden="true" />
            <div className="flow-node">
              <strong>Decision / conflict</strong>
              <span>What needs coordination</span>
            </div>
            <div className="flow-line" aria-hidden="true" />
            <div className="flow-node flow-node--artifact">
              <strong>.trace artifact</strong>
              <span>Portable project memory</span>
            </div>
          </div>
        </section>

        <section className="public-section public-container public-section--split">
          <div>
            <SectionLabel>The bottleneck</SectionLabel>
            <h2>More changes do not create more review capacity.</h2>
          </div>
          <div className="section-copy">
            <p>
              Human teams and coding agents can increase output quickly. The expensive part is
              understanding whether work fits together, whether intent survived implementation, and
              what knowledge will remain after the pull request closes.
            </p>
            <p>
              TRACE is designed for that missing layer: sparse, evidence-backed understanding
              instead of another stream of automated comments.
            </p>
          </div>
        </section>

        <section className="public-section public-container">
          <SectionLabel>What TRACE preserves</SectionLabel>
          <div className="capability-grid">
            {capabilities.map(([number, title, body]) => (
              <article className="capability" key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="public-section public-container trace-section">
          <div>
            <SectionLabel>Repository-native memory</SectionLabel>
            <h2>The dashboard is a view. The record belongs to the project.</h2>
            <p>
              `.trace` is a proposed versioned artifact layer for reports, decisions, risks,
              pull-request intelligence, and synchronization state. It is experimental and evolving.
            </p>
            <Link className="inline-link" href="/specification">
              Read the current specification →
            </Link>
          </div>
          <pre className="trace-tree" aria-label="Example trace directory">
            <code>{`.trace/
├── config.yml
├── reports/
│   ├── daily/
│   └── weekly/
├── pull-requests/
├── decisions/
├── risks/
└── state/`}</code>
          </pre>
        </section>

        <section className="public-section public-container execution-section">
          <SectionLabel>Execution without lock-in</SectionLabel>
          <div className="execution-grid">
            <div>
              <h3>Local</h3>
              <p>
                Analyze in your environment and keep source handling local. The CLI is the durable
                path.
              </p>
            </div>
            <div>
              <h3>Cloud</h3>
              <p>
                Coordinate hosted workflows when the project policy allows it. Cloud behavior is not
                yet live.
              </p>
            </div>
            <div>
              <h3>Hybrid</h3>
              <p>
                Synchronize only explicitly permitted artifacts or fields. The repository remains
                the source of truth.
              </p>
            </div>
          </div>
        </section>

        <section className="final-cta public-container">
          <SectionLabel>Start with the evidence trail</SectionLabel>
          <h2>Make the reasoning around change durable.</h2>
          <Link className="trace-button trace-button--primary" href="/sign-in">
            Join the early build
          </Link>
        </section>
      </main>
    </PublicLayout>
  );
}
