# md-to-x — 共有セットアップガイド

Markdown ファイルを HTML に変換し、X Articles 対応のリッチテキストとして macOS クリップボードにコピーするツール。

---

## Claude Code のインストール（まだ入っていない方へ）

### Node.js のインストール

**macOS**（Homebrew）:
```bash
brew install node
```

**Ubuntu / Debian**:
```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Windows**（WSL2推奨）:
```bash
winget install OpenJS.NodeJS.LTS
```

確認:
```bash
node -v   # v18 以上
npm -v
```

### Claude Code のインストール

```bash
npm install -g @anthropic-ai/claude-code
```

### 認証方法（いずれか1つ）

| 方法 | 手順 |
|---|---|
| Claude Max / Pro | `claude` 起動後にブラウザ認証 |
| API キー | `export ANTHROPIC_API_KEY=sk-ant-...` を設定後 `claude` 起動 |

### 初回起動確認

```bash
claude
```

プロンプトが表示されれば OK。

---

## Claude Code への指示

このファイルを受け取った方へ: Claude Code を起動し、以下のように指示してください。

    このファイルを読んで、md-to-x をセットアップして

---

## Step 0: 前提条件チェック

| 項目 | 確認コマンド | 未インストール時 |
|---|---|---|
| Node.js v18+ | `node -v` | 上記「Node.js のインストール」参照 |
| npm | `npm -v` | Node.js に同梱 |
| Swift | `swift --version` | macOS に標準搭載（Xcode CLT 必須: `xcode-select --install`） |
| macOS | `uname` | **必須**: NSPasteboard は macOS 専用 |

> **注意**: このツールは macOS 専用です。Linux / Windows では Swift の NSPasteboard が使えないため動作しません。

---

## Step 1: プロジェクト作成

### ディレクトリ作成と依存インストール

```bash
mkdir -p PROJECT_DIR
cd PROJECT_DIR
npm init -y
npm install marked
```

> `PROJECT_DIR` は任意のパスに置き換えてください（例: `~/project/md-to-x`）

### .gitignore

```
node_modules/
.vercel/
```

---

## Step 2: コアスクリプトの作成

### index.js

````javascript
#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { marked } = require("marked");

const mdPath = process.argv[2];
if (!mdPath) {
  console.error("Usage: node index.js <markdown-file>");
  process.exit(1);
}

const absPath = path.resolve(mdPath);
if (!fs.existsSync(absPath)) {
  console.error(`File not found: ${absPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(absPath, "utf-8");

// frontmatter 除去
const content = raw.replace(/^---[\s\S]*?---\n*/m, "");

// X Articles (Draft.js) 互換レンダラー
const renderer = new marked.Renderer();
renderer.heading = function({ tokens, depth }) {
  const text = this.parser.parseInline(tokens);
  const tag = depth <= 1 ? "h1" : "h2";
  return `<${tag}>${text}</${tag}>\n`;
};
renderer.hr = function() {
  return "<p>---</p>\n";
};
renderer.code = function({ text }) {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<pre><code>${escaped}</code></pre>\n`;
};
renderer.codespan = function({ text }) {
  return text;
};
renderer.table = function({ header, rows }) {
  let result = "<p>";
  const headerCells = header.map((cell) =>
    cell.tokens.map((t) => t.text || "").join("")
  );
  result += headerCells.join(" | ") + "</p>\n";
  for (const row of rows) {
    const cells = row.map((cell) =>
      cell.tokens.map((t) => t.text || "").join("")
    );
    result += "<p>" + cells.join(" | ") + "</p>\n";
  }
  return result;
};

marked.setOptions({
  gfm: true,
  breaks: true,
  renderer: renderer,
});

const html = marked.parse(content);

// 一時ファイル出力
const tmpFile = path.join("/tmp", `md-to-x-${Date.now()}.html`);
fs.writeFileSync(tmpFile, html, "utf-8");

// Swift でクリップボードに設定
const swiftPath = path.join(__dirname, "clipboard.swift");
try {
  execFileSync("swift", [swiftPath, tmpFile], { stdio: "inherit" });
} finally {
  // 一時ファイル削除
  if (fs.existsSync(tmpFile)) {
    fs.unlinkSync(tmpFile);
  }
}

console.log(`Done: ${path.basename(absPath)}`);
````

### clipboard.swift

````swift
import Cocoa

guard CommandLine.arguments.count > 1 else {
  fputs("Usage: clipboard <html-file>\n", stderr)
  exit(1)
}

let path = CommandLine.arguments[1]
guard let data = FileManager.default.contents(atPath: path),
      let html = String(data: data, encoding: .utf8) else {
  fputs("Error: cannot read \(path)\n", stderr)
  exit(1)
}

let pb = NSPasteboard.general
pb.clearContents()
pb.setString(html, forType: .html)
pb.setString(html, forType: .string)
print("Copied to clipboard (HTML)")
````

---

## Step 3: Claude Code スキル登録

`.claude/commands/md-to-x.md` を作成:

````markdown
---
allowed-tools: Bash, Read
description: Markdown → X Articles クリップボード変換
---

# Markdown → X Articles 変換スキル

MarkdownファイルをHTML変換し、X Articles対応のリッチテキストとしてクリップボードにコピーする。

## 使い方

    /md-to-x [mdファイルパス]

## 処理

1. 引数で指定されたMarkdownファイルを読み込む
2. 以下のコマンドを実行:

    node PROJECT_DIR/index.js [mdファイルパス]

3. 完了後、ユーザーに「クリップボードにコピーしました。X Articlesエディタで Cmd+V でペーストしてください」と伝える

## 引数がない場合

対象ディレクトリ内のファイル一覧を表示し、変換対象を選択してもらう。

## 注意事項

- frontmatter（`---`で囲まれた部分）は自動除去される
- GFM（GitHub Flavored Markdown）対応
- 見出し・太字・リンク・区切り線・リストがHTML変換される
- X Articles (Draft.js) 互換: h3以降はh2に統一、`---`は`<p>---</p>`に変換、テーブルはパイプ区切りテキストに変換
````

> `PROJECT_DIR` は実際のインストールパスに置換してください。

---

## Step 4: 動作確認

### テスト用 Markdown ファイルで変換

```bash
# テスト用ファイル作成
cat > /tmp/test-article.md << 'EOF'
---
title: テスト記事
---

## 見出し2

これは **太字** のテストです。

- リスト項目1
- リスト項目2

---

### 見出し3

[リンクテスト](https://example.com)
EOF

# 変換実行
node PROJECT_DIR/index.js /tmp/test-article.md
```

### 成功時の期待出力

```
Copied to clipboard (HTML)
Done: test-article.md
```

この状態で任意のリッチテキストエディタ（X Articles、Google Docs 等）に `Cmd+V` でペーストすると、見出し・太字・リンク・区切り線が反映されます。

---

## Web版（オプション）

ブラウザ上で Markdown → HTML 変換 + クリップボードコピーができる Web UI も用意可能。

### セットアップ

```bash
mkdir -p PROJECT_DIR/public
```

`PROJECT_DIR/public/index.html` に以下を作成:

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown → X Articles 変換</title>
</head>
<body>
  <h1>Markdown → X Articles</h1>
  <textarea id="input" placeholder="Markdownを貼り付け..." rows="15" style="width:100%;"></textarea>
  <button id="convert">変換してコピー</button>
  <div id="preview"></div>
  <script src="/index.js"></script>
</body>
</html>
```

### Vercel デプロイ

`PROJECT_DIR/vercel.json`:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/public/$1" }]
}
```

```bash
cd PROJECT_DIR
npx vercel
```

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `Cannot find module 'marked'` | 依存未インストール | `cd PROJECT_DIR && npm install` |
| `swift: command not found` | Xcode CLT 未インストール | `xcode-select --install` |
| `error: no such module 'Cocoa'` | Linux 環境で実行 | macOS 専用ツールのため非対応 |
| ペースト時にプレーンテキストになる | エディタがHTML MIME非対応 | X Articles / Google Docs 等のリッチテキスト対応エディタで試す |
| frontmatter が本文に含まれる | `---` の書式不正 | ファイル先頭が `---` で始まり、閉じ `---` があることを確認 |

---

## システム構成図

```
┌──────────────────┐
│  Markdown File   │
│  (frontmatter付) │
└────────┬─────────┘
         │ node index.js
         ▼
┌──────────────────┐
│  index.js        │
│  ・frontmatter除去│
│  ・marked → HTML  │
│  ・/tmp に出力    │
└────────┬─────────┘
         │ swift clipboard.swift
         ▼
┌──────────────────┐
│  clipboard.swift │
│  ・NSPasteboard  │
│  ・HTML MIME設定  │
└────────┬─────────┘
         │ Cmd+V
         ▼
┌──────────────────┐
│  X Articles      │
│  見出し/太字/HR   │
│  がリッチ反映     │
└──────────────────┘
```

---

## ライセンス

このセットアップガイドは自由に共有・改変可能です。
