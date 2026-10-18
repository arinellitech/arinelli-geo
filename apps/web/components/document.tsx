import type { ReactNode } from 'react';
import { getFacts } from '../lib/facts';
import { localize, type Locale } from '../lib/i18n';
import { personJsonLd, projectsJsonLd, websiteJsonLd } from '../lib/jsonld';

/**
 * <html> de cada root layout: (pt) e (en) só diferem no idioma, então o documento
 * e o JSON-LD saem daqui, já localizados.
 */
export function Document({ locale, children }: { locale: Locale; children: ReactNode }) {
  const f = localize(getFacts(), locale);
  const jsonLd = [personJsonLd(f, locale), websiteJsonLd(f), ...projectsJsonLd(f)];
  return (
    <html lang={locale}>
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
