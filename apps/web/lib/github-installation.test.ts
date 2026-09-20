import { describe, expect, it } from 'vitest';
import { chooseGitHubInstallation } from './github-installation';

const first = {
  id: 101,
  accountLogin: 'trace-user',
  accountType: 'User',
  appId: 202,
  suspendedAt: null,
} as const;
const second = {
  id: 303,
  accountLogin: 'trace-org',
  accountType: 'Organization',
  appId: 202,
  suspendedAt: null,
} as const;

describe('GitHub installation reconciliation selection', () => {
  it('auto-selects the only authorized installation', () => {
    expect(chooseGitHubInstallation([first])).toEqual(first);
  });

  it('fails closed when more than one installation is authorized', () => {
    expect(chooseGitHubInstallation([first, second])).toBeNull();
  });

  it('accepts only an explicitly requested authorized installation', () => {
    expect(chooseGitHubInstallation([first, second], second.id)).toEqual(second);
    expect(chooseGitHubInstallation([first, second], 999)).toBeNull();
  });
});
