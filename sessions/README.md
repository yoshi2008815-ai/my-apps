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
| `log/` | 1セッション1ファイルの追記ログ。誰が/どの端末/どのエージェントかを記録。 |
| `session.sh` | 全経路で共通のCLI（下記）。 |
| `.active` | このチェックアウトでの「進行中ログ」への一時ポインタ（git管理外）。 |

## 使い方（どの経路でも同じ）
```sh
sessions/session.sh show              # 現在の共有状態と直近ログを表示（作業開始時にまず実行）
sessions/session.sh start "見出し"     # セッション開始（ログを1件作成）
sessions/session.sh log   "メモ"       # 進行中セッションに追記
sessions/session.sh end   "まとめ"     # セッションを締める
sessions/session.sh sync              # pull → commit → push（全端末へ共有）
```

「誰が」の記録は環境変数で調整できます（任意）:
```sh
SESSION_DEVICE=iphone SESSION_USER=yoshi sessions/session.sh start "競馬アプリ調整"
```
`SESSION_AGENT` は未指定なら Claude Code / Codex / 人 を自動判定します。

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
