import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'TRACE — Change intelligence for software teams',
  description: 'Evidence-backed engineering change intelligence for human and AI software teams.',
  metadataBase: new URL(process.env.TRACE_PUBLIC_URL ?? 'http://localhost:3000'),
  openGraph: {
    title: 'TRACE — The history of understanding',
    description: 'Evidence-backed understanding for software change.',
    type: 'website',
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
