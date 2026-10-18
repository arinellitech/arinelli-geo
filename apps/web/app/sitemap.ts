import type { MetadataRoute } from 'next';
import { siteUrl } from '../lib/facts';

export default function sitemap(): MetadataRoute.Sitemap {
  const url = siteUrl();
  return [
    { url: `${url}/`, changeFrequency: 'monthly', priority: 1 },
    { url: `${url}/llms.txt`, changeFrequency: 'monthly', priority: 0.5 },
  ];
}
