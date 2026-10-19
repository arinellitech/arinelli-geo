-- Role só de leitura para o dashboard (apps/web). O geo_worker continua com o worker.
-- Enxerga as views do dashboard e geo.runs; as views são do postgres (sem security_invoker),
-- então não precisam de grant nas tabelas por baixo. View nova no dashboard: grant select aqui.
--
-- A senha não fica no repo. Depois de aplicar, defina fora da migration:
--   alter role geo_reader with login password '<senha>';
-- Pelo pooler (porta 6543) o usuário é `geo_reader.<project_ref>`.

do $$
begin
  if not exists (select from pg_roles where rolname = 'geo_reader') then
    create role geo_reader nologin;
  end if;
end
$$;

-- Mesmo que alguém esqueça o begin read only no código, toda transação do role é read-only.
alter role geo_reader set default_transaction_read_only = on;

grant usage on schema geo to geo_reader;
grant select on geo.runs, geo.v_visibility, geo.v_visibility_by_run, geo.v_cited_domains, geo.v_inaccuracies to geo_reader;

-- geo.runs tem RLS sem policy para este role.
create policy geo_reader_select on geo.runs for select to geo_reader using (true);
