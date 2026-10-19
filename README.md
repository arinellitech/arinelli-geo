# arinelli-geo

Programa de GEO (Generative Engine Optimization) para o nome **Patrick Arinelli Rodrigues**: mede como os
modelos (OpenAI, Anthropic, Gemini, Perplexity) respondem a um painel de prompts, detecta menções e
alucinações, mostra onde os modelos buscam fontes — e publica a "ficha" canônica que eles devem citar.

```
facts.yaml            fonte única de fatos públicos  → site, llms.txt, JSON-LD e juiz leem daqui
prompts/panel.yaml    painel de prompts, modelos por provedor, modelo do juiz
supabase/migrations/  schema (geo.*) com invariantes no banco
apps/worker           coleta (prompt × provedor × modo) + juiz + relatório   [Node/TS, AI SDK]
apps/web              site público (Person JSON-LD, /llms.txt, robots) + /dashboard  [Next.js]
.github/workflows     cron semanal que roda o worker
```

## Como funciona

1. **Coleta.** Para cada prompt ativo × provedor × modo, o worker chama o modelo e grava a resposta, latência,
   tokens e as URLs citadas (`result.sources`).
   - `grounded` = modelo com ferramenta de busca nativa (web_search / google_search / Sonar). Reage a conteúdo
     novo em dias.
   - `parametric` = sem busca. Só muda quando o modelo é retreinado. Medir separado evita confundir os dois.
2. **Juiz.** Um modelo barato lê cada resposta junto com `facts.yaml` e devolve um objeto tipado:
   `mention_kind` (person / project / none), `position`, `sentiment`, `accuracy`, `inaccuracies[]`,
   `competitors[]`, `summary`.
3. **Relatório.** Taxa de menção por provedor/modo, domínios citados (com flag de "domínio seu") e
   imprecisões — no console, no resumo do job do Actions e no `/dashboard`.

Idempotência está no banco, não no código: uma resposta por `(run, prompt, provider, mode)`, um run por
`run_key`. Rodar duas vezes no mesmo dia retoma o que faltou (inclusive células que falharam) sem repetir
chamadas pagas.

## Setup

### 1. Banco (Supabase)

Aplique as migrations de `supabase/migrations/` em ordem (SQL editor ou `supabase db push`). A segunda cria o
role `geo_worker`, que só enxerga o schema `geo`; defina a senha dele fora do repo
(`alter role geo_worker with login password '...'`). O banco pode ser compartilhado com outro app, então o
`DATABASE_URL` usa esse role, nunca o `postgres`: Transaction pooler (porta 6543) com usuário
`geo_worker.<project_ref>`. A terceira cria o `geo_reader`, só de leitura, para o dashboard: só lê as views e
`geo.runs`, e toda transação dele é read-only. Mesma coisa: `alter role geo_reader with login password '...'`.

### 2. Fatos e prompts

- Preencha os `TODO` em `facts.yaml` (domínio do site, GitHub, LinkedIn, URLs dos repos). Revise cada linha:
  é exatamente isso que o site vai publicar e que o juiz vai usar como verdade. Cada texto tem um irmão
  `_en` (`headline_en`, `summary_en`…) que alimenta a versão em inglês em `/en`.
- Ajuste `prompts/panel.yaml`. Confira os ids de modelo em <https://vercel.com/ai-gateway/models> — eles mudam.
  Mantenha os ids dos prompts estáveis (são a chave do histórico).

### 3. Chaves

Copie `.env.example` para `.env`. Com `AI_GATEWAY_API_KEY` definida, tudo passa pelo AI Gateway da Vercel
(uma chave, uma fatura). Sem ela, o worker usa as chaves diretas de cada provedor.

### 4. Rodar local

