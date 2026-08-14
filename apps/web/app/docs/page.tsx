import { PublicLayout, PageHeader } from '../components/public';

export const metadata = { title: 'Documentation — TRACE' };

export default function DocsPage() {
  return (
    <PublicLayout>
      <main className="public-container public-page">
        <PageHeader
          eyebrow="Documentation"
          title="The source documents are the current documentation."
          body="TRACE is still being implemented. These links point to the repository’s product, architecture, design, and implementation records rather than inventing a finished manual."
        />
        <div className="docs-links">
          <a href="https://github.com/mathofdynamic/TRACE/blob/main/DOC/project-overview.md">
            <strong>Project overview</strong>
            <span>Product intent and audience.</span>
          </a>
          <a href="https://github.com/mathofdynamic/TRACE/blob/main/DOC/technical-overview.md">
            <strong>Technical overview</strong>
            <span>Architecture and operating model.</span>
          </a>
          <a href="https://github.com/mathofdynamic/TRACE/blob/main/Design-system/TRACE-DESIGN-SPEC.md">
            <strong>Design specification</strong>
            <span>Authoritative visual and interaction direction.</span>
          </a>
          <a href="https://github.com/mathofdynamic/TRACE/tree/main/Implementation-Prompts">
            <strong>Implementation roadmap</strong>
            <span>Phases 00–16 and their acceptance criteria.</span>
          </a>
          <a href="https://github.com/mathofdynamic/TRACE/blob/main/DOC/github-app-setup.md">
            <strong>GitHub App setup</strong>
            <span>Permissions, callbacks, webhooks, and staging secrets.</span>
          </a>
        </div>
        <section className="docs-local" id="local-analysis">
          <p className="section-label">Local analysis</p>
          <h2>Build the project record without uploading source.</h2>
          <p>
            The current cloud dashboard can store repository and persisted analysis state, but it
            does not execute the analysis engine. Run the CLI from the repository you want TRACE to
            understand.
          </p>
          <ol>
            <li>
              <code>trace init</code>
              <span>Create the portable `.trace` structure.</span>
            </li>
            <li>
              <code>trace analyze changes</code>
              <span>Collect deterministic change evidence.</span>
            </li>
            <li>
              <code>trace report daily --write --yes</code>
              <span>Write a deterministic daily report.</span>
            </li>
            <li>
              <code>trace validate</code>
              <span>Validate generated TRACE artifacts.</span>
            </li>
          </ol>
          <p className="docs-local__note">
            Generated files remain durable repository records. Dashboard sync is explicit and
            source-free.
          </p>
        </section>
        <section className="docs-local" id="local-dashboard">
          <p className="section-label">Local to dashboard</p>
          <h2>Analyze locally. Sync only the record you approve.</h2>
          <p>
            Connect the CLI to the exact GitHub repository, inspect the source-free dry run, then
            publish a completed artifact snapshot.
          </p>
          <ol>
            <li>
              <code>trace login</code>
              <span>Approve a separate, revocable CLI credential.</span>
            </li>
            <li>
              <code>trace connect</code>
              <span>Bind the exact GitHub remote to its selected dashboard repository.</span>
            </li>
            <li>
              <code>trace analyze</code>
              <span>Analyze source inside the repository and write `.trace` output.</span>
            </li>
            <li>
              <code>trace sync --dry-run</code>
              <span>Review every included and excluded artifact.</span>
            </li>
            <li>
              <code>trace sync</code>
              <span>Upload the approved source-free snapshot.</span>
            </li>
          </ol>
          <p className="docs-local__note">
            Source files, code snippets, secrets, confidential artifacts, and browser credentials
            are excluded.
          </p>
        </section>
      </main>
    </PublicLayout>
  );
}
