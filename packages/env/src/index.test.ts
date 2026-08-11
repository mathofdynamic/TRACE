import { describe, expect, it } from 'vitest';
import { getOptionalServerEnv } from './index.js';

describe('environment validation', () => {
  it('rejects incomplete runtime configuration without throwing at import time', () => {
    expect(getOptionalServerEnv({ NODE_ENV: 'test' })).toBeNull();
  });
});
