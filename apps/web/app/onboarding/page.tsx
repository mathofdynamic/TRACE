import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getTraceSession } from '@trace/auth';
import { schema } from '@trace/db';
import { OnboardingForm } from '../components/onboarding-form';
import { createRequestDatabase } from '../../lib/request-database';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Onboarding — TRACE', robots: { index: false, follow: false } };

export default async function OnboardingPage() {
  const session = await getTraceSession(await headers());
  if (!session?.user) redirect('/sign-in?next=/onboarding');

  const { db, client } = await createRequestDatabase();
  try {
    const [profile] = await db
      .select({ completed: schema.onboardingProfiles.completed })
      .from(schema.onboardingProfiles)
      .where(eq(schema.onboardingProfiles.userId, session.user.id))
      .limit(1);
    if (profile?.completed) redirect('/app/repositories');
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
        <span className="onboarding-step">Step 1 of 2</span>
      </div>
      <section className="onboarding-card">
        <p className="section-label">Workspace setup</p>
        <h1>Choose the shape of your first TRACE workspace.</h1>
        <p>
          These choices help us resume your setup. GitHub App connection comes next and is not
          performed here.
        </p>
        <OnboardingForm />
      </section>
    </main>
  );
}
