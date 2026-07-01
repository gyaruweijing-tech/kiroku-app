import { NextRequest, NextResponse } from 'next/server';

// GitHubのリポジトリ内の1ファイル（JSON）をDB代わりに読み書きするAPI。
// 秘密のトークンはここ（サーバー側）でしか使わない。

const API = 'https://api.github.com';

function config() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!token || !owner || !repo) return null;
  return {
    token,
    owner,
    repo,
    path: process.env.GITHUB_DATA_PATH || 'data/kiroku-data.json',
    branch: process.env.GITHUB_BRANCH || 'main',
  };
}

async function readFile(cfg: NonNullable<ReturnType<typeof config>>) {
  const res = await fetch(
    `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}?ref=${cfg.branch}`,
    {
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
      },
      cache: 'no-store',
    }
  );
  if (res.status === 404) return { sha: null as string | null, content: null as string | null };
  if (!res.ok) throw new Error(`GitHub読み込み失敗: ${res.status}`);
  const json = await res.json();
  return {
    sha: json.sha as string,
    content: Buffer.from(json.content, 'base64').toString('utf-8'),
  };
}

export async function GET() {
  const cfg = config();
  if (!cfg) return NextResponse.json({ error: 'sync未設定' }, { status: 501 });

  try {
    const { content } = await readFile(cfg);
    return NextResponse.json({ projects: content ? JSON.parse(content) : null });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown error' },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  const cfg = config();
  if (!cfg) return NextResponse.json({ error: 'sync未設定' }, { status: 501 });

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.projects)) {
    return NextResponse.json({ error: '不正なデータ' }, { status: 400 });
  }

  try {
    const { sha } = await readFile(cfg);
    const res = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({
        message: `sync: ${new Date().toISOString()}`,
        content: Buffer.from(JSON.stringify(body.projects, null, 2), 'utf-8').toString('base64'),
        branch: cfg.branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!res.ok) throw new Error(`GitHub書き込み失敗: ${res.status} ${await res.text()}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown error' },
      { status: 502 }
    );
  }
}
