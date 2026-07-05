#!/usr/bin/env node
// ============================================================
//  開発の軌跡（stats）を git 履歴から計算して data/stats.json に書く。
//  GitHub Action (.github/workflows/stats.yml) が定期実行する。
//  ローカルでも `node scripts/stats.mjs` で動く（要: 全履歴のclone）。
//
//  測っているもの:
//  - pushes: コミット数（=push）。溜まる一方の「運動量」。品質ではなく心拍。
//      dev    = コード開発コミット（sync:/stats: 以外）
//      record = アプリの同期コミット（sync:）＝記録を書いた回数
//  - projects[].pushes: そのプロジェクトのブロック（k:p JSON+本文）が
//      変わったコミット数 ＝「そのプロジェクトの記録が動いた回数（世話の回数）」
//  - code.survival: 各開発コミットが追加した行のうち、今のHEADに
//      生き残っている行の割合。書いてから MATURE_DAYS 日経ったコミットだけを
//      「熟成済み」として率に採用する（新しいコミットは必ず高く出るため）。
//      ※率は品質の「鏡」。目標にした瞬間に腐る（グッドハートの法則）ので、
//        眺めるだけの数字として扱うこと。
// ============================================================

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const REF = process.env.STATS_REF || 'HEAD';
const OUT = 'data/stats.json';
const MATURE_DAYS = 7;

// 記録データが入っているファイル（プロジェクト別push数の対象）
const DATA_PATHS = ['content/kiroku.md', 'data/kiroku-data.json'];

// 「📒 このアプリ（Kiroku）について」のプロジェクトid。
// コード開発コミットはこのプロジェクトのpushとしても数える
// （アプリ自身の開発＝このプロジェクトの進捗、という扱い）。
const APP_PROJECT_ID = 'mr24t3fm92u50x';

// 生存分析の対象＝コードファイル。記録データ・生成物は除く
const CODE_EXCLUDE = /^(content\/|data\/|public\/|package-lock\.json)/;
const CODE_INCLUDE = /\.(ts|tsx|mjs|js|gs|css|json|md|yml|yaml)$/;

function git(...args) {
  // stderrは捨てる（過去コミットにファイルが無い時の fatal: がノイズになるため）
  return execFileSync('git', args, {
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).toString();
}

function sha1(s) {
  return createHash('sha1').update(s).digest('hex');
}

function show(sha, path) {
  try {
    return git('show', `${sha}:${path}`);
  } catch {
    return null; // そのコミットにはまだ無い
  }
}

// ---- コミット一覧（新しい順）: sha / 時刻 / 件名 ----
function listCommits() {
  const raw = git('log', REF, '--format=%H;%ct;%s');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [sha, ct, ...s] = l.split(';');
      return { sha, at: Number(ct) * 1000, subject: s.join(';') };
    });
}

function kind(subject) {
  if (subject.startsWith('sync:')) return 'record';
  if (subject.startsWith('stats:')) return 'stats'; // このスクリプト自身のコミットは数えない
  return 'dev';
}

// ---- プロジェクト別push数: 各コミット時点の「プロジェクトid → ブロックのハッシュ」 ----

// content/kiroku.md: <!-- k:p {...} --> から次の k:p 行（またはEOF）までを1ブロックとする
function stateFromMd(md) {
  const map = new Map(); // id -> { hash, title }
  const starts = [];
  const re = /^<!-- k:p .*-->$/gm;
  let m;
  while ((m = re.exec(md))) starts.push(m.index);
  for (let i = 0; i < starts.length; i++) {
    const block = md.slice(starts[i], starts[i + 1] ?? md.length);
    const head = block.slice(0, block.indexOf('-->') + 3);
    const jm = head.match(/^<!-- k:p (.*) -->$/s);
    if (!jm) continue;
    try {
      const meta = JSON.parse(jm[1]);
      if (meta.id) map.set(String(meta.id), { hash: sha1(block), title: String(meta.title ?? '') });
    } catch {
      // 壊れた行は数えない（アプリのparseと同じく無視）
    }
  }
  return map;
}

// 旧形式 data/kiroku-data.json（生Markdown化より前の履歴もpushとして数える）
function stateFromJson(text) {
  const map = new Map();
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) {
      for (const p of arr) {
        if (p && p.id) map.set(String(p.id), { hash: sha1(JSON.stringify(p)), title: String(p.title ?? '') });
      }
    }
  } catch {
    /* 壊れたスナップショットは無視 */
  }
  return map;
}

function projectStateAt(sha) {
  const md = show(sha, DATA_PATHS[0]);
  if (md !== null) return stateFromMd(md);
  const json = show(sha, DATA_PATHS[1]);
  if (json !== null) return stateFromJson(json);
  return null;
}

function countProjectPushes() {
  const shas = git('log', '--reverse', '--format=%H', REF, '--', ...DATA_PATHS)
    .trim()
    .split('\n')
    .filter(Boolean);
  const pushes = new Map(); // id -> count
  const titles = new Map(); // id -> 最後に見たタイトル
  let prev = new Map();
  for (const sha of shas) {
    const state = projectStateAt(sha);
    if (!state) continue;
    for (const [id, { hash, title }] of state) {
      if (prev.get(id)?.hash !== hash) pushes.set(id, (pushes.get(id) ?? 0) + 1);
      if (title) titles.set(id, title);
    }
    prev = state;
  }
  return { pushes, titles };
}

