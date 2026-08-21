# HANDOFF — Claude ⇄ Codex バトン

> 最新の引き継ぎ1件のみ保持。履歴は Obsidian `handoff-session-local/` を参照。

- **日時**: 2026-08-21 05:07 JST
- **ツール**: Claude Code（claude-fable-5）
- **ブランチ**: main

## やったこと
- **伊豆七島枠のTシャツ用単体SVG切り出し**（前回handoffの最優先タスク・完了）
  - `island-camp/design/izu7-dipper-frame.svg` — v2.10.0 全国マップの伊豆七島枠と同一デザイン（青枠・タイトル・星座線・実海岸線シルエット×ポップカラー9色）
  - `island-camp/design/izu7-dipper-frame-nobg.svg` — 背景なし版（濃色生地向け）
  - シルエットは `GEO.isleDetail` 高解像度版（各島114〜207点）で印刷品質。viewBox 235×475
  - 生成スクリプトの正: app.js の IZU_BOX / IZU_DIPPER / IZU_SIZE / IZU_COLORS / izuShapePoints を複製し isleDetail でサンプリング
- コミット `f066f17` として main へ push 済み（rebaseで他セッションの `760afe0` と統合）

## 現在の状態
- 作業ツリー: この HANDOFF.md 以外クリーン。main = origin/main = `5a0dbeb`
- SVG はブラウザペインでDOM検証済み（9島・9色・ラベル・星座線・高解像度点数）
- スクリーンショットはペイン非表示時に撮れないため未取得（構造検証で代替）

## 次にやること
1. **ユーザーがSVG 2種を目視確認**（`design/izu7-dipper-frame.svg` / `-nobg.svg`）。色替え・文字なし版などの要望があれば生成スクリプト（下記）を再利用
2. スマホ実機で新全国マップの表示確認（狭幅時は下部が見切れる既存のmeet挙動あり）
3. 式根島キャンプ場の開設状況フォロー（〜2026-03-31閉鎖告知、以降未確定）
4. 公式マップPDFリンクの定期実在チェック（`kankomap.js` の `KANKO_LINKS[].pdf`）

## 注意点・ハマりどころ
- **観光協会パンフPDFをリポジトリに同梱しない**（著作権。公式サーバー直表示方式を維持）
- design/ のSVG群はいずれも standalone（フォントは Zen Maru Gothic 指定＋システムフォールバック。入稿先によってはアウトライン化が必要）
- izu7 SVG の再生成はセッションscratchpadの `gen-izu7-svg.js` 方式で（geo.js を eval で読み、app.js の定数をコピーして同期。**app.js側の IZU_* を変えたら再生成**）
- kanko-geo.js の再生成: `node island-camp/tools/gen-kanko-geo.js`（Overpass 429/504 リトライ実装済み）
- 旧実装（手描き LANDMASSES / ROADS / TOWNS）はフォールバックとして残置・削除禁止
- 過去バージョン復元: `git checkout island-camp-vX.Y.Z -- island-camp/`（DESIGN.md §12-5）
- sw.js CACHE=v250。プリキャッシュ構成を変えた時だけ bump
- リモート main には他セッションが随時 push → push 前に `git pull --rebase`

## 関連ファイル
- `island-camp/design/izu7-dipper-frame.svg` / `izu7-dipper-frame-nobg.svg` — 今回の成果物
- `island-camp/design/tshirt-*.svg` — 旧Tシャツ案5点（アーチ×ひがしまんちゅ等）
- `island-camp/app.js` — 全国マップ（IZU_BOX/IZU_DIPPER/IZU_SIZE/IZU_COLORS/izuShapePoints）
- `island-camp/kankomap.js` ／ `island-camp/kanko-geo.js` ／ `island-camp/tools/gen-kanko-geo.js`
- `island-camp/data.js` — シード 24島×363スポット
- `island-camp/CHANGELOG.md` ／ `island-camp/docs/DESIGN.md`（v1.3）
