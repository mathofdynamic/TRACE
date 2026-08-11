import { createHash } from 'node:crypto';

export type ReportWindow = {
  kind: 'daily' | 'weekly' | 'rolling' | 'custom';
  startUtc: string;
  endUtc: string;
  displayTimeZone: string;
  key: string;
};

function timeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  );
}

function offsetMs(date: Date, timeZone: string) {
  const parts = timeZoneParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  return asUtc - date.getTime();
}

function localMidnightUtc(localDate: Date, timeZone: string) {
  const parts = timeZoneParts(localDate, timeZone);
  const rough = Date.UTC(parts.year ?? 0, (parts.month ?? 1) - 1, parts.day ?? 1);
  const first = new Date(rough - offsetMs(new Date(rough), timeZone));
  return new Date(rough - offsetMs(first, timeZone));
}

export function dailyWindow(date: Date, timeZone: string): ReportWindow {
  const start = localMidnightUtc(date, timeZone);
  const end = localMidnightUtc(new Date(start.getTime() + 36 * 60 * 60 * 1000), timeZone);
  const key = timeZoneParts(date, timeZone);
  const dateKey = `${key.year}-${String(key.month).padStart(2, '0')}-${String(key.day).padStart(2, '0')}`;
  return {
    kind: 'daily',
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    displayTimeZone: timeZone,
    key: `daily:${dateKey}:${timeZone}`,
  };
}

export function rollingWindow(end: Date, hours = 24): ReportWindow {
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  return {
    kind: 'rolling',
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    displayTimeZone: 'UTC',
    key: `rolling:${start.toISOString()}:${end.toISOString()}`,
  };
}

export function weeklyWindow(date: Date, timeZone: string, weekStartsOn: 0 | 1 = 1): ReportWindow {
  const local = timeZoneParts(date, timeZone);
  const localDate = new Date(Date.UTC(local.year ?? 0, (local.month ?? 1) - 1, local.day ?? 1));
  const day = localDate.getUTCDay();
  const delta = (day - weekStartsOn + 7) % 7;
  const start = localMidnightUtc(new Date(localDate.getTime() - delta * 86_400_000), timeZone);
  const end = localMidnightUtc(new Date(start.getTime() + 7 * 86_400_000), timeZone);
  return {
    kind: 'weekly',
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    displayTimeZone: timeZone,
    key: `weekly:${start.toISOString()}:${timeZone}`,
  };
}

export type MaterialReportItem = {
  id: string;
  kind: 'change' | 'conflict' | 'decision' | 'risk' | 'debt' | 'follow_up';
  title: string;
  detail: string;
  evidenceIds: string[];
  materiality: 'high' | 'medium' | 'low';
  included: boolean;
  exclusionReason?: string;
};

export type ReportInput = {
  window: ReportWindow;
  items: MaterialReportItem[];
  semanticSummary?: string;
  limitations?: string[];
};

export function reportIdempotencyKey(window: ReportWindow, repository: string) {
  return createHash('sha256').update(`${repository}:${window.key}:0.1`).digest('hex');
}

export function renderReport(input: ReportInput, kind: 'daily' | 'weekly') {
  const included = input.items.filter((item) => item.included);
  const grouped = new Map<string, MaterialReportItem[]>();
  for (const item of included) grouped.set(item.kind, [...(grouped.get(item.kind) ?? []), item]);
  const section = (kindName: string, heading: string) => {
    const items = grouped.get(kindName) ?? [];
    return `## ${heading}\n\n${items.length ? items.map((item) => `- ${item.title}: ${item.detail} [${item.evidenceIds.join(', ')}]`).join('\n') : '- None recorded.'}\n`;
  };
  return `# ${kind === 'daily' ? 'Daily' : 'Weekly'} report\n\n- Window: **${input.window.startUtc}** to **${input.window.endUtc}**\n- Display timezone: **${input.window.displayTimeZone}**\n\n## Executive summary\n\n${input.semanticSummary ?? 'The report contains deterministic material changes only; intent is unknown where no evidence is available.'}\n\n${section('change', 'Meaningful changes')}\n${section('conflict', 'Conflict movement')}\n${section('decision', 'Decisions')}\n${section('risk', 'Risks')}\n${section('debt', 'Debt')}\n${section('follow_up', 'Incomplete and follow-up work')}\n## Limitations\n\n${input.limitations?.length ? input.limitations.map((item) => `- ${item}`).join('\n') : '- None recorded.'}\n\nNo individual activity, ranking, or productivity score is included.\n`;
}
