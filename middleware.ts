import { NextRequest, NextResponse } from 'next/server';

// アプリ全体（画面 + /api/sync）をBasic認証で保護する。
// BASIC_AUTH_USER / BASIC_AUTH_PASS が未設定の場合はローカル開発を邪魔しないよう素通り。
export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
    const sep = decoded.indexOf(':');
    const u = decoded.slice(0, sep);
    const p = decoded.slice(sep + 1);
    if (u === user && p === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse('認証が必要です', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Kiroku"' },
  });
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
