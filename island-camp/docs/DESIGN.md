# 島キャンプ思い出マップ 設計書

| 項目 | 内容 |
|---|---|
| 文書バージョン | 1.2 |
| 最終更新 | 2026-07-20 |
| 対応アプリバージョン | v2.7.0 |
| 公開URL | https://yoshi2008815-ai.github.io/my-apps/island-camp/ |
| リポジトリ | https://github.com/yoshi2008815-ai/my-apps （`island-camp/`） |

---

## 1. 概要

20年分の島キャンプ（伊豆諸島メイン、鹿児島・沖縄・新潟）の思い出を日本地図上で振り返り、
**5人のグループで**スポット・日記・お店・ナレッジを共有するPWA。

- 利用者: 代表者（リポジトリ所有者）＋メンバー4人の計5人
- 端末: スマホ（iOS/Android）・PC のブラウザ。ホーム画面追加（PWA）対応
- サーバー: なし（GitHub Pages の静的配信＋GitHub Gist をデータ置き場に利用）

## 2. 技術構成

| 層 | 技術 | 備考 |
|---|---|---|
| 配信 | GitHub Pages | `main` ブランチ直下を公開 |
| UI | Vanilla JS + SVG + CSS | ビルド工程なし。ES2020想定 |
| 詳細地図 | Leaflet 1.9.4（unpkg CDN） | 島選択後の詳細マップ |
| 地図タイル | 国土地理院タイル（淡色 `pale` / 写真 `seamlessphoto`） | 出典表記必須 |
| 共有データ | GitHub Gist API（非公開Gist / `islands.json`） | 認証は classic PAT（gistスコープ） |
| ローカル保存 | localStorage（島データ）+ IndexedDB（写真） | |
| オフライン | Service Worker（`sw.js`） | 戦略は §9 |

## 3. ファイル構成

```
island-camp/
├── index.html      画面・スタイル・モーダル群
├── app.js          アプリ本体（全国マップ/詳細マップ/CRUD/マージ/同期制御）
├── kankomap.js     観光マップ風モード＋公式マップPDFビューア
├── kanko-geo.js    OSM実データ（道路・集落）※tools/gen-kanko-geo.js で自動生成
├── media.js        アルバム・ドキュメント（IndexedDB）
├── sync.js         Gist同期モジュール（pull/push/共有グループ作成/設定保存）
├── data.js         シードデータ（24島＋363スポット）※手編集可
├── tools/gen-kanko-geo.js  Overpass APIから kanko-geo.js を再生成するスクリプト
├── sw.js           Service Worker
├── manifest.json   PWAマニフェスト
├── icon*.svg       アイコン
├── docs/DESIGN.md  本書
├── CHANGELOG.md    変更履歴（バージョン管理 §12）
└── （レガシー・未参照）geo.js / islemap.js / miyake.js / design/*.svg
    2026-07-11までの別系統実装の遺産。現行版からは読み込まれない。
    geo.js はOSM由来の海岸線ポリゴンで将来再利用の可能性あり。design/ はTシャツ案。
```

## 4. 画面構成

1. **全国マップ**（SVG自前描画）
   - デフォルメ島シェイプ（ズーム2倍以上で表示）＋ドットピン。視認性優先で実寸の1.5〜2倍
   - **東海汽船航路レイヤー**（`FERRY_ROUTES`/`drawFerryRoutes`）: 竹芝発2系統を
     寄港順の破線カーブで描画。線幅・文字は `1/scale` でズーム追従
   - 正確な地形は詳細マップ側で担保する（役割分担）
   - **横並びビュー（⛰ 横からながめる）**: 地図下中央のボタンで切替。
     島を北→南に横一列のパノラマ表示（`renderSideView`）。島イラストは
     種類別シルエット（cone/dome/flat/twin/forest、`ISLAND_KIND`）＋
     名産バッジ（`SPECIALTY`）。訪問回数でサイズ変化。‹ ›／ドラッグ／
     ホイールで横スクロール、タップで詳細パネルへ（v1.x系から移植）
2. **詳細パネル**（島タップで右からスライド）
   - ヘッダ（島名・★お気に入り・訪問回数）
   - **詳細マップ**（Leaflet、パネル上部固定・「⤢拡大」で全画面）
   - セクション: スポット一覧（カテゴリチップ絞り込み）／写真／旅日記／お店／ナレッジ／Tips
3. **モーダル**: 汎用入力フォーム／データ管理／共有（同期）設定
4. **同期インジケータ**: ヘッダ「☁共有」ボタンのドット色
   （灰=未設定、緑=同期OK、黄=同期中、赤=エラー）

## 5. データモデル

