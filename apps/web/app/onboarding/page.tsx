import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { d1Schema, isD1Database, schema } from '@trace/db';
import type { TraceD1Database } from '@trace/db';
import { OnboardingForm } from '../components/onboarding-form';
import { SetupProgress } from '../components/setup-progress';
import { createRequestDatabase, getRequestTraceSession } from '../../lib/request-database';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Onboarding — TRACE', robots: { index: false, follow: false } };

export default async function OnboardingPage() {
  const session = await getRequestTraceSession(await headers());
  if (!session?.user) redirect('/sign-in?next=/onboarding');

  const { db, client } = await createRequestDatabase();
  try {
    if (isD1Database(db)) {
      const [profile] = await (db as unknown as TraceD1Database)
        .select({ completed: d1Schema.onboardingProfiles.completed })
        .from(d1Schema.onboardingProfiles)
        .where(eq(d1Schema.onboardingProfiles.userId, session.user.id))
        .limit(1);
      if (profile?.completed) redirect('/app/repositories');
    } else {
      const [profile] = await db
        .select({ completed: schema.onboardingProfiles.completed })
        .from(schema.onboardingProfiles)
        .where(eq(schema.onboardingProfiles.userId, session.user.id))
        .limit(1);
      if (profile?.completed) redirect('/app/repositories');
    }
  } finally {
    await client.end();
  }

  return (
    <main className="onboarding-shell">
      <div className="auth-shell__top">
        <span className="wordmark">
          <span className="trace-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span>TRACE</span>
        </span>
        <span className="onboarding-step">Setup</span>
      </div>
      <SetupProgress current={1} />
      <section className="onboarding-card">
        <p className="section-label">Your workspace</p>
        <h1>Who will use this TRACE workspace?</h1>
        <p>
          This sets the workspace context. Execution and synchronization preferences can be changed
          later.
        </p>
        <OnboardingForm />
      </section>
    </main>
  );
}
