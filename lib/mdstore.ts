import { MdFile, Project } from './types';

// ============================================================
//  生Markdown ストア
//  1つのJSON塊 → GitHubで人が読める・直せる Markdown 1枚に変換する。
//
//  設計の肝（＝壊れない理由）:
//  - 構造データ（id/日時/status/focused/nextAction/goal/origin/log/ファイル一覧）は
//    HTMLコメント `<!-- k:p {JSON} -->` に丸ごと入れる → JSONなので完全再現・往復ロスなし。
//    ※コメント内の files[].body は空にしておく（本文は下のフェンスが正）
//  - ファイル本文は `<!-- k:body -->` ～ `<!-- k:/body -->` の間に生Markdownでそのまま置く
//    → GitHubで直接編集でき、その編集がそのままアプリに反映される。
//  - 見出し( ## / ### )や「あゆみ」リストは“読む用の飾り”で、parse では完全に無視する
//    （＝二重管理にならない。正はコメントのJSONとフェンス本文だけ）。
// ============================================================

const HEADER =
  '<!-- Kiroku のデータです。各ファイルの本文（<!-- k:body --> と <!-- k:/body --> の間）は\n     GitHub 上で直接編集できます。上のコメント行(k:p / k:f)は消さないでください。 -->';

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

// プロジェクトを Markdown 文字列にする
export function serializeProjects(projects: Project[]): string {
  const out: string[] = ['# Kiroku', HEADER, ''];

  for (const p of projects) {
    // コメント用メタ：本文だけ空にした完全なプロジェクト（キー順もそのまま保つ）
    const meta = {
      ...p,
      files: p.files.map((f) => ({ ...f, body: '' })),
    };
    out.push(`<!-- k:p ${JSON.stringify(meta)} -->`);

    // ---- ここから下は“読む用”。parse では無視される ----
    out.push(`## ${p.title || '(無題)'}${p.deletedAt ? '  🗑ゴミ箱' : ''}`);
    const bits: string[] = [p.status];
    if (p.focused) bits.push('⭐注力中');
    if (p.goal) bits.push(`狙い: ${p.goal}`);
    if (p.nextAction) bits.push(`次の一手: ${p.nextAction}`);
    out.push(`> ${bits.join(' ・ ')}`);
    if (p.origin) out.push(`> 原点: ${p.origin}`);

    const log = (p.log ?? []).slice().sort((a, b) => b.at - a.at);
    if (log.length) {
      out.push('', '### あゆみ');
      for (const e of log) {
        out.push(`- ${fmtDate(e.at)} ${e.note}${e.by === 'claude' ? ' _(Claude)_' : ''}`);
      }
    }

    // ---- ファイル本文（ここが GitHub で編集できる“正”のデータ） ----
    for (const f of p.files) {
      out.push('');
      out.push(`### 📄 ${f.name || '(無題)'}${f.deletedAt ? '  🗑' : ''}`);
      out.push('<!-- k:body -->');
      out.push(f.body ?? '');
      out.push('<!-- k:/body -->');
    }

    out.push('', '---', '');
  }

  return out.join('\n');
}

// Markdown 文字列をプロジェクト配列に戻す
export function parseProjects(md: string): Project[] {
  const projects: Project[] = [];
  const lines = md.split('\n');
  let cur: Project | null = null;
  let fileIdx = 0; // 現プロジェクト内で、次に本文を割り当てるファイルの番号

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 新しいプロジェクト
    const pm = line.match(/^<!-- k:p (.*) -->$/);
    if (pm) {
      try {
        const meta = JSON.parse(pm[1]) as Project;
        // files[].body は空で入っている。下のフェンスで埋める。
        cur = { ...meta, files: (meta.files ?? []).map((f) => ({ ...f })) };
        projects.push(cur);
        fileIdx = 0;
      } catch {
        cur = null;
      }
      i++;
      continue;
    }

    // ファイル本文フェンス：<!-- k:body --> ～ <!-- k:/body -->
    if (line.trim() === '<!-- k:body -->' && cur) {
      const bodyLines: string[] = [];
      let k = i + 1;
      while (k < lines.length && lines[k] !== '<!-- k:/body -->') {
        bodyLines.push(lines[k]);
        k++;
      }
      const target = cur.files[fileIdx];
      if (target) target.body = bodyLines.join('\n');
      fileIdx++;
      i = k + 1; // 閉じフェンスの次へ
      continue;
    }

    i++; // それ以外（見出し・あゆみ等の飾り）は無視
  }

  return projects;
}

// テスト/移行用：2つのプロジェクト配列が「意味的に」等しいか（キー順は無視）
export function projectsEqual(a: Project[], b: Project[]): boolean {
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      return Object.keys(o)
        .sort()
        .reduce((acc, k) => {
          acc[k] = norm(o[k]);
          return acc;
        }, {} as Record<string, unknown>);
    }
    return x;
  };
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

export type { MdFile, Project };
