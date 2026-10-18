import { generateText, Output } from 'ai';
import pLimit from 'p-limit';
import { z } from 'zod';
import { factsAsText, mentionTargets, type Facts } from './config.js';
import { insertJudgment, responsesNeedingJudgment, type PendingJudgment, type Sql } from './db.js';
import { resolveModel } from './providers.js';

export const judgmentSchema = z.object({
  mention_kind: z
    .enum(['person', 'project', 'none'])
    .describe(
      "'person' se a pessoa-alvo é citada pelo nome (qualquer variação); 'project' se só um projeto dela é citado sem o nome; 'none' caso contrário",
    ),
  position: z
    .number()
    .int()
    .min(1)
    .nullable()
    .describe('Ordem em que a pessoa/projeto aparece entre as recomendações (1 = primeira). null se não mencionada.'),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'n/a']).describe("Tom sobre a pessoa-alvo. 'n/a' se não mencionada."),
  accuracy: z
    .enum(['accurate', 'partially', 'inaccurate', 'n/a'])
    .describe("Afirmações sobre a pessoa-alvo comparadas aos FATOS. 'n/a' se não mencionada."),
  inaccuracies: z
    .array(z.object({ claim: z.string(), correction: z.string() }))
    .max(10)
    .describe('Cada afirmação incorreta sobre a pessoa-alvo e a correção conforme os FATOS. Vazio se não houver.'),
  competitors: z
    .array(z.string())
    .max(10)
    .describe('Outras pessoas, empresas ou projetos recomendados na resposta (nomes exatos). Vazio se não houver.'),
  summary: z.string().max(300).describe('Uma frase, em português, resumindo como a pessoa-alvo aparece (ou não) na resposta.'),
});

export type Judgment = z.infer<typeof judgmentSchema>;

function judgeSystem(facts: Facts): string {
  const t = mentionTargets(facts);
  return [
    'Você é um avaliador imparcial de visibilidade em respostas de IA.',
    'Receberá um PROMPT feito a um assistente e a RESPOSTA desse assistente.',
    'Avalie APENAS a RESPOSTA. O nome da pessoa aparecer no PROMPT não conta como menção.',
    '',
    `Pessoa-alvo: ${t.person.join(' / ')}`,
    `Projetos da pessoa-alvo: ${t.projects.join(', ')}`,
    '',
    'Regras:',
    '- "position": conte as entidades recomendadas na ordem em que aparecem; a posição da pessoa-alvo (ou do projeto, se só ele aparece).',
    '- "accuracy": compare cada afirmação sobre a pessoa-alvo com os FATOS abaixo. Afirmações que os FATOS não cobrem não são erro, a menos que contradigam os FATOS ou a lista de erros conhecidos.',
    '- Não invente menções. Se houver dúvida se "Patrick" é a pessoa-alvo, só conte se houver sobrenome, projeto ou contexto (pagamentos/Pix/Rio) que confirme.',
    '- Seja literal em "competitors": só nomes que a resposta realmente recomenda.',
    '',
    'FATOS:',
    factsAsText(facts),
  ].join('\n');
}

export async function judgeOne(model: string, facts: Facts, r: PendingJudgment): Promise<Judgment> {
  const { output } = await generateText({
    model: resolveModel(model),
    system: judgeSystem(facts),
    prompt: `PROMPT (${r.provider}/${r.mode}):\n${r.prompt_text}\n\nRESPOSTA:\n${r.text}`,
    output: Output.object({ schema: judgmentSchema }),
    abortSignal: AbortSignal.timeout(90_000),
    maxRetries: 2,
  });
  if (!output) throw new Error('juiz não retornou objeto');
  // Invariante do banco: position só quando mencionado. Normaliza antes de gravar.
  if (output.mention_kind === 'none') {
    output.position = null;
    output.sentiment = 'n/a';
    output.accuracy = 'n/a';
    output.inaccuracies = [];
  } else if (output.position == null) {
    output.position = 1;
  }
  return output;
}

export type JudgeStats = { pending: number; ok: number; failed: number };

export async function runJudge(
  sql: Sql,
  model: string,
  facts: Facts,
  opts: { runId?: string; concurrency?: number; log?: (msg: string) => void } = {},
): Promise<JudgeStats> {
  const log = opts.log ?? console.log;
  const pending = await responsesNeedingJudgment(sql, opts.runId);
  const stats: JudgeStats = { pending: pending.length, ok: 0, failed: 0 };
  log(`juiz: ${pending.length} respostas pendentes`);
  const limit = pLimit(opts.concurrency ?? 4);
  await Promise.all(
    pending.map((r) =>
      limit(async () => {
        try {
          const j = await judgeOne(model, facts, r);
          await insertJudgment(sql, {
            responseId: r.id,
            mentionKind: j.mention_kind,
            position: j.position,
            sentiment: j.sentiment,
            accuracy: j.accuracy,
            inaccuracies: j.inaccuracies,
            competitors: j.competitors,
            summary: j.summary,
            judgeModel: model,
          });
          stats.ok++;
          log(`  ${j.mention_kind === 'none' ? '--' : j.mention_kind === 'person' ? 'P#' + j.position : 'p#' + j.position} ${r.provider}/${r.mode} ${r.prompt_id}`);
        } catch (err) {
          stats.failed++;
          const message = err instanceof Error ? err.message : String(err);
          log(`  FAIL juiz ${r.provider}/${r.mode} ${r.prompt_id}: ${message.slice(0, 200)}`);
        }
      }),
    ),
  );
  return stats;
}
