'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  ['Summary', ''],
  ['Pull requests', '/pull-requests'],
  ['Changes', '/changes'],
  ['Conflicts', '/conflicts'],
  ['Reports', '/reports'],
  ['Decisions', '/decisions'],
  ['Risks', '/risks'],
] as const;

export function RepositoryTabs({ repositoryId }: { repositoryId: string }) {
  const pathname = usePathname();
  const root = `/app/repositories/${repositoryId}`;
  return (
    <nav className="repository-tabs" aria-label="Repository navigation">
      {tabs.map(([label, suffix]) => {
        const href = `${root}${suffix}`;
        const active = suffix ? pathname === href : pathname === root;
        return (
          <Link key={label} href={href} aria-current={active ? 'page' : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
