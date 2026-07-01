#!/bin/sh
# session.sh - クロス端末・クロスエージェントのセッション状態を扱う共通CLI
#
# 携帯 / PCアプリ / ターミナル / Codex のどこから使っても、この1本のスクリプトで
# 同じ「作業の文脈（STATE.md・各セッションのログ・日次ダイジェスト）」を読み書き
# できます。同期の実体は git です。
#
# 使い方:
#   sessions/session.sh show               現在の状態・現在セッションの要約・今日の流れを表示
#   sessions/session.sh start "見出し" [名前] 新しいセッションを開始（ID=日付+名前）
#   sessions/session.sh list               セッション一覧（進行中/完了）を番号付きで表示
#   sessions/session.sh resume [選択子]     既存セッションに合流（サマリを引き継ぐ）
#   sessions/session.sh log   "メモ"        現在のセッションに追記（日次にも自動記録）
#   sessions/session.sh summary "要約"      現在セッションの「引き継ぎサマリ」を更新
#   sessions/session.sh end   "まとめ"      現在のセッションを締める（任意。締めなくても記録は残る）
#   sessions/session.sh today [YYYY-MM-DD] 指定日（既定は今日）の日次ダイジェストを表示
#   sessions/session.sh mirror             Obsidian vault へバックアップ（あれば）
#   sessions/session.sh sync               pull → commit → push（＋ Obsidian へミラー）
#
# セッションIDは「日付+名前」（例: 2026-07-01-競馬アプリ調整）。同日同名は -2, -3 が付きます。
# resume の「選択子」は 一覧の番号 / IDの一部 / 見出しの一部 のいずれか。
#
# 記録する「誰が」の情報は環境変数で上書きできます:
#   SESSION_AGENT   例) claude-code / codex / human   （未指定なら自動判定）
#   SESSION_DEVICE  例) iphone / macbook / work-pc     （未指定ならホスト名）
#   SESSION_USER    例) yoshi                          （未指定なら git user.name）
#
# Obsidian バックアップ（vault が存在する端末＝ローカルPC でのみ動作）:
#   OBSIDIAN_VAULT  vault のパス（未指定なら my-apps の兄弟で .obsidian を持つ repo を自動検出）
#   OBSIDIAN_SUBDIR vault 内の保存先（既定: my-apps-sessions）
#   OBSIDIAN_PUSH   auto(既定)=vault が git なら commit/push, no=コピーのみ

set -eu

# --- 位置の解決 --------------------------------------------------------------
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "${ROOT}" ]; then
  SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  ROOT=$(dirname -- "${SCRIPT_DIR}")
fi
SESSIONS_DIR="${ROOT}/sessions"
STATE="${SESSIONS_DIR}/STATE.md"
LOG_DIR="${SESSIONS_DIR}/log"
DAILY_DIR="${SESSIONS_DIR}/daily"
ACTIVE="${SESSIONS_DIR}/.active"   # このチェックアウトが指す「現在のセッション」（git管理外・端末ローカル）
OBS_SUBDIR="${OBSIDIAN_SUBDIR:-my-apps-sessions}"

mkdir -p "${LOG_DIR}" "${DAILY_DIR}"

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
HM()  { date '+%H:%M'; }
TODAY() { date '+%Y-%m-%d'; }

