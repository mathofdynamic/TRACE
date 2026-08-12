import { redirect } from 'next/navigation';
import { safeAuthNext } from '@trace/auth';

export const metadata = {
  title: 'Start with TRACE — TRACE',
  robots: { index: false, follow: false },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const query = await searchParams;
  const requestedNext = Array.isArray(query.next) ? query.next[0] : query.next;
  redirect(`/sign-in?next=${encodeURIComponent(safeAuthNext(requestedNext))}`);
}
