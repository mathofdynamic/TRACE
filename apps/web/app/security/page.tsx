import { PublicLayout, PageHeader } from '../components/public';

export const metadata = { title: 'Security — TRACE' };

export default function SecurityPage() {
  return (
    <PublicLayout>
      <main className="public-container public-page">
        <PageHeader
          eyebrow="Security and privacy"
          title="Boundaries are part of the product."
          body="TRACE is designed around explicit data boundaries, portable artifacts, and visible uncertainty. This page describes commitments and planned controls without inventing certifications."
        />
        <div className="security-grid">
          <article>
            <h2>Local mode</h2>
            <p>
              Local analysis is intended to run in the project environment without required
              source-code upload to TRACE Cloud. The local CLI and artifact contract are still being
              implemented.
            </p>
          </article>
          <article>
            <h2>Cloud mode</h2>
            <p>
              Cloud processing will require configured repository and model-provider boundaries.
              Retention, deletion, and provider behavior will be documented before production claims
              are made.
            </p>
          </article>
          <article>
            <h2>Secrets</h2>
            <p>
              Credentials, prompts, raw source duplication, and private model conversations must not
              be written to `.trace`. Server-side secrets are kept outside browser and repository
              artifacts.
            </p>
          </article>
          <article>
            <h2>Planned controls</h2>
            <p>
              Tenant authorization, audit events, safe Markdown rendering, secret scanning,
              prompt-injection defenses, retention behavior, and quarantine workflows are planned in
              later implementation phases.
            </p>
          </article>
        </div>
        <div className="notice-block notice-block--warning">
          <strong>Not claimed</strong>
          <p>
            TRACE does not currently claim SOC 2, GDPR certification, zero retention, compliance
            guarantees, or a completed enterprise security program.
          </p>
        </div>
        <p className="responsible-link">
          Responsible disclosure:{' '}
          <a href="https://github.com/mathofdynamic/TRACE/security">
            use the repository security channel
          </a>
          .
        </p>
      </main>
    </PublicLayout>
  );
}