# --- 小道具 ------------------------------------------------------------------
list_files() { ls -1t "${LOG_DIR}"/*.md 2>/dev/null || true; }
title_of()  { sed -n '1s/^# //p' "$1" 2>/dev/null; }
id_of()     { b=$(basename "$1"); printf '%s' "${b%.md}"; }
is_closed() { grep -q '^## まとめ' "$1" 2>/dev/null; }
status_of() { if is_closed "$1"; then printf '完了'; else printf '進行中'; fi; }

slugify() {  # 見出し → ファイル名に使う名前（日本語は保持、空白・記号は - に）
  s=$(printf '%s' "$1" | sed 's#[/\\:*?"<>|[:space:]]\{1,\}#-#g; s/^-\{1,\}//; s/-\{1,\}$//')
  [ -n "${s}" ] || s="session"
  printf '%s' "${s}"
}

daily_append() {  # $1: 行本文
  day_file="${DAILY_DIR}/$(TODAY).md"
  [ -f "${day_file}" ] || printf '# %s の作業ダイジェスト\n\n' "$(TODAY)" > "${day_file}"
  printf -- '- [%s] %s\n' "$(HM)" "$1" >> "${day_file}"
}

active_file() {
  if [ -f "${ACTIVE}" ]; then
    rel=$(cat "${ACTIVE}")
    [ -f "${SESSIONS_DIR}/${rel}" ] && { printf '%s' "${SESSIONS_DIR}/${rel}"; return 0; }
  fi
  return 1
}
set_active() { printf 'log/%s\n' "$(basename "$1")" > "${ACTIVE}"; }

# 「## 引き継ぎサマリ」ブロック（見出し＋本文）を出力
print_carry() { awk '/^## 引き継ぎサマリ$/{f=1;print;next} f&&/^## /{exit} f{print}' "$1"; }

# セッションの短い要約（サマリ＋直近の経過）を出力＝コンテキスト節約
print_brief() {
  f=$1
  printf '# %s  (%s) [%s]\n' "$(title_of "$f")" "$(id_of "$f")" "$(status_of "$f")"
  sed -n '3,4p' "$f"   # 開始/担当メタ行
  echo
  print_carry "$f"
  echo
  echo "直近の経過（末尾5件）:"
  grep '^- \[' "$f" 2>/dev/null | tail -n 5 || true
  echo "（フルログ: sessions/$(printf 'log/%s' "$(basename "$f")")）"
}

# --- コマンド ----------------------------------------------------------------
cmd_show() {
  if [ -f "${STATE}" ]; then
    echo "================ 共有状態 (sessions/STATE.md) ================"
    cat "${STATE}"
  else
    echo "(STATE.md がまだありません。'session.sh start' で開始してください)"
  fi

  if af=$(active_file); then
    echo
    echo "================ このチェックアウトの現在セッション ================"
    print_brief "${af}"
  else
    open=$(for f in $(list_files); do is_closed "$f" || echo "$f"; done)
    if [ -n "${open}" ]; then
      echo
      echo "================ 進行中セッション（resume で合流できます） ================"
      i=0
      for f in ${open}; do
        i=$((i+1))
        printf '  %d) [%s] %s  (%s)\n' "$i" "$(status_of "$f")" "$(title_of "$f")" "$(id_of "$f")"
      done
      echo "  → 続きをやるなら: sessions/session.sh resume <番号/ID/見出しの一部>"
    fi
  fi

  day_file="${DAILY_DIR}/$(TODAY).md"
  if [ -f "${day_file}" ]; then
    echo
    echo "================ 今日の流れ ($(TODAY)) ================"
    cat "${day_file}"
  fi
}

cmd_list() {
  files=$(list_files)
  if [ -z "${files}" ]; then echo "(セッションはまだありません)"; return; fi
  echo "セッション一覧（新しい順）:"
  i=0
  for f in ${files}; do
    i=$((i+1))
    printf '  %d) [%s] %s\n        ID: %s\n' "$i" "$(status_of "$f")" "$(title_of "$f")" "$(id_of "$f")"
  done
  if af=$(active_file); then
    echo
    echo "現在このチェックアウトが指しているセッション: $(id_of "${af}")"
  fi
}

cmd_start() {
  title=${1:-作業}
  name=${2:-${title}}                       # 第2引数で名前を明示指定可
  slug=$(slugify "${name}")
  base="$(TODAY)-${slug}"
  file="${LOG_DIR}/${base}.md"
  if [ -e "${file}" ]; then n=2; while [ -e "${LOG_DIR}/${base}-${n}.md" ]; do n=$((n+1)); done; file="${LOG_DIR}/${base}-${n}.md"; fi
  {
    echo "# ${title}"
    echo
    echo "- 開始: $(NOW)"
    echo "- 担当: ${WHO} / 端末: ${DEVICE} / エージェント: ${AGENT}"
    echo
    echo "## 引き継ぎサマリ"
    echo "（未記入。'session.sh summary \"...\"' で更新。resume 時にここを最優先で読む）"
    echo
    echo "## 経過"
    echo
  } > "${file}"
  set_active "${file}"
  daily_append "▶ 開始: ${title}  ($(id_of "${file}") / ${DEVICE}・${AGENT})"
  echo "セッション開始: ${file}"
  echo "ID: $(id_of "${file}")"
  echo "（追記=log / 引き継ぎ用の要約=summary / 締め=end〔任意〕）"
}

# 選択子 → セッションファイル絶対パス（0=解決, 1=なし, 2=複数）
resolve_selector() {
  sel=$1
  files=$(list_files)
  case "${sel}" in
    ''|*[!0-9]*) : ;;
    *)
      i=0
      for f in ${files}; do i=$((i+1)); [ "$i" = "${sel}" ] && { printf '%s' "$f"; return 0; }; done
      return 1 ;;
  esac
  matches=""
  for f in ${files}; do
    if id_of "$f" | grep -qi -- "${sel}" || title_of "$f" | grep -qi -- "${sel}"; then
      matches="${matches}${f}
"
    fi
  done
  n=$(printf '%s' "${matches}" | grep -c . || true)
  if [ "${n}" -eq 1 ]; then printf '%s' "$(printf '%s' "${matches}" | sed -n '1p')"; return 0; fi
  if [ "${n}" -gt 1 ]; then
    echo "複数該当しました。番号かより具体的な語で指定してください:" >&2
    printf '%s' "${matches}" | while IFS= read -r f; do [ -n "$f" ] && printf '  - %s  (%s)\n' "$(title_of "$f")" "$(id_of "$f")" >&2; done
    return 2
  fi
  return 1
}

cmd_resume() {
  sel=${1:-}
  if [ -z "${sel}" ]; then
    files=$(list_files)
    if [ -z "${files}" ]; then echo "合流できるセッションがありません。'start' で開始してください。"; return; fi
    if [ -t 0 ]; then
      cmd_list
      printf 'どのセッションに合流しますか？番号: '
      read -r sel || return 1
    else
      echo "合流先を指定してください: session.sh resume <番号/ID/見出しの一部>"
      cmd_list
      return 1
    fi
  fi
  if target=$(resolve_selector "${sel}"); then
    set_active "${target}"
    daily_append "↳ 合流: $(title_of "${target}")  ($(id_of "${target}") / ${DEVICE}・${AGENT})"
    echo "現在セッションを切り替えました。以降の log/summary/end はこのセッションに入ります。"
    echo
    echo "======== 引き継ぎ用サマリ（ここから続けてください） ========"
    print_brief "${target}"
  else
    rc=$?
    [ "${rc}" = "1" ] && echo "該当するセッションが見つかりませんでした: ${sel}" >&2
    return 1
  fi
}

cmd_log() {
  msg=${1:-}
  if [ -z "${msg}" ]; then echo "追記する内容を渡してください: session.sh log \"...\"" >&2; exit 1; fi
  if ! file=$(active_file); then
    echo "現在のセッションがありません。'start' で開始するか 'resume' で合流してください。" >&2
    cmd_list >&2 || true
    exit 1
  fi
  printf -- '- [%s] %s\n' "$(NOW)" "${msg}" >> "${file}"
  daily_append "${msg}  (→ $(title_of "${file}"))"
  echo "追記しました → $(id_of "${file}")"
}

cmd_summary() {
  msg=${1:-}
  if [ -z "${msg}" ]; then echo "引き継ぎサマリの本文を渡してください: session.sh summary \"...\"" >&2; exit 1; fi
  if ! file=$(active_file); then echo "現在のセッションがありません。" >&2; exit 1; fi
  tmp="${file}.tmp.$$"
  if grep -q '^## 引き継ぎサマリ$' "${file}"; then
    # 既存ブロックを置換（見出し〜次の "## " の手前まで）
    awk -v s="${msg}" '
      /^## 引き継ぎサマリ$/{print; print s; print ""; skip=1; next}
      skip && /^## /{skip=0}
      skip{next}
      {print}
    ' "${file}" > "${tmp}"
  else
    # 見出しが無い旧セッションには「## 経過」の直前へ挿入
    awk -v s="${msg}" '
      /^## 経過$/ && !done {print "## 引き継ぎサマリ"; print s; print ""; done=1}
      {print}
      END{ if(!done){ print ""; print "## 引き継ぎサマリ"; print s } }
    ' "${file}" > "${tmp}"
  fi
  mv "${tmp}" "${file}"
  daily_append "✎ サマリ更新: $(title_of "${file}")"
  echo "引き継ぎサマリを更新しました → $(id_of "${file}")"
}

cmd_end() {
  summary=${1:-}
  if ! file=$(active_file); then echo "現在のセッションがありません。" >&2; exit 1; fi
  {
    echo
    echo "## まとめ"
    echo "- 終了: $(NOW)"
    [ -n "${summary}" ] && printf -- '- %s\n' "${summary}"
  } >> "${file}"
  daily_append "■ 完了: $(title_of "${file}")${summary:+ — ${summary}}  ($(id_of "${file}"))"
  [ -f "${ACTIVE}" ] && rm -f "${ACTIVE}"
  echo "セッションを締めました → $(id_of "${file}")"
  echo "▶ 必要なら STATE.md を更新し 'session.sh sync' で共有してください。"
}

cmd_today() {
  day=${1:-$(TODAY)}
  day_file="${DAILY_DIR}/${day}.md"
  if [ -f "${day_file}" ]; then cat "${day_file}"; else echo "(${day} のダイジェストはありません)"; fi
}

# --- Obsidian ミラー ---------------------------------------------------------
resolve_vault() {
  if [ -n "${OBSIDIAN_VAULT:-}" ]; then [ -d "${OBSIDIAN_VAULT}" ] && printf '%s' "${OBSIDIAN_VAULT}"; return; fi
  parent=$(dirname "${ROOT}")
  for d in "${parent}"/*/; do
    [ "${d%/}" = "${ROOT}" ] && continue
    if [ -d "${d}.obsidian" ]; then printf '%s' "${d%/}"; return; fi
  done
}

