# さくらVPS × Claude Code Remote Control セットアップ手順

> スマホのClaudeアプリ（Codeタブ）から、さくらVPS上のClaude Codeを直接操作できるようにする手順。
> structureLab等、VPS上で動くプロジェクトの進捗確認・追加開発を外出先からスマホだけで行える。
> 2026-07-12 実施・動作確認済み（さくらVPS / Ubuntu 24.04 LTS / Claude Code v2.1.207）。

## 仕組み

1. VPS側でClaude Codeが動く（コマンドを実行するのはあくまでVPS上のClaude Code）
2. スマホ側は普段使っているClaudeアプリがそのまま窓口（追加アプリのインストール不要）
3. アプリの「Code」タブからVPS上のセッションに接続し、日本語で指示を送るだけ
4. VPS上のClaude Codeがbashコマンドを組み立てて実行し、結果がスマホに返ってくる

**ネットワーク要件**: VPS→Anthropicサーバー（api.anthropic.com / claude.ai）への
アウトバウンドHTTPS接続のみで成立する。**インバウンドのポート開放・さくらインターネット側の
API連携・ファイアウォール変更は一切不要**。

## 前提条件

| 項目 | 要件 |
|------|------|
| プラン | claude.aiサブスクリプション（Pro / Max / Team / Enterprise）。**APIキー認証では動かない** |
| CLIバージョン | Claude Code v2.1.51 以上（`claude --version`で確認） |
| アカウント | VPS側のログインは**スマホアプリと同じclaude.aiアカウント**であること |
| その他 | VPSへのSSH接続、tmux（プロセス維持用） |

## 初回セットアップ手順

### 1. SSHでVPSに接続

```bash
ssh ubuntu@<VPSのIPアドレス>
```

### 2. Claude Codeをインストール

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

`~/.local/bin/claude` にインストールされる。

### 3. PATHを通す

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
claude --version   # バージョンが出ればOK
```

> ⚠️ **ハマりどころ**: サーバーによってはSSHログイン時に`.bashrc`が読まれない
> （今回のさくらVPSがこれだった）。SSHで入り直すたびに「コマンドが見つかりません」に
> なる場合は、下記トラブルシューティング参照。

### 4. claude.aiアカウントでログイン

```bash
claude          # 起動（初回はログイン画面が出る。出なければ /login と打つ）
```

1. **「Claude account with subscription」を選択**（APIキーの方ではない）
2. 表示されたURLをスマホかPCのブラウザで開く
3. **スマホのClaudeアプリと同じアカウント**でログイン
4. ブラウザに表示された認証コードをターミナルに貼り付けてEnter

### 5. ワークスペースの信頼確認

「Do you trust the files in this folder?」と聞かれたら
**「Yes, I trust this folder」を選んでEnter**。
（これを済ませないと`claude remote-control`が`Workspace not trusted`エラーになる）

### 6. tmux内でRemote Controlを起動

```bash
tmux new -s claude    # tmuxセッションを作成
claude                # Claude Codeを起動
```

Claude Codeの入力欄で：

```
/remote-control
```

QRコードが表示されたら成功。

> 💡 信頼確認が済んでいれば、対話画面を経由しない単独コマンド
> `claude remote-control`（サーバーモード）も使える。こちらは
> **スマホ側から新規セッションを作成できる**ので、常用にはこちらが便利。

### 7. スマホから接続

- QRコードをスマホのカメラで読み取る、**または**
- Claudeアプリ → **Codeタブ** → コンピュータアイコン＋緑ドット付きの
  「ホスト名-xxxx」セッションをタップ

### 8. デタッチして放置

VPSのターミナルで **Ctrl+b → d** を押してtmuxからデタッチ。
SSHを切断してもtmux内でclaudeが動き続け、以降はスマホだけで操作できる。

## 日常運用

| やりたいこと | 操作 |
|------|------|
| スマホから指示 | Codeタブ → セッションをタップ → 日本語で指示（例:「NiFiのログを確認して」） |
| tmuxの状態確認 | VPSで `tmux ls` |
| tmuxに戻る | VPSで `tmux attach -t claude` |
| VPS再起動後の復旧 | `tmux new -s claude` → `claude` → `/remote-control`（自動では復活しない） |
| 過去セッションの再開 | bashから `claude --resume`（対話内なら `/resume`）。再開後に `/remote-control` すればスマホからも触れる |
| 認証状態の確認 | セッション内で `/status`、または `claude doctor` |

**注意点**:

- スマホに表示されるのは、Remote Controlが**有効になっているライブのセッションだけ**。
  過去のセッション履歴は一覧に出ないが、`~/.claude`配下に残っており`claude --resume`で再開できる
- tmuxを閉じる・プロセス終了・VPS再起動でセッション一覧から消える（緑ドットが消える）
- ネットワークが10分以上途切れるとタイムアウトする

## トラブルシューティング（実際に遭遇したエラーと解決策）

### `claude: コマンドが見つかりません`

**原因1**: PATH未設定 → 手順3を実施。

**原因2**: SSHログイン時に`.bashrc`が読まれていない。
`.bashrc`にexport行があるのに新しいSSHセッションで見つからない場合はこれ。

```bash
# 応急処置（そのシェルでのみ有効）
source ~/.bashrc

# 恒久対策: .bash_profile があるか確認
ls ~/.bash_profile ~/.bash_login 2>/dev/null

# → ファイルが表示された場合（.bash_profileが.bashrcを読んでいないのが原因）
echo '[ -f ~/.bashrc ] && . ~/.bashrc' >> ~/.bash_profile

# → 何も表示されなかった場合
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.profile
```

SSHで入り直して`claude --version`が通れば解決。

> 💡 なお、以前npm（nvm経由）でインストールしていた場合も同じ理由で
> 「コマンドが見つかりません」になる（nvmは`.bashrc`で読み込まれるため）。
> 「インストールしたはずなのに消えた」ように見えても、履歴は`~/.claude`に残っている。

### `Error: You must be logged in to use Remote Control.`

ログイン未完了。手順4を実施（`claude`起動 → `/login`）。

### `Error: Workspace not trusted.`

信頼確認が未完了。`claude`を普通に起動して
「Yes, I trust this folder」を選ぶ（手順5）。
それでも通らない場合は、対話画面の中から`/remote-control`を打つ方法（手順6）が確実。

### `Remote Control requires a claude.ai subscription`

APIキー認証になっている。Remote ControlはAPIキー非対応。

```bash
echo $ANTHROPIC_API_KEY   # 設定されているか確認
unset ANTHROPIC_API_KEY   # 外す（.bashrc等に書いてあればその行も削除）
claude                    # 起動して /login でclaude.aiアカウントにログインし直す
```

環境変数`ANTHROPIC_API_KEY`が残っていると`/login`してもAPIキーが優先されるので注意。

## 認証情報の扱い

- ログイン時の**認証コード**と**QRコード**はどちらも一回きりの使い捨て。
  **保存不要**。次回は新しいものが発行される
- 有効な間は読み取った人がセッションに接続できる可能性があるため、
  **スクショの公開・共有はしない**
- 本物の認証トークンはログイン成功時にVPSの`~/.claude`配下に自動保存され、
  以降の再ログインは不要（失効したら`/login`し直すだけ）

## 参考リンク

- Remote Control公式ドキュメント: https://code.claude.com/docs/en/remote-control
- 認証について: https://code.claude.com/docs/en/authentication
