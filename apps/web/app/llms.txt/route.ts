import { llmsResponse } from '../../lib/llms';

export const dynamic = 'force-static';

export function GET() {
  return llmsResponse('pt-BR');
}
