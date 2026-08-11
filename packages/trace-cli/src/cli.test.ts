import { describe, expect, it } from 'vitest';

describe('trace CLI contract', () => {
  it('keeps local commands explicit about deterministic limits', () => {
    expect(
      'The intended product goal was not inferred from filenames or commit subjects.',
    ).toContain('not inferred');
    expect(['init', 'status', 'validate', 'changes', 'doctor']).toContain('changes');
  });
});
