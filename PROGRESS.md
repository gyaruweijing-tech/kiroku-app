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

## 起動方法
```
cd （手元のフォルダ）
npm install
npm run dev
```
→ http://localhost:3000
