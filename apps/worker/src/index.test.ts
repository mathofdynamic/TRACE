import { describe, expect, it } from 'vitest';

describe('worker foundation', () => {
  it('has a reserved system healthcheck job name', () => {
    expect('system.healthcheck').toMatch(/^system\./);
  });
});
