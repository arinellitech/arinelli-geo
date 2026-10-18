import { generateText } from 'ai';
import pLimit from 'p-limit';
import type { Mode, Panel, PanelPrompt, Provider } from './config.js';
import { PROVIDERS } from './config.js';
import { existingCells, insertResponse, type Sql } from './db.js';
import { groundingTools, resolveModel, systemFor } from './providers.js';

export type Cell = { prompt: PanelPrompt; provider: Provider; model: string; mode: Mode };

/** Produto prompts × provedores × modos, respeitando overrides por prompt. */
export function planCells(panel: Panel, onlyProviders?: Provider[]): Cell[] {
  const cells: Cell[] = [];
  for (const prompt of panel.prompts) {
    if (!prompt.active) continue;
    for (const provider of PROVIDERS) {
      const cfg = panel.providers[provider];
      if (!cfg) continue;
      if (onlyProviders && !onlyProviders.includes(provider)) continue;
      const modes = cfg.modes.filter((m) => !prompt.modes || prompt.modes.includes(m));
      for (const mode of modes) cells.push({ prompt, provider, model: cfg.model, mode });
    }
  }
  return cells;
}

export type MonitorStats = { planned: number; skipped: number; ok: number; failed: number };

export async function runMonitor(
  sql: Sql,
  runId: string,
  panel: Panel,
  opts: { onlyProviders?: Provider[]; dryRun?: boolean; log?: (msg: string) => void } = {},
): Promise<MonitorStats> {
  const log = opts.log ?? console.log;
  const all = planCells(panel, opts.onlyProviders);
  const done = await existingCells(sql, runId);
  const todo = all.filter((c) => !done.has(`${c.prompt.id}|${c.provider}|${c.mode}`));
  const stats: MonitorStats = { planned: all.length, skipped: all.length - todo.length, ok: 0, failed: 0 };
  log(`células: ${all.length} planejadas, ${stats.skipped} já feitas, ${todo.length} a executar`);
  if (opts.dryRun) {
    for (const c of todo) log(`  [dry-run] ${c.provider}/${c.mode} ${c.prompt.id}`);
    return stats;
  }

  const limit = pLimit(panel.concurrency);
  await Promise.all(
    todo.map((cell) =>
      limit(async () => {
        const started = Date.now();
        try {
          const result = await generateText({
            model: resolveModel(cell.model),
            system: systemFor(cell.mode, cell.prompt.lang),
            prompt: cell.prompt.text,
            tools: groundingTools(cell.provider, cell.mode),
            abortSignal: AbortSignal.timeout(180_000),
            maxRetries: 2,
          });
          const citations = dedupe(
            result.sources
              .filter((s): s is Extract<typeof s, { sourceType: 'url' }> => s.sourceType === 'url')
              .map((s) => ({ url: s.url, title: s.title ?? null })),
          );
          await insertResponse(sql, {
            runId,
            promptId: cell.prompt.id,
            provider: cell.provider,
            model: cell.model,
            mode: cell.mode,
            text: result.text,
            error: null,
            latencyMs: Date.now() - started,
            inputTokens: result.usage.inputTokens ?? null,
            outputTokens: result.usage.outputTokens ?? null,
            citations,
          });
          stats.ok++;
          log(`  ok   ${cell.provider}/${cell.mode} ${cell.prompt.id} (${citations.length} fontes)`);
        } catch (err) {
          const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          await insertResponse(sql, {
            runId,
            promptId: cell.prompt.id,
            provider: cell.provider,
            model: cell.model,
            mode: cell.mode,
            text: null,
            error: message.slice(0, 2000),
            latencyMs: Date.now() - started,
            inputTokens: null,
            outputTokens: null,
            citations: [],
          });
          stats.failed++;
          log(`  FAIL ${cell.provider}/${cell.mode} ${cell.prompt.id}: ${message.slice(0, 200)}`);
        }
      }),
    ),
  );
  return stats;
}

function dedupe(items: { url: string; title: string | null }[]): { url: string; title: string | null }[] {
  const seen = new Map<string, { url: string; title: string | null }>();
  for (const it of items) {
    const key = it.url.replace(/[#?].*$/, '').replace(/\/$/, '');
    if (!seen.has(key)) seen.set(key, { url: key, title: it.title });
  }
  return [...seen.values()];
}
