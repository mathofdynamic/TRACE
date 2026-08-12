import { describe, expect, it } from 'vitest';
import { deriveSetupState } from './dashboard';

describe('dashboard setup projection', () => {
  it('keeps analysis unavailable before a repository is selected', () => {
    expect(deriveSetupState({ githubConnected: false, repositorySelected: false })).toMatchObject({
      githubConnected: false,
      repositorySelected: false,
      analysisState: 'unavailable',
      cloudAnalysisAvailable: false,
    });
  });

  it('distinguishes a connected repository from a completed analysis', () => {
    expect(deriveSetupState({ githubConnected: true, repositorySelected: true })).toMatchObject({
      repositorySelected: true,
      analysisState: 'not-started',
    });
    expect(
      deriveSetupState({
        githubConnected: true,
        repositorySelected: true,
        latestAnalysisStatus: 'completed',
      }),
    ).toMatchObject({ repositorySelected: true, analysisState: 'completed' });
  });
});
