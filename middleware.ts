import { NextRequest, NextResponse } from 'next/server';

// アプリ全体（画面 + /api/sync）をBasic認証で保護する。
// BASIC_AUTH_USER / BASIC_AUTH_PASS が未設定の場合はローカル開発を邪魔しないよう素通り。
//
// スマホ対策：一度Basic認証を通ったら HttpOnly Cookie（90日）を発行し、
// 以降はCookieだけで通す。→ スマホ（特にホーム画面に追加したPWA）で
// 毎回ID/パスワードを聞かれる問題を解消する。
// Cookieの値はパスワードそのものではなく SHA-256 ハッシュ（漏れても即パスワードにはならない。
// パスワードを変えれば全端末のCookieが自動で無効になる）。

const COOKIE_NAME = 'kiroku_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90日

async function authToken(user: string, pass: string): Promise<string> {
  const data = new TextEncoder().encode(`kiroku-auth-v1:${user}:${pass}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return NextResponse.next();

  const expected = await authToken(user, pass);

  // 1) Cookieがあればそれで通す（2回目以降はここで即OK）
  if (req.cookies.get(COOKIE_NAME)?.value === expected) {
    return NextResponse.next();
  }

  // 2) Basic認証ヘッダを確認（初回ログイン時）
  const header = req.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    try {
      // atob はEdgeランタイム標準（BufferはEdge非対応のため使わない）
      const decoded = atob(header.slice(6));
      const sep = decoded.indexOf(':');
      const u = decoded.slice(0, sep);
      const p = decoded.slice(sep + 1);
      if (u === user && p === pass) {
        const res = NextResponse.next();
        res.cookies.set(COOKIE_NAME, expected, {
          maxAge: COOKIE_MAX_AGE,
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
        });
        return res;
      }
    } catch {
      // base64が壊れていたら未認証扱い
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
