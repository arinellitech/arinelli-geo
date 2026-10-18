import './env.js';
import { parseArgs } from 'node:util';
import { loadFacts, loadPanel, PROVIDERS, type Provider } from './config.js';
import { connect, findRun, finishRun, getOrCreateRun, syncOwnDomains, upsertPrompts } from './db.js';
import { runJudge } from './judge.js';
import { pendingCells, runMonitor } from './monitor.js';
import { report } from './report.js';

/**
 * Uso:
 *   pnpm monitor                       # run de hoje: coleta + juiz + relatório (retoma se já existir)
 *   pnpm monitor --run-key 2026-10-18  # força um run_key
 *   pnpm monitor --only openai,google  # só alguns provedores
 *   pnpm monitor --dry-run             # lista as células sem chamar APIs nem gravar no banco
 *   pnpm monitor:judge                 # só julga respostas pendentes (todos os runs)
 */
const { values: args } = parseArgs({
  options: {
    'run-key': { type: 'string' },
    only: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'judge-only': { type: 'boolean', default: false },
    'skip-judge': { type: 'boolean', default: false },
  },
});

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const { panel, version } = loadPanel();
  const facts = loadFacts();
  const sql = connect();

  try {
    if (args['judge-only']) {
      const stats = await runJudge(sql, panel.judge.model, facts, { concurrency: panel.concurrency });
      console.log(`juiz: ${stats.ok} ok, ${stats.failed} falhas`);
      return;
    }

    const onlyProviders = args.only
      ?.split(',')
      .map((s) => s.trim())
      .filter((s): s is Provider => (PROVIDERS as readonly string[]).includes(s));

    const runKey = args['run-key'] ?? todayKey();

    if (args['dry-run']) {
      // Só leitura: lista o que o run faria, sem gravar no banco nem chamar modelos.
      const existing = await findRun(sql, runKey);
      const { all, todo } = await pendingCells(sql, existing?.id ?? null, panel, onlyProviders);
      console.log(`[dry-run] run ${runKey} ${existing ? `(${existing.status})` : '(ainda não existe)'} painel ${version}`);
      console.log(`células: ${all.length} planejadas, ${all.length - todo.length} já feitas, ${todo.length} a executar`);
      for (const c of todo) console.log(`  ${c.provider}/${c.mode} ${c.prompt.id}`);
      return;
    }

    await upsertPrompts(
      sql,
      panel.prompts.map((p) => ({ id: p.id, text: p.text, category: p.category, lang: p.lang, active: p.active })),
    );
    await syncOwnDomains(sql, facts.site.own_domains);

    const run = await getOrCreateRun(sql, runKey, version, process.env.GITHUB_SHA);
    console.log(`run ${run.run_key} (${run.id}) painel ${version}`);

    try {
      const m = await runMonitor(sql, run.id, panel, { onlyProviders });
      console.log(`coleta: ${m.ok} ok, ${m.failed} falhas, ${m.skipped} já existiam`);

      if (!args['skip-judge']) {
        const j = await runJudge(sql, panel.judge.model, facts, { runId: run.id, concurrency: panel.concurrency });
        console.log(`juiz: ${j.ok} ok, ${j.failed} falhas`);
      }

      const status = m.failed > 0 ? 'failed' : 'done';
      await finishRun(sql, run.id, status, m.failed > 0 ? `${m.failed} células falharam` : undefined);
      console.log('\n' + (await report(sql, run.run_key)));
      if (m.failed > 0) process.exitCode = 1;
    } catch (err) {
      await finishRun(sql, run.id, 'failed', err instanceof Error ? err.message : String(err));
      throw err;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
