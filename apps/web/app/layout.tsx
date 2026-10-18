import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getFacts, siteUrl } from '../lib/facts';
import { personJsonLd, projectsJsonLd, websiteJsonLd } from '../lib/jsonld';
import './globals.css';

export function generateMetadata(): Metadata {
  const f = getFacts();
  const url = siteUrl();
  return {
    metadataBase: new URL(url),
    title: { default: `${f.person.name} — ${f.person.headline}`, template: `%s · ${f.person.short_name}` },
    description: f.person.headline_en ? `${f.person.headline}. ${f.person.headline_en}.` : f.person.headline,
    alternates: { canonical: '/' },
    openGraph: { type: 'profile', url, title: f.person.name, description: f.person.headline, locale: 'pt_BR' },
    robots: { index: true, follow: true },
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const f = getFacts();
  const jsonLd = [personJsonLd(f), websiteJsonLd(f), ...projectsJsonLd(f)];
  return (
    <html lang="pt-BR">
      <head>
        {jsonLd.map((obj, i) => (
          <script
            key={i}
            type="application/ld+json"
            // JSON-LD precisa ser texto literal no HTML; o replace evita fechar a tag <script>.
            dangerouslySetInnerHTML={{ __html: JSON.stringify(obj).replace(/</g, '\\u003c') }}
          />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}
