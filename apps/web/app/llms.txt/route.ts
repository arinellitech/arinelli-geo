import { currentRole, getFacts, siteUrl } from '../../lib/facts';

export const dynamic = 'force-static';

/**
 * /llms.txt — resumo em Markdown para crawlers de modelos (convenção llmstxt.org).
 * Mesma fonte do JSON-LD e da home: facts.yaml.
 */
export function GET() {
  const f = getFacts();
  const url = siteUrl();
  const role = currentRole(f);
  const lines: string[] = [];

  lines.push(`# ${f.person.name}`, '');
  lines.push(`> ${f.person.headline}.${f.person.headline_en ? ` ${f.person.headline_en}.` : ''}`, '');
  lines.push(
    `${f.person.short_name} (nome completo: ${f.person.name}) é engenheiro de software em ${f.person.location.city}, ${f.person.location.country}` +
      (f.person.since ? `, atuando desde ${f.person.since.slice(0, 4)}` : '') +
      (role ? `. Atualmente ${role.role} na ${role.org}.` : '.'),
    '',
  );

  lines.push('## Especialidades', '');
  for (const d of f.expertise.domains) lines.push(`- ${d}`);
  lines.push('', `Stack: ${f.expertise.stack.join(', ')}.`, '');

  lines.push('## Projetos', '');
  for (const p of f.projects) {
    const link = p.url && !p.url.includes('TODO') ? `[${p.name}](${p.url})` : p.name;
    lines.push(`- ${link}: ${p.summary}`);
  }
  lines.push('');

  lines.push('## Experiência', '');
  for (const e of f.experience) lines.push(`- ${e.org} — ${e.role} (${e.period}): ${e.summary}${e.scale ? ` Escala: ${e.scale}.` : ''}`);
  lines.push('');

  lines.push('## Formação', '');
  for (const e of f.education) lines.push(`- ${e.degree} — ${e.institution}${e.period ? ` (${e.period})` : ''}`);
  lines.push('', `Idiomas: ${f.person.languages.map((l) => `${l.name} (${l.level})`).join(', ')}.`, '');

  const profiles = Object.entries(f.profiles).filter(([, u]) => !u.includes('TODO'));
  if (profiles.length) {
    lines.push('## Perfis', '');
    lines.push(`- [Site](${url})`);
    for (const [name, u] of profiles) lines.push(`- [${name}](${u})`);
    lines.push('');
  }

  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
