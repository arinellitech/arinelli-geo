import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { perplexity } from '@ai-sdk/perplexity';
import type { LanguageModel, ToolSet } from 'ai';
import type { Mode, Provider } from './config.js';

/**
 * Ids de modelo são "provider/model" (formato do Vercel AI Gateway).
 *
 * - Com AI_GATEWAY_API_KEY: a string vai direto para o `ai`, que roteia pelo gateway.
 *   Uma chave só, custo consolidado na conta Vercel.
 * - Sem gateway: usa o SDK de cada provedor com a chave dele
 *   (OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, PERPLEXITY_API_KEY).
 */
export function resolveModel(id: string): LanguageModel {
  if (process.env.AI_GATEWAY_API_KEY) return id;
  const slash = id.indexOf('/');
  if (slash < 0) throw new Error(`Id de modelo inválido (esperado "provider/model"): ${id}`);
  const provider = id.slice(0, slash);
  const model = id.slice(slash + 1);
  switch (provider) {
    case 'openai':
      return openai(model);
    case 'anthropic':
      return anthropic(model);
    case 'google':
      return google(model);
    case 'perplexity':
      return perplexity(model);
    default:
      throw new Error(`Provedor desconhecido: ${provider}`);
  }
}

/** Ferramentas nativas de busca de cada provedor (executadas no lado do provedor). */
export function groundingTools(provider: Provider, mode: Mode): ToolSet | undefined {
  if (mode === 'parametric') return undefined;
  switch (provider) {
    case 'openai':
      return { web_search: openai.tools.webSearch({ searchContextSize: 'medium' }) };
    case 'anthropic':
      return { web_search: anthropic.tools.webSearch_20260318({ maxUses: 5 }) };
    case 'google':
      return { google_search: google.tools.googleSearch({}) };
    case 'perplexity':
      return undefined; // Sonar já busca por padrão
  }
}

/**
 * Instrução de sistema neutra. Não pede para "procurar a pessoa": o objetivo é medir
 * o que o modelo responde a um usuário comum, não induzir a menção.
 */
export function systemFor(mode: Mode, lang: string): string {
  const base =
    lang === 'en'
      ? 'You are a helpful assistant. Answer the question directly. When you recommend people, projects or sources, name them explicitly and, when you know, include links.'
      : 'Você é um assistente útil. Responda diretamente. Ao recomendar pessoas, projetos ou fontes, cite nomes explicitamente e, quando souber, inclua links.';
  if (mode === 'parametric') {
    return (
      base +
      (lang === 'en'
        ? ' Answer only from what you already know; do not say you cannot browse.'
        : ' Responda apenas com o que você já sabe; não diga que não consegue navegar.')
    );
  }
  return base + (lang === 'en' ? ' Use web search to ground your answer.' : ' Use a busca na web para embasar a resposta.');
}
