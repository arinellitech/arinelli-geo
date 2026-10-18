import type { MetadataRoute } from 'next';
import { siteUrl } from '../lib/facts';

/**
 * Libera explicitamente os crawlers de IA. Deixar só "*" costuma bastar, mas alguns
 * operadores leem a regra nominal como sinal de permissão para uso em treino/busca.
 */
const AI_BOTS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Googlebot',
  'Bingbot',
  'Applebot',
  'Applebot-Extended',
  'CCBot',
  'meta-externalagent',
  'DuckAssistBot',
];

export default function robots(): MetadataRoute.Robots {
  const url = siteUrl();
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/dashboard', '/dashboard/'] },
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: '/', disallow: ['/dashboard', '/dashboard/'] })),
    ],
    sitemap: `${url}/sitemap.xml`,
    host: url,
  };
}
