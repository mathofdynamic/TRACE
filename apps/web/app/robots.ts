import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.TRACE_PUBLIC_URL ?? 'http://localhost:3000';
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app/', '/onboarding', '/sign-in', '/sign-up', '/auth/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
