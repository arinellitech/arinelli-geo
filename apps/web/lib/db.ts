import postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

declare global {
  // eslint-disable-next-line no-var
  var __geoSql: Sql | undefined;
}

/** Conexão reutilizada entre requests (serverless) — só no servidor, nunca no cliente. */
export function getSql(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!globalThis.__geoSql) {
    globalThis.__geoSql = postgres(url, { ssl: 'require', max: 2, prepare: false, idle_timeout: 20 });
  }
  return globalThis.__geoSql;
}

export type TrendRow = {
  run_key: string;
  provider: string;
  mode: string;
  answered: number;
  mentioned: number;
  mention_rate_pct: number | null;
  avg_position: number | null;
  inaccurate: number;
};

export type CellRow = {
  prompt_id: string;
  category: string;
  lang: string;
  provider: string;
  mode: string;
  errored: boolean;
  mention_kind: string | null;
  position: number | null;
  accuracy: string | null;
};

export type DomainRow = { domain: string; citations: number; prompts: number; providers: number; is_own: boolean };
export type InaccuracyRow = { run_key: string; provider: string; mode: string; prompt_id: string; claim: string; correction: string };

/**
 * Tudo numa transação read-only. Com mais queries em paralelo do que conexões, o postgres.js faz
 * pipelining, e o pooler do Supabase em modo transaction perde a query enfileirada: a página
 * ficava carregando para sempre. Dentro da transação a conexão fica presa ao mesmo backend.
 */
export async function loadDashboard(db: Sql, runs = 30) {
  return db.begin('read only', async (sql) => {
    const [trend, latestRun] = await Promise.all([
      sql<TrendRow[]>`
        select run_key, provider, mode, answered::int, mentioned::int, mention_rate_pct::float, avg_position::float, inaccurate::int
        from geo.v_visibility_by_run
        where run_key in (select run_key from geo.runs order by started_at desc limit ${runs})
        order by run_key desc, provider, mode
      `,
      sql<{ run_key: string }[]>`select run_key from geo.runs order by started_at desc limit 1`,
    ]);
    const runKey = latestRun[0]?.run_key ?? null;
    const [cells, domains, inaccuracies] = runKey
      ? await Promise.all([
          sql<CellRow[]>`
            select prompt_id, category, lang, provider, mode, errored, mention_kind, position, accuracy
            from geo.v_visibility where run_key = ${runKey}
            order by category, prompt_id, provider, mode
          `,
          sql<DomainRow[]>`select domain, citations::int, prompts::int, providers::int, is_own from geo.v_cited_domains limit 25`,
          sql<InaccuracyRow[]>`
            select run_key, provider, mode, prompt_id, claim, correction
            from geo.v_inaccuracies order by run_key desc limit 50
          `,
        ])
      : [[], [], []];
    return { runKey, trend, cells, domains, inaccuracies };
  });
}
