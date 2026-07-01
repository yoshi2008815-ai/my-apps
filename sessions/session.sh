#!/bin/sh
# session.sh - クロス端末・クロスエージェントのセッション状態を扱う共通CLI
#
# 携帯 / PCアプリ / ターミナル / Codex のどこから使っても、この1本のスクリプトで
# 同じ「作業の文脈（STATE.md とログ）」を読み書きできます。同期の実体は git です。
#
# 使い方:
#   sessions/session.sh show            現在の共有状態と直近ログを表示
#   sessions/session.sh start "見出し"   新しいセッションを開始（ログを1件作成）
#   sessions/session.sh log   "メモ"     進行中セッションに追記
#   sessions/session.sh end   "まとめ"   セッションを締めて STATE.md 更新を促す
#   sessions/session.sh sync            pull → （変更あれば）commit → push
#
# 記録する「誰が」の情報は環境変数で上書きできます:
#   SESSION_AGENT   例) claude-code / codex / human   （未指定なら自動判定）
#   SESSION_DEVICE  例) iphone / macbook / work-pc     （未指定ならホスト名）
#   SESSION_USER    例) yoshi                          （未指定なら git user.name）

set -eu

# --- 位置の解決 --------------------------------------------------------------
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "${ROOT}" ]; then
  # git 管理外から呼ばれた場合はスクリプト位置の親を基準にする
  SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  ROOT=$(dirname -- "${SCRIPT_DIR}")
fi
SESSIONS_DIR="${ROOT}/sessions"
STATE="${SESSIONS_DIR}/STATE.md"
LOG_DIR="${SESSIONS_DIR}/log"
ACTIVE="${SESSIONS_DIR}/.active"   # このチェックアウトでの「進行中ログ」への相対パス（git管理外）

mkdir -p "${LOG_DIR}"

# --- 誰が / どの端末 / どのエージェント --------------------------------------
detect_agent() {
  if [ -n "${SESSION_AGENT:-}" ]; then printf '%s' "${SESSION_AGENT}"; return; fi
  if [ -n "${CLAUDECODE:-}" ] || [ -n "${CLAUDE_CODE_ENTRYPOINT:-}" ]; then printf 'claude-code'; return; fi
  if [ -n "${CODEX_SANDBOX:-}" ] || [ -n "${CODEX_HOME:-}" ] || [ -n "${OPENAI_CODEX:-}" ]; then printf 'codex'; return; fi
  printf 'human'
}
AGENT=$(detect_agent)
DEVICE="${SESSION_DEVICE:-$(hostname 2>/dev/null || printf 'unknown')}"
WHO="${SESSION_USER:-$(git -C "${ROOT}" config user.name 2>/dev/null || printf 'unknown')}"
NOW() { date '+%Y-%m-%d %H:%M:%S %z'; }
STAMP() { date '+%Y-%m-%d-%H%M%S'; }

# --- コマンド ----------------------------------------------------------------
cmd_show() {
  if [ -f "${STATE}" ]; then
    echo "================ 共有状態 (sessions/STATE.md) ================"
    cat "${STATE}"
  else
    echo "(STATE.md がまだありません。'session.sh start' で開始してください)"
  fi
  latest=$(ls -1t "${LOG_DIR}"/*.md 2>/dev/null | head -n 1 || true)
  if [ -n "${latest:-}" ]; then
    echo
    echo "================ 直近ログ ($(basename "${latest}")) ================"
    cat "${latest}"
  fi
}

cmd_start() {
  title=${1:-作業}
  file="${LOG_DIR}/$(STAMP)-${AGENT}.md"
  {
    echo "# ${title}"
    echo
    echo "- 開始: $(NOW)"
    echo "- 担当: ${WHO} / 端末: ${DEVICE} / エージェント: ${AGENT}"
    echo
    echo "## 経過"
    echo
  } > "${file}"
  # このチェックアウト内での相対パスを進行中として記録（git管理外）
  printf 'log/%s\n' "$(basename "${file}")" > "${ACTIVE}"
  echo "セッション開始: ${file}"
  echo "（メモ追記は 'sessions/session.sh log \"...\"'、締めは 'end'）"
}

active_file() {
  if [ -f "${ACTIVE}" ]; then
    rel=$(cat "${ACTIVE}")
    if [ -f "${SESSIONS_DIR}/${rel}" ]; then printf '%s' "${SESSIONS_DIR}/${rel}"; return 0; fi
  fi
  # フォールバック: 直近のログファイル
  ls -1t "${LOG_DIR}"/*.md 2>/dev/null | head -n 1
}

cmd_log() {
  msg=${1:-}
  if [ -z "${msg}" ]; then echo "追記する内容を渡してください: session.sh log \"...\"" >&2; exit 1; fi
  file=$(active_file)
  if [ -z "${file:-}" ]; then
    echo "進行中セッションがありません。先に 'session.sh start' を実行してください。" >&2
    exit 1
  fi
  printf -- '- [%s] %s\n' "$(NOW)" "${msg}" >> "${file}"
  echo "追記しました → $(basename "${file}")"
}

cmd_end() {
  summary=${1:-}
  file=$(active_file)
  if [ -z "${file:-}" ]; then
    echo "進行中セッションがありません。" >&2
    exit 1
  fi
  {
    echo
    echo "## まとめ"
    echo "- 終了: $(NOW)"
    [ -n "${summary}" ] && printf -- '- %s\n' "${summary}"
  } >> "${file}"
  [ -f "${ACTIVE}" ] && rm -f "${ACTIVE}"
  echo "セッションを締めました → $(basename "${file}")"
  echo
  echo "▶ 次に sessions/STATE.md の「現在の焦点 / 次の一手 / 決定事項」を更新し、"
  echo "  'sessions/session.sh sync' で全端末へ共有してください。"
}

cmd_sync() {
  echo "→ pull (origin $(git -C "${ROOT}" rev-parse --abbrev-ref HEAD))"
  git -C "${ROOT}" pull --rebase --autostash origin "$(git -C "${ROOT}" rev-parse --abbrev-ref HEAD)" || true
  if [ -n "$(git -C "${ROOT}" status --porcelain -- sessions 2>/dev/null)" ]; then
    git -C "${ROOT}" add sessions
    git -C "${ROOT}" commit -m "sessions: update shared state (${AGENT}/${DEVICE})" >/dev/null
    echo "→ commit 済み"
  else
    echo "→ commit なし（sessions に変更なし）"
  fi
  git -C "${ROOT}" push -u origin "$(git -C "${ROOT}" rev-parse --abbrev-ref HEAD)"
  echo "→ push 完了"
}

usage() {
  sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
}

sub=${1:-show}
[ $# -gt 0 ] && shift || true
case "${sub}" in
  show)  cmd_show "$@" ;;
  start) cmd_start "$@" ;;
  log)   cmd_log "$@" ;;
  end)   cmd_end "$@" ;;
  sync)  cmd_sync "$@" ;;
  help|-h|--help) usage ;;
  *) echo "不明なコマンド: ${sub}" >&2; usage; exit 1 ;;
esac
