import Link from 'next/link';
import { executionComparison, narrativeItems } from '../lib/homepage-data';
import { PublicLayout, SectionLabel, TraceMark } from './components/public';

export default function HomePage() {
  return (
    <PublicLayout>
      <main id="main-content">
        {/* =================================================================
            Hero Section (Two-Column Editorial on Desktop)
            ================================================================= */}
        <section className="hero public-container" aria-label="Introduction to TRACE">
          <div
            className="hero__copy"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <SectionLabel>Change intelligence for human and AI software teams</SectionLabel>
            <h1>Git is the history of code. TRACE is the history of understanding.</h1>
            <p>
              TRACE connects intent, changes, decisions, evidence, risks, and active-work conflicts
              — then keeps the durable record portable inside <code>.trace</code>.
            </p>
            <div className="hero__actions">
              <Link className="trace-button trace-button--primary" href="/sign-in">
                Start with TRACE
              </Link>
              <Link className="trace-button trace-button--secondary" href="/specification">
                Explore <code>.trace</code>
              </Link>
            </div>
            <p className="hero__caption">
              Early implementation. Public claims are deliberately limited to what exists.
            </p>
          </div>

          <div
            className="hero-intelligence-card"
            aria-label="TRACE Change Intelligence Path"
            data-trace-motion="item"
            style={{ '--motion-index': 1 } as React.CSSProperties}
          >
            <div className="intelligence-card__header">
              <div className="intelligence-card__title">
                <TraceMark size={14} />
                <span>TRACE / Change Intelligence Path</span>
              </div>
              <span className="trace-badge trace-badge--info">Illustrative example</span>
            </div>

            <div className="path-rail" role="list">
              <div className="path-node" role="listitem">
                <span className="path-node__tag">Goal</span>
                <div className="path-node__content">
                  <div className="path-node__title">
                    <span>Why this change exists</span>
                  </div>
                  <span className="path-node__meta">
                    Enforce bounded memory on telemetry ring buffers
                  </span>
                </div>
              </div>

              <div className="path-node" role="listitem">
                <span className="path-node__tag">Change</span>
                <div className="path-node__content">
                  <div className="path-node__title">
                    <span>Pull request</span>
                    <span className="mono-target">Radar #41</span>
                  </div>
                  <span className="path-node__meta">
                    3 files · +84 -12 lines · Stream ring-buffer
                  </span>
                </div>
              </div>

              <div className="path-node path-node--active" role="listitem">
                <span className="path-node__tag">Evidence</span>
                <div className="path-node__content">
                  <div className="path-node__title">
                    <span>Deterministic checks</span>
                    <span className="mono-target">AST Verified</span>
                  </div>
                  <span className="path-node__meta">stream.rs:48 · Bounded memory allocation</span>
                </div>
              </div>

              <div className="path-node" role="listitem">
                <span className="path-node__tag">Conflict</span>
                <div className="path-node__content">
                  <div className="path-node__title">
                    <span>Collision check</span>
                    <span className="mono-target">0 Collisions</span>
                  </div>
                  <span className="path-node__meta">Conforms to ADR-0001 (Ring buffer policy)</span>
                </div>
              </div>

              <div className="path-node path-node--record" role="listitem">
                <span className="path-node__tag">Record</span>
                <div className="path-node__content">
                  <div className="path-node__title">
                    <span>Portable .trace artifact</span>
                  </div>
                  <span className="path-node__meta">
                    .trace/reports/daily/2026-08-19.md · Hash 1e9b8a
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================
            The Bottleneck (Editorial Section)
            ================================================================= */}
        <section
          className="public-section public-container public-section--split"
          data-trace-motion="section"
          data-motion-section="bottleneck"
          aria-labelledby="bottleneck-heading"
        >
          <div data-trace-motion="item" style={{ '--motion-index': 0 } as React.CSSProperties}>
            <SectionLabel>The bottleneck</SectionLabel>
            <h2 id="bottleneck-heading">More changes do not create more review capacity.</h2>
            <div className="bottleneck-points">
              <div className="bottleneck-point">
                <span className="bottleneck-point__num">01</span>
                <div>
                  <strong>Code generation is frictionless</strong>
                  <p>
                    AI assistants and parallel human contributors produce diffs faster than teams
                    can evaluate systemic impact.
                  </p>
                </div>
              </div>
              <div className="bottleneck-point">
                <span className="bottleneck-point__num">02</span>
                <div>
                  <strong>Comprehension remains bounded</strong>
                  <p>
                    Understanding whether architectural intent survived across concurrent branches
                    requires verified evidence, not more comment noise.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div
            className="section-copy"
            data-trace-motion="item"
            style={{ '--motion-index': 1 } as React.CSSProperties}
          >
            <p>
              Human teams and coding agents can increase code volume almost without friction. The
              expensive part is understanding: whether work fits together across branches, whether
              intent survived implementation, and what architectural knowledge survives after the
              merge.
            </p>
            <p>
              TRACE provides the missing layer: sparse, evidence-backed understanding instead of
              another stream of unverified automated comments.
            </p>

            <div
              className="bottleneck-comparison"
              aria-label="Change volume versus comprehension capacity"
            >
              <div className="bottleneck-row">
                <div className="bottleneck-row__header">
                  <strong>Change velocity & agent diff volume</strong>
                  <span>Surging diff volume</span>
                </div>
                <div className="bottleneck-bar">
                  <div className="bottleneck-bar__fill bottleneck-bar__fill--surge" />
                </div>
              </div>

              <div className="bottleneck-row">
                <div className="bottleneck-row__header">
                  <strong>Human review & systemic comprehension</strong>
                  <span>Bounded capacity</span>
                </div>
                <div className="bottleneck-bar">
                  <div className="bottleneck-bar__fill bottleneck-bar__fill--fixed" />
                </div>
              </div>

              <div className="bottleneck-footer">
                TRACE bridges the gap by preserving verified facts and decisions instead of noisy
                commentary.
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================
            What TRACE Preserves (Asymmetric Connected Narrative)
            ================================================================= */}
        <section
          className="public-section public-container"
          data-trace-motion="section"
          data-motion-section="preserves"
          aria-labelledby="preserves-heading"
        >
          <div
            className="section-header-compact"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <SectionLabel>What TRACE preserves</SectionLabel>
            <h2 id="preserves-heading">Three layers of durable engineering context.</h2>
            <p>
              Structured engineering memory designed for longevity across repository lifecycles.
            </p>
          </div>

          <div className="narrative-rail">
            {narrativeItems.map((item, idx) => (
              <article
                className="narrative-node"
                key={item.index}
                data-trace-motion="item"
                style={{ '--motion-index': idx + 1 } as React.CSSProperties}
              >
                <div className="narrative-node__header">
                  <span className="narrative-node__index">{item.index}</span>
                  <div className="narrative-node__line" aria-hidden="true" />
                </div>
                <div className="narrative-node__body">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <div className="narrative-node__evidence">
                    <span className="evidence-tag">{item.evidenceTag}</span>
                    <code>{item.evidenceSnippet}</code>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* =================================================================
            Repository-Native Memory (.trace Spec Section)
            ================================================================= */}
        <section
          className="public-section public-container trace-section"
          data-trace-motion="section"
          data-motion-section="memory"
          aria-labelledby="memory-heading"
        >
          <div
            className="trace-section__copy"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <SectionLabel>Repository-native memory</SectionLabel>
            <h2 id="memory-heading">The dashboard is a view. The record belongs to the project.</h2>
            <p>
              <code>.trace</code> is a proposed versioned artifact layer for reports, decisions,
              risks, pull-request intelligence, and synchronization state. The record stays inside
              your Git tree, human-readable in Markdown and structured YAML.
            </p>
            <div className="trace-section__meta">
              <div className="trace-meta-item">
                <span className="trace-meta-item__label">Storage Location</span>
                <span className="trace-meta-item__val">
                  <code>/.trace</code> in repo root
                </span>
              </div>
              <div className="trace-meta-item">
                <span className="trace-meta-item__label">Formats</span>
                <span className="trace-meta-item__val">YAML frontmatter + CommonMark</span>
              </div>
            </div>
            <Link className="inline-link" href="/specification">
              Read the current specification (RFC-001) →
            </Link>
          </div>

          <div
            className="trace-memory-split"
            aria-label="Example .trace directory and artifact preview"
            data-trace-motion="item"
            style={{ '--motion-index': 1 } as React.CSSProperties}
          >
            <div className="trace-tree-pane" aria-label="Directory tree">
              <div className="trace-pane-header">Repository Tree</div>
              <div className="trace-tree-content">
                <div>.trace/</div>
                <div>├── config.yml</div>
                <div>├── reports/</div>
                <div>
                  │ ├── <span className="active-file">daily/2026-08-19.md</span>
                </div>
                <div>│ └── weekly/2026-08-17.md</div>
                <div>├── decisions/</div>
                <div>│ └── 0001-memory.md</div>
                <div>├── conflicts/</div>
                <div>└── state/</div>
              </div>
            </div>

            <div className="trace-preview-pane">
              <div className="trace-preview-pane__header">
                <span>reports/daily/2026-08-19.md</span>
                <span>YAML + Markdown</span>
              </div>
              <pre className="trace-preview-pane__code">
                <code>
                  <span className="hl-comment">---</span>
                  {'\n'}
                  <span className="hl-key">id:</span>{' '}
                  <span className="hl-val">rep-radar-2026-08-19</span>
                  {'\n'}
                  <span className="hl-key">type:</span> <span className="hl-val">daily_report</span>
                  {'\n'}
                  <span className="hl-key">repo:</span>{' '}
                  <span className="hl-val">mathofdynamic/Radar</span>
                  {'\n'}
                  <span className="hl-key">commit:</span>{' '}
                  <span className="hl-val">1e9b8a4746f3</span>
                  {'\n'}
                  <span className="hl-key">freshness:</span> <span className="hl-val">current</span>
                  {'\n'}
                  <span className="hl-comment">---</span>
                  {'\n'}
                  <span className="hl-key"># Daily Intelligence Report</span>
                  {'\n'}- Verified rule: Deterministic Memory Bounds{'\n'}- Source code uploaded:{' '}
                  <span className="hl-val">false</span>
                </code>
              </pre>
            </div>
          </div>
        </section>

        {/* =================================================================
            Execution Without Lock-In (Comparison Band / Table)
            ================================================================= */}
        <section
          className="public-section public-container execution-section"
          data-trace-motion="section"
          data-motion-section="execution"
          aria-labelledby="execution-heading"
        >
          <div
            className="section-header-compact"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <SectionLabel>Execution without lock-in</SectionLabel>
            <h2 id="execution-heading">
              Engineered for local control and selective synchronization.
            </h2>
            <p>
              Clear separation between verified local execution and optional coordination layers.
            </p>
          </div>

          <div
            className="execution-comparison-band"
            role="region"
            aria-label="Execution mode comparison"
            data-trace-motion="item"
            style={{ '--motion-index': 1 } as React.CSSProperties}
          >
            <div className="comparison-table-wrapper">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th scope="col">Execution Mode</th>
                    <th scope="col">Status</th>
                    <th scope="col">Source Code Handling</th>
                    <th scope="col">Analysis Pipeline</th>
                    <th scope="col">Durable Storage</th>
                  </tr>
                </thead>
                <tbody>
                  {executionComparison.map((row) => (
                    <tr
                      key={row.mode}
                      className={row.active ? 'comparison-row--active' : 'comparison-row--planned'}
                    >
                      <td>
                        <strong className="comparison-mode-name">{row.mode}</strong>
                      </td>
                      <td>
                        <span
                          className={`comparison-badge ${row.active ? 'comparison-badge--active' : 'comparison-badge--planned'}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="comparison-detail">{row.sourceHandling}</td>
                      <td className="comparison-detail">{row.parsing}</td>
                      <td className="comparison-detail">{row.storage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* =================================================================
            Final CTA (High-Intent Tight Lockup)
            ================================================================= */}
        <section
          className="final-cta public-container"
          data-trace-motion="section"
          data-motion-section="cta"
          aria-labelledby="cta-heading"
        >
          <div
            className="final-cta__content"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <SectionLabel>Start with the evidence trail</SectionLabel>
            <h2 id="cta-heading">Make the reasoning around change durable.</h2>
            <p>
              Equip human developers and coding agents with shared, verifiable repository memory
              that persists across pull requests.
            </p>
            <div className="final-cta__actions">
              <Link className="trace-button trace-button--primary" href="/sign-in">
                Start with TRACE
              </Link>
              <Link className="trace-button trace-button--secondary" href="/specification">
                Read the specification
              </Link>
            </div>
          </div>

          <div
            className="final-cta__token"
            aria-label="Artifact ledger verification summary"
            data-trace-motion="item"
            style={{ '--motion-index': 1 } as React.CSSProperties}
          >
            <div className="final-cta__token-header">
              <div className="final-cta__token-brand">
                <TraceMark size={14} />
                <span>TRACE Artifact Ledger</span>
              </div>
              <span className="hl-blue">RFC-001</span>
            </div>
            <div className="final-cta__token-row">
              <span>Specification</span>
              <span>.trace v0.1</span>
            </div>
            <div className="final-cta__token-row">
              <span>Execution Engine</span>
              <span>Local CLI (Verified)</span>
            </div>
            <div className="final-cta__token-row">
              <span>Integrity Hash</span>
              <span className="hl-blue">SHA-256 Checksum</span>
            </div>
            <div className="final-cta__token-row">
              <span>Source Transmission</span>
              <span>0 Bytes (Local Analysis)</span>
            </div>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
