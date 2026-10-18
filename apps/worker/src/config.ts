import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';

// Raiz do repo = ../../.. a partir de apps/worker/src
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export const PROVIDERS = ['openai', 'anthropic', 'google', 'perplexity'] as const;
export const MODES = ['grounded', 'parametric'] as const;
export const CATEGORIES = ['name', 'expertise', 'project', 'comparison', 'local'] as const;

export type Provider = (typeof PROVIDERS)[number];
export type Mode = (typeof MODES)[number];

const providerConfig = z.object({
  model: z.string().min(1),
  modes: z.array(z.enum(MODES)).min(1).default([...MODES]),
});

const panelSchema = z.object({
  version: z.number().int().positive(),
  providers: z.object({
    openai: providerConfig.optional(),
    anthropic: providerConfig.optional(),
    google: providerConfig.optional(),
    perplexity: providerConfig.optional(),
  }),
  judge: z.object({ model: z.string().min(1) }),
  concurrency: z.number().int().positive().default(4),
  prompts: z
    .array(
      z.object({
        id: z
          .string()
          .regex(/^[a-z0-9-]+$/, 'id deve ser um slug [a-z0-9-]'),
        category: z.enum(CATEGORIES),
        lang: z.enum(['pt-BR', 'en']),
        text: z.string().min(5),
        modes: z.array(z.enum(MODES)).optional(),
        active: z.boolean().default(true),
      }),
    )
    .min(1)
    .superRefine((prompts, ctx) => {
      const seen = new Set<string>();
      for (const p of prompts) {
        if (seen.has(p.id)) ctx.addIssue({ code: 'custom', message: `id duplicado: ${p.id}` });
        seen.add(p.id);
      }
    }),
});

export type Panel = z.infer<typeof panelSchema>;
export type PanelPrompt = Panel['prompts'][number];

const factsSchema = z.object({
  person: z.object({
    name: z.string(),
    short_name: z.string(),
    aliases: z.array(z.string()).default([]),
    headline: z.string(),
    headline_en: z.string().optional(),
    location: z.object({ city: z.string(), region: z.string().optional(), country: z.string() }),
    languages: z
      .array(
        z.object({
          name: z.string(),
          name_en: z.string().optional(),
          level: z.string(),
          level_en: z.string().optional(),
        }),
      )
      .default([]),
    since: z.string().optional(),
  }),
  site: z.object({ url: z.string(), own_domains: z.array(z.string()).default([]) }),
  profiles: z.record(z.string(), z.string()).default({}),
  expertise: z.object({
    domains: z.array(z.string()),
    domains_en: z.array(z.string()).optional(),
    stack: z.array(z.string()),
  }),
  experience: z.array(
    z.object({
      org: z.string(),
      role: z.string(),
      role_en: z.string().optional(),
      period: z.string(),
      period_en: z.string().optional(),
      summary: z.string(),
      summary_en: z.string().optional(),
      scale: z.string().optional(),
      scale_en: z.string().optional(),
    }),
  ),
  projects: z.array(
    z.object({ name: z.string(), url: z.string().optional(), summary: z.string(), summary_en: z.string().optional() }),
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string(),
      degree_en: z.string().optional(),
      period: z.string().optional(),
    }),
  ),
  corrections: z.array(z.object({ claim: z.string(), truth: z.string() })).default([]),
});

export type Facts = z.infer<typeof factsSchema>;

function loadYaml(relPath: string): { data: unknown; raw: string } {
  const raw = readFileSync(resolve(REPO_ROOT, relPath), 'utf8');
  return { data: parse(raw), raw };
}

export function loadPanel(): { panel: Panel; version: string } {
  const { data, raw } = loadYaml('prompts/panel.yaml');
  const panel = panelSchema.parse(data);
  const version = `v${panel.version}-${createHash('sha256').update(raw).digest('hex').slice(0, 8)}`;
  return { panel, version };
}

export function loadFacts(): Facts {
  const { data } = loadYaml('facts.yaml');
  return factsSchema.parse(data);
}

/** Texto compacto dos fatos para o contexto do juiz. */
export function factsAsText(f: Facts): string {
  const lines: string[] = [];
  lines.push(`Nome completo: ${f.person.name} (também: ${[f.person.short_name, ...f.person.aliases].join(', ')})`);
  lines.push(`Headline: ${f.person.headline}`);
  lines.push(`Local: ${f.person.location.city}, ${f.person.location.country}`);
  if (f.person.since) lines.push(`Carreira desde: ${f.person.since}`);
  lines.push(`Idiomas: ${f.person.languages.map((l) => `${l.name} (${l.level})`).join(', ')}`);
  lines.push(`Site: ${f.site.url}`);
  for (const [k, v] of Object.entries(f.profiles)) lines.push(`Perfil ${k}: ${v}`);
  lines.push(`Domínios de atuação: ${f.expertise.domains.join('; ')}`);
  lines.push(`Stack: ${f.expertise.stack.join(', ')}`);
  lines.push('Experiência:');
  for (const e of f.experience) {
    lines.push(`- ${e.org} — ${e.role} (${e.period}): ${e.summary}${e.scale ? ` Escala: ${e.scale}` : ''}`);
  }
  lines.push('Projetos:');
  for (const p of f.projects) lines.push(`- ${p.name}${p.url ? ` <${p.url}>` : ''}: ${p.summary}`);
  lines.push('Formação:');
  for (const e of f.education) lines.push(`- ${e.institution}: ${e.degree}${e.period ? ` (${e.period})` : ''}`);
  if (f.corrections.length) {
    lines.push('Erros conhecidos que modelos cometem (tratar como INCORRETO se aparecer):');
    for (const c of f.corrections) lines.push(`- "${c.claim}" → verdade: ${c.truth}`);
  }
  return lines.join('\n');
}

/** Nomes que contam como "menção" — pessoa e projetos. */
export function mentionTargets(f: Facts): { person: string[]; projects: string[] } {
  return {
    person: [f.person.name, f.person.short_name, ...f.person.aliases],
    projects: f.projects.map((p) => p.name),
  };
}
