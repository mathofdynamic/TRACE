import { describe, expect, it } from 'vitest';
import { traceTokens } from './tokens.js';

describe('TRACE design tokens', () => {
  it('keeps the dark-first palette and controlled blue accent authoritative', () => {
    expect(traceTokens.color.canvas).toBe('#080809');
    expect(traceTokens.color.surface1).toBe('#111112');
    expect(traceTokens.color.bluePrimary).toBe('#087cf0');
    expect(traceTokens.radius.card).toBe(10);
  });
});
