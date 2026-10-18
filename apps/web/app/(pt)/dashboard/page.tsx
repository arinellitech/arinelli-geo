import type { Metadata } from 'next';
import { getSql, loadDashboard, type CellRow, type TrendRow } from '../../../lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dashboard', robots: { index: false, follow: false } };

const COLS = [
  'openai/grounded',
  'openai/parametric',
  'anthropic/grounded',
  'anthropic/parametric',
  'google/grounded',
  'google/parametric',
  'perplexity/grounded',
] as const;

function short(col: string) {
  const [p, m] = col.split('/');
  return `${p.slice(0, 4)} ${m === 'grounded' ? 'web' : 'param'}`;
}

export default async function DashboardPage() {
  const sql = getSql();
  if (!sql) {
    return (
      <main>
        <h1>Dashboard</h1>
        <p>Defina DATABASE_URL para o dashboard ler o Supabase.</p>
      </main>
    );
  }
  const data = await loadDashboard(sql);

  if (!data.runKey) {
    return (
      <main>
        <h1>Dashboard</h1>
        <p>
          Nenhum run ainda. Rode <code>pnpm monitor</code> ou dispare o workflow no GitHub Actions.
        </p>
      </main>
    );
  }

  // Pivot tendência: run_key -> coluna -> linha
  const trendByRun = new Map<string, Map<string, TrendRow>>();
  for (const t of data.trend) {
    if (!trendByRun.has(t.run_key)) trendByRun.set(t.run_key, new Map());
    trendByRun.get(t.run_key)!.set(`${t.provider}/${t.mode}`, t);
  }
  const presentCols = COLS.filter((c) => data.trend.some((t) => `${t.provider}/${t.mode}` === c));

  // Pivot último run: prompt -> coluna -> célula
  const cellsByPrompt = new Map<string, { category: string; lang: string; cells: Map<string, CellRow> }>();
  for (const c of data.cells) {
    if (!cellsByPrompt.has(c.prompt_id)) cellsByPrompt.set(c.prompt_id, { category: c.category, lang: c.lang, cells: new Map() });
    cellsByPrompt.get(c.prompt_id)!.cells.set(`${c.provider}/${c.mode}`, c);
  }

  return (
    <main>
      <h1>GEO monitor</h1>
      <p className="muted">
        Último run: <strong>{data.runKey}</strong> · {trendByRun.size} runs no histórico
      </p>

      <h2>Taxa de menção por run</h2>
      <table>
        <thead>
          <tr>
            <th>run</th>
            {presentCols.map((c) => (
              <th key={c} className="num">
                {short(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...trendByRun.entries()].map(([runKey, cols]) => (
            <tr key={runKey}>
              <td>{runKey}</td>
              {presentCols.map((c) => {
                const t = cols.get(c);
                return (
                  <td key={c} className="num" title={t ? `${t.mentioned}/${t.answered} · pos. média ${t.avg_position ?? '—'} · imprecisas ${t.inaccurate}` : ''}>
                    {t ? `${t.mention_rate_pct ?? 0}%` : '·'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Último run por prompt</h2>
      <p className="muted">
        <span className="pill person">P#n</span> pessoa citada na posição n · <span className="pill project">p#n</span> só projeto · — não citado ·{' '}
        <span className="pill err">err</span> falha · ⚠ imprecisão
      </p>
      <table>
        <thead>
          <tr>
            <th>prompt</th>
            {presentCols.map((c) => (
              <th key={c}>{short(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...cellsByPrompt.entries()].map(([promptId, row]) => (
            <tr key={promptId}>
              <td>
                <span className="muted">{row.category}</span> {promptId}
              </td>
              {presentCols.map((c) => {
                const cell = row.cells.get(c);
                if (!cell) return <td key={c}>·</td>;
                if (cell.errored)
                  return (
                    <td key={c}>
                      <span className="pill err">err</span>
                    </td>
                  );
                if (!cell.mention_kind) return <td key={c}>…</td>;
                if (cell.mention_kind === 'none') return <td key={c}>—</td>;
                const warn = cell.accuracy === 'inaccurate' || cell.accuracy === 'partially' ? ' ⚠' : '';
                return (
                  <td key={c}>
                    <span className={`pill ${cell.mention_kind}`}>
                      {cell.mention_kind === 'person' ? 'P' : 'p'}#{cell.position}
                    </span>
                    {warn}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Domínios citados (modos com busca)</h2>
      <p className="muted">Onde os modelos buscam resposta para esses prompts = onde vale publicar. ✅ = domínio seu.</p>
      <table>
        <thead>
          <tr>
            <th>domínio</th>
            <th className="num">citações</th>
            <th className="num">prompts</th>
            <th className="num">provedores</th>
            <th>seu</th>
          </tr>
        </thead>
        <tbody>
          {data.domains.map((d) => (
            <tr key={d.domain}>
              <td>{d.domain}</td>
              <td className="num">{d.citations}</td>
              <td className="num">{d.prompts}</td>
              <td className="num">{d.providers}</td>
              <td>{d.is_own ? '✅' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Imprecisões recentes</h2>
      {data.inaccuracies.length === 0 ? (
        <p className="muted">Nenhuma registrada.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>run</th>
              <th>onde</th>
              <th>afirmação</th>
              <th>correção</th>
            </tr>
          </thead>
          <tbody>
            {data.inaccuracies.map((i, idx) => (
              <tr key={idx}>
                <td>{i.run_key}</td>
                <td>
                  {i.provider}/{i.mode}
                  <br />
                  <span className="muted">{i.prompt_id}</span>
                </td>
                <td>{i.claim}</td>
                <td>{i.correction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
