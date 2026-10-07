import { z } from 'zod';

export const prBriefInputCheck = 'trace:pr-brief-input:v1';
const hash = z.string().regex(/^[a-f0-9]{40,64}$/i);
const identity = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/);
const ref = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/)
  .refine((s) => !s.includes('..'));
const forbidden =
  /```|[<>\r\n]|\b(?:gh[opsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})\b|(?:^|\s)(?:\/[A-Za-z]|[A-Za-z]:\\)|\b(?:const|let|var|function|class|import|export)\s|(?:=>|\bdiff --git\b)/i;
export function safePrBriefText(value: string) {
  return !forbidden.test(value);
}
export function safePrBriefValue(value: unknown): boolean {
  if (typeof value === 'string') return safePrBriefText(value);
  if (Array.isArray(value)) return value.every(safePrBriefValue);
  if (value && typeof value === 'object') return Object.values(value).every(safePrBriefValue);
  return true;
}
export const prBriefProjectionSchema = z
  .object({
    number: z.number().int().positive().max(2147483647),
    provider: z.enum(['github', 'git']),
    owner: identity,
    repository: identity,
    change_scope: z.literal('working_tree'),
    changed_files: z.number().int().nonnegative(),
    findings: z.number().int().nonnegative(),
    material_findings: z.number().int().nonnegative(),
    input: z
      .object({
        branch: ref.optional(),
        head_commit: hash.optional(),
        working_tree: z.enum(['clean', 'dirty']),
        stable: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.material_findings > p.findings || !safePrBriefValue(p))
      ctx.addIssue({ code: 'custom', message: 'Unsafe or inconsistent PR brief projection' });
  });
export type PrBriefProjection = z.infer<typeof prBriefProjectionSchema>;

// Used at both CLI selection and server upload, against the actual sync target.
export function prBriefAttributionIssue(
  metadata: {
    repository: { provider: string; owner: string; name: string };
    dashboard?: { branch?: string; head_commit?: string; pull_request?: PrBriefProjection };
  },
  target: { branch: string; headCommit: string },
  repository?: string,
) {
  const p = metadata.dashboard?.pull_request;
  if (!p) return 'PR brief projection is missing';
  if (p.input.working_tree !== 'clean' || !p.input.stable)
    return 'PR brief input is dirty or unstable';
  if (
    p.input.head_commit !== target.headCommit ||
    metadata.dashboard?.head_commit !== target.headCommit
  )
    return 'historical PR brief: commit differs from current HEAD';
  if (p.input.branch !== target.branch || metadata.dashboard?.branch !== target.branch)
    return 'historical PR brief: branch differs from current branch';
  if (
    repository &&
    `${metadata.repository.owner}/${metadata.repository.name}`.toLowerCase() !==
      repository.toLowerCase()
  )
    return 'PR brief repository identity differs from sync target';
  return null;
}

export function prBriefSummary(p: PrBriefProjection) {
  return `${p.changed_files} working-tree changes observed; ${p.findings} deterministic findings (${p.material_findings} material). GitHub PR change totals, title, state and decisions: Not available.`;
}
export function prBriefTitle(p: PrBriefProjection) {
  return `PR #${p.number} — Local review brief`;
}
export function renderPrBriefDocument(p: PrBriefProjection) {
  const clean = p.input.working_tree === 'clean' && p.input.stable;
  return `# ${prBriefTitle(p)}\n\n## Summary\n\n${prBriefSummary(p)}\n\n## Attribution\n\nLocally generated review brief for ${p.owner}/${p.repository}#${p.number}. PR number supplied by the caller; GitHub metadata was not fetched. Input: ${clean ? 'clean committed checkout' : 'dirty or unstable; local-only'}. Source code and snippets are excluded.\n`;
}
