export type NavigationItem = {
  label: string;
  href: string;
  icon:
    | 'overview'
    | 'repository'
    | 'change'
    | 'conflict'
    | 'report'
    | 'decision'
    | 'rule'
    | 'activity'
    | 'settings'
    | 'docs';
  external?: boolean;
  requires?: 'changes' | 'conflicts' | 'reports' | 'decisions' | 'rules' | 'activity';
};

export type NavigationCapabilities = Record<
  'changes' | 'conflicts' | 'reports' | 'decisions' | 'rules' | 'activity',
  boolean
>;

export const primaryNavigation: readonly NavigationItem[] = [
  { label: 'Overview', href: '/app', icon: 'overview' },
  { label: 'Repositories', href: '/app/repositories', icon: 'repository' },
  { label: 'Changes', href: '/app/changes', icon: 'change', requires: 'changes' },
  { label: 'Conflicts', href: '/app/conflicts', icon: 'conflict', requires: 'conflicts' },
  { label: 'Reports', href: '/app/reports', icon: 'report', requires: 'reports' },
  { label: 'Decisions', href: '/app/decisions', icon: 'decision', requires: 'decisions' },
  { label: 'Rules', href: '/app/rules', icon: 'rule', requires: 'rules' },
] as const;

export const secondaryNavigation: readonly NavigationItem[] = [
  { label: 'Activity', href: '/app/activity', icon: 'activity', requires: 'activity' },
  { label: 'Settings', href: '/app/settings', icon: 'settings' },
  { label: 'Documentation', href: '/app/documentation', icon: 'docs' },
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
