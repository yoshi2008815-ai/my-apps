#!/usr/bin/env pwsh
# session.ps1 - session.sh の PowerShell 版（Windows / PowerShell 用）
#
# session.sh と同じファイル（STATE.md・log/・daily/・.active・.obsidian-path）を
# 読み書きするので、.sh と .ps1 は完全に相互運用できます。PowerShell から使う端末
# （Windows ローカルPC・Codex・Claude Code on Windows）はこちらを使ってください。
#
# 使い方:
#   sessions\session.ps1 show
#   sessions\session.ps1 start "見出し" [名前]
#   sessions\session.ps1 list
#   sessions\session.ps1 resume 競馬
#   sessions\session.ps1 log "メモ"
#   sessions\session.ps1 summary "要約"
#   sessions\session.ps1 end "まとめ"
#   sessions\session.ps1 today [YYYY-MM-DD]
#   sessions\session.ps1 set-vault "C:\Users\user\Documents\Obsidian Vault"
#   sessions\session.ps1 mirror
#   sessions\session.ps1 sync
#
# 環境変数: SESSION_AGENT / SESSION_DEVICE / SESSION_USER /
#           OBSIDIAN_VAULT / OBSIDIAN_SUBDIR / OBSIDIAN_PUSH（auto|no）

[CmdletBinding()]
param(
  [Parameter(Position = 0)] [string] $Cmd = 'show',
  [Parameter(Position = 1, ValueFromRemainingArguments = $true)] [string[]] $Rest
)
$ErrorActionPreference = 'Stop'

# --- UTF-8(BOMなし) で読み書き（.sh 版と同一フォーマットに揃える）-----------
$Utf8 = New-Object System.Text.UTF8Encoding($false)
function Write-Text([string]$Path, [string]$Text) { [System.IO.File]::WriteAllText($Path, $Text, $Utf8) }
function Append-Text([string]$Path, [string]$Text) { [System.IO.File]::AppendAllText($Path, $Text, $Utf8) }
function Read-Lines([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return @() }
  return [System.IO.File]::ReadAllLines($Path, $Utf8)
}

# --- 位置の解決 --------------------------------------------------------------
$Root = (& git rev-parse --show-toplevel 2>$null)
if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
$Root = $Root.Trim()
$SessionsDir = Join-Path $Root 'sessions'
$State       = Join-Path $SessionsDir 'STATE.md'
$LogDir      = Join-Path $SessionsDir 'log'
$DailyDir    = Join-Path $SessionsDir 'daily'
$Active      = Join-Path $SessionsDir '.active'
$VaultCfg    = Join-Path $SessionsDir '.obsidian-path'
$ObsSubdir   = if ($env:OBSIDIAN_SUBDIR) { $env:OBSIDIAN_SUBDIR } else { 'my-apps-sessions' }
New-Item -ItemType Directory -Force -Path $LogDir, $DailyDir | Out-Null

# --- 誰が / どの端末 / どのエージェント --------------------------------------
function Get-Agent {
  if ($env:SESSION_AGENT) { return $env:SESSION_AGENT }
  if ($env:CLAUDECODE -or $env:CLAUDE_CODE_ENTRYPOINT) { return 'claude-code' }
  if ($env:CODEX_SANDBOX -or $env:CODEX_HOME -or $env:OPENAI_CODEX) { return 'codex' }
  return 'human'
}
$Agent  = Get-Agent
$Device = if ($env:SESSION_DEVICE) { $env:SESSION_DEVICE } elseif ($env:COMPUTERNAME) { $env:COMPUTERNAME } else { 'unknown' }
$Who    = if ($env:SESSION_USER) { $env:SESSION_USER } else { (& git -C $Root config user.name 2>$null) }
if (-not $Who) { $Who = 'unknown' }

