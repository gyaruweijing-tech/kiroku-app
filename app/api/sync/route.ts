import { NextRequest, NextResponse } from 'next/server';

// GitHubのリポジトリ内の1ファイル（JSON）をDB代わりに読み書きするAPI。
// 秘密のトークンはここ（サーバー側）でしか使わない。
//
// 失敗したとき原因が分かるように：
// - エラーにはGitHubのステータスコード＋対処ヒントを必ず含める
// - GET /api/sync?check=1 で設定と疎通の診断結果を返す（秘密の値は一切出さない）

const API = 'https://api.github.com';

function config() {
  const token = process.env.GITHUB_TOKEN;
  // owner/repo は秘密ではない固定値。envで上書きもできるが、
  // 未設定でも既定値で動くようにして「設定漏れで同期できない」事故を防ぐ。
  // （＝実質必要な設定は GITHUB_TOKEN だけ）
  const owner = process.env.GITHUB_OWNER || 'gyaruweijing-tech';
  const repo = process.env.GITHUB_REPO || 'kiroku';
  if (!token) return null;
  return {
    token,
    owner,
    repo,
    path: process.env.GITHUB_DATA_PATH || 'data/kiroku-data.json',
    branch: process.env.GITHUB_BRANCH || 'main',
  };
}

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

// GitHubのステータスコード → 人間向けの対処ヒント
function hint(status: number): string {
  switch (status) {
    case 401:
      return 'トークンが無効（値の貼り間違い・失効の可能性）。GitHubでPATを確認';
    case 403:
      return 'トークンの権限不足かレート制限。PATのPermissions: Contents=Read and write を確認';
    case 404:
      return 'リポジトリかファイルが見えない。Fine-grained PATの「対象リポジトリ」にkirokuが入っているか、GITHUB_OWNER/GITHUB_REPOの綴りを確認';
    case 409:
    case 422:
      return 'ブランチ名やshaの不整合。GITHUB_BRANCHがmainか確認';
    default:
      return 'GitHub側の一時的なエラーの可能性。少し待って再試行';
  }
}

async function readFile(cfg: NonNullable<ReturnType<typeof config>>) {
  const res = await fetch(
    `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}?ref=${cfg.branch}`,
    { headers: ghHeaders(cfg.token), cache: 'no-store' }
  );
  if (res.status === 404) {
    // 注意：404は「ファイルがまだ無い」以外に「トークンにリポジトリが見えていない」でも返る。
    // 区別は ?check=1 の診断（リポジトリ本体へのアクセス確認）で行う。
    return { sha: null as string | null, content: null as string | null };
  }
  if (!res.ok) throw new Error(`GitHub読み込み失敗: ${res.status}（${hint(res.status)}）`);
  const json = await res.json();
  return {
    sha: json.sha as string,
    content: Buffer.from(json.content, 'base64').toString('utf-8'),
  };
}

// 診断：環境変数の有無とGitHubへの疎通を確認する（値そのものは返さない）
async function runCheck() {
  const env = {
    GITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
    // owner/repo は未設定でも既定値で動く（＝falseでも問題ない）
    GITHUB_OWNER: process.env.GITHUB_OWNER ? 'set' : '既定値を使用',
    GITHUB_REPO: process.env.GITHUB_REPO ? 'set' : '既定値を使用',
    BASIC_AUTH_USER: !!process.env.BASIC_AUTH_USER,
    BASIC_AUTH_PASS: !!process.env.BASIC_AUTH_PASS,
  };
  const cfg = config();
  if (!cfg) {
    return {
      ok: false,
      env,
      diagnosis: 'GITHUB_TOKEN が未設定。VercelのenvにGITHUB_TOKENを設定して再デプロイ',
    };
  }

  // 1) リポジトリ本体が見えるか（トークンの対象リポジトリ設定の確認）
  const repoRes = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}`, {
    headers: ghHeaders(cfg.token),
    cache: 'no-store',
  });
  // 2) データファイルがあるか
  const fileRes = await fetch(
    `${API}/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}?ref=${cfg.branch}`,
    { headers: ghHeaders(cfg.token), cache: 'no-store' }
  );

  const repoOk = repoRes.ok;
  const fileStatus = fileRes.status;
  let diagnosis: string;
  if (!repoOk) {
    diagnosis = `リポジトリ ${cfg.owner}/${cfg.repo} にアクセスできない（${repoRes.status}）。${hint(repoRes.status)}`;
  } else if (fileStatus === 404) {
    diagnosis =
      'リポジトリはOK。データファイルがまだ無いだけ（初回の書き込みで自動作成される）。この状態で同期が失敗するなら書き込み権限（Contents=Read and write）を確認';
  } else if (fileRes.ok) {
    diagnosis = '設定・疎通ともOK。データファイルも存在する';
  } else {
    diagnosis = `データファイル読み込みで ${fileStatus}。${hint(fileStatus)}`;
  }

  return {
    ok: repoOk && (fileRes.ok || fileStatus === 404),
    env,
    repoAccess: repoRes.status,
    dataFile: fileStatus === 404 ? '未作成' : fileRes.ok ? 'あり' : `エラー ${fileStatus}`,
    target: `${cfg.owner}/${cfg.repo}/${cfg.path} (${cfg.branch})`,
    diagnosis,
  };
}

export async function GET(req: NextRequest) {
  const cfg = config();

  if (req.nextUrl.searchParams.has('check')) {
    try {
      return NextResponse.json(await runCheck());
    } catch (e) {
      return NextResponse.json(
        { ok: false, diagnosis: e instanceof Error ? e.message : 'unknown error' },
        { status: 502 }
      );
    }
  }

  if (!cfg) {
    return NextResponse.json(
      { error: 'sync未設定（GITHUB_TOKEN/OWNER/REPOが未設定）' },
      { status: 501 }
    );
  }

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
  if (!cfg) {
    return NextResponse.json(
      { error: 'sync未設定（GITHUB_TOKEN/OWNER/REPOが未設定）' },
      { status: 501 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.projects)) {
    return NextResponse.json({ error: '不正なデータ' }, { status: 400 });
  }

  try {
    const { sha } = await readFile(cfg);
    const res = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`, {
      method: 'PUT',
      headers: ghHeaders(cfg.token),
      body: JSON.stringify({
        message: `sync: ${new Date().toISOString()}`,
        content: Buffer.from(JSON.stringify(body.projects, null, 2), 'utf-8').toString('base64'),
        branch: cfg.branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`GitHub書き込み失敗: ${res.status}（${hint(res.status)}）`);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown error' },
      { status: 502 }
    );
  }
}
