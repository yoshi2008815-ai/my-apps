# my-apps — エージェント向けメモ（Claude Code）

個人用の静的Webアプリ集です。Cloudflare Workers（`wrangler.toml`, `[assets] directory="./"`）で
リポジトリ全体を静的配信しています。

## セッション管理（携帯 / PCアプリ / ターミナル / Codex で共有）
作業の文脈は `sessions/` に集約し、git で全端末・全エージェントに同期します。
詳細は `sessions/README.md`。**必ず以下を守ってください:**

1. **作業開始時**: `sessions/STATE.md` を読む（起動フックで自動表示されます）。
   新しいまとまった作業を始めるなら `sessions/session.sh start "見出し"`。
2. **作業中**: 重要な判断や区切りは `sessions/session.sh log "メモ"` で残す。
3. **作業終了時**:
   - `sessions/session.sh end "まとめ"` でログを締める。
   - `sessions/STATE.md` の「現在の焦点 / 次の一手 / 決定事項 / TODO」を最新化する。
   - `sessions/session.sh sync`（または通常の commit/push）で共有する。

これにより、次に別の端末や Codex から入っても文脈が途切れません。

## その他
- 秘匿情報は書かない（`sessions/` 配下も公開配信され得ます）。
- ローカル確認: `.claude/launch.json` の静的サーブ設定、または `npx -y serve -l 8742 .`。
