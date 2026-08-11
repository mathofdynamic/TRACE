import Link from 'next/link';
import { PublicLayout, PageHeader } from '../components/public';

export const metadata = { title: '.trace specification — TRACE' };

export default function SpecificationPage() {
  return (
    <PublicLayout>
      <main className="public-container public-page">
        <PageHeader
          eyebrow="Experimental standard"
          title="`.trace` keeps understanding close to the code."
          body="The proposed artifact layer connects Git history to human-readable project memory without making a hosted dashboard the durable owner."
        />
        <div className="spec-grid">
          <section>
            <h2>What it holds</h2>
            <p>
              Reports, pull-request briefs, decisions, risks, evidence references, conflict records,
              rules, and synchronization metadata.
            </p>
          </section>
          <section>
            <h2>How it relates</h2>
            <p>
              Git remains the history of code. `AGENTS.md` and ADRs remain useful project documents.
              `.trace` links change intelligence and provenance into a versioned, portable layer.
            </p>
          </section>
          <section>
            <h2>How it travels</h2>
            <p>
              Local, cloud, and hybrid modes can produce or consume the same schema. Sensitive
              values and raw source duplication are excluded by policy.
            </p>
          </section>
          <section>
            <h2>Current state</h2>
            <p>
              The standard is experimental. Version 0.1 is being implemented with Markdown artifacts
              plus structured metadata and validators.
            </p>
          </section>
        </div>
        <Link className="inline-link" href="https://github.com/mathofdynamic/TRACE/tree/main/DOC">
          Inspect the repository documents →
        </Link>
      </main>
    </PublicLayout>
  );
}
