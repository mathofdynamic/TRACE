import { z } from 'zod';

export const reportEvidenceLocator = 'trace:engineering-report:v1';
export const reportSectionIds = [
  'period',
  'summary',
  'commits',
  'pull-requests',
  'files',
  'engineering',
  'findings',
  'attention',
  'decisions',
  'releases',
  'freshness',
] as const;
const item = z
  .object({
    title: z.string().min(1).max(240),
    detail: z.string().max(2000).optional(),
    url: z
      .string()
      .max(500)
      .url()
      .refine((url) => /^https:\/\/github\.com\//.test(url))
      .optional(),
    evidence: z.array(z.string().min(1).max(300)).min(1).max(20),
  })
  .strict();
export const engineeringReportSchema = z
  .object({
    version: z.literal(1),
    period: z
      .object({
        kind: z.enum(['daily', 'weekly']),
        start: z.string().datetime(),
        end: z.string().datetime(),
        timeZone: z.string().min(1).max(100),
        asOf: z.string().datetime(),
      })
      .strict()
      .refine((p) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: p.timeZone }).format(new Date(p.start));
          const hours = (Date.parse(p.end) - Date.parse(p.start)) / 3_600_000;
          return (
            Date.parse(p.start) < Date.parse(p.end) &&
            Date.parse(p.start) <= Date.parse(p.asOf) &&
            Date.parse(p.asOf) <= Date.parse(p.end) &&
            (p.kind === 'daily' ? hours >= 23 && hours <= 25 : hours >= 167 && hours <= 169)
          );
        } catch {
          return false;
        }
      }, 'Invalid reporting period'),
    sources: z
      .array(
        z
          .object({
            name: z.string().min(1).max(100),
            status: z.enum(['available', 'partial', 'not_available']),
            detail: z.string().max(2000),
          })
          .strict(),
      )
      .max(20),
    sections: z
      .array(
        z
          .object({
            id: z.enum(reportSectionIds),
            title: z.string().min(1).max(100),
            summary: z.string().max(4000),
            items: z.array(item).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .refine(
    (document) =>
      document.sections.length === reportSectionIds.length &&
      new Set(document.sections.map((s) => s.id)).size === reportSectionIds.length,
    'Every required report section must appear exactly once',
  );
export type EngineeringReport = z.infer<typeof engineeringReportSchema>;
