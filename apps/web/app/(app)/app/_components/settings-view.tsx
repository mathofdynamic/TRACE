'use client';

import { useId, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { OverlayPortal, ModalBackdrop, CenteredDialog, PresenceContext } from './overlay-portal';
import { usePresence, getMotionItemProps } from '../../../../lib/entrance-motion';
import type { DashboardSummary } from '../../../../lib/dashboard';
import type { TraceSession } from '@trace/auth';
import { formatDate, formatRelativeDate } from '../../../../lib/dashboard-state';

export type DeviceItem = {
  id: string;
  organizationId: string;
  userId: string;
  label: string;
  scopes?: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
};

export type SettingsViewProps = {
  summary: DashboardSummary;
  session: TraceSession;
  devices: DeviceItem[];
};

export type SettingsTabId = 'workspace' | 'computers' | 'privacy' | 'cli' | 'account';

function initialsForName(value: string | null | undefined) {
  const parts = (value ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  if (parts.length === 1)
    return Array.from(parts[0] ?? '')
      .slice(0, 2)
      .join('')
      .toUpperCase();
  return `${Array.from(parts[0] ?? '')[0] ?? ''}${Array.from(parts.at(-1) ?? '')[0] ?? ''}`.toUpperCase();
}

export function SettingsView({ summary, session, devices: initialDevices }: SettingsViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTabId>('workspace');
  const [deviceList, setDeviceList] = useState<DeviceItem[]>(initialDevices);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Sync state if props change
  useEffect(() => {
    setDeviceList(initialDevices);
  }, [initialDevices]);

  // Rename modal state
  const [renameTarget, setRenameTarget] = useState<DeviceItem | null>(null);
  const [cachedRenameTarget, setCachedRenameTarget] = useState<DeviceItem | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [renamePending, setRenamePending] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  useEffect(() => {
    if (renameTarget) {
      setCachedRenameTarget(renameTarget);
    }
  }, [renameTarget]);

  // Revoke modal state
  const [revokeTarget, setRevokeTarget] = useState<DeviceItem | null>(null);
  const [cachedRevokeTarget, setCachedRevokeTarget] = useState<DeviceItem | null>(null);
  const [revokePending, setRevokePending] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  useEffect(() => {
    if (revokeTarget) {
      setCachedRevokeTarget(revokeTarget);
    }
  }, [revokeTarget]);

  // Filter revoked vs active
  const activeDevices = deviceList.filter((d) => !d.revokedAt);
  const revokedDevices = deviceList.filter((d) => Boolean(d.revokedAt));

  function handleCopy(text: string, id: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
      setCopiedCmd(id);
      setTimeout(() => setCopiedCmd(null), 2000);
    }
  }

  function openRenameModal(device: DeviceItem) {
    setRenameTarget(device);
    setRenameInput(device.label);
    setRenameError(null);
  }

  function closeRenameModal() {
    if (renamePending) return;
    setRenameTarget(null);
    setRenameInput('');
    setRenameError(null);
  }

  async function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!renameTarget) return;
    const trimmed = renameInput.trim();
    if (!trimmed || trimmed === renameTarget.label) {
      closeRenameModal();
      return;
    }

    setRenamePending(true);
    setRenameError(null);

    try {
      const res = await fetch(`/api/cli/connections/${renameTarget.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label: trimmed }),
      });

      if (!res.ok) {
        setRenameError('Could not rename this device connection.');
        setRenamePending(false);
        return;
      }

      // Optimistic local update
      setDeviceList((prev) =>
        prev.map((d) =>
          d.id === renameTarget.id
            ? { ...d, label: trimmed, updatedAt: new Date().toISOString() }
            : d,
        ),
      );
      setRenamePending(false);
      setRenameTarget(null);
      router.refresh();
    } catch {
      setRenameError('An unexpected network error occurred.');
      setRenamePending(false);
    }
  }

  function openRevokeModal(device: DeviceItem) {
    setRevokeTarget(device);
    setRevokeError(null);
  }

  function closeRevokeModal() {
    if (revokePending) return;
    setRevokeTarget(null);
    setRevokeError(null);
  }

  async function handleRevokeConfirm() {
    if (!revokeTarget) return;
    setRevokePending(true);
    setRevokeError(null);

    try {
      const res = await fetch(`/api/cli/connections/${revokeTarget.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        setRevokeError('Could not revoke this device authorization.');
        setRevokePending(false);
        return;
      }

      // Optimistic local update
      const nowIso = new Date().toISOString();
      setDeviceList((prev) =>
        prev.map((d) =>
          d.id === revokeTarget.id ? { ...d, revokedAt: nowIso, updatedAt: nowIso } : d,
        ),
      );
      setRevokePending(false);
      setRevokeTarget(null);
      router.refresh();
    } catch {
      setRevokeError('An unexpected network error occurred.');
      setRevokePending(false);
    }
  }

  const userName = session.user.name || 'Account name unavailable';
  const userEmail = session.user.email || 'Account email unavailable';
  const githubHandle =
    (session.user as { githubLogin?: string }).githubLogin || 'GitHub identity unavailable';

  const tabs: { id: SettingsTabId; label: string; badge?: string | number }[] = [
    { id: 'workspace', label: 'Workspace & GitHub' },
    { id: 'computers', label: 'Authorized Computers', badge: activeDevices.length },
    { id: 'privacy', label: 'Privacy & Sync' },
    { id: 'cli', label: 'Local CLI' },
    { id: 'account', label: 'Account' },
  ];

  return (
    <div className="settings-surface" id="settings-surface">
      {/* 1. Header & Context Bar */}
      <header className="settings-header">
        <div
          className="settings-header__main"
          data-trace-motion="item"
          style={{ '--motion-index': 0 } as React.CSSProperties}
        >
          <div className="settings-header__title-group">
            <div className="settings-header__eyebrow-row">
              <span className="eyebrow">Workspace Settings</span>
              <span className="settings-header__divider" aria-hidden="true">
                ·
              </span>
              <span className="settings-badge settings-badge--boundary">
                <svg
                  className="settings-badge__icon"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Source-Exclusion Boundary
              </span>
            </div>
            <h1 className="settings-header__title">Workspace Settings</h1>
            <p className="settings-header__lead">
              Manage connected repositories, review local-to-cloud synchronization boundaries,
              manage authorized developer computers, and inspect CLI execution workflows.
            </p>
          </div>

          <div className="settings-header__actions">
            <span className="settings-device-count-pill">
              <span className="status-dot status-dot--blue" aria-hidden="true" />
              {activeDevices.length} Authorized Computer{activeDevices.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          className="settings-tabs-wrapper"
          role="region"
          aria-label="Settings categories"
          data-trace-motion="item"
          style={{ '--motion-index': 1 } as React.CSSProperties}
        >
          <nav className="settings-tablist" role="tablist" aria-label="Settings categories">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`tabpanel-${tab.id}`}
                  tabIndex={isActive ? 0 : -1}
                  className={`settings-tab-btn ${isActive ? 'is-active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span>{tab.label}</span>
                  {tab.badge !== undefined ? (
                    <span className="settings-tab-badge">{tab.badge}</span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Tab Panel 1: Workspace + GitHub */}
      {activeTab === 'workspace' && (
        <section
          id="tabpanel-workspace"
          role="tabpanel"
          aria-labelledby="tab-workspace"
          className="settings-section"
          data-trace-motion="section"
          data-motion-section="settings-workspace"
        >
          <div
            className="settings-section__header"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <div>
              <span className="settings-section__eyebrow">Identity & Integration</span>
              <h2 className="settings-section__title">Workspace & Source Control Integration</h2>
            </div>
            <span className="settings-section__meta-tag">Live workspace</span>
          </div>

          <div className="settings-facts-grid">
            {/* Workspace Panel */}
            <div
              className="settings-panel"
              data-trace-motion="item"
              style={{ '--motion-index': 1 } as React.CSSProperties}
            >
              <div className="settings-panel__header">
                <div className="settings-panel__identity">
                  <div className="settings-panel__avatar">
                    {initialsForName(summary.workspace.name)}
                  </div>
                  <div>
                    <h3 className="settings-panel__title">{summary.workspace.name}</h3>
                    <p className="settings-panel__sub">Workspace identity is managed by TRACE</p>
                  </div>
                </div>
                <span className="settings-panel__badge">
                  {summary.workspace.intendedUsage ?? 'Team'}
                </span>
              </div>

              <dl className="settings-facts-list">
                <div className="settings-fact-item">
                  <dt className="settings-fact-item__label">Current User</dt>
                  <dd className="settings-fact-item__val">{userName}</dd>
                </div>
                <div className="settings-fact-item">
                  <dt className="settings-fact-item__label">Team Composition</dt>
                  <dd className="settings-fact-item__val">
                    Membership details are not available in this view
                  </dd>
                </div>
                <div className="settings-fact-item">
                  <dt className="settings-fact-item__label">Execution Mode</dt>
                  <dd className="settings-fact-item__val settings-fact-item__val--mode">
                    <span className="status-dot status-dot--blue" aria-hidden="true" />
                    {summary.workspace.executionMode ?? 'Local TRACE'}
                  </dd>
                </div>
                <div className="settings-fact-item">
                  <dt className="settings-fact-item__label">Connected Repositories</dt>
                  <dd className="settings-fact-item__val">
                    {summary.repositories.length} repositories selected
                  </dd>
                </div>
              </dl>
            </div>

            {/* GitHub Connection Panel */}
            <div
              className="settings-panel"
              data-trace-motion="item"
              style={{ '--motion-index': 2 } as React.CSSProperties}
            >
              <div className="settings-panel__header">
                <div className="settings-panel__identity">
                  <div className="settings-panel__avatar settings-panel__avatar--github">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 className="settings-panel__title">GitHub App Installation</h3>
                    <p className="settings-panel__sub">{summary.workspace.name}</p>
                  </div>
                </div>
                <span className="settings-connected-badge">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {summary.github.connected ? 'Connected' : 'Not connected'}
                </span>
              </div>

              <dl className="settings-facts-list">
                <div className="settings-fact-item">
                  <dt className="settings-fact-item__label">Permission Scope</dt>
                  <dd className="settings-fact-item__val">
                    Repository access is managed by the connected GitHub App
                  </dd>
                </div>
                <div className="settings-fact-item">
                  <dt className="settings-fact-item__label">Last Verification</dt>
                  <dd className="settings-fact-item__val">
                    {summary.github.connected
                      ? 'Verified through the current workspace connection'
                      : 'Status unavailable'}
                  </dd>
                </div>
                <div className="settings-fact-item">
                  <dt className="settings-fact-item__label">Default Branch</dt>
                  <dd className="settings-fact-item__val font-mono">
                    {summary.github.defaultBranch ?? 'Default branch unavailable'}
                  </dd>
                </div>
                <div className="settings-fact-item">
                  <dt className="settings-fact-item__label">Webhook Security</dt>
                  <dd className="settings-fact-item__val font-mono">HMAC-SHA256 Signed</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>
      )}

      {/* Tab Panel 2: Authorized Computers */}
      {activeTab === 'computers' && (
        <section
          id="tabpanel-computers"
          role="tabpanel"
          aria-labelledby="tab-computers"
          className="settings-section"
          data-trace-motion="section"
          data-motion-section="settings-computers"
        >
          <div
            className="settings-section__header"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <div>
              <span className="settings-section__eyebrow">Local CLI Authorization</span>
              <h2 className="settings-section__title">Authorized Computers</h2>
            </div>
            <span className="settings-section__meta-tag">
              {activeDevices.length} active · {revokedDevices.length} revoked
            </span>
          </div>

          <p
            className="settings-section__lead"
            data-trace-motion="item"
            style={{ '--motion-index': 1 } as React.CSSProperties}
          >
            These computers are authorized to compile local AST changes and send approved TRACE
            projection records to this workspace. Token digests are stored as one-way hashes on the
            server and never include your browser session credentials.
          </p>

          {/* Active Devices List */}
          {activeDevices.length > 0 ? (
            <div
              className="settings-device-list"
              data-trace-motion="item"
              style={{ '--motion-index': 2 } as React.CSSProperties}
            >
              {activeDevices.map((device, idx) => {
                const isMacBook = device.label.toLowerCase().includes('macbook');
                const isCurrentDevice = idx === 0;

                return (
                  <div key={device.id} className="settings-device-row">
                    <div className="settings-device-row__identity">
                      <div className="settings-device-row__avatar">
                        {isMacBook ? (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <rect x="2" y="4" width="20" height="12" rx="2" />
                            <path d="M6 20h12" />
                            <line x1="12" y1="16" x2="12" y2="20" />
                          </svg>
                        ) : (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <rect x="2" y="3" width="20" height="14" rx="2" />
                            <line x1="8" y1="21" x2="16" y2="21" />
                            <line x1="12" y1="17" x2="12" y2="21" />
                          </svg>
                        )}
                      </div>

                      <div className="settings-device-row__info">
                        <div className="settings-device-row__title-group">
                          <strong className="settings-device-row__name">{device.label}</strong>
                          {isCurrentDevice ? (
                            <span className="settings-device-tag settings-device-tag--current">
                              Current Device
                            </span>
                          ) : null}
                          <span className="settings-device-tag settings-device-tag--active">
                            <span className="status-dot status-dot--active" aria-hidden="true" />
                            Active
                          </span>
                        </div>
                        <p className="settings-device-row__ids">
                          ID: {device.id} · Org: {device.organizationId}
                        </p>

                        {/* Metadata items */}
                        <div className="settings-device-row__meta">
                          <span>
                            <span className="meta-label">Authorized:</span>{' '}
                            {formatDate(device.createdAt)}
                          </span>
                          <span className="meta-sep" aria-hidden="true">
                            ·
                          </span>
                          <span>
                            <span className="meta-label">Last used:</span>{' '}
                            <strong>
                              {device.lastUsedAt ? formatRelativeDate(device.lastUsedAt) : 'Never'}
                            </strong>
                          </span>
                          <span className="meta-sep" aria-hidden="true">
                            ·
                          </span>
                          <span>
                            <span className="meta-label">Expires:</span>{' '}
                            {device.expiresAt ? formatDate(device.expiresAt) : 'Never'}
                          </span>
                        </div>

                        {/* Scopes badge list */}
                        {device.scopes && device.scopes.length > 0 ? (
                          <div className="settings-device-row__scopes">
                            <span className="scopes-label">Scopes:</span>
                            {device.scopes.map((scope) => (
                              <span key={scope} className="scope-pill">
                                {scope}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="settings-device-row__actions">
                      <button
                        type="button"
                        onClick={() => openRenameModal(device)}
                        className="trace-button trace-button--secondary trace-button--small"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => openRevokeModal(device)}
                        className="trace-button trace-button--secondary trace-button--small trace-button--danger"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                        </svg>
                        Revoke
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="settings-empty-devices">
              <div className="settings-empty-devices__icon">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <h3>No active authorized computers</h3>
              <p>
                Run <code>trace login</code> in your local terminal to authorize this machine.
              </p>
            </div>
          )}

          {/* Revoked Devices Accordion */}
          {revokedDevices.length > 0 ? (
            <details className="settings-revoked-details">
              <summary className="settings-revoked-details__summary">
                <div className="settings-revoked-details__title">
                  <span className="status-dot status-dot--muted" aria-hidden="true" />
                  <span>Revoked Computers ({revokedDevices.length})</span>
                </div>
                <span className="settings-revoked-details__chevron" aria-hidden="true">
                  ▼
                </span>
              </summary>

              <div className="settings-revoked-details__content">
                {revokedDevices.map((device) => (
                  <div key={device.id} className="settings-revoked-row">
                    <div className="settings-revoked-row__info">
                      <div className="settings-revoked-row__head">
                        <strong className="settings-revoked-row__name">{device.label}</strong>
                        <span className="settings-device-tag settings-device-tag--revoked">
                          Revoked
                        </span>
                      </div>
                      <p className="settings-revoked-row__sub">
                        Revoked {device.revokedAt ? formatDate(device.revokedAt) : 'recently'} ·
                        Future synchronization blocked · Historical records preserved
                      </p>
                    </div>
                    <span className="settings-revoked-row__time">
                      Last used: {device.lastUsedAt ? formatDate(device.lastUsedAt) : 'Never'}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      )}

      {/* Tab Panel 3: Privacy & Synchronization */}
      {activeTab === 'privacy' && (
        <section
          id="tabpanel-privacy"
          role="tabpanel"
          aria-labelledby="tab-privacy"
          className="settings-section"
          data-trace-motion="section"
          data-motion-section="settings-privacy"
        >
          <div
            className="settings-section__header"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <div>
              <span className="settings-section__eyebrow">Trust & Data Architecture</span>
              <h2 className="settings-section__title">Privacy & Synchronization Trust Boundary</h2>
            </div>
          </div>
          <p
            className="settings-section__lead"
            data-trace-motion="item"
            style={{ '--motion-index': 1 } as React.CSSProperties}
          >
            TRACE enforces a source-isolated local analysis architecture. Full source code, inline
            snippets, and developer credentials never leave your workstation.
          </p>

          {/* Two-Column Comparison Matrix: Sent vs Never Sent */}
          <div className="settings-privacy-grid">
            {/* Column 1: Synchronized Records */}
            <div
              className="settings-privacy-panel"
              data-trace-motion="item"
              style={{ '--motion-index': 2 } as React.CSSProperties}
            >
              <div className="settings-privacy-panel__header">
                <div className="settings-privacy-panel__title-group">
                  <div className="settings-privacy-panel__icon settings-privacy-panel__icon--sync">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h3 className="settings-privacy-panel__title">Synchronized to Workspace</h3>
                </div>
                <span className="settings-privacy-panel__badge">Approved Projections</span>
              </div>

              <ul className="settings-privacy-list">
                <li className="settings-privacy-item">
                  <span className="settings-privacy-item__bullet" aria-hidden="true">
                    ✓
                  </span>
                  <div>
                    <strong>Approved .trace Projections:</strong>
                    <p>
                      Manifest manifests, checksum digests, and change metadata generated by the
                      local CLI engine.
                    </p>
                  </div>
                </li>
                <li className="settings-privacy-item">
                  <span className="settings-privacy-item__bullet" aria-hidden="true">
                    ✓
                  </span>
                  <div>
                    <strong>Governance Rule Checks:</strong>
                    <p>
                      Automated policy checks, severity invariants, and AST pattern match results.
                    </p>
                  </div>
                </li>
                <li className="settings-privacy-item">
                  <span className="settings-privacy-item__bullet" aria-hidden="true">
                    ✓
                  </span>
                  <div>
                    <strong>Architecture Decisions (ADRs):</strong>
                    <p>
                      Structured architectural decision records, rationale statements, and
                      evaluation records.
                    </p>
                  </div>
                </li>
                <li className="settings-privacy-item">
                  <span className="settings-privacy-item__bullet" aria-hidden="true">
                    ✓
                  </span>
                  <div>
                    <strong>Cryptographic Hashes & Git Metadata:</strong>
                    <p>
                      Commit SHAs, branch names, timestamp provenance, and payload verification
                      signatures.
                    </p>
                  </div>
                </li>
              </ul>
            </div>

            {/* Column 2: Strictly Excluded */}
            <div
              className="settings-privacy-panel"
              data-trace-motion="item"
              style={{ '--motion-index': 3 } as React.CSSProperties}
            >
              <div className="settings-privacy-panel__header">
                <div className="settings-privacy-panel__title-group">
                  <div className="settings-privacy-panel__icon settings-privacy-panel__icon--excluded">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </div>
                  <h3 className="settings-privacy-panel__title">Never Sent (Excluded by Design)</h3>
                </div>
                <span className="settings-privacy-panel__badge">Workstation Retained</span>
              </div>

              <ul className="settings-privacy-list">
                <li className="settings-privacy-item">
                  <span
                    className="settings-privacy-item__bullet settings-privacy-item__bullet--cross"
                    aria-hidden="true"
                  >
                    ✕
                  </span>
                  <div>
                    <strong>Repository Source Files:</strong>
                    <p>
                      Raw code never leaves your local file system. Remote cloud compilation of raw
                      files is prohibited.
                    </p>
                  </div>
                </li>
                <li className="settings-privacy-item">
                  <span
                    className="settings-privacy-item__bullet settings-privacy-item__bullet--cross"
                    aria-hidden="true"
                  >
                    ✕
                  </span>
                  <div>
                    <strong>Inline Code Snippets & Private ASTs:</strong>
                    <p>
                      AST construction and symbol resolution execute purely in-memory on your local
                      CPU.
                    </p>
                  </div>
                </li>
                <li className="settings-privacy-item">
                  <span
                    className="settings-privacy-item__bullet settings-privacy-item__bullet--cross"
                    aria-hidden="true"
                  >
                    ✕
                  </span>
                  <div>
                    <strong>Secrets, Env Files & Private Keys:</strong>
                    <p>
                      Files matching <code>.env*</code>, <code>.pem</code>, <code>.key</code>, or
                      credentials patterns are ignored before packaging.
                    </p>
                  </div>
                </li>
                <li className="settings-privacy-item">
                  <span
                    className="settings-privacy-item__bullet settings-privacy-item__bullet--cross"
                    aria-hidden="true"
                  >
                    ✕
                  </span>
                  <div>
                    <strong>Developer Velocity & Surveillance Metrics:</strong>
                    <p>
                      No individual developer ranking, keystroke tracking, or personal surveillance
                      telemetry is ever generated.
                    </p>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          {/* Security & Verification Guarantee Bar */}
          <div
            className="settings-guarantee-bar"
            data-trace-motion="item"
            style={{ '--motion-index': 4 } as React.CSSProperties}
          >
            <div className="settings-guarantee-bar__info">
              <div className="settings-guarantee-bar__icon">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div>
                <strong>Pre-Flight Review Guarantee</strong>
                <p>
                  Run <code>trace sync --dry-run</code> to audit every byte before synchronizing.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleCopy('trace sync --dry-run', 'dry-run-guarantee')}
              className="trace-button trace-button--secondary trace-button--small"
            >
              {copiedCmd === 'dry-run-guarantee'
                ? 'Copied Dry-Run Command'
                : 'Copy dry-run command'}
            </button>
          </div>
        </section>
      )}

      {/* Tab Panel 4: Local CLI Workflow */}
      {activeTab === 'cli' && (
        <section
          id="tabpanel-cli"
          role="tabpanel"
          aria-labelledby="tab-cli"
          className="settings-section"
          data-trace-motion="section"
          data-motion-section="settings-cli"
        >
          <div
            className="settings-section__header"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <div>
              <span className="settings-section__eyebrow">Developer Operations</span>
              <h2 className="settings-section__title">Local CLI Execution Workflow</h2>
            </div>
          </div>
          <p
            className="settings-section__lead"
            data-trace-motion="item"
            style={{ '--motion-index': 1 } as React.CSSProperties}
          >
            Browser sessions do not execute repository analysis or touch local file systems. Run the
            TRACE CLI in your local terminal to parse AST boundaries and synchronize approved
            records.
          </p>

          <div className="settings-cli-grid">
            {/* Step 1: Analyze */}
            <div
              className="settings-cli-card"
              data-trace-motion="item"
              style={{ '--motion-index': 2 } as React.CSSProperties}
            >
              <div className="settings-cli-card__body">
                <div className="settings-cli-card__head">
                  <span className="settings-cli-card__step-num">1</span>
                  <span className="settings-cli-card__badge">AST Parser</span>
                </div>
                <h3 className="settings-cli-card__title">Run Local Analysis</h3>
                <p className="settings-cli-card__desc">
                  Parses repository AST, checks architectural invariants, and compiles the local
                  projection.
                </p>
              </div>

              <div className="settings-cli-card__footer">
                <div className="settings-cli-box">
                  <code>trace analyze</code>
                  <button
                    type="button"
                    onClick={() => handleCopy('trace analyze', 'step-1')}
                    className="settings-cli-copy-btn"
                    aria-label="Copy trace analyze command"
                  >
                    {copiedCmd === 'step-1' ? (
                      <span className="copied-text">Copied</span>
                    ) : (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Step 2: Dry Run */}
            <div
              className="settings-cli-card"
              data-trace-motion="item"
              style={{ '--motion-index': 3 } as React.CSSProperties}
            >
              <div className="settings-cli-card__body">
                <div className="settings-cli-card__head">
                  <span className="settings-cli-card__step-num">2</span>
                  <span className="settings-cli-card__badge">Pre-Flight</span>
                </div>
                <h3 className="settings-cli-card__title">Inspect Manifest Payload</h3>
                <p className="settings-cli-card__desc">
                  Dry-run prints the exact metadata manifest and SHA checksums that will be
                  transmitted.
                </p>
              </div>

              <div className="settings-cli-card__footer">
                <div className="settings-cli-box">
                  <code>trace sync --dry-run</code>
                  <button
                    type="button"
                    onClick={() => handleCopy('trace sync --dry-run', 'step-2')}
                    className="settings-cli-copy-btn"
                    aria-label="Copy trace sync dry run command"
                  >
                    {copiedCmd === 'step-2' ? (
                      <span className="copied-text">Copied</span>
                    ) : (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Step 3: Synchronize */}
            <div
              className="settings-cli-card"
              data-trace-motion="item"
              style={{ '--motion-index': 4 } as React.CSSProperties}
            >
              <div className="settings-cli-card__body">
                <div className="settings-cli-card__head">
                  <span className="settings-cli-card__step-num">3</span>
                  <span className="settings-cli-card__badge">Sync</span>
                </div>
                <h3 className="settings-cli-card__title">Synchronize Records</h3>
                <p className="settings-cli-card__desc">
                  Signs and synchronizes approved project memory to your central workspace ledger.
                </p>
              </div>

              <div className="settings-cli-card__footer">
                <div className="settings-cli-box">
                  <code>trace sync</code>
                  <button
                    type="button"
                    onClick={() => handleCopy('trace sync', 'step-3')}
                    className="settings-cli-copy-btn"
                    aria-label="Copy trace sync command"
                  >
                    {copiedCmd === 'step-3' ? (
                      <span className="copied-text">Copied</span>
                    ) : (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Tab Panel 5: Account */}
      {activeTab === 'account' && (
        <section
          id="tabpanel-account"
          role="tabpanel"
          aria-labelledby="tab-account"
          className="settings-section"
          data-trace-motion="section"
          data-motion-section="settings-account"
        >
          <div
            className="settings-section__header"
            data-trace-motion="item"
            style={{ '--motion-index': 0 } as React.CSSProperties}
          >
            <div>
              <span className="settings-section__eyebrow">Identity & Session</span>
              <h2 className="settings-section__title">Account Details</h2>
            </div>
          </div>

          <div
            className="settings-account-card"
            data-trace-motion="item"
            style={{ '--motion-index': 1 } as React.CSSProperties}
          >
            <div className="settings-account-card__info">
              <div className="settings-account-card__avatar">{initialsForName(userName)}</div>
              <div className="settings-account-card__details">
                <div className="settings-account-card__name-row">
                  <h3 className="settings-account-card__name">{userName}</h3>
                  <span className="settings-account-card__role">Workspace member</span>
                </div>
                <p className="settings-account-card__sub">
                  {userEmail} · @{githubHandle}
                </p>
              </div>
            </div>

            <div className="settings-account-card__actions">
              <a href="/api/auth/sign-out" className="trace-button trace-button--secondary">
                Sign out
              </a>
            </div>
          </div>
        </section>
      )}

      {/* Rename Modal */}
      {cachedRenameTarget ? (
        <DeviceRenameModal
          device={cachedRenameTarget}
          isOpen={Boolean(renameTarget)}
          onClose={closeRenameModal}
          onSubmit={handleRenameSubmit}
          renameInput={renameInput}
          setRenameInput={setRenameInput}
          renamePending={renamePending}
          renameError={renameError}
        />
      ) : null}

      {/* Revoke Modal */}
      {cachedRevokeTarget ? (
        <DeviceRevokeModal
          device={cachedRevokeTarget}
          isOpen={Boolean(revokeTarget)}
          onClose={closeRevokeModal}
          onConfirm={handleRevokeConfirm}
          revokePending={revokePending}
          revokeError={revokeError}
        />
      ) : null}
    </div>
  );
}

function DeviceRenameModal({
  device,
  isOpen,
  onClose,
  onSubmit,
  renameInput,
  setRenameInput,
  renamePending,
  renameError,
}: {
  device: DeviceItem;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  renameInput: string;
  setRenameInput: (val: string) => void;
  renamePending: boolean;
  renameError: string | null;
}) {
  const presence = usePresence(isOpen);

  if (!presence.isMounted) return null;

  return (
    <PresenceContext.Provider value={presence}>
      <OverlayPortal>
        <ModalBackdrop onRequestClose={presence.requestClose} ariaLabel="Close dialog">
          <CenteredDialog
            size="md"
            titleId="rename-dialog-title"
            onRequestClose={presence.requestClose}
          >
            <div className="trace-dialog__header" {...getMotionItemProps(0)}>
              <h3 id="rename-dialog-title" className="trace-dialog__title">
                Rename Authorized Computer
              </h3>
              <button
                type="button"
                onClick={presence.requestClose}
                disabled={renamePending}
                className="trace-dialog__close"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <form onSubmit={onSubmit} className="settings-modal-form">
              <div className="settings-form-group" {...getMotionItemProps(1)}>
                <label htmlFor="device-label-input" className="settings-form-label">
                  Computer Label
                </label>
                <input
                  id="device-label-input"
                  type="text"
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  disabled={renamePending}
                  maxLength={80}
                  className="trace-input"
                  autoFocus
                />
                <p className="settings-form-hint">Device ID: {device.id}</p>
              </div>

              {renameError ? (
                <p className="settings-form-error" role="alert">
                  {renameError}
                </p>
              ) : null}

              <div className="trace-dialog__actions" {...getMotionItemProps(2)}>
                <button
                  type="button"
                  onClick={presence.requestClose}
                  disabled={renamePending}
                  className="trace-button trace-button--secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={renamePending || !renameInput.trim()}
                  className="trace-button trace-button--primary"
                >
                  {renamePending ? 'Saving...' : 'Save Label'}
                </button>
              </div>
            </form>
          </CenteredDialog>
        </ModalBackdrop>
      </OverlayPortal>
    </PresenceContext.Provider>
  );
}

function DeviceRevokeModal({
  device,
  isOpen,
  onClose,
  onConfirm,
  revokePending,
  revokeError,
}: {
  device: DeviceItem;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  revokePending: boolean;
  revokeError: string | null;
}) {
  const presence = usePresence(isOpen);

  if (!presence.isMounted) return null;

  return (
    <PresenceContext.Provider value={presence}>
      <OverlayPortal>
        <ModalBackdrop onRequestClose={presence.requestClose} ariaLabel="Close dialog">
          <CenteredDialog
            size="md"
            titleId="revoke-dialog-title"
            onRequestClose={presence.requestClose}
          >
            <div className="trace-dialog__header" {...getMotionItemProps(0)}>
              <div className="settings-modal-title-with-icon">
                <div className="settings-modal-warning-icon">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                </div>
                <h3 id="revoke-dialog-title" className="trace-dialog__title">
                  Revoke Computer Authorization
                </h3>
              </div>
              <button
                type="button"
                onClick={presence.requestClose}
                disabled={revokePending}
                className="trace-dialog__close"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <div className="settings-modal-body" {...getMotionItemProps(1)}>
              <p className="settings-modal-lead">
                Are you sure you want to revoke authorization for <strong>“{device.label}”</strong>?
              </p>
              <div className="settings-modal-note">
                <p>• Future local synchronization from this computer will stop immediately.</p>
                <p>
                  • Historical project records, AST metrics, and architectural decisions will remain
                  preserved in workspace memory.
                </p>
              </div>
            </div>

            {revokeError ? (
              <p className="settings-form-error" role="alert">
                {revokeError}
              </p>
            ) : null}

            <div className="trace-dialog__actions" {...getMotionItemProps(2)}>
              <button
                type="button"
                onClick={presence.requestClose}
                disabled={revokePending}
                className="trace-button trace-button--secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={revokePending}
                className="trace-button trace-button--secondary trace-button--danger"
              >
                {revokePending ? 'Revoking...' : 'Revoke Authorization'}
              </button>
            </div>
          </CenteredDialog>
        </ModalBackdrop>
      </OverlayPortal>
    </PresenceContext.Provider>
  );
}
