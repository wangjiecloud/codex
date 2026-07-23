"use client";

import { useMemo } from "react";
import { marked, Renderer } from "marked";

interface Props {
  content: string;
  streaming?: boolean;
}

// 配置 marked 渲染器
const renderer = new Renderer();

// 代码块
renderer.code = ({ text, lang }) => {
  const language = lang || "text";
  return `<div class="md-code-block"><div class="md-code-header"><span class="md-code-lang">${language}</span></div><pre class="md-code-pre"><code class="md-code">${escapeHtml(text)}</code></pre></div>`;
};

// 行内代码
renderer.codespan = ({ text }) => {
  return `<code class="md-inline-code">${escapeHtml(text)}</code>`;
};

// 段落
renderer.paragraph = function ({ tokens }) {
  return `<p class="md-p">${this.parser.parseInline(tokens)}</p>`;
};

// 标题
renderer.heading = function ({ tokens, depth }) {
  return `<h${depth} class="md-h${depth}">${this.parser.parseInline(tokens)}</h${depth}>`;
};

// 列表
renderer.list = function ({ items, ordered }) {
  const tag = ordered ? "ol" : "ul";
  const inner = items
    .map((item) => {
      const content = item.tokens
        ? this.parser.parse(item.tokens)
        : (item.text ?? "");
      return `<li class="md-li">${content}</li>`;
    })
    .join("");
  return `<${tag} class="md-list">${inner}</${tag}>`;
};

// 加粗
renderer.strong = function ({ tokens }) {
  return `<strong class="md-strong">${this.parser.parseInline(tokens)}</strong>`;
};

// 斜体
renderer.em = function ({ tokens }) {
  return `<em class="md-em">${this.parser.parseInline(tokens)}</em>`;
};

// 水平线
renderer.hr = () => `<hr class="md-hr" />`;

renderer.html = ({ text }) => text;

// 表格
renderer.table = function ({ header, rows }) {
  const headerHtml = header
    .map(
      (h) =>
        `<th class="md-th">${h.tokens ? this.parser.parseInline(h.tokens) : h.text}</th>`,
    )
    .join("");
  const rowsHtml = rows
    .map(
      (row) =>
        `<tr class="md-tr">${row
          .map(
            (cell) =>
              `<td class="md-td">${cell.tokens ? this.parser.parseInline(cell.tokens) : cell.text}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  return `<div class="md-table-wrap"><table class="md-table"><thead><tr class="md-tr">${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

marked.setOptions({ renderer, breaks: true, gfm: true });

export function renderMarkdownToHtml(content: string): string {
  return marked.parse(content) as string;
}

export function buildMarkdownPreviewDocument(content: string): string {
  const html = renderMarkdownToHtml(content);
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>消息预览</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        padding: 32px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f5f5f5;
        color: #1f2937;
      }
      .wrap {
        max-width: 960px;
        margin: 0 auto;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 16px;
        padding: 28px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      }
      .title {
        margin: 0 0 20px;
        font-size: 24px;
        font-weight: 700;
        color: #111827;
      }
      .md-body {
        font-size: 14px;
        line-height: 1.8;
        color: #374151;
      }
      .md-body .md-p { margin: 0 0 14px; }
      .md-body .md-h1, .md-body .md-h2, .md-body .md-h3, .md-body .md-h4, .md-body .md-h5, .md-body .md-h6 {
        margin: 24px 0 12px;
        color: #111827;
        line-height: 1.35;
      }
      .md-body .md-list { margin: 0 0 14px 20px; padding: 0; }
      .md-body .md-li { margin: 6px 0; }
      .md-body .md-inline-code {
        padding: 2px 6px;
        border-radius: 6px;
        background: #f3f4f6;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .md-code-block {
        margin: 16px 0;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        overflow: hidden;
        background: #0f172a;
      }
      .md-code-header {
        padding: 10px 14px;
        background: #111827;
        color: #d1d5db;
        font-size: 12px;
      }
      .md-code-pre {
        margin: 0;
        padding: 16px;
        overflow-x: auto;
        color: #e5e7eb;
      }
      .md-code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        white-space: pre-wrap;
      }
      .md-table-wrap { overflow-x: auto; margin: 16px 0; }
      .md-table { width: 100%; border-collapse: collapse; }
      .md-th, .md-td {
        border: 1px solid #e5e7eb;
        padding: 10px 12px;
        text-align: left;
      }
      .md-th { background: #f9fafb; }
      .md-hr { border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0; }
      details {
        margin: 12px 0;
        padding: 10px 14px;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        background: #fafafa;
      }
      summary {
        cursor: pointer;
        font-weight: 600;
        color: #111827;
      }
      @media (prefers-color-scheme: dark) {
        body { background: #0f172a; color: #e5e7eb; }
        .wrap { background: #111827; border-color: #374151; box-shadow: none; }
        .title { color: #f9fafb; }
        .md-body { color: #d1d5db; }
        .md-body .md-h1, .md-body .md-h2, .md-body .md-h3, .md-body .md-h4, .md-body .md-h5, .md-body .md-h6 { color: #f9fafb; }
        .md-body .md-inline-code { background: #1f2937; }
        .md-th, .md-td, details { border-color: #374151; }
        .md-th, details { background: #111827; }
        .md-hr { border-top-color: #374151; }
        summary { color: #f9fafb; }
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <h1 class="title">消息预览</h1>
      <div class="md-body">${html}</div>
    </main>
  </body>
</html>`;
}

/** 判断内容是否包含 Markdown 特征 */
function hasMarkdown(text: string): boolean {
  return /(\*\*|__|^#{1,6} |^[-*+] |^\d+\. |```|`[^`]|^\|.+\|)/m.test(text);
}

export function MarkdownMessage({ content, streaming }: Props) {
  const isMarkdown = useMemo(() => hasMarkdown(content), [content]);

  if (!isMarkdown) {
    // 纯文本：保留换行，不转义 HTML
    return (
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        {content}
        {streaming && (
          <span className="inline-block w-1.5 h-3.5 bg-current ml-0.5 animate-pulse rounded-sm" />
        )}
      </p>
    );
  }

  const html = renderMarkdownToHtml(content);

  return (
    <>
      <div
        className="md-body text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {streaming && (
        <span className="inline-block w-1.5 h-3.5 bg-current ml-0.5 animate-pulse rounded-sm" />
      )}
    </>
  );
}
