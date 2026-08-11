import { describe, expect, it } from 'vitest';
import { getRouteLabel, isNavigationItemActive } from './navigation';

describe('dashboard navigation', () => {
  it('keeps Overview active only on the dashboard root', () => {
    expect(isNavigationItemActive('/app', '/app')).toBe(true);
    expect(isNavigationItemActive('/app/reports', '/app')).toBe(false);
  });

  it('keeps parent navigation active for nested routes', () => {
    expect(isNavigationItemActive('/app/repositories/trace/reports', '/app/repositories')).toBe(
      true,
    );
    expect(isNavigationItemActive('/app/rules', '/app/reports')).toBe(false);
  });

  it('derives the visible route label from the current path', () => {
    expect(getRouteLabel('/app/conflicts')).toBe('Conflicts');
    expect(getRouteLabel('/app/repositories/trace')).toBe('Repositories');
    expect(getRouteLabel('/app/unknown-view')).toBe('Unknown view');
  });
});