```js
island = {
  id, name, region, pref, lat, lng,          // スカラー（島単位LWW）
  firstVisit, visits, fav, summary,
  updatedAt,                                  // スカラー変更時に更新
  photos: [photoId],                          // ★端末ローカルのみ・同期対象外
  spots:     [{id,name,cat,lat,lng,url,note, author,updatedAt,deleted}],
  logs:      [{id,date,text,               author,updatedAt,deleted}],
  shops:     [{id,name,type,note,url,      author,updatedAt,deleted}],
  knowledge: [{id,text,                    author,updatedAt,deleted}],
  tips:      [{id,text,                    author,updatedAt,deleted}],
}
```

- **spot.cat**: `キャンプ場 / ビーチ / 温泉 / 山・自然 / 観光 / 食事・店 / 港・交通` の7種
- **ID規約**（`app.js`）
  - UI新規作成: `uid(prefix)` → `sp_xxx` `lg_xxx` など（時刻+乱数）
  - シード・v1移行: `chash(内容)` → `sdxxxx`。**内容から決定的に生成**されるため
    5端末それぞれで移行しても同じIDになり、マージで重複しない
  - 外部から届いたID: `safeId()` が `[A-Za-z0-9_-]{1,64}` に強制
    （不正IDは決定的に振り直し。HTML属性へのインジェクション対策 §10）
  - logs のみ内容ハッシュに配列indexを混ぜる（同一日付・同文の日記を別エントリとして保持）
- **削除 = tombstone**: 物理削除せず `deleted:true, updatedAt:now`。
  同期しても復活しない。90日経過後に掃除（**シード由来 `sd` IDの墓標は掃除しない**。
  シードは毎起動 data.js から再注入されるため、墓標が消えると削除が復活してしまう）
- **localStorage キー**: `island-camp/islands-v2`（旧 `-v1` からは起動時自動移行。
  parse失敗時は `-v2-corrupt` に退避しシード上書きしない）

## 6. 共有同期設計（5人共有）

### 接続情報
- **共有コード**: `ic1.<gistId>.<token>`（token省略時は受信専用）
- 代表者がアプリ内「共有グループを作成」で非公開Gistを作成（POST /gists）し、
  コードをメンバーへ配布。各端末の `localStorage island-camp/sync-v1` に保存
- コード欄を空にして保存 = 共有解除（gistId/tokenを端末から削除）

### 同期フロー（`syncNow`）
```
pull(Gist GET) → remote正規化(migrateIsland)
→ merged = purgeTombstones(mergeIslands(local, remote))
→ 内容が変わった場合のみ STATE.islands を差し替え・保存・再描画
   ※変わっていなければ既存オブジェクトを保つ（開いているパネルの参照を無効化しない）
→ merged ≠ remote なら push(Gist PATCH)
```
- **マージ**: 島スカラー = 島の`updatedAt`が新しい方を一括採用（LWW）。
  リスト = エントリID単位の和集合、同一IDは`updatedAt`が新しい方（LWW）
- **canon()**: 島とエントリをIDソートした正規形JSON。並び順・キー順に依存せず
  「実質同じ内容か」を判定（無駄なpush・無駄な再描画を防ぐ）
- **UI側の原則**: 同期で島オブジェクトが差し替わるため、
  すべての変異ハンドラは書き込み直前に `resolveIsland()/find(id)` で引き直す
- **起動時・90秒ごと（タブ表示中）・ウィンドウフォーカス時**にpull、
  編集の2.5秒後にデバウンスpush

### 整合性の特性と制約
- 同時書き込みは gist レベルで後勝ち。**負けた端末の次回同期で自動復元**される
  （各端末はマージ済み和集合をpushするため）。恒久ロストは「負けた端末が二度と
  同期しない」場合のみ
- 写真は同期しない（Gist容量・転送量の制約）。端末ごとに保持
- APIレート制限: token使用時 5,000req/h。90秒ポーリング≒40req/h/人で余裕

## 7. 詳細地図設計

- タイル: 淡色 `https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png`（既定）
  ／写真 `seamlessphoto`（レイヤコントロールで切替）。出典「地理院タイル」表記
- 初期表示: `DETAIL_BBOX`（島ごとの実範囲 [[latS,lngW],[latN,lngE]]）に fitBounds。
  未定義の島（ユーザー追加）はスポット＋島中心から導出
- マーカー: カテゴリ別の絵文字divIcon（⛺緑/🏖青/♨️朱/🏔深緑/📷紫/🍴橙/⚓紺）
- ポップアップ: 名前・カテゴリ・メモ・🔗リンク・✎更新者・編集/削除
- スポット追加: 「＋追加」→ 地図タップで座標指定 → フォーム（名前/カテゴリ/URL/メモ/緯度/経度）
- 全画面化: `.dmapwrap.full`（position:fixed）。パネルは `.open{transform:none}` に
  しておく必要がある（transform祖先はfixedの包含ブロックになるため）

