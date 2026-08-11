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
      </main>
    </PublicLayout>
  );
}
