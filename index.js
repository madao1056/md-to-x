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
