import { appendFileSync } from 'node:fs';
import { runCitedDomains, runInaccuracies, runSummary, type Sql } from './db.js';

/** Relatório em Markdown: console + $GITHUB_STEP_SUMMARY (aparece na página do job no Actions). */
export async function report(sql: Sql, runKey: string): Promise<string> {
  const [summary, inaccuracies, domains] = await Promise.all([
    runSummary(sql, runKey),
    runInaccuracies(sql, runKey),
    runCitedDomains(sql, runKey),
  ]);

  const lines: string[] = [];
  lines.push(`## GEO monitor — run \`${runKey}\``, '');
  lines.push('| provider | mode | respondidas | menções | taxa | pos. média | imprecisas |');
  lines.push('|---|---|---:|---:|---:|---:|---:|');
  for (const r of summary) {
    lines.push(
      `| ${r.provider} | ${r.mode} | ${r.answered} | ${r.mentioned} | ${r.mention_rate_pct ?? 0}% | ${r.avg_position ?? '—'} | ${r.inaccurate} |`,
    );
  }
  lines.push('');

  lines.push('### Domínios citados (grounded)', '');
  if (domains.length === 0) lines.push('_nenhuma citação_');
  else {
    lines.push('| domínio | citações | prompts | próprio |', '|---|---:|---:|:---:|');
    for (const d of domains) lines.push(`| ${d.domain} | ${d.citations} | ${d.prompts} | ${d.is_own ? '✅' : ''} |`);
  }
  lines.push('');

  lines.push('### Imprecisões sobre a pessoa', '');
  if (inaccuracies.length === 0) lines.push('_nenhuma_');
  else for (const i of inaccuracies) lines.push(`- **${i.provider}/${i.mode}** (${i.prompt_id}): "${i.claim}" → ${i.correction}`);
  lines.push('');

  const md = lines.join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  return md;
}
