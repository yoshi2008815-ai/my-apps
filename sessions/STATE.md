<!--
  これは「作業の文脈」の唯一の共有状態です。
  携帯 / PCアプリ / ターミナル / Codex のどこから作業しても、まずここを読み、
  作業後はここを更新して commit / push してください（同期の実体は git です）。
  更新は簡潔に。詳細な経過は sessions/log/ の各ログに残します。
-->

# 共有セッション状態 (my-apps)

最終更新: 2026-07-01 / claude-code

## 現在の焦点
- クロス端末・クロスエージェントのセッション管理の仕組みを整備（複数セッション選択・日次記憶・端末跨ぎ引き継ぎに対応）。

## 次の一手
- 各端末（携帯 / PC / ターミナル）と Codex から `sessions/session.sh show / list / resume` が動くか実運用で確認する。
- 実運用に合わせて STATE.md の見出しを調整する。

## 決定事項 / メモ
- セッション状態はリポジトリ内 `sessions/` に置き、git で全端末・全エージェントへ同期する。
- 起動時: `sessions/session.sh show` で状態を読む（Claude Code は SessionStart フックで自動表示）。
- セッションIDは「日付+名前」（例 `2026-07-01-競馬アプリ調整`）。同日同名は `-2` が付く。
- 複数セッションは `list` / `resume` で選択・切替。`end` は任意で、締めなくても `daily/` に1日分が残る。
- 端末をまたぐ続きは、別端末で `git pull` → `resume`。`resume`/`show` は「引き継ぎサマリ＋直近5件」だけ出す（コンテキスト節約）。区切り前に `summary` を更新する運用。
- Obsidian バックアップ: `sync`/`mirror` で兄弟の vault(git repo) の `my-apps-sessions/` にミラー＆push。vault が無い端末では自動スキップ。
- 終了時: STATE.md を更新し `sessions/session.sh sync` で共有する。

## 進行中の課題（TODO）
- [ ] （ここに未完のタスクを箇条書きで積む）
