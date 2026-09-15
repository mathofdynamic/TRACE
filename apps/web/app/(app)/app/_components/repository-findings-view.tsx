'use client';

import { useMemo, useState } from 'react';
import type { DashboardAttention, DashboardRepository } from '../../../../lib/dashboard';
import {
  formatDate,
  formatRelativeDate,
  presentFindingDetail,
} from '../../../../lib/dashboard-state';
import { FindingDisclosure } from './trace-redesign';
import { TraceSelect } from './trace-select';

interface RepositoryFindingsViewProps {
  findings: DashboardAttention[];
  repository: DashboardRepository;
}

export function RepositoryFindingsView({ findings, repository }: RepositoryFindingsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [classificationFilter, setClassificationFilter] = useState<string>('all');
  const [affectedAreaFilter, setAffectedAreaFilter] = useState<string>('all');

  // Extract unique affected areas
  const affectedAreas = useMemo(() => {
    const areas = new Set<string>();
    findings.forEach((f) => {
      if (f.affectedArea) areas.add(f.affectedArea);
    });
    return Array.from(areas).sort();
  }, [findings]);

  // Filter findings
  const filteredFindings = useMemo(() => {
    return findings.filter((finding) => {
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesTitle = finding.title.toLowerCase().includes(query);
        const matchesDetail = finding.detail.toLowerCase().includes(query);
        const matchesRule = finding.provenance?.ruleId?.toLowerCase().includes(query);
        const matchesEvidence = finding.evidence.some((e) => e.toLowerCase().includes(query));
        const matchesArea = finding.affectedArea?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDetail && !matchesRule && !matchesEvidence && !matchesArea) {
          return false;
        }
      }

      // Severity filter
      if (severityFilter !== 'all') {
        if (severityFilter === 'critical-high') {
          if (finding.severity !== 'critical' && finding.severity !== 'high') return false;
        } else if (finding.severity !== severityFilter) {
          return false;
        }
      }

      // Classification filter
      if (classificationFilter !== 'all') {
        if (finding.classification !== classificationFilter) return false;
      }

      // Affected area filter
      if (affectedAreaFilter !== 'all') {
        if (finding.affectedArea !== affectedAreaFilter) return false;
      }

      return true;
    });
  }, [findings, searchQuery, severityFilter, classificationFilter, affectedAreaFilter]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    severityFilter !== 'all' ||
    classificationFilter !== 'all' ||
    affectedAreaFilter !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setSeverityFilter('all');
    setClassificationFilter('all');
    setAffectedAreaFilter('all');
  };

  const deterministicCount = findings.filter((f) => f.classification === 'deterministic').length;
  const probabilisticCount = findings.filter((f) => f.classification === 'probabilistic').length;

  return (
    <div className="repository-findings-view" id="repository-findings-tab-content">
      {/* Findings Filter Bar */}
      <div
        className="findings-filter-bar"
        role="search"
        aria-label="Filter repository findings"
        data-trace-motion="item"
        style={{ '--motion-index': 0 } as React.CSSProperties}
      >
        <div className="findings-filter-search">
          <input
            className="trace-input findings-search-input"
            type="search"
            placeholder="Search findings by keyword, rule ID, or file pathâ€¦"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search findings"
          />
        </div>

        <div className="findings-filter-controls">
          <div className="filter-group">
            <label htmlFor="findings-severity-filter" className="filter-label">
              Severity
            </label>
            <TraceSelect
              id="findings-severity-filter"
              value={severityFilter}
              onChange={setSeverityFilter}
              ariaLabel="Filter by severity"
              size="sm"
              options={[
                { value: 'all', label: 'All severities' },
                { value: 'critical', label: 'Critical' },
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' },
                { value: 'info', label: 'Info' },
              ]}
            />
          </div>

          <div className="filter-group">
            <label htmlFor="findings-classification-filter" className="filter-label">
              Classification
            </label>
            <TraceSelect
              id="findings-classification-filter"
              value={classificationFilter}
              onChange={setClassificationFilter}
              ariaLabel="Filter by classification"
              size="sm"
              options={[
                { value: 'all', label: 'All classifications' },
                {
                  value: 'deterministic',
                  label: 'Verified evidence (Deterministic)',
                },
                {
                  value: 'probabilistic',
                  label: 'Probabilistic interpretation',
                },
              ]}
            />
          </div>

          {affectedAreas.length > 0 ? (
            <div className="filter-group">
              <label htmlFor="findings-area-filter" className="filter-label">
                Area
              </label>
              <TraceSelect
                id="findings-area-filter"
                value={affectedAreaFilter}
                onChange={setAffectedAreaFilter}
                ariaLabel="Filter by affected area"
                size="sm"
                options={[
                  { value: 'all', label: 'All affected areas' },
                  ...affectedAreas.map((area) => ({
                    value: area,
                    label: area,
                  })),
                ]}
              />
            </div>
          ) : null}

          {hasActiveFilters ? (
            <button
              className="trace-button trace-button--tertiary filter-reset-button"
              type="button"
              onClick={resetFilters}
            >
              Reset filters
            </button>
          ) : null}
        </div>
      </div>

      {/* Summary Stats Strip */}
      <div
        className="findings-summary-strip"
        data-trace-motion="item"
        style={{ '--motion-index': 1 } as React.CSSProperties}
      >
        <div className="findings-summary-stats">
          <span className="findings-stat-item">
            <strong>{filteredFindings.length}</strong> of <strong>{findings.length}</strong> finding
            {findings.length === 1 ? '' : 's'}
          </span>
          <span className="meta-sep" aria-hidden="true">
            Â·
          </span>
          <span className="findings-stat-item">
            <strong>{deterministicCount}</strong> verified deterministic
          </span>
          <span className="meta-sep" aria-hidden="true">
            Â·
          </span>
          <span className="findings-stat-item">
            <strong>{probabilisticCount}</strong> probabilistic
          </span>
        </div>

        <div className="findings-provenance-note">
          <span>
            Analyzed commit:{' '}
            <code>
              {repository.latestSync?.headCommit?.slice(0, 7) ??
                repository.remoteHeadSha?.slice(0, 7) ??
                'unknown'}
            </code>
          </span>
        </div>
      </div>

      {/* Findings List */}
      {filteredFindings.length > 0 ? (
        <div
          className="redesign-list finding-list-redesign finding-list-redesign--standalone"
          data-trace-motion="section"
          data-motion-section="findings-filter-list"
        >
          {filteredFindings.map((finding, idx) => (
            <article
              className="finding-row-redesign"
              key={finding.id}
              data-trace-motion="item"
              style={{ '--motion-index': idx } as React.CSSProperties}
            >
              <div className="finding-row-redesign__severity">
                <span className="severity-badge" data-severity={finding.severity}>
                  {finding.severity}
                </span>
                <span className="evidence-count-pill">
                  {finding.evidence.length} evidence ref{finding.evidence.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="finding-row-redesign__body">
                <div className="finding-row-redesign__header">
                  <h2 className="finding-row-redesign__title">{finding.title}</h2>
                  <div className="finding-row-redesign__badges">
                    <span className="classification-pill">
                      {finding.classification === 'deterministic'
                        ? 'Verified evidence'
                        : 'Probabilistic'}
                    </span>
                    {finding.affectedArea ? (
                      <span className="affected-area-pill">{finding.affectedArea}</span>
                    ) : null}
                    {finding.relatedChangeNumber ? (
                      <span className="related-change-pill">PR #{finding.relatedChangeNumber}</span>
                    ) : null}
                  </div>
                </div>

                <p className="finding-row-redesign__detail">
                  {presentFindingDetail(finding.detail)}
                </p>

                <div className="finding-row-redesign__meta">
                  {finding.provenance?.ruleId ? (
                    <span className="finding-rule">
                      Rule: <code>{finding.provenance.ruleId}</code>
                    </span>
                  ) : null}
                  {finding.evidence.length > 0 ? (
                    <span className="finding-location">
                      Location: <code>{finding.evidence[0]}</code>
                      {finding.evidence.length > 1 ? ` +${finding.evidence.length - 1} more` : ''}
                    </span>
                  ) : null}
                  <span className="finding-updated">
                    Updated {formatRelativeDate(finding.updatedAt)}
                  </span>
                </div>
              </div>

              <div className="finding-row-redesign__action">
                <FindingDisclosure
                  finding={finding}
                  repositoryName={repository.fullName}
                  repository={repository}
                />
              </div>
            </article>
          ))}
        </div>
      ) : hasActiveFilters ? (
        <div
          className="inline-empty redesign-empty redesign-empty--large"
          data-trace-motion="item"
          style={{ '--motion-index': 2 } as React.CSSProperties}
        >
          <strong>No findings match your filter criteria</strong>
          <p>
            Try clearing your search query or selecting different severity and classification
            filters.
          </p>
          <button
            className="trace-button trace-button--secondary"
            type="button"
            onClick={resetFilters}
          >
            Clear active filters
          </button>
        </div>
      ) : (
        <div
          className="inline-empty redesign-empty redesign-empty--large"
          data-trace-motion="item"
          style={{ '--motion-index': 2 } as React.CSSProperties}
        >
          <strong>
            {repository.analysis?.status === 'completed'
              ? 'No unresolved findings'
              : 'No findings yet'}
          </strong>
          <p>
            {repository.analysis?.status === 'completed'
              ? 'The latest persisted run has nothing requiring review.'
              : 'Run local TRACE analysis before expecting findings here.'}
          </p>
        </div>
      )}
    </div>
  );
}
