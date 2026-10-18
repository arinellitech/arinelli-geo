# AGENTS.md

Instruções para agentes (Claude Code, Codex etc.) trabalhando neste repositório.

## Contexto

Monorepo pnpm. `apps/worker` coleta respostas de modelos e as julga; `apps/web` publica a ficha pública
e o dashboard. `facts.yaml` é a única fonte de fatos sobre a pessoa; `prompts/panel.yaml` é o painel.
Leia o `README.md` antes de qualquer alteração.

## Invariantes (não quebrar)

- Uma resposta por `(run_id, prompt_id, provider, mode)`; um julgamento por resposta; um run por `run_key`.
  Essas regras vivem em constraints no Postgres — não as reimplemente no código nem as relaxe.
- `prompts.id` é chave de histórico: nunca renomeie um id existente; crie outro e desative o antigo.
- `facts.yaml` não recebe nada privado. Tudo ali é publicado no site e no `/llms.txt`.
- O juiz avalia só a RESPOSTA; o nome aparecer no PROMPT não é menção.
- O worker precisa continuar retomável: ao falhar no meio, rodar de novo com o mesmo `run_key` completa o run.

## Como trabalhar

- Antes de mudar o schema: nova migration em `supabase/migrations/` (nunca edite a inicial depois de aplicada).
- Mudou o formato do `panel.yaml` ou do `facts.yaml`: atualize o zod em `apps/worker/src/config.ts` e,
  se afetar o site, o tipo em `apps/web/lib/facts.ts`.
- Ids de modelo (`provider/model`) são configuração, não código. Não os espalhe pelo worker.
- Chamadas a provedores só via AI SDK (`generateText`, `Output.object`, ferramentas nativas de busca).
- Rode `pnpm typecheck` e `pnpm web:build` antes de abrir PR. Para o worker, `pnpm monitor --dry-run`
  valida yaml e planejamento sem gastar API.
- Conteúdo (artigos, READMEs) gerado por agente vai para PR; a pessoa revisa antes de publicar.

## Fora de escopo deste repo

- Postar automaticamente em redes/sites de terceiros.
- Qualquer coisa que tente "injetar" o nome em respostas (prompts enviesados, texto escondido no site).
  O objetivo é medir e publicar fatos, não enganar o crawler.
