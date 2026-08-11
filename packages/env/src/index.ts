import { z } from 'zod';

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TRACE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  TRACE_AUTH_SECRET: z.string().min(32),
  TRACE_PUBLIC_URL: z.string().url(),
  GITHUB_OAUTH_CLIENT_ID: z.string().min(1),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().min(1),
  GITHUB_APP_ID: z.string().min(1).optional(),
  GITHUB_APP_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
  GITHUB_WEBHOOK_SECRET: z.string().min(1).optional(),
  GITHUB_APP_SLUG: z.string().min(1).optional(),
  GITHUB_APP_CALLBACK_URL: z.string().url().optional(),
  GITHUB_APP_SETUP_URL: z.string().url().optional(),
  GITHUB_APP_INSTALL_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function parseServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverSchema.parse(source);
}

export function getOptionalServerEnv(source: NodeJS.ProcessEnv = process.env) {
  const result = serverSchema.safeParse(source);
  return result.success ? result.data : null;
}

export function parseGitHubAppEnv(source: NodeJS.ProcessEnv = process.env) {
  const values = z
    .object({
      GITHUB_APP_ID: z.string().min(1),
      GITHUB_APP_CLIENT_ID: z.string().min(1),
      GITHUB_APP_CLIENT_SECRET: z.string().min(1),
      GITHUB_APP_PRIVATE_KEY: z.string().min(1),
      GITHUB_WEBHOOK_SECRET: z.string().min(1),
      GITHUB_APP_SLUG: z.string().min(1),
      GITHUB_APP_CALLBACK_URL: z.string().url().optional(),
      GITHUB_APP_SETUP_URL: z.string().url().optional(),
    })
    .parse(source);
  return { ...values, GITHUB_APP_PRIVATE_KEY: values.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n') };
}

export function parseGitHubAppInstallEnv(source: NodeJS.ProcessEnv = process.env) {
  return z
    .object({
      GITHUB_APP_SLUG: z.string().min(1),
      GITHUB_APP_INSTALL_URL: z.string().url().optional(),
    })
    .parse(source);
}

export function parseGitHubWebhookEnv(source: NodeJS.ProcessEnv = process.env) {
  return z.object({ GITHUB_WEBHOOK_SECRET: z.string().min(1) }).parse(source);
}

export const publicEnv = {
  TRACE_PUBLIC_URL: process.env.TRACE_PUBLIC_URL ?? 'http://localhost:3000',
} as const;
