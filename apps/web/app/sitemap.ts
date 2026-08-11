import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.TRACE_PUBLIC_URL ?? 'http://localhost:3000';
  return ['/', '/product', '/security', '/specification', '/pricing', '/docs'].map((path) => ({
    url: `${baseUrl}${path}`,
    changeFrequency: 'monthly',
    priority: path === '/' ? 1 : 0.6,
  }));
}