// ---- 生存コード分析 ----
function codeFiles() {
  return git('ls-tree', '-r', '--name-only', REF)
    .trim()
    .split('\n')
    .filter((f) => f && !CODE_EXCLUDE.test(f) && CODE_INCLUDE.test(f));
}

// 現在のHEADで生きている行を、書いたコミット別に数える（git blame）
function survivingLines(files) {
  const bySha = new Map(); // sha先頭12桁 -> 行数
  let total = 0;
  for (const f of files) {
    let out;
    try {
      out = git('blame', '-s', '-l', REF, '--', f);
    } catch {
      continue; // バイナリ等はスキップ
    }
    for (const line of out.split('\n')) {
      if (!line) continue;
      // 行頭がsha（境界コミットは ^ 付き）
      const m = line.match(/^\^?([0-9a-f]{8,40})\s/);
      if (!m) continue;
      const key = m[1].slice(0, 12);
      bySha.set(key, (bySha.get(key) ?? 0) + 1);
      total++;
    }
  }
  return { bySha, total };
}

// 各コミットがコードファイルに追加した行数（numstat）
function addedLines(fileSet) {
  const raw = git('log', REF, '--format=@%H', '--numstat');
  const bySha = new Map();
  let cur = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('@')) {
      cur = line.slice(1);
      continue;
    }
    const m = line.match(/^(\d+)\t\d+\t(.+)$/);
    if (m && cur && fileSet.has(m[2])) {
      bySha.set(cur, (bySha.get(cur) ?? 0) + Number(m[1]));
    }
  }
  return bySha;
}

// ---- 本体 ----
function main() {
  const commits = listCommits();
  const head = commits[0]?.sha ?? '';
  const nowMs = Date.now();

  const pushCounts = { total: 0, dev: 0, record: 0 };
  for (const c of commits) {
    const k = kind(c.subject);
    if (k === 'stats') continue;
    pushCounts.total++;
    pushCounts[k]++;
  }

  const { pushes, titles } = countProjectPushes();
  // コード開発コミットは「このアプリ」プロジェクトのpushにも加算
  if (pushCounts.dev > 0) {
    pushes.set(APP_PROJECT_ID, (pushes.get(APP_PROJECT_ID) ?? 0) + pushCounts.dev);
  }
  const projects = [...pushes.entries()]
    .map(([id, n]) => ({ id, title: titles.get(id) ?? '', pushes: n }))
    .sort((a, b) => b.pushes - a.pushes);

  const files = codeFiles();
  const fileSet = new Set(files);
  const { bySha: surv, total: liveLines } = survivingLines(files);
  const added = addedLines(fileSet);

  const devCommits = commits
    .filter((c) => kind(c.subject) === 'dev')
    .map((c) => {
      const a = added.get(c.sha) ?? 0;
      const s = surv.get(c.sha.slice(0, 12)) ?? 0;
      return {
        sha: c.sha.slice(0, 7),
        date: new Date(c.at).toISOString().slice(0, 10),
        subject: c.subject,
        added: a,
        surviving: s,
        mature: nowMs - c.at >= MATURE_DAYS * 86400000,
      };
    })
    .filter((c) => c.added > 0); // コードに触れていないコミットは表から省く

  const sum = (list) => ({
    added: list.reduce((n, c) => n + c.added, 0),
    surviving: list.reduce((n, c) => n + c.surviving, 0),
  });
  const rate = ({ added: a, surviving: s }) => (a > 0 ? Math.round((s / a) * 1000) / 1000 : null);
  const matureList = devCommits.filter((c) => c.mature);
  const allSum = sum(devCommits);
  const matureSum = sum(matureList);

  const stats = {
    generatedAt: new Date(nowMs).toISOString(),
    head,
    pushes: pushCounts,
    projects,
    code: {
      liveLines,
      matureDays: MATURE_DAYS,
      all: { ...allSum, rate: rate(allSum) },
      mature: matureList.length ? { ...matureSum, rate: rate(matureSum) } : null,
      commits: devCommits,
    },
  };

  // generatedAt 以外に変化が無ければ書き換えない（無意味なstatsコミットを増やさない）
  try {
    const old = JSON.parse(readFileSync(OUT, 'utf8'));
    const strip = (o) => JSON.stringify({ ...o, generatedAt: null });
    if (strip(old) === strip(stats)) {
      console.log('stats: 変化なし（書き込みスキップ）');
      return;
    }
  } catch {
    /* 初回 or 壊れている → 普通に書く */
  }

  mkdirSync('data', { recursive: true });
  writeFileSync(OUT, JSON.stringify(stats, null, 2) + '\n');
  console.log(`stats: ${OUT} を更新（push合計 ${pushCounts.total} / 生存 ${liveLines}行）`);
}

main();
