import { NextResponse } from 'next/server';

// 開発の軌跡（data/stats.json）を読むだけのAPI。
// 中身は GitHub Action (.github/workflows/stats.yml) が
// scripts/stats.mjs で定期生成している。ここでは計算しない（読むだけ）。

const API = 'https://api.github.com';

export async function GET() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || 'gyaruweijing-tech';
  const repo = process.env.GITHUB_REPO || 'kiroku';
  const branch = process.env.GITHUB_BRANCH || 'main';
  if (!token) {
    return NextResponse.json(
      { error: 'sync未設定（GITHUB_TOKENが未設定）' },
      { status: 501 }
    );
  }
  try {
    const res = await fetch(
      `${API}/repos/${owner}/${repo}/contents/data/stats.json?ref=${branch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          // raw指定でbase64デコード不要のJSON本文をそのまま受け取る
          Accept: 'application/vnd.github.raw+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        cache: 'no-store',
      }
    );
    if (res.status === 404) {
      // まだActionが一度も走っていない（statsファイル未生成）
      return NextResponse.json({ stats: null });
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `GitHub読み込み失敗: ${res.status}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ stats: await res.json() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown error' },
      { status: 502 }
    );
  }
}
