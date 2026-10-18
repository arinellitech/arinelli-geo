-- GEO monitor: schema inicial
-- Invariantes garantidas no banco (não no worker):
--   * uma resposta por (run, prompt, provider, mode)  -> re-execução é idempotente
--   * um julgamento por resposta
--   * uma citação por (resposta, url)
--   * um run por run_key (ex.: 2026-10-18) -> rerun do mesmo dia retoma em vez de duplicar

create schema if not exists geo;

create table geo.prompts (
  id          text primary key,                     -- slug estável, vem do prompts/panel.yaml
  text        text not null,
  category    text not null check (category in ('name','expertise','project','comparison','local')),
  lang        text not null default 'pt-BR',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table geo.runs (
  id            uuid primary key default gen_random_uuid(),
  run_key       text not null unique,               -- 'YYYY-MM-DD' (ou 'YYYY-MM-DD-manual-<n>')
  panel_version text,                               -- hash do panel.yaml no momento do run
  git_sha       text,
  status        text not null default 'running' check (status in ('running','done','failed')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  error         text
);

create table geo.responses (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null references geo.runs(id) on delete cascade,
  prompt_id     text not null references geo.prompts(id),
  provider      text not null check (provider in ('openai','anthropic','google','perplexity')),
  model         text not null,
  mode          text not null check (mode in ('grounded','parametric')),
  text          text,                               -- null quando houve erro
  error         text,
  latency_ms    integer,
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz not null default now(),
  constraint responses_one_per_cell unique (run_id, prompt_id, provider, mode),
  constraint responses_text_or_error check (text is not null or error is not null)
);

create index responses_prompt_idx on geo.responses (prompt_id, provider, mode, created_at desc);

create table geo.citations (
  id          bigserial primary key,
  response_id uuid not null references geo.responses(id) on delete cascade,
  url         text not null,
  domain      text generated always as (
                lower(regexp_replace(regexp_replace(url, '^https?://', ''), '[/:?#].*$', ''))
              ) stored,
  title       text,
  constraint citations_one_per_url unique (response_id, url)
);

create index citations_domain_idx on geo.citations (domain);

create table geo.judgments (
  response_id   uuid primary key references geo.responses(id) on delete cascade,
  mention_kind  text not null check (mention_kind in ('person','project','none')),
  -- 'person'  = a pessoa foi citada pelo nome
  -- 'project' = só um projeto dela foi citado (meia vitória: falta ligar o nome ao projeto)
  mentioned     boolean not null generated always as (mention_kind <> 'none') stored,
  position      smallint check (position is null or position >= 1),   -- null se não mencionado
  sentiment     text not null check (sentiment in ('positive','neutral','negative','n/a')),
  accuracy      text not null check (accuracy in ('accurate','partially','inaccurate','n/a')),
  inaccuracies  jsonb not null default '[]'::jsonb,   -- [{claim, correction}]
  competitors   jsonb not null default '[]'::jsonb,   -- outras pessoas/entidades recomendadas
  summary       text,
  judge_model   text not null,
  created_at    timestamptz not null default now(),
  constraint judgments_position_iff_mentioned check (
    (mention_kind <> 'none' and position is not null) or (mention_kind = 'none' and position is null)
  )
);

-- Visibilidade por célula (prompt x provider x mode) em cada run
create view geo.v_visibility as
select
  r.run_key,
  r.started_at as run_at,
  p.id         as prompt_id,
  p.category,
  p.lang,
  rs.provider,
  rs.model,
  rs.mode,
  rs.error is not null as errored,
  j.mention_kind,
  j.mentioned,
  j.position,
  j.sentiment,
  j.accuracy,
  (select count(*) from geo.citations c where c.response_id = rs.id) as citation_count
from geo.responses rs
join geo.runs    r on r.id = rs.run_id
join geo.prompts p on p.id = rs.prompt_id
left join geo.judgments j on j.response_id = rs.id;

-- Série temporal: taxa de menção e posição média por run/provider/mode
create view geo.v_visibility_by_run as
select
  run_key,
  min(run_at) as run_at,
  provider,
  mode,
  count(*) filter (where not errored)                      as answered,
  count(*) filter (where mentioned)                        as mentioned,
  round(100.0 * count(*) filter (where mentioned)
        / nullif(count(*) filter (where not errored), 0), 1) as mention_rate_pct,
  round(avg(position) filter (where mentioned), 2)         as avg_position,
  count(*) filter (where accuracy = 'inaccurate')          as inaccurate
from geo.v_visibility
group by run_key, provider, mode;

-- Domínios próprios (site, GitHub, LinkedIn...) — o worker sincroniza a partir do facts.yaml
create table geo.own_domains (
  domain text primary key
);

-- Quais domínios os modos grounded citam (= onde vale publicar)
create view geo.v_cited_domains as
select
  c.domain,
  count(*)                          as citations,
  count(distinct rs.prompt_id)      as prompts,
  count(distinct rs.provider)       as providers,
  exists (select 1 from geo.own_domains o where o.domain = c.domain) as is_own
from geo.citations c
join geo.responses rs on rs.id = c.response_id
where rs.mode = 'grounded'
group by c.domain
order by citations desc;

-- Alucinações recorrentes sobre a pessoa
create view geo.v_inaccuracies as
select
  r.run_key,
  rs.provider,
  rs.mode,
  p.id as prompt_id,
  x->>'claim'      as claim,
  x->>'correction' as correction
from geo.judgments j
join geo.responses rs on rs.id = j.response_id
join geo.runs r on r.id = rs.run_id
join geo.prompts p on p.id = rs.prompt_id
cross join lateral jsonb_array_elements(j.inaccuracies) x
where j.accuracy in ('partially','inaccurate');

-- RLS: o worker usa a connection string direta (bypassa RLS). O dashboard lê via
-- service role no servidor. Nada aqui é exposto ao cliente anônimo.
alter table geo.own_domains enable row level security;
alter table geo.prompts   enable row level security;
alter table geo.runs      enable row level security;
alter table geo.responses enable row level security;
alter table geo.citations enable row level security;
alter table geo.judgments enable row level security;
