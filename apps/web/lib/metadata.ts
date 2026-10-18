import type { Metadata } from 'next';
import { getFacts, siteUrl } from './facts';
import { HOME, localize, OG_LOCALE, otherLocale, type Locale } from './i18n';

/** Metadata da ficha em cada idioma, com hreflang apontando uma versão para a outra. */
export function profileMetadata(locale: Locale): Metadata {
  const raw = getFacts();
  const f = localize(raw, locale);
  const url = siteUrl();
  const description =
    locale === 'pt-BR' && raw.person.headline_en
      ? `${raw.person.headline}. ${raw.person.headline_en}.`
      : f.person.headline;
  return {
    metadataBase: new URL(url),
    title: { default: `${f.person.name} — ${f.person.headline}`, template: `%s · ${f.person.short_name}` },
    description,
    alternates: {
      canonical: HOME[locale],
      languages: { 'pt-BR': HOME['pt-BR'], en: HOME.en, 'x-default': HOME['pt-BR'] },
    },
    openGraph: {
      type: 'profile',
      url: new URL(HOME[locale], url).toString(),
      title: f.person.name,
      description: f.person.headline,
      locale: OG_LOCALE[locale],
      alternateLocale: OG_LOCALE[otherLocale(locale)],
    },
    robots: { index: true, follow: true },
  };
}
