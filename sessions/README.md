# sessions/ — クロス端末・クロスエージェントのセッション管理

携帯・PCアプリ・ターミナル・**Codex** のどこから作業しても、「前回までの作業の文脈」
（現在の焦点・次の一手・決定事項・TODO・経過ログ）を共有するための仕組みです。

## なぜ git なのか
携帯（Claude Code web/mobile）も、PCアプリ（デスクトップ）も、ターミナル（CLI）も、
Codex も、結局はこの **同じ git リポジトリ** を操作します。だから
「セッション状態をリポジトリ内のファイルとして持ち、pull/push で同期する」だけで、
特別なサーバやアカウント連携なしに全経路で状態が共有できます。

```
どの端末/エージェントも  ──pull──▶  sessions/STATE.md + sessions/log/  ──push──▶  他の全端末
```

## 構成
| パス | 役割 |
|------|------|
| `STATE.md` | 唯一の「生きた共有状態」。まずここを読み、作業後はここを更新する。 |
| `log/` | 1セッション1ファイルの追記ログ。ファイル名＝**日付+名前**（例 `2026-07-01-競馬アプリ調整.md`）。 |
| `daily/` | 日次ダイジェスト（`YYYY-MM-DD.md`）。全セッションの動きが時系列で自動蓄積。 |
| `session.sh` | 全経路で共通のCLI（下記）。 |
| `.active` | このチェックアウトが指す「現在のセッション」への一時ポインタ（git管理外・端末ローカル）。 |

## 使い方（どの経路でも同じ）
```sh
sessions/session.sh show               # 状態・現在セッションの要約・今日の流れを表示（開始時にまず実行）
sessions/session.sh start "見出し" [名前] # 新しいセッションを開始（ID=日付+名前）
sessions/session.sh list               # セッション一覧（進行中/完了）を番号付きで表示
sessions/session.sh resume 競馬         # 既存セッションに合流（番号/ID/見出しの一部で選択）＋サマリ表示
sessions/session.sh log   "メモ"        # 現在のセッションに追記（日次にも自動記録）
sessions/session.sh summary "要約"      # 現在セッションの「引き継ぎサマリ」を更新
sessions/session.sh end   "まとめ"      # 現在のセッションを締める（任意）
sessions/session.sh today              # 今日の日次ダイジェストを表示
sessions/session.sh mirror             # Obsidian vault へバックアップ（あれば）
sessions/session.sh sync               # pull → commit → push（＋ Obsidian へミラー）
```

「誰が」の記録は環境変数で調整できます（任意）:
```sh
SESSION_DEVICE=iphone SESSION_USER=yoshi sessions/session.sh start "競馬アプリ調整"
```
`SESSION_AGENT` は未指定なら Claude Code / Codex / 人 を自動判定します。

## よくある使い方

### 複数のセッションを並行して持つ / 選ぶ
`start` するたびにセッションが増えます。`list` で番号付きの一覧が出るので、
`resume <番号 / ID / 見出しの一部>` で「現在のセッション」を切り替えられます。
以降の `log` / `end` は選んだセッションに入ります。

### end しなくても1日分は残る
`end` は任意です。締めなくても、`start` / `log` / `end` の動きはすべて
`daily/YYYY-MM-DD.md` に時系列で自動記録されます。`session.sh today` でその日の
流れを振り返れます（`end` は個別セッションに「## まとめ」を足すだけ）。

### 1つのセッションを端末をまたいで続ける（スマホ↔PC）
セッションのログ本体は git で共有されます。別端末では:
```sh
git pull                         # 最新を取得
sessions/session.sh resume 競馬   # スマホで始めたセッションに合流
sessions/session.sh log "PCで続き"# 同じログファイルに追記される
sessions/session.sh sync          # 共有
```
`.active`（どのセッションが現在か）は端末ごとに別管理なので、複数端末で別々の
セッションを並行しても混ざりません。合流したいときだけ `resume` します。

### 引き継ぎサマリ（コンテキスト上限対策）
長いセッションはログ全文を読むとコンテキストを圧迫します。そこで各セッションに
**「引き継ぎサマリ」**欄を持たせています。区切りごとに要約を更新しておくと、
`resume` / `show` はフルログではなく **サマリ＋直近5件** だけを出すので、
別端末・別エージェントが少ないコンテキストで続きに入れます。
```sh
sessions/session.sh summary "ここまでの結論・残タスク・対象ファイルを短く"
```
> エージェント運用の推奨: 端末を離れる前・区切りの前に `summary` を更新する。
> `resume` したら、まずサマリを読んでから作業を続ける。

### Obsidian にバックアップ（ローカルPC）
`my-apps` の**兄弟ディレクトリにある Obsidian vault（git repo）**へ、セッション情報を
自動でミラーします。`sync`（または `mirror`）実行時に、vault 内の
`my-apps-sessions/`（`STATE.md` / `log/` / `daily/`）へコピーし、vault が git repo なら
commit → push まで行います。
```sh
sessions/session.sh sync   # my-apps を push した後、Obsidian vault にもミラー＆push
```
**初回だけ**、その端末（ローカルPC）で vault のパスを登録します（`sessions/.obsidian-path`
に保存。git では共有されない端末ローカル設定）:
```sh
# Git Bash の場合
sessions/session.sh set-vault "/c/Users/user/Documents/Obsidian Vault"
# WSL の場合
sessions/session.sh set-vault "/mnt/c/Users/user/Documents/Obsidian Vault"
```
以降は `sync` / `mirror` が自動でこの vault（git: `yoshi2008815-ai/vault`）へバックアップします。

- vault の解決順: `OBSIDIAN_VAULT`（環境変数） → `sessions/.obsidian-path`（登録済み）
  → 既知の既定パス（`~/Documents/Obsidian Vault` など） → `my-apps` の兄弟で `.obsidian/` を持つ repo。
- 保存先サブフォルダは `OBSIDIAN_SUBDIR`（既定 `my-apps-sessions`）で変更可。
- vault を push したくない端末は `OBSIDIAN_PUSH=no`（コピーのみ）。
- **vault が存在しない端末（携帯・クラウド上のエージェント）では自動でスキップ**されます。

## エージェント連携
- **Claude Code**: リポジトリ直下の `CLAUDE.md` を読み、起動時に SessionStart フック
  （`.claude/settings.json`）で `STATE.md` を自動表示します。
- **Codex**: リポジトリ直下の `AGENTS.md` を読み、同じ手順（開始時に read、終了時に update）
  に従います。

## 運用ルール（要点）
1. 作業を始めるとき: `session.sh show` で状態を読む。
2. 作業を終えるとき: `STATE.md` を更新し `session.sh sync` で共有する。
3. `STATE.md` は簡潔に。詳細な経過は `log/` のログへ。

> 注意: このリポジトリは Cloudflare で全ファイルが静的配信されます（`wrangler.toml`）。
> `sessions/` 配下も公開URLからアクセスされ得るため、パスワード等の秘匿情報は書かないでください。
