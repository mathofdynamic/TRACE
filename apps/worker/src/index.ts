import { PgBoss, type Job } from 'pg-boss';
import { getOptionalServerEnv } from '@trace/env';
import { createLogger } from '@trace/logger';

const logger = createLogger('trace-worker', process.env.TRACE_LOG_LEVEL as 'info' | undefined);

export async function startWorker(databaseUrl: string) {
  const boss = new PgBoss({ connectionString: databaseUrl });
  await boss.start();
  await boss.createQueue('system.healthcheck');
  await boss.createQueue('github.webhook.process');
  await boss.createQueue('github.installation.sync');
  await boss.createQueue('github.repository.sync');
  await boss.createQueue('github.pull-request.sync');
  await boss.createQueue('github.issue.sync');
  await boss.createQueue('github.webhook.replay');
  await boss.createQueue('analysis.changes');
  await boss.createQueue('reports.daily');
  await boss.createQueue('reports.weekly');
  await boss.createQueue('conflicts.reconcile');
  await boss.createQueue('sync.reconcile');
  await boss.work('system.healthcheck', async (jobs: Job[]) => {
    logger.info('system healthcheck completed', { jobId: jobs[0]?.id });
  });
  await boss.work('github.webhook.process', async (jobs: Job[]) => {
    logger.info('github webhook queued for processing', { jobId: jobs[0]?.id });
  });
  await boss.work('analysis.changes', async (jobs: Job[]) => {
    logger.info('analysis job accepted', { jobId: jobs[0]?.id, source: 'worker-boundary' });
  });
  await boss.work('reports.daily', async (jobs: Job[]) => {
    logger.info('daily report job accepted', { jobId: jobs[0]?.id });
  });
  await boss.work('reports.weekly', async (jobs: Job[]) => {
    logger.info('weekly report job accepted', { jobId: jobs[0]?.id });
  });
  await boss.work('conflicts.reconcile', async (jobs: Job[]) => {
    logger.info('conflict reconciliation job accepted', { jobId: jobs[0]?.id });
  });
  await boss.work('sync.reconcile', async (jobs: Job[]) => {
    logger.info('sync reconciliation job accepted', { jobId: jobs[0]?.id });
  });
  return boss;
}

async function main() {
  const env = getOptionalServerEnv();
  if (!env) {
    throw new Error(
      'Worker environment is incomplete. Copy .env.example and configure server variables.',
    );
  }
  const boss = await startWorker(env.DATABASE_URL);
  logger.info('worker started', { environment: env.NODE_ENV });

  const shutdown = async (signal: string) => {
    logger.info('worker shutting down', { signal });
    await boss.stop();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error: unknown) => {
    logger.error('worker failed to start', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  });
}