function Now   { (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz') }
function HM    { (Get-Date -Format 'HH:mm') }
function Today { (Get-Date -Format 'yyyy-MM-dd') }

# --- 小道具 ------------------------------------------------------------------
function List-Files {
  Get-ChildItem -Path $LogDir -Filter *.md -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
}
function Title-Of([string]$f) {
  $lines = Read-Lines $f
  if ($lines.Count -gt 0 -and $lines[0] -match '^# (.*)') { return $Matches[1] }
  return ''
}
function Id-Of([string]$f) { [System.IO.Path]::GetFileNameWithoutExtension($f) }
function Is-Closed([string]$f) { @(Read-Lines $f | Where-Object { $_ -eq '## まとめ' }).Count -gt 0 }
function Status-Of([string]$f) { if (Is-Closed $f) { '完了' } else { '進行中' } }

function Slugify([string]$s) {
  $x = ($s -replace '[/\\:*?"<>|\s]+', '-').Trim('-')
  if ([string]::IsNullOrEmpty($x)) { $x = 'session' }
  return $x
}

function Daily-Append([string]$line) {
  $df = Join-Path $DailyDir ((Today) + '.md')
  if (-not (Test-Path -LiteralPath $df)) { Write-Text $df ("# " + (Today) + " の作業ダイジェスト`n`n") }
  Append-Text $df ("- [" + (HM) + "] " + $line + "`n")
}

function Active-File {
  if (Test-Path -LiteralPath $Active) {
    $rel = ([System.IO.File]::ReadAllText($Active, $Utf8)).Trim()
    if ($rel) {
      $p = Join-Path $SessionsDir $rel
      if (Test-Path -LiteralPath $p) { return (Resolve-Path -LiteralPath $p).Path }
    }
  }
  return $null
}
function Set-ActiveFile([string]$f) { Write-Text $Active ('log/' + [System.IO.Path]::GetFileName($f) + "`n") }

# 「## 引き継ぎサマリ」ブロック（見出し＋本文）を返す
function Print-Carry([string]$f) {
  $out = @(); $inb = $false
  foreach ($l in (Read-Lines $f)) {
    if ($l -eq '## 引き継ぎサマリ') { $inb = $true; $out += $l; continue }
    if ($inb -and $l -match '^## ') { break }
    if ($inb) { $out += $l }
  }
  return ($out -join "`n")
}

# サマリ＋直近の経過（コンテキスト節約）
function Print-Brief([string]$f) {
  $lines = Read-Lines $f
  ("# {0}  ({1}) [{2}]" -f (Title-Of $f), (Id-Of $f), (Status-Of $f))
  if ($lines.Count -ge 4) { $lines[2]; $lines[3] }
  ""
  Print-Carry $f
  ""
  "直近の経過（末尾5件）:"
  @($lines | Where-Object { $_ -match '^- \[' } | Select-Object -Last 5)
  ("（フルログ: sessions/log/{0}）" -f [System.IO.Path]::GetFileName($f))
}

# --- コマンド ----------------------------------------------------------------
function Cmd-Show {
  if (Test-Path -LiteralPath $State) {
    "================ 共有状態 (sessions/STATE.md) ================"
    [System.IO.File]::ReadAllText($State, $Utf8).TrimEnd()
  } else {
    "(STATE.md がまだありません。'session.ps1 start' で開始してください)"
  }
  $af = Active-File
  if ($af) {
    ""
    "================ このチェックアウトの現在セッション ================"
    Print-Brief $af
  } else {
    $open = @(List-Files | Where-Object { -not (Is-Closed $_.FullName) })
    if ($open.Count -gt 0) {
      ""
      "================ 進行中セッション（resume で合流できます） ================"
      $i = 0
      foreach ($f in $open) { $i++; ("  {0}) [{1}] {2}  ({3})" -f $i, (Status-Of $f.FullName), (Title-Of $f.FullName), (Id-Of $f.FullName)) }
      "  → 続きをやるなら: sessions/session.ps1 resume <番号/ID/見出しの一部>"
    }
  }
  $df = Join-Path $DailyDir ((Today) + '.md')
  if (Test-Path -LiteralPath $df) {
    ""
    ("================ 今日の流れ ({0}) ================" -f (Today))
    [System.IO.File]::ReadAllText($df, $Utf8).TrimEnd()
  }
}

function Cmd-List {
  $files = @(List-Files)
  if ($files.Count -eq 0) { "(セッションはまだありません)"; return }
  "セッション一覧（新しい順）:"
  $i = 0
  foreach ($f in $files) {
    $i++
    ("  {0}) [{1}] {2}" -f $i, (Status-Of $f.FullName), (Title-Of $f.FullName))
    ("        ID: {0}" -f (Id-Of $f.FullName))
  }
  $af = Active-File
  if ($af) { ""; ("現在このチェックアウトが指しているセッション: {0}" -f (Id-Of $af)) }
}

function Cmd-Start {
  $title = if ($Rest.Count -ge 1 -and $Rest[0]) { $Rest[0] } else { '作業' }
  $name  = if ($Rest.Count -ge 2 -and $Rest[1]) { $Rest[1] } else { $title }
  $slug  = Slugify $name
  $base  = (Today) + '-' + $slug
  $file  = Join-Path $LogDir ($base + '.md')
  if (Test-Path -LiteralPath $file) {
    $n = 2
    while (Test-Path -LiteralPath (Join-Path $LogDir ("$base-$n.md"))) { $n++ }
    $file = Join-Path $LogDir ("$base-$n.md")
  }
  $body = @(
    "# $title", "",
    "- 開始: $(Now)",
    "- 担当: $Who / 端末: $Device / エージェント: $Agent", "",
    "## 引き継ぎサマリ",
    "（未記入。'session.ps1 summary ""...""' で更新。resume 時にここを最優先で読む）", "",
    "## 経過", ""
  ) -join "`n"
  Write-Text $file ($body + "`n")
  Set-ActiveFile $file
  Daily-Append ("▶ 開始: $title  ({0} / $Device・$Agent)" -f (Id-Of $file))
  "セッション開始: $file"
  ("ID: {0}" -f (Id-Of $file))
  "（追記=log / 引き継ぎ用の要約=summary / 締め=end〔任意〕）"
}

# 選択子 → セッションファイル。$null=なし, 'MULTI'=複数
function Resolve-Selector([string]$sel) {
  $files = @(List-Files)
  if ($sel -match '^\d+$') {
    $idx = [int]$sel
    if ($idx -ge 1 -and $idx -le $files.Count) { return $files[$idx - 1].FullName }
    return $null
  }
  $matches = @($files | Where-Object {
      ((Id-Of $_.FullName) -match [regex]::Escape($sel)) -or ((Title-Of $_.FullName) -match [regex]::Escape($sel))
    })
  if ($matches.Count -eq 1) { return $matches[0].FullName }
  if ($matches.Count -gt 1) {
    Write-Host "複数該当しました。番号かより具体的な語で指定してください:"
    foreach ($m in $matches) { Write-Host ("  - {0}  ({1})" -f (Title-Of $m.FullName), (Id-Of $m.FullName)) }
    return 'MULTI'
  }
  return $null
}

function Cmd-Resume {
  $sel = if ($Rest.Count -ge 1) { $Rest[0] } else { '' }
  if (-not $sel) {
    $files = @(List-Files)
    if ($files.Count -eq 0) { "合流できるセッションがありません。'start' で開始してください。"; return }
    Cmd-List
    $sel = Read-Host "どのセッションに合流しますか？番号"
    if (-not $sel) { return }
  }
  $target = Resolve-Selector $sel
  if ($target -eq 'MULTI') { return }
  if (-not $target) { Write-Host "該当するセッションが見つかりませんでした: $sel"; return }
  Set-ActiveFile $target
  Daily-Append ("↳ 合流: {0}  ({1} / $Device・$Agent)" -f (Title-Of $target), (Id-Of $target))
  "現在セッションを切り替えました。以降の log/summary/end はこのセッションに入ります。"
  ""
  "======== 引き継ぎ用サマリ（ここから続けてください） ========"
  Print-Brief $target
}

function Cmd-Log {
  $msg = if ($Rest.Count -ge 1) { $Rest[0] } else { '' }
  if (-not $msg) { Write-Host "追記する内容を渡してください: session.ps1 log ""..."""; exit 1 }
  $file = Active-File
  if (-not $file) { Write-Host "現在のセッションがありません。'start' か 'resume' を先に。"; Cmd-List; exit 1 }
  Append-Text $file ("- [$(Now)] $msg`n")
  Daily-Append ("$msg  (→ {0})" -f (Title-Of $file))
  ("追記しました → {0}" -f (Id-Of $file))
}

function Cmd-Summary {
  $msg = if ($Rest.Count -ge 1) { $Rest[0] } else { '' }
  if (-not $msg) { Write-Host "引き継ぎサマリの本文を渡してください: session.ps1 summary ""..."""; exit 1 }
  $file = Active-File
  if (-not $file) { Write-Host "現在のセッションがありません。"; exit 1 }
  $lines = Read-Lines $file
  $out = @(); $skip = $false; $has = $false
  foreach ($l in $lines) { if ($l -eq '## 引き継ぎサマリ') { $has = $true; break } }
  if ($has) {
    foreach ($l in $lines) {
      if ($l -eq '## 引き継ぎサマリ') { $out += $l; $out += $msg; $out += ''; $skip = $true; continue }
      if ($skip -and $l -match '^## ') { $skip = $false }
      if ($skip) { continue }
      $out += $l
    }
  } else {
    $done = $false
    foreach ($l in $lines) {
      if ($l -eq '## 経過' -and -not $done) { $out += '## 引き継ぎサマリ'; $out += $msg; $out += ''; $done = $true }
      $out += $l
    }
    if (-not $done) { $out += ''; $out += '## 引き継ぎサマリ'; $out += $msg }
  }
  Write-Text $file (($out -join "`n") + "`n")
  Daily-Append ("✎ サマリ更新: {0}" -f (Title-Of $file))
  ("引き継ぎサマリを更新しました → {0}" -f (Id-Of $file))
}

function Cmd-End {
  $summary = if ($Rest.Count -ge 1) { $Rest[0] } else { '' }
  $file = Active-File
  if (-not $file) { Write-Host "現在のセッションがありません。"; exit 1 }
  $tail = "`n## まとめ`n- 終了: $(Now)`n"
  if ($summary) { $tail += "- $summary`n" }
  Append-Text $file $tail
  $extra = if ($summary) { " — $summary" } else { '' }
  Daily-Append ("■ 完了: {0}{1}  ({2})" -f (Title-Of $file), $extra, (Id-Of $file))
  if (Test-Path -LiteralPath $Active) { Remove-Item -LiteralPath $Active -Force }
  ("セッションを締めました → {0}" -f (Id-Of $file))
  "▶ 必要なら STATE.md を更新し 'session.ps1 sync' で共有してください。"
}

function Cmd-Today {
  $day = if ($Rest.Count -ge 1 -and $Rest[0]) { $Rest[0] } else { (Today) }
  $df = Join-Path $DailyDir ($day + '.md')
  if (Test-Path -LiteralPath $df) { [System.IO.File]::ReadAllText($df, $Utf8).TrimEnd() } else { "($day のダイジェストはありません)" }
}

# --- Obsidian ミラー ---------------------------------------------------------
function Vault-Candidates {
  if ($env:OBSIDIAN_VAULT) { $env:OBSIDIAN_VAULT }
  if (Test-Path -LiteralPath $VaultCfg) {
    foreach ($l in (Read-Lines $VaultCfg)) { if ($l.Trim()) { $l.Trim() } }
  }
  if ($env:USERPROFILE) { Join-Path $env:USERPROFILE 'Documents\Obsidian Vault' }
  'C:\Users\user\Documents\Obsidian Vault'
  if ($env:USERNAME) { "C:\Users\$($env:USERNAME)\Documents\Obsidian Vault" }
}

function Resolve-Vault {
  foreach ($c in (Vault-Candidates)) {
    if ($c -and (Test-Path -LiteralPath $c -PathType Container)) { return (Resolve-Path -LiteralPath $c).Path }
  }
  # 兄弟に .obsidian を持つ repo
  $parent = Split-Path -Parent $Root
  Get-ChildItem -Path $parent -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.FullName -ne $Root -and (Test-Path -LiteralPath (Join-Path $_.FullName '.obsidian'))) { return $_.FullName }
  } | Select-Object -First 1
}