cmd_mirror() {
  vault=$(resolve_vault)
  if [ -z "${vault:-}" ]; then
    echo "Obsidian vault が見つからないためスキップ（OBSIDIAN_VAULT 未設定 & 兄弟に .obsidian repo なし）。"
    return 0
  fi
  dest="${vault}/${OBS_SUBDIR}"
  mkdir -p "${dest}/log" "${dest}/daily"
  [ -f "${STATE}" ] && cp -f "${STATE}" "${dest}/STATE.md"
  cp -f "${LOG_DIR}"/*.md   "${dest}/log/"   2>/dev/null || true
  cp -f "${DAILY_DIR}"/*.md "${dest}/daily/" 2>/dev/null || true
  echo "Obsidian へミラーしました: ${dest}"
  # vault が git repo なら push（OBSIDIAN_PUSH=no で無効化）
  if [ "${OBSIDIAN_PUSH:-auto}" != "no" ] && git -C "${vault}" rev-parse --git-dir >/dev/null 2>&1; then
    vbranch=$(git -C "${vault}" rev-parse --abbrev-ref HEAD)
    git -C "${vault}" pull --rebase --autostash origin "${vbranch}" 2>/dev/null || true
    if [ -n "$(git -C "${vault}" status --porcelain -- "${OBS_SUBDIR}" 2>/dev/null)" ]; then
      git -C "${vault}" add "${OBS_SUBDIR}"
      git -C "${vault}" commit -m "my-apps sessions backup ($(NOW))" >/dev/null
      if git -C "${vault}" push origin "${vbranch}"; then
        echo "Obsidian vault を push しました。"
      else
        echo "※ Obsidian vault の push に失敗（commit は済み）。vault の remote/認証を確認してください。"
      fi
    else
      echo "Obsidian vault に変更なし。"
    fi
  fi
}

cmd_sync() {
  branch=$(git -C "${ROOT}" rev-parse --abbrev-ref HEAD)
  echo "→ pull (origin ${branch})"
  git -C "${ROOT}" pull --rebase --autostash origin "${branch}" || true
  if [ -n "$(git -C "${ROOT}" status --porcelain -- sessions 2>/dev/null)" ]; then
    git -C "${ROOT}" add sessions
    git -C "${ROOT}" commit -m "sessions: update shared state (${AGENT}/${DEVICE})" >/dev/null
    echo "→ commit 済み"
  else
    echo "→ commit なし（sessions に変更なし）"
  fi
  git -C "${ROOT}" push -u origin "${branch}"
  echo "→ push 完了"
  echo "→ Obsidian ミラー"
  cmd_mirror
}

usage() { sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; }

sub=${1:-show}
[ $# -gt 0 ] && shift || true
case "${sub}" in
  show)    cmd_show "$@" ;;
  list|ls) cmd_list "$@" ;;
  start)   cmd_start "$@" ;;
  resume|switch|attach) cmd_resume "$@" ;;
  log)     cmd_log "$@" ;;
  summary) cmd_summary "$@" ;;
  end)     cmd_end "$@" ;;
  today)   cmd_today "$@" ;;
  mirror)  cmd_mirror "$@" ;;
  sync)    cmd_sync "$@" ;;
  help|-h|--help) usage ;;
  *) echo "不明なコマンド: ${sub}" >&2; usage; exit 1 ;;
esac
