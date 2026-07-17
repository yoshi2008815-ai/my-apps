# HANDOFF — Claude ⇄ Codex バトン

> 最新の引き継ぎ1件のみ保持。履歴は Obsidian `handoff-session-local/` を参照。

- **日時**: 2026-07-11 17:17 JST
- **ツール**: Claude Code（claude-fable-5 / claude-opus-4-8 / claude-sonnet-4-6）
- **ブランチ**: main

## やったこと
- island-camp 大改修（本日分すべて main に push 済み・最新 `ff4aff2`）
  - モダンUI刷新（フローティングヘッダー・丸ゴシック・エリアタブ・FABズーム）
  - 「⛰ 横からながめる」パノラマビュー新設（北→南の横一列・‹ › スクロールボタン・名産バッジ 絵34px+名前17px を島の上に表示）
  - 島イラストの可愛い化（グラデ・波あわ・ゆげ・もこもこ木・ヤシ＋ココナッツ）
  - 全24島に観光マップ風の詳細地図：高解像度海岸線（GEO.isleDetail、式根島13点→422点）＋ズーム/ピンチ/ドラッグ
  - 観光スポット計204箇所（Nominatimジオコーディング、式根島・神津島はDriveのパンフレットPDF準拠）
  - スポット登録機能（地図タップ→名前・アイコン選択🏞🏖♨🍴⛺🏪📍・おすすめ・URL・登録者）
  - 訪問記録をOneNote実記録（2004〜2025）に修正、年表インデックス＋「😷 2020–2023 コロナでお休み」表示、既存端末向けマイグレーション（stats-v=2）
  - アルバム機能（全島写真一覧・ライトボックス・選択/一括ZIPダウンロード＝自前ZIP生成）
  - 詳細パネルをタブUIに刷新（🗺地図/📷写真/📖旅日記/🍴お店/💡メモ・件数バッジ・全画面表示）
  - Tシャツデザイン5点を `island-camp/design/` に保存（伊豆七島アーチ×ひがしまんちゅ背中プリントが最終形）
  - キャッシュ対策：スクリプトURLに `?v=` 付与（現在 v15）＋ SWナビゲーションを `cache:'no-cache'` に

## 現在の状態
- 作業ツリー：クリーン（未コミットなし）。main は origin と同期済み（`ff4aff2`）
- テスト：プレビュー（`npx serve` :8765 → /my-apps/island-camp/index.html）でE2E検証済み、コンソールエラー0
- 並行セッション由来のテント意匠版（`261e9f6` 等）は `-s ours` マージで履歴のみ保持。今日の版を採用（ユーザー確認済み）
- 今日の版のバックアップブランチ: `claude/island-camp-modern-redesign`

## 次にやること
1. ユーザーの実機（v15）での表示確認待ち。問題あればキャッシュ系を疑う（下記参照）
2. OSMに無く座標が取れなかった約30スポット（御代ヶ池・ムシロ瀬・与論城跡・紀元杉など）→ ユーザーがアプリ内のスポット登録で追加するか、手動座標で geo.js に追記
3. 西表島は実記録に無く「未訪問」に変更済み → 実際に行っていたらユーザーに年を確認して data.js 修正
4. Tシャツ：入稿時に色替え（白インク版など）の要望が来る可能性

## 注意点・ハマりどころ
- **geo.js は AUTO-GENERATED**（手編集禁止）。更新は scratchpad の Python スクリプト（Nominatim 1.1s/req + bbox検証）→ node で `window.GEO` を再シリアライズ
- **更新のたびに必ず3点セットでバンプ**：index.html の `?v=` / sw.js の `CACHE` / sw.js の `V`（現在15）
- ブラウザがヒューリスティックキャッシュで古いJSを掴む問題あり → 開発時は `?bust=` 付きURLで開く。SWはナビゲーションを no-cache 化済み
- localStorage のシード上書き問題は `stats-v` マイグレーションで解決済み。訪問統計を再変更するときは `STATS_VERSION` をインクリメント
- プレビューの `preview_screenshot` は頻繁にタイムアウトする（タブ非表示でrAF停止）→ `preview_eval` でのDOM検証が確実。アニメーションは `document.hidden` 時に即時反映するフォールバック実装済み
- リモート main には他セッション（ゲームアプリ等）が随時 push してくる → push 前に `git pull --rebase`

## 関連ファイル
- `island-camp/app.js` — 地図・横並びビュー・アルバム・タブパネル・マイグレーション
- `island-camp/islemap.js` — 島詳細マップ（ズーム・スポット・登録・ポップアップ）
- `island-camp/miyake.js` — 三宅島スペシャル（スポット14件）
- `island-camp/data.js` — シードデータ（実訪問記録 years[] 付き）
- `island-camp/geo.js` — 自動生成（海岸線 isleDetail・スポット isleSpots 204件）
- `island-camp/sw.js` — SW（v15・ナビno-cache）
- `island-camp/design/tshirt-*.svg` — Tシャツ入稿データ5点
