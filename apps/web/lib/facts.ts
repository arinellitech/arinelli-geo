import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

export type Facts = {
  person: {
    name: string;
    short_name: string;
    aliases: string[];
    headline: string;
    headline_en?: string;
    location: { city: string; region?: string; country: string };
    languages: { name: string; level: string }[];
    since?: string;
  };
  site: { url: string; own_domains: string[] };
  profiles: Record<string, string>;
  expertise: { domains: string[]; stack: string[] };
  experience: { org: string; role: string; period: string; summary: string; scale?: string }[];
  projects: { name: string; url?: string; summary: string }[];
  education: { institution: string; degree: string; period?: string }[];
  corrections?: { claim: string; truth: string }[];
};

let cached: Facts | null = null;

/** facts.yaml fica na raiz do repo (../../ a partir de apps/web). */
export function getFacts(): Facts {
  if (cached) return cached;
  const candidates = [resolve(process.cwd(), '../../facts.yaml'), resolve(process.cwd(), 'facts.yaml')];
  const path = candidates.find((p) => existsSync(p));
  if (!path) throw new Error(`facts.yaml não encontrado (procurado em: ${candidates.join(', ')})`);
  cached = parse(readFileSync(path, 'utf8')) as Facts;
  return cached;
}

export function siteUrl(): string {
  return getFacts().site.url.replace(/\/$/, '');
}

export function currentRole(f: Facts) {
  return f.experience.find((e) => /presente|present|atual/i.test(e.period)) ?? f.experience[0];
}
