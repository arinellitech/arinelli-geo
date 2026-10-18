import postgres from 'postgres';
import type { Mode, Provider } from './config.js';

export type Sql = ReturnType<typeof postgres>;

export function connect(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  // prepare:false é obrigatório no transaction pooler do Supabase (porta 6543).
  return postgres(url, { ssl: 'require', max: 5, prepare: false, idle_timeout: 20 });
}

export type PromptRow = { id: string; text: string; category: string; lang: string; active: boolean };

export async function upsertPrompts(sql: Sql, prompts: PromptRow[]): Promise<void> {
  await sql.begin(async (tx) => {
    for (const p of prompts) {
      await tx`
        insert into geo.prompts (id, text, category, lang, active)
        values (${p.id}, ${p.text}, ${p.category}, ${p.lang}, ${p.active})
        on conflict (id) do update
          set text = excluded.text, category = excluded.category,
              lang = excluded.lang, active = excluded.active, updated_at = now()
      `;
    }
    // Prompts removidos do painel ficam inativos, mas o histórico permanece.
    const ids = prompts.map((p) => p.id);
    await tx`update geo.prompts set active = false, updated_at = now() where id <> all(${ids}) and active`;
  });
}

export async function syncOwnDomains(sql: Sql, domains: string[]): Promise<void> {
  const normalized = domains.map((d) => d.toLowerCase().replace(/^https?:\/\//, '').replace(/[/:?#].*$/, ''));
  await sql.begin(async (tx) => {
    await tx`delete from geo.own_domains`;
    for (const d of normalized) await tx`insert into geo.own_domains (domain) values (${d}) on conflict do nothing`;
  });
}

export type Run = { id: string; run_key: string; status: string };

/** Um run por run_key: rerun do mesmo dia retoma onde parou. */
export async function getOrCreateRun(sql: Sql, runKey: string, panelVersion: string, gitSha?: string): Promise<Run> {
  const [run] = await sql<Run[]>`
    insert into geo.runs (run_key, panel_version, git_sha)
    values (${runKey}, ${panelVersion}, ${gitSha ?? null})
    on conflict (run_key) do update
      set status = 'running', finished_at = null, error = null,
          panel_version = excluded.panel_version, git_sha = coalesce(excluded.git_sha, geo.runs.git_sha)
    returning id, run_key, status
  `;
  return run;
}

export async function findRun(sql: Sql, runKey: string): Promise<Run | null> {
  const [run] = await sql<Run[]>`select id, run_key, status from geo.runs where run_key = ${runKey}`;
  return run ?? null;
}

export async function finishRun(sql: Sql, runId: string, status: 'done' | 'failed', error?: string): Promise<void> {
  await sql`update geo.runs set status = ${status}, finished_at = now(), error = ${error ?? null} where id = ${runId}`;
}

export type CellKey = `${string}|${Provider}|${Mode}`;

/** Células já respondidas COM SUCESSO neste run (retoma sem repetir chamadas pagas; erros são tentados de novo). */
export async function existingCells(sql: Sql, runId: string): Promise<Set<CellKey>> {
  const rows = await sql<{ prompt_id: string; provider: Provider; mode: Mode }[]>`
    select prompt_id, provider, mode from geo.responses where run_id = ${runId} and text is not null
  `;
  return new Set(rows.map((r) => `${r.prompt_id}|${r.provider}|${r.mode}` as CellKey));
}

export type NewResponse = {
  runId: string;
  promptId: string;
  provider: Provider;
  model: string;
  mode: Mode;
  text: string | null;
  error: string | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  citations: { url: string; title: string | null }[];
};

/**
 * Resposta + citações numa transação.
 * Conflito na célula: se a existente foi erro, substitui; se foi sucesso, mantém (retorna null).
 */
export async function insertResponse(sql: Sql, r: NewResponse): Promise<string | null> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into geo.responses
        (run_id, prompt_id, provider, model, mode, text, error, latency_ms, input_tokens, output_tokens)
      values
        (${r.runId}, ${r.promptId}, ${r.provider}, ${r.model}, ${r.mode}, ${r.text}, ${r.error},
         ${r.latencyMs}, ${r.inputTokens}, ${r.outputTokens})
      on conflict on constraint responses_one_per_cell do update
        set model = excluded.model, text = excluded.text, error = excluded.error,
            latency_ms = excluded.latency_ms, input_tokens = excluded.input_tokens,
            output_tokens = excluded.output_tokens, created_at = now()
        where geo.responses.text is null
      returning id
    `;
    if (!row) return null;
    for (const c of r.citations) {
      await tx`
        insert into geo.citations (response_id, url, title)
        values (${row.id}, ${c.url}, ${c.title})
        on conflict on constraint citations_one_per_url do nothing
      `;
    }
    return row.id;
  });
}

export type PendingJudgment = {
  id: string;
  prompt_id: string;
  prompt_text: string;
  provider: Provider;
  mode: Mode;
  text: string;
};

export async function responsesNeedingJudgment(sql: Sql, runId?: string): Promise<PendingJudgment[]> {
  return sql<PendingJudgment[]>`
    select rs.id, rs.prompt_id, p.text as prompt_text, rs.provider, rs.mode, rs.text
    from geo.responses rs
    join geo.prompts p on p.id = rs.prompt_id
    left join geo.judgments j on j.response_id = rs.id
    where j.response_id is null
      and rs.text is not null
      ${runId ? sql`and rs.run_id = ${runId}` : sql``}
    order by rs.created_at
  `;
}

export type NewJudgment = {
  responseId: string;
  mentionKind: 'person' | 'project' | 'none';
  position: number | null;
  sentiment: 'positive' | 'neutral' | 'negative' | 'n/a';
  accuracy: 'accurate' | 'partially' | 'inaccurate' | 'n/a';
  inaccuracies: { claim: string; correction: string }[];
  competitors: string[];
  summary: string;
  judgeModel: string;
};

export async function insertJudgment(sql: Sql, j: NewJudgment): Promise<void> {
  await sql`
    insert into geo.judgments
      (response_id, mention_kind, position, sentiment, accuracy, inaccuracies, competitors, summary, judge_model)
    values
      (${j.responseId}, ${j.mentionKind}, ${j.position}, ${j.sentiment}, ${j.accuracy},
       ${sql.json(j.inaccuracies)}, ${sql.json(j.competitors)}, ${j.summary}, ${j.judgeModel})
    on conflict (response_id) do nothing
  `;
}

export type RunSummaryRow = {
  provider: string;
  mode: string;
  answered: number;
  mentioned: number;
  mention_rate_pct: number | null;
  avg_position: number | null;
  inaccurate: number;
};

export async function runSummary(sql: Sql, runKey: string): Promise<RunSummaryRow[]> {
  return sql<RunSummaryRow[]>`
    select provider, mode, answered, mentioned, mention_rate_pct, avg_position, inaccurate
    from geo.v_visibility_by_run where run_key = ${runKey}
    order by provider, mode
  `;
}

export type InaccuracyRow = { provider: string; mode: string; prompt_id: string; claim: string; correction: string };

export async function runInaccuracies(sql: Sql, runKey: string): Promise<InaccuracyRow[]> {
  return sql<InaccuracyRow[]>`
    select provider, mode, prompt_id, claim, correction
    from geo.v_inaccuracies where run_key = ${runKey}
    order by provider, mode, prompt_id
  `;
}

export type CitedDomainRow = { domain: string; citations: number; prompts: number; is_own: boolean };

export async function runCitedDomains(sql: Sql, runKey: string, limit = 15): Promise<CitedDomainRow[]> {
  return sql<CitedDomainRow[]>`
    select c.domain, count(*)::int as citations, count(distinct rs.prompt_id)::int as prompts,
           exists (select 1 from geo.own_domains o where o.domain = c.domain) as is_own
    from geo.citations c
    join geo.responses rs on rs.id = c.response_id
    join geo.runs r on r.id = rs.run_id
    where r.run_key = ${runKey} and rs.mode = 'grounded'
    group by c.domain
    order by citations desc
    limit ${limit}
  `;
}
