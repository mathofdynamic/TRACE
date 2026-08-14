import { describe, expect, it } from 'vitest';
import { isTrustedBrowserMutation } from './browser-origin';

describe('browser mutation origin boundary', () => {
  it('accepts the configured application origin and rejects missing or foreign origins', () => {
    expect(
      isTrustedBrowserMutation(
        new Request('http://127.0.0.1:3001/api/cli/device/confirm', {
          headers: { origin: 'http://127.0.0.1:3001' },
        }),
      ),
    ).toBe(true);
    expect(
      isTrustedBrowserMutation(
        new Request('http://127.0.0.1:3001/api/cli/device/confirm', {
          headers: { origin: 'https://attacker.example' },
        }),
      ),
    ).toBe(false);
    expect(
      isTrustedBrowserMutation(new Request('http://127.0.0.1:3001/api/cli/device/confirm')),
    ).toBe(false);
  });
});
