import type { NextConfig } from 'next';
import { resolve } from 'node:path';

const nextConfig: NextConfig = {
  // facts.yaml fica na raiz do monorepo; garante que ele vá junto no deploy serverless.
  outputFileTracingRoot: resolve(import.meta.dirname, '../..'),
  outputFileTracingIncludes: { '/**': ['../../facts.yaml'] },
  serverExternalPackages: ['postgres'],
  poweredByHeader: false,
};

export default nextConfig;
