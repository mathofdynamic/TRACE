import type { EngineeringReport } from '@trace/schema';

export function EngineeringReportDocument({
  document,
  onVerify,
}: {
  document: EngineeringReport;
  onVerify?: () => void;
}) {
  return (
    <div className="engineering-report-document">
      {document.sections.map((section) => (
        <section
          className="report-doc-section"
          key={section.id}
          aria-labelledby={`engineering-${section.id}`}
        >
          <div className="doc-section-header">
            <h2 className="doc-section-title" id={`engineering-${section.id}`}>
              {section.title}
            </h2>
          </div>
          <p className="doc-paragraph">{section.summary}</p>
          {section.items.length > 0 && (
            <ul className="engineering-report-items">
              {section.items.map((item, index) => (
                <li key={`${section.id}-${index}`}>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {item.title} ↗
                    </a>
                  ) : (
                    <>
                      <strong>{item.title}</strong>
                      {onVerify && (
                        <button
                          type="button"
                          className="trace-button trace-button--secondary trace-button--sm"
                          onClick={onVerify}
                        >
                          View evidence
                        </button>
                      )}
                    </>
                  )}
                  {item.detail && <p className="doc-paragraph">{item.detail}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <section className="report-doc-section" aria-labelledby="engineering-coverage">
        <h2 className="doc-section-title" id="engineering-coverage">
          Data coverage
        </h2>
        {document.sources.map((source) => (
          <p className="doc-paragraph" key={source.name}>
            <strong>
              {source.name}:{' '}
              {source.status === 'not_available'
                ? 'Not available'
                : source.status === 'partial'
                  ? 'Partial'
                  : 'Verified'}
            </strong>{' '}
            — {source.detail}
          </p>
        ))}
      </section>
    </div>
  );
}