### 観光マップ風モード（kankomap.js）のデータソース

| 要素 | ソース | ライセンス/扱い |
|---|---|---|
| 海岸線 | geo.js（OSM Nominatim由来） | ODbL。出典表記を地図左下に表示 |
| 道路・集落 | kanko-geo.js（OSM Overpass由来） | 同上。`node tools/gen-kanko-geo.js` で再生成 |
| 山・港・航路 | kankomap.js 内の検証済み手作業データ | — |
| 公式マップPDF | `KANKO_LINKS[id].pdf`（発行元サーバー直リンク） | **再配布禁止のためリポジトリに置かない**。都度公式サーバーから表示。`frame:false` は X-Frame-Options により iframe 不可 → 新タブ |

- 公式マップビューア: PC幅(≥700px)かつ `frame!==false` のときアプリ内 iframe
  モーダル（#kpdfModal）、それ以外は新しいタブで PDF を開く。
  リンク切れ時の案内先として `url`（配布ページ）も保持する

## 8. スポットシードデータ

- 24島 × 7〜22件 = **363スポット**（2026-07 Web調査。当初9島 → 2026-07-20 に全24島へ拡充）
- 収集方針: キャンプ場を最優先で全網羅 → ビーチ/温泉/山・自然/観光/食事/港
- 検証: 全座標を OpenStreetMap(Nominatim)・Wikipedia・NAVITIME 等と照合、
  URLは公式・自治体・観光協会ドメインを実在確認（怪しいものは空欄）
- `data.js` は生成スクリプト由来だが手編集可能。編集時は §5 のID規約に従い
  `id` を書かなければ自動で内容ハッシュIDが付く

## 9. オフライン／キャッシュ戦略（sw.js）

| 対象 | 戦略 | 理由 |
|---|---|---|
| 同一オリジン | **ネットワーク優先**→失敗時キャッシュ | 更新が5人に確実に届く。オフラインでも開ける |
| unpkg.com（Leaflet） | キャッシュ優先（opaque許可） | バージョン固定URLで安全 |
| 上記以外（GitHub API・地理院タイル等） | **SW素通し** | 常に最新が必要／タイルで容量肥大を防ぐ |

- 正常応答（`res.ok` または opaque）のみ `cache.put`（エラーページで汚染しない）
- オフラインfallbackの index.html は**ページ遷移のみ**（JS/JSONにHTMLを返さない）
- `CACHE` 名（現 `island-camp-v2`）はプリキャッシュ対象の**構成が変わったときだけ**bump

## 10. セキュリティ

- **XSS**: 全ユーザー入力・共有データは表示時に `esc()`。IDはHTML属性に入るため
  `safeId()` で文字集合を強制（共有Gist・インポートJSON経由の細工ID対策）
- URLは `https?://` のみリンク化（`safeUrl()`）
- **トークン**: 各端末の localStorage のみに保存。リポジトリ・コードには含めない。
  漏えい時の影響は gist スコープに限定。無効化は GitHub 側で revoke
- 非公開GistはURLを知る者は閲覧可能（検索不可）。旅の記録という性質上許容。
  書き込みはトークン保持者のみ

## 11. 既知の制約・課題

- 同時書き込みの厳密な原子性はない（§6の自己修復で実用上カバー）
- 写真は共有されない（メンバーへの周知事項）
- Gist 1ファイル1MB超で content が truncated になる（raw_url フォールバック実装済み。
  テキストのみの運用では実質到達しない）
- レガシーファイル（geo.js / islemap.js / miyake.js / design/）が未整理 → 要否判断待ち

## 12. バージョン管理の運用ルール

1. **セマンティックバージョニング** `MAJOR.MINOR.PATCH`
   - MAJOR: データ形式・共有プロトコルの互換が壊れる変更（例: localStorageキー変更）
   - MINOR: 機能追加（画面・カテゴリ・同期機能の追加など）
   - PATCH: バグ修正・文言・スタイル調整
2. リリース時に必ず更新するもの
   - `CHANGELOG.md` に変更点を追記（Keep a Changelog 形式）
   - `app.js` 冒頭の `APP_VERSION`（データ管理モーダルに表示される）
   - プリキャッシュ構成が変わる場合のみ `sw.js` の `CACHE` を bump
3. コミットメッセージは `island-camp: <要約>` 形式
4. 設計に関わる変更は本書（docs/DESIGN.md）の該当節と文書バージョンを更新