function Cmd-SetVault {
  $p = if ($Rest.Count -ge 1 -and $Rest[0]) { $Rest[0] } else { Resolve-Vault }
  if (-not $p) {
    Write-Host "vault を自動検出できませんでした。パスを渡してください:"
    Write-Host '  sessions\session.ps1 set-vault "C:\Users\user\Documents\Obsidian Vault"'
    exit 1
  }
  if (-not (Test-Path -LiteralPath $p -PathType Container)) { Write-Host "ディレクトリが存在しません: $p"; exit 1 }
  Write-Text $VaultCfg ((Resolve-Path -LiteralPath $p).Path + "`n")
  "Obsidian vault のパスを保存しました（この端末のみ・git非共有）:"
  "  $p"
}

function Cmd-Mirror {
  $vault = Resolve-Vault
  if (-not $vault) { "Obsidian vault が見つからないためスキップ（set-vault で登録できます）。"; return }
  $dest = Join-Path $vault $ObsSubdir
  New-Item -ItemType Directory -Force -Path (Join-Path $dest 'log'), (Join-Path $dest 'daily') | Out-Null
  if (Test-Path -LiteralPath $State) { Copy-Item -LiteralPath $State -Destination (Join-Path $dest 'STATE.md') -Force }
  Get-ChildItem -Path $LogDir   -Filter *.md -File -ErrorAction SilentlyContinue | Copy-Item -Destination (Join-Path $dest 'log')   -Force
  Get-ChildItem -Path $DailyDir -Filter *.md -File -ErrorAction SilentlyContinue | Copy-Item -Destination (Join-Path $dest 'daily') -Force
  "Obsidian へミラーしました: $dest"
  $push = if ($env:OBSIDIAN_PUSH) { $env:OBSIDIAN_PUSH } else { 'auto' }
  if ($push -ne 'no') {
    & git -C $vault rev-parse --git-dir *> $null
    if ($LASTEXITCODE -eq 0) {
      $vbranch = (& git -C $vault rev-parse --abbrev-ref HEAD).Trim()
      & git -C $vault pull --rebase --autostash origin $vbranch *> $null
      $dirty = (& git -C $vault status --porcelain -- $ObsSubdir)
      if ($dirty) {
        & git -C $vault add $ObsSubdir
        & git -C $vault commit -m "my-apps sessions backup ($(Now))" *> $null
        & git -C $vault push origin $vbranch
        if ($LASTEXITCODE -eq 0) { "Obsidian vault を push しました。" }
        else { "※ Obsidian vault の push に失敗（commit は済み）。remote/認証を確認してください。" }
      } else { "Obsidian vault に変更なし。" }
    }
  }
}

