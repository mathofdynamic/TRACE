export type NavigationItem = {
  label: string;
  href: string;
  icon:
    | 'overview'
    | 'repository'
    | 'change'
    | 'conflict'
    | 'report'
    | 'rule'
    | 'activity'
    | 'settings'
    | 'docs';
  external?: boolean;
};

export const primaryNavigation: readonly NavigationItem[] = [
  { label: 'Overview', href: '/app', icon: 'overview' },
  { label: 'Repositories', href: '/app/repositories', icon: 'repository' },
  { label: 'Active changes', href: '/app/changes', icon: 'change' },
  { label: 'Conflicts', href: '/app/conflicts', icon: 'conflict' },
  { label: 'Reports', href: '/app/reports', icon: 'report' },
  { label: 'Rules', href: '/app/rules', icon: 'rule' },
] as const;

export const secondaryNavigation: readonly NavigationItem[] = [
  { label: 'Activity', href: '/app/activity', icon: 'activity' },
  { label: 'Settings', href: '/app/settings', icon: 'settings' },
  { label: 'Documentation', href: '/docs', icon: 'docs', external: true },
] as const;

export function isNavigationItemActive(pathname: string, href: string) {
  if (href === '/app') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getRouteLabel(pathname: string) {
  const match = [...primaryNavigation, ...secondaryNavigation].find((item) =>
    isNavigationItemActive(pathname, item.href),
  );
  if (match) return match.label;

  const segments = pathname.split('/').filter(Boolean);
  const lastSegment = segments.at(-1);
  if (!lastSegment) return 'Overview';
  return lastSegment.replaceAll('-', ' ').replace(/^./, (character) => character.toUpperCase());
}
