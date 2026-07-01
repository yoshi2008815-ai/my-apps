# my-apps — エージェント向けメモ（Codex ほか）

このファイルは Codex（および AGENTS.md を読むエージェント）向けです。内容は
Claude Code 向けの `CLAUDE.md` と同一の運用ルールで、両者は同じ `sessions/` を共有します。

個人用の静的Webアプリ集です。Cloudflare Workers でリポジトリ全体を静的配信しています。

## セッション管理（携帯 / PCアプリ / ターミナル / Claude Code と共有）
作業の文脈は `sessions/` に集約し、git で全端末・全エージェントに同期します。
詳細は `sessions/README.md`。**必ず以下を守ってください:**

1. **作業開始時**: まず現在の状態・今日の流れを読む。
   ```sh
   sessions/session.sh show
   ```
   新しいまとまった作業なら開始を記録（ID=日付+名前）。別端末の続きなら合流:
   ```sh
   sessions/session.sh start "見出し"      # 新規
   sessions/session.sh list               # 既存を確認
   sessions/session.sh resume <番号/見出し> # 既存に合流（サマリを引き継ぐ＝コンテキスト節約）
   ```
   resume したら、まず表示される「引き継ぎサマリ」を読んでから続ける。
2. **作業中**: 重要な判断や区切りを追記（個別ログ＋日次ダイジェストに自動記録）:
   ```sh
   sessions/session.sh log "メモ"
   sessions/session.sh summary "結論・残タスク・対象ファイル"  # 区切り/離席前に更新
   ```
3. **作業終了時**: （任意で）締めて → STATE.md を更新 → 共有:
   ```sh
   sessions/session.sh end "まとめ"   # 任意。締めなくても daily/ に残ります
   # sessions/STATE.md の「現在の焦点 / 次の一手 / 決定事項 / TODO」を最新化
   sessions/session.sh sync          # my-apps を push ＋ 兄弟の Obsidian vault へバックアップ
   ```

Codex から動かすと `session.sh` はエージェントを自動判定します。手動指定する場合は
`SESSION_AGENT=codex` を付けてください（端末名は `SESSION_DEVICE=...`）。

## その他
- 秘匿情報は書かない（`sessions/` 配下も公開配信され得ます）。
