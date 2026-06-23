# PROGRESS — Kiroku（記録）

超シンプルな進捗・プロジェクト管理アプリ。MDファイル/テキストを管理する。
Vercel + スマホ（PWA）対応を見据えた構成。

## スタック
- Next.js 14（App Router, TypeScript）
- react-markdown + remark-gfm（プレビュー）
- 保存：localStorage（データ層は `lib/storage.ts` に分離）

## ✅ 初日（2026-06-23）に入れたもの
- [x] プロジェクト一覧（ステータスチップ＋更新日時、更新順ソート）
- [x] Markdown 編集（自動保存）／プレビュー切替
- [x] 新規作成 / 削除 / ステータス（進行中・保留・完了）
- [x] .md 書き出し / 読み込み（= あなたの「MDファイル」を出し入れできる橋渡し）
- [x] スマホ対応レイアウト（一覧↔詳細の切替）
- [x] PWA manifest ＋ SVGアイコン
- [x] 初期データに「ポッドキャスト自動生成システム」の今日の進捗を投入

## 🏗️ 設計の急所（改良を楽にするため）
- 画面コード（`app/page.tsx`）は **`lib/storage.ts` の4関数だけ** に依存。
  → 保存先を localStorage から API/DB に替えても、`storage.ts` の中身だけ直せばよい。
- データの形は `lib/types.ts` に集約（= 契約）。

## 🔜 改良メモ（明日以降）
- [ ] `npm install` → `npm run dev` で起動確認（初回）
- [ ] Vercel へデプロイ → スマホのホーム画面に追加
- [ ] 端末間同期したくなったら storage を DB/API 実装に差し替え
- [ ] PWA用 PNG アイコン（192/512）を用意（今は SVG 1枚。iOS の home追加で要る場合あり）
- [ ] 検索 / タグ / 並び替え
- [ ] 自動保存の最適化（今は変更ごとに保存）

## 🤖 将来構想：Claude Code が Kiroku を自律的に更新する
狙い：進捗の記録・整理を Claude Code に任せる。

現状の自動化ループ（コードについては既に稼働中）：
```
Claude Codeがファイル編集 → git commit → git push → Vercelが自動デプロイ → スマホで反映
```

### 仕組みの候補
- **案A（王道・現実的）**：進捗データを repo 内の Markdown（例 `content/*.md`）に置き、
  Kiroku はそれを読む。→ Claude Code が `.md` を編集して push = スマホに反映。
  「ファイルいじって push」がそのまま自律更新ルートになる。履歴も残る。秘密不要。
  - 欠点：反映にビルド1〜2分。アプリ内リアルタイム編集とは別系統。
- **案B**：localStorage → DB/API 化。Claude/外部から API で読み書き＋端末同期も解決。
  - 欠点：作り込み大・認証必要。

→ 当面は **案A** が次の一歩。`lib/storage.ts` を分離済みなのは切替を楽にするため。

### 自律運用のガードレール（決めること）
- 「勝手に」やってよい範囲（追記OK／削除は確認、など）
- main 直 push か PR 経由か
- `/schedule`（定期実行）も可能だが、まずは手動セッションで十分

## 起動方法
```
cd （手元のフォルダ）
npm install
npm run dev
```
→ http://localhost:3000
