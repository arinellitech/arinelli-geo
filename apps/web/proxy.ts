import { NextResponse, type NextRequest } from 'next/server';

/**
 * Basic auth só para /dashboard. O resto do site é público por definição.
 * Defina DASHBOARD_USER e DASHBOARD_PASSWORD na Vercel.
 */
export function proxy(request: NextRequest) {
  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!user || !pass) {
    return new NextResponse('Dashboard desativado: defina DASHBOARD_USER e DASHBOARD_PASSWORD.', { status: 503 });
  }
  const header = request.headers.get('authorization') ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [u, p] = atob(encoded).split(':');
    if (u === user && p === pass) return NextResponse.next();
  }
  return new NextResponse('Auth required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="geo-dashboard", charset="UTF-8"' },
  });
}

export const config = { matcher: ['/dashboard', '/dashboard/:path*'] };
