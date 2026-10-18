import type { NextConfig } from 'next';
import { resolve } from 'node:path';

const nextConfig: NextConfig = {
  // facts.yaml fica na raiz do monorepo; garante que ele vá junto no deploy serverless.
  outputFileTracingRoot: resolve(import.meta.dirname, '../..'),
  outputFileTracingIncludes: { '/**': ['../../facts.yaml'] },
  serverExternalPackages: ['postgres'],
  poweredByHeader: false,
  // Dois root layouts, (pt) e (en): o 404 de URL sem rota vem de app/global-not-found.tsx.
  experimental: { globalNotFound: true },
};

export default nextConfig;
