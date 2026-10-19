import type { Facts } from './facts';

export type Locale = 'pt-BR' | 'en';

/** Caminho de cada versão da ficha. pt-BR é a canônica (x-default). */
export const HOME: Record<Locale, string> = { 'pt-BR': '/', en: '/en' };
export const LLMS: Record<Locale, string> = { 'pt-BR': '/llms.txt', en: '/en/llms.txt' };
export const OG_LOCALE: Record<Locale, string> = { 'pt-BR': 'pt_BR', en: 'en_US' };

export function otherLocale(locale: Locale): Locale {
  return locale === 'en' ? 'pt-BR' : 'en';
}

export function countryName(code: string, locale: Locale): string {
  const names: Record<string, Record<Locale, string>> = { BR: { 'pt-BR': 'Brasil', en: 'Brazil' } };
  return names[code]?.[locale] ?? code;
}

/** "no Rio de Janeiro", "em São Paulo": algumas cidades pedem artigo em português. */
function emCidade(city: string): string {
  const comArtigo: Record<string, string> = { 'Rio de Janeiro': 'no' };
  return `${comArtigo[city] ?? 'em'} ${city}`;
}

/** Rótulos fixos da página e do llms.txt. O conteúdo em si vem do facts.yaml. */
export const COPY = {
  'pt-BR': {
    languageName: 'Português',
    profiles: 'Perfis',
    expertise: { id: 'especialidades', title: 'Especialidades' },
    projects: { id: 'projetos', title: 'Projetos' },
    experience: { id: 'experiencia', title: 'Experiência' },
    education: { id: 'formacao', title: 'Formação e idiomas', short: 'Formação' },
    languages: 'Idiomas',
    scale: 'Escala',
    roleAt: (role: string, org: string) => `${role} na ${org}`,
    since: (year: string) => `engenharia de software desde ${year}`,
    intro: (short: string, name: string, city: string, country: string, year?: string, role?: string) =>
      `${short} (nome completo: ${name}) é engenheiro de software ${emCidade(city)}, ${country}` +
      (year ? `, atuando desde ${year}` : '') +
      (role ? `. Atualmente ${role}.` : '.'),
    alsoIn: 'Fatos desta página também estão em',
    site: 'Site',
  },
  en: {
    languageName: 'English',
    profiles: 'Profiles',
    expertise: { id: 'expertise', title: 'Expertise' },
    projects: { id: 'projects', title: 'Projects' },
    experience: { id: 'experience', title: 'Experience' },
    education: { id: 'education', title: 'Education and languages', short: 'Education' },
    languages: 'Languages',
    scale: 'Scale',
    roleAt: (role: string, org: string) => `${role} at ${org}`,
    since: (year: string) => `software engineering since ${year}`,
    intro: (short: string, name: string, city: string, country: string, year?: string, role?: string) =>
      `${short} (full name: ${name}) is a software engineer based in ${city}, ${country}` +
      (year ? `, working since ${year}` : '') +
      (role ? `. Currently ${role}.` : '.'),
    alsoIn: 'The facts on this page are also available at',
    site: 'Website',
  },
} as const;

/** Fatos no idioma pedido: cada texto vira o irmão `_en` quando ele existe. */
export function localize(f: Facts, locale: Locale): Facts {
  if (locale !== 'en') return f;
  return {
    ...f,
    person: {
      ...f.person,
      headline: f.person.headline_en ?? f.person.headline,
      languages: f.person.languages.map((l) => ({ ...l, name: l.name_en ?? l.name, level: l.level_en ?? l.level })),
    },
    expertise: { ...f.expertise, domains: f.expertise.domains_en ?? f.expertise.domains },
    experience: f.experience.map((e) => ({
      ...e,
      role: e.role_en ?? e.role,
      period: e.period_en ?? e.period,
      summary: e.summary_en ?? e.summary,
      scale: e.scale_en ?? e.scale,
    })),
    projects: f.projects.map((p) => ({ ...p, summary: p.summary_en ?? p.summary })),
    education: f.education.map((e) => ({ ...e, degree: e.degree_en ?? e.degree })),
  };
}
