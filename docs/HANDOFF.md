# HANDOFF — Claude ⇄ Codex バトン

> 最新の引き継ぎ1件のみ保持。履歴は Obsidian `handoff-session-local/` を参照。

- **日時**: 2026-07-20 09:47 JST
- **ツール**: Claude Code（claude-fable-5）
- **ブランチ**: main

## やったこと
island-camp を v2.4.0 → v2.10.0 まで6バージョン更新（全コミット・タグ push 済み）。

- **v2.5.0**: 観光マップ風モードの道路・集落をOSM実データ化（`kanko-geo.js`、生成は `tools/gen-kanko-geo.js`）。公式観光マップPDFビューア追加（24島中21島の直リンクを実在確認。PCはiframeモーダル、X-Frame-Options不可とスマホは新タブ。**PDFはリポジトリに置かず公式サーバーから直接表示**）
- **v2.6.0**: 三宅島22件・御蔵島12件のスポットシード追加（v1移行で島だけ残りスポット空だった問題を解消）
- **v2.7.0**: 残り13島に151スポット追加 → **シード全24島×363件に**。東海汽船2航路（さるびあ丸/橘丸）を全国マップに描画。観光マップの発着矢印を全24島化
- **v2.8.0**: 全国マップをイラスト調（緑の島×海色）に刷新、沖縄7島を左上インセット枠へ
- **v2.9.0**: 本土海岸線を geo.js 実データ化（本州448点等）。北方領土枠（右上）、伊豆諸島を北斗七星ならびに、トカラ・小笠原を参考表示
- **v2.10.0**: **伊豆七島枠を主役化**（実海岸線シルエット×島別ポップカラー9色、Tシャツ向け）。鹿児島の島々を左中段枠に、海色をポップブルーに
- 設計書 v1.3（§13文書履歴・復元手順を追記）。gitタグ `island-camp-v2.4.0`〜`v2.10.0` を作成しpush

## 現在の状態
- ワーキングツリー: この HANDOFF.md 以外クリーン。origin/main = b365be1 まで push 済み
- プレビュー検証済み（全24島スポット・航路・4枠レイアウト・PDFビューア・コンソールエラーなし）
- スポット品質: 全座標 OSM(Overpass/Nominatim) 検証済み、URLは実在確認済みのみ収録

## 次にやること
1. **Tシャツ用の伊豆七島枠 単体SVG/PNG切り出し**（ユーザーに提案済み・依頼待ち）
2. スマホ実機で新全国マップの表示確認（狭幅時は下部が見切れる既存のmeet挙動あり）
3. 式根島キャンプ場の開設状況フォロー（〜2026-03-31閉鎖の告知、以降未確定。noteに「要確認」記載済み）
4. 公式マップPDFリンクの定期実在チェック（`KANKO_LINKS[].pdf`）

## 注意点・ハマりどころ
- **観光協会パンフPDFをリポジトリに同梱しない**（著作権。公式サーバー直表示方式を維持）
- kanko-geo.js の再生成: `node island-camp/tools/gen-kanko-geo.js`（Overpass混雑時429/504→リトライ実装済み。島ごと逐次保存対応）
- 旧実装（手描き LANDMASSES / ROADS / TOWNS）は**フォールバックとして残置・削除禁止**
- 過去バージョン復元: `git checkout island-camp-vX.Y.Z -- island-camp/`（DESIGN.md §12-5）
- 全国マップの島座標: 伊豆9島=`IZU_DIPPER`、鹿児島7島=`KAGO_POS` の固定座標、沖縄7島=INSET再投影、他=projectMain。`islandPoint()` 経由
- sw.js CACHE=v250。プリキャッシュ構成を変えた時だけ bump
- Claude Code のブラウザペインはPDF iframe表示後にスクリーンショットが固まることがある（DOM検証で代替した）

## 関連ファイル
- `island-camp/app.js` — 全国マップ（MAIN_RECT/INSET/IZU_DIPPER/KAGO_POS/FERRY_ROUTES/drawBase）
- `island-camp/kankomap.js` — 観光マップ風モード＋公式PDFビューア（KANKO_LINKS に pdf/frame）
- `island-camp/kanko-geo.js` — OSM道路・集落（自動生成）／ `island-camp/tools/gen-kanko-geo.js`
- `island-camp/data.js` — シード 24島×363スポット
- `island-camp/CHANGELOG.md` ／ `island-camp/docs/DESIGN.md`（v1.3）