```bash
pnpm install
pnpm monitor --dry-run          # lista as células sem chamar nada
pnpm monitor --only openai      # um provedor só, para validar
pnpm monitor                    # run completo do dia
pnpm monitor:judge              # julga respostas ainda sem julgamento (qualquer run)
pnpm web:dev                    # site + dashboard em http://localhost:3000
```

O juiz só avalia respostas sem julgamento. Se você mudar `facts.yaml` e quiser re-julgar o histórico,
apague os julgamentos (`delete from geo.judgments`) e rode `pnpm monitor:judge`.

### 5. Agendar (GitHub Actions)

Secrets do repositório: `DATABASE_URL` e `AI_GATEWAY_API_KEY` (ou as chaves diretas). O workflow roda toda
segunda às 06:17 (Brasília) e pode ser disparado à mão com `run_key`, `only` e `dry_run`.

Custo de referência com o painel inicial (22 prompts → 154 chamadas + 154 julgamentos): uns US$ 2,50–3,50 por
run completo (preços do AI Gateway em out/2026). O que pesa é o modo `grounded`: as buscas nativas são cobradas
por chamada e os resultados entram como tokens de entrada (no run da OpenAI, ~27 mil por resposta). A Anthropic
com Sonnet é o provedor mais caro. Semanal dá uns US$ 10–15/mês; diário passaria de US$ 75/mês.

### 6. Deploy do site (Vercel)

Root directory `apps/web`, framework Next.js. Variáveis: `DATABASE_URL` (com o `geo_reader`, não o `geo_worker`),
`DASHBOARD_USER`, `DASHBOARD_PASSWORD`.
O deploy sai do workflow `.github/workflows/deploy.yml` (CLI da Vercel), não da integração Git nativa: o login da
Vercel está ligado a outra conta GitHub e não enxerga este repo. Push na `main` publica em produção; PR ganha
preview com o link comentado. Secret necessário: `VERCEL_TOKEN` (vercel.com/account/tokens, escopo no time).
O `next.config.ts` já inclui `../../facts.yaml` no trace do build. As funções rodam em `sin1` (`apps/web/vercel.json`),
ao lado do Supabase em ap-southeast-1: só o `/dashboard` usa o banco, e com a função longe dele cada carga levava
3–7 s. Se o banco mudar de região, mude essa também. Depois do deploy, confira:

- `/` com `<script type="application/ld+json">` de `Person` (valide em <https://validator.schema.org>)
- `/llms.txt`, `/robots.txt`, `/sitemap.xml`
- `/en` e `/en/llms.txt` em inglês, com `hreflang` apontando uma versão para a outra
- `/dashboard` pedindo Basic auth

## O que mexe o ponteiro

O monitor diz **onde** você está; o que muda a resposta dos modelos é o que está publicado:

1. O mesmo texto de `facts.yaml` nos perfis (GitHub bio, LinkedIn "Sobre", READMEs dos projetos). Consistência
   entre fontes é o sinal mais forte de entidade.
2. READMEs dos repos de pagamentos com o problema no título (idempotência Pix, Outbox, ledger de partidas
   dobradas) — são o que os modos grounded encontram para prompts de `expertise`.
3. Artigos técnicos nos domínios que `v_cited_domains` mostrar como mais citados (dev.to, Medium, GitHub…).
   Publique onde os modelos já leem, não só no seu site.
4. Alimente `corrections:` em `facts.yaml` com o que `v_inaccuracies` repetir; depois publique a correção
   em texto claro em algum lugar indexado.

## Decisões

- **TypeScript ponta a ponta** (worker + site) — uma linguagem, zero infra nova, Vercel + Supabase já existentes.
- **AI SDK** como camada única para os quatro provedores e para a saída estruturada do juiz.
- **GitHub Actions como scheduler**, não Vercel Cron: roda longo, grátis, e o repositório já está lá.
- **Postgres como estado durável**, com constraints carregando as invariantes; views para o dashboard.
- **Sem Python** no projeto: um juiz com `Output.object` não justifica uma terceira linguagem.
