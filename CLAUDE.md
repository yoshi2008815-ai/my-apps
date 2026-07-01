# my-apps — エージェント向けメモ（Claude Code）

個人用の静的Webアプリ集です。Cloudflare Workers（`wrangler.toml`, `[assets] directory="./"`）で
リポジトリ全体を静的配信しています。

## セッション管理（携帯 / PCアプリ / ターミナル / Codex で共有）
作業の文脈は `sessions/` に集約し、git で全端末・全エージェントに同期します。
詳細は `sessions/README.md`。**必ず以下を守ってください:**

1. **作業開始時**: `sessions/STATE.md` と今日の流れを読む（起動フックで自動表示されます）。
   - 新しいまとまった作業なら `sessions/session.sh start "見出し"`。
   - 別端末で始めた続きなら `sessions/session.sh list` → `sessions/session.sh resume <番号/見出し>` で合流。
2. **作業中**: 重要な判断や区切りは `sessions/session.sh log "メモ"` で残す
   （個別ログと `daily/` の日次ダイジェストの両方に自動記録されます）。
3. **作業終了時**:
   - 区切りがついたら `sessions/session.sh end "まとめ"`（**任意**。締めなくても日次には残ります）。
   - `sessions/STATE.md` の「現在の焦点 / 次の一手 / 決定事項 / TODO」を最新化する。
   - `sessions/session.sh sync`（または通常の commit/push）で共有する。

これにより、複数セッションの並行・スマホ↔PCの引き継ぎ・別エージェント(Codex)からの再開でも
文脈が途切れません。コマンド詳細は `sessions/README.md`。

## その他
- 秘匿情報は書かない（`sessions/` 配下も公開配信され得ます）。
- ローカル確認: `.claude/launch.json` の静的サーブ設定、または `npx -y serve -l 8742 .`。