function Cmd-Sync {
  $branch = (& git -C $Root rev-parse --abbrev-ref HEAD).Trim()
  "→ pull (origin $branch)"
  & git -C $Root pull --rebase --autostash origin $branch
  if (& git -C $Root status --porcelain -- sessions) {
    & git -C $Root add sessions
    & git -C $Root commit -m "sessions: update shared state ($Agent/$Device)" *> $null
    "→ commit 済み"
  } else { "→ commit なし（sessions に変更なし）" }
  & git -C $Root push -u origin $branch
  "→ push 完了"
  "→ Obsidian ミラー"
  Cmd-Mirror
}

switch ($Cmd) {
  'show'      { Cmd-Show }
  'list'      { Cmd-List }
  'ls'        { Cmd-List }
  'start'     { Cmd-Start }
  'resume'    { Cmd-Resume }
  'switch'    { Cmd-Resume }
  'attach'    { Cmd-Resume }
  'log'       { Cmd-Log }
  'summary'   { Cmd-Summary }
  'end'       { Cmd-End }
  'today'     { Cmd-Today }
  'set-vault' { Cmd-SetVault }
  'vault'     { Cmd-SetVault }
  'mirror'    { Cmd-Mirror }
  'sync'      { Cmd-Sync }
  default     { Write-Host "不明なコマンド: $Cmd"; Write-Host "使い方は sessions/session.ps1 の先頭コメントを参照。" }
}
