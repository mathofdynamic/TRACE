import { describe, expect, it } from 'vitest';
import { dailyWindow, renderReport, rollingWindow, weeklyWindow } from './reports.js';

describe('report windows and rendering', () => {
  it('creates timezone-aware daily and weekly windows', () => {
    const date = new Date('2026-08-08T12:00:00.000Z');
    const daily = dailyWindow(date, 'Asia/Tehran');
    const weekly = weeklyWindow(date, 'Asia/Tehran');
    expect(daily.startUtc).toContain('T');
    expect(weekly.endUtc > weekly.startUtc).toBe(true);
  });

  it('renders evidence and explicitly avoids individual scoring', () => {
    const markdown = renderReport(
      {
        window: rollingWindow(new Date('2026-08-08T12:00:00.000Z')),
        items: [
          {
            id: 'change-1',
            kind: 'change',
            title: 'API changed',
            detail: 'Evidence-backed',
            evidenceIds: ['file:a.ts'],
            materiality: 'high',
            included: true,
          },
        ],
      },
      'daily',
    );
    expect(markdown).toContain('file:a.ts');
    expect(markdown).toContain('No individual activity');
  });
});
