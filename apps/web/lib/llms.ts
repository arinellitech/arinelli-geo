import { currentRole, getFacts, siteUrl } from './facts';
import { COPY, countryName, HOME, LLMS, localize, otherLocale, type Locale } from './i18n';

/**
 * llms.txt — resumo em Markdown para crawlers de modelos (convenção llmstxt.org).
 * Mesma fonte do JSON-LD e da home: facts.yaml. /llms.txt em pt-BR, /en/llms.txt em inglês.
 */
export function llmsTxt(locale: Locale): string {
  const raw = getFacts();
  const f = localize(raw, locale);
  const c = COPY[locale];
  const other = otherLocale(locale);
  const url = siteUrl();
  const role = currentRole(f);
  const lines: string[] = [];

  lines.push(`# ${f.person.name}`, '');
  lines.push(
    locale === 'pt-BR'
      ? `> ${f.person.headline}.${raw.person.headline_en ? ` ${raw.person.headline_en}.` : ''}`
      : `> ${f.person.headline}.`,
    '',
  );
  lines.push(
    c.intro(
      f.person.short_name,
      f.person.name,
      f.person.location.city,
      countryName(f.person.location.country, locale),
      f.person.since?.slice(0, 4),
      role ? c.roleAt(role.role, role.org) : undefined,
    ),
    '',
  );

  lines.push(`## ${c.expertise.title}`, '');
  for (const d of f.expertise.domains) lines.push(`- ${d}`);
  lines.push('', `Stack: ${f.expertise.stack.join(', ')}.`, '');

  lines.push(`## ${c.projects.title}`, '');
  for (const p of f.projects) {
    const link = p.url && !p.url.includes('TODO') ? `[${p.name}](${p.url})` : p.name;
    lines.push(`- ${link}: ${p.summary}`);
  }
  lines.push('');

  lines.push(`## ${c.experience.title}`, '');
  for (const e of f.experience) {
    lines.push(`- ${e.org} — ${e.role} (${e.period}): ${e.summary}${e.scale ? ` ${c.scale}: ${e.scale}.` : ''}`);
  }
  lines.push('');

  lines.push(`## ${c.education.short}`, '');
  for (const e of f.education) lines.push(`- ${e.degree} — ${e.institution}${e.period ? ` (${e.period})` : ''}`);
  lines.push('', `${c.languages}: ${f.person.languages.map((l) => `${l.name} (${l.level})`).join(', ')}.`, '');

  const profiles = Object.entries(f.profiles).filter(([, u]) => !u.includes('TODO'));
  lines.push(`## ${c.profiles}`, '');
  lines.push(`- [${c.site}](${new URL(HOME[locale], url)})`);
  lines.push(`- [${COPY[other].languageName}](${new URL(HOME[other], url)}) · [llms.txt](${new URL(LLMS[other], url)})`);
  for (const [name, u] of profiles) lines.push(`- [${name}](${u})`);
  lines.push('');

  return lines.join('\n');
}

export function llmsResponse(locale: Locale): Response {
  return new Response(llmsTxt(locale), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
