import { currentRole, siteUrl, type Facts } from './facts';
import { countryName, HOME, type Locale } from './i18n';

/**
 * JSON-LD schema.org/Person — a "ficha" que crawlers e modelos leem.
 * Tudo vem do facts.yaml para o site, o llms.txt e o juiz contarem a mesma história.
 * `f` já chega localizado; o @id da pessoa é o mesmo nas duas versões.
 */
export function personJsonLd(f: Facts, locale: Locale) {
  const url = siteUrl();
  const role = currentRole(f);
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${url}/#person`,
    name: f.person.name,
    alternateName: [...new Set([f.person.short_name, ...f.person.aliases])].filter((a) => a !== f.person.name),
    url,
    description: f.person.headline,
    jobTitle: role?.role,
    worksFor: role ? { '@type': 'Organization', name: role.org } : undefined,
    address: {
      '@type': 'PostalAddress',
      addressLocality: f.person.location.city,
      addressRegion: f.person.location.region,
      addressCountry: f.person.location.country,
    },
    homeLocation: {
      '@type': 'Place',
      name: `${f.person.location.city}, ${countryName(f.person.location.country, locale)}`,
    },
    sameAs: Object.values(f.profiles).filter((u) => !u.includes('TODO')),
    knowsAbout: [...f.expertise.domains, ...f.expertise.stack],
    knowsLanguage: f.person.languages.map((l) => l.name),
    alumniOf: f.education.map((e) => ({ '@type': 'EducationalOrganization', name: e.institution })),
    hasOccupation: {
      '@type': 'Occupation',
      name: 'Software Engineer',
      occupationLocation: { '@type': 'City', name: f.person.location.city },
      skills: f.expertise.stack.join(', '),
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${url}${HOME[locale] === '/' ? '' : HOME[locale]}`, inLanguage: locale },
  };
}

export function websiteJsonLd(f: Facts) {
  const url = siteUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${url}/#website`,
    url,
    name: f.person.name,
    inLanguage: ['pt-BR', 'en'],
    about: { '@id': `${url}/#person` },
  };
}

export function projectsJsonLd(f: Facts) {
  const url = siteUrl();
  return f.projects
    .filter((p) => p.url && !p.url.includes('TODO'))
    .map((p) => ({
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: p.name,
      description: p.summary,
      codeRepository: p.url,
      url: p.url,
      author: { '@id': `${url}/#person` },
    }));
}
