import { config } from 'dotenv';
import { resolve } from 'node:path';
import { REPO_ROOT } from './config.js';

// O .env fica na raiz do monorepo, mas `pnpm monitor` roda o worker com cwd em apps/worker.
// No Actions as variáveis vêm dos secrets e não há .env: config() só não encontra nada.
config({ path: resolve(REPO_ROOT, '.env'), quiet: true });
