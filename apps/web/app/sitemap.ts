import type { MetadataRoute } from 'next';
import { siteUrl } from '../lib/facts';
import { HOME, LLMS } from '../lib/i18n';

export default function sitemap(): MetadataRoute.Sitemap {
  const url = siteUrl();
  const languages = { 'pt-BR': `${url}${HOME['pt-BR']}`, en: `${url}${HOME.en}` };
  return [
    { url: `${url}${HOME['pt-BR']}`, changeFrequency: 'monthly', priority: 1, alternates: { languages } },
    { url: `${url}${HOME.en}`, changeFrequency: 'monthly', priority: 1, alternates: { languages } },
    { url: `${url}${LLMS['pt-BR']}`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${url}${LLMS.en}`, changeFrequency: 'monthly', priority: 0.5 },
  ];
}
