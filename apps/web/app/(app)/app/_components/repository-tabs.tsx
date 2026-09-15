'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface RepositoryTabCounts {
  changes?: number;
  findings?: number;
  reports?: number;
}

const tabs = [
  { label: 'Overview', suffix: '', countKey: undefined },
  { label: 'Pull requests', suffix: '/pull-requests', countKey: 'changes' as const },
  { label: 'Findings', suffix: '/findings', countKey: 'findings' as const },
  { label: 'Reports', suffix: '/reports', countKey: 'reports' as const },
] as const;

export function RepositoryTabs({
  repositoryId,
  counts,
}: {
  repositoryId: string;
  counts?: RepositoryTabCounts;
}) {
  const pathname = usePathname();
  const root = `/app/repositories/${repositoryId}`;
  return (
    <nav className="repository-tabs" aria-label="Repository navigation">
      {tabs.map(({ label, suffix, countKey }) => {
        const href = `${root}${suffix}`;
        const active = suffix ? pathname === href : pathname === root;
        const count = countKey && counts ? counts[countKey] : undefined;
        return (
          <Link
            key={label}
            href={href}
            aria-current={active ? 'page' : undefined}
            className="repository-tab-link"
          >
            <span>{label}</span>
            {typeof count === 'number' ? (
              <span className="repository-tab-count">{count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
