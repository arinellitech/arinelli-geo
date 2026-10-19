-- Role dedicado do worker e do dashboard: só enxerga o schema geo.
-- O banco é compartilhado com outro app, então nada de usar a senha do `postgres` no DATABASE_URL.
--
-- A senha não fica no repo. Depois de aplicar, defina fora da migration:
--   alter role geo_worker with login password '<senha ou verificador SCRAM>';
-- Pelo pooler (porta 6543) o usuário é `geo_worker.<project_ref>`.

do $$
begin
  if not exists (select from pg_roles where rolname = 'geo_worker') then
    create role geo_worker nologin;
  end if;
end
$$;

grant usage on schema geo to geo_worker;
grant select, insert, update, delete on all tables in schema geo to geo_worker;
grant usage, select on all sequences in schema geo to geo_worker;
alter default privileges in schema geo grant select, insert, update, delete on tables to geo_worker;
alter default privileges in schema geo grant usage, select on sequences to geo_worker;

-- RLS está ligado sem policies (nega tudo para quem não é dono). Libera só para o geo_worker.
create policy geo_worker_all on geo.prompts     for all to geo_worker using (true) with check (true);
create policy geo_worker_all on geo.runs        for all to geo_worker using (true) with check (true);
create policy geo_worker_all on geo.responses   for all to geo_worker using (true) with check (true);
create policy geo_worker_all on geo.citations   for all to geo_worker using (true) with check (true);
create policy geo_worker_all on geo.judgments   for all to geo_worker using (true) with check (true);
create policy geo_worker_all on geo.own_domains for all to geo_worker using (true) with check (true);
