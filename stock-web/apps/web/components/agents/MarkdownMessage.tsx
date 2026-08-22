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

/** 生成用于 iframe print → PDF 的 HTML，样式与页面显示完全一致 */
export function buildPdfDocument(content: string): string {
  const html = renderMarkdownToHtml(content);
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>报告</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        background: #ffffff;
        color: #1f2937;
        font-size: 13px;
        line-height: 1.7;
      }
      .wrap {
        max-width: 860px;
        margin: 0 auto;
        padding: 32px 40px;
      }
      .md-body { color: #374151; }
      .md-body .md-p { margin: 0 0 12px; }
      .md-body .md-h1 { font-size: 22px; font-weight: 700; margin: 28px 0 14px; color: #111827; line-height: 1.3; }
      .md-body .md-h2 { font-size: 18px; font-weight: 700; margin: 24px 0 12px; color: #111827; line-height: 1.35; }
      .md-body .md-h3 { font-size: 15px; font-weight: 600; margin: 20px 0 10px; color: #111827; }
      .md-body .md-h4, .md-body .md-h5, .md-body .md-h6 { font-size: 13px; font-weight: 600; margin: 16px 0 8px; color: #111827; }
      .md-body .md-list { margin: 0 0 12px 20px; padding: 0; }
      .md-body .md-li { margin: 5px 0; }
      .md-body .md-strong { font-weight: 700; color: #111827; }
      .md-body .md-em { font-style: italic; }
      .md-body .md-inline-code {
        padding: 1px 5px;
        border-radius: 4px;
        background: #f3f4f6;
        font-family: ui-monospace, "Courier New", monospace;
        font-size: 12px;
        color: #374151;
      }
      .md-code-block {
        margin: 14px 0;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        overflow: hidden;
        background: #1e293b;
        page-break-inside: avoid;
      }
      .md-code-header {
        padding: 8px 12px;
        background: #0f172a;
        color: #94a3b8;
        font-size: 11px;
      }
      .md-code-pre {
        margin: 0;
        padding: 14px;
        overflow-x: auto;
        color: #e2e8f0;
        font-size: 12px;
      }
      .md-code { font-family: ui-monospace, "Courier New", monospace; white-space: pre-wrap; }
      .md-table-wrap { overflow-x: auto; margin: 14px 0; page-break-inside: avoid; }
      .md-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .md-th, .md-td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; vertical-align: top; }
      .md-th { background: #f9fafb; font-weight: 600; color: #111827; }
      .md-tr:nth-child(even) .md-td { background: #fafafa; }
      .md-hr { border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0; }
      details { margin: 10px 0; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 8px; }
      summary { cursor: pointer; font-weight: 600; color: #111827; }

      @media print {
        @page { margin: 18mm 16mm; size: A4; }
        body { background: #fff !important; }
        .wrap { padding: 0; max-width: 100%; }
        .md-code-block { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .md-th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        h1, h2, h3, h4, h5, h6 { page-break-after: avoid; }
        p, li { orphans: 3; widows: 3; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="md-body">${html}</div>
    </div>
  </body>
</html>`;
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
      .toolbar {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        justify-content: flex-end;
        padding: 12px 0 8px;
        margin-bottom: 4px;
        background: #f5f5f5;
      }
      .btn-pdf {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 16px;
        background: #111827;
        color: #f9fafb;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .btn-pdf:hover { background: #374151; }
      .btn-pdf svg { flex-shrink: 0; }
      @media (prefers-color-scheme: dark) {
        body { background: #0f172a; color: #e5e7eb; }
        .wrap { background: #111827; border-color: #374151; box-shadow: none; }
        .toolbar { background: #0f172a; }
        .btn-pdf { background: #374151; color: #f9fafb; }
        .btn-pdf:hover { background: #4b5563; }
        .title { color: #f9fafb; }
        .md-body { color: #d1d5db; }
        .md-body .md-h1, .md-body .md-h2, .md-body .md-h3, .md-body .md-h4, .md-body .md-h5, .md-body .md-h6 { color: #f9fafb; }
        .md-body .md-inline-code { background: #1f2937; }
        .md-th, .md-td, details { border-color: #374151; }
        .md-th, details { background: #111827; }
        .md-hr { border-top-color: #374151; }
        summary { color: #f9fafb; }
      }
      @media print {
        .toolbar { display: none !important; }
        body { background: #fff !important; padding: 0 !important; }
        .wrap { border: none !important; border-radius: 0 !important; box-shadow: none !important; padding: 0 !important; max-width: 100% !important; }
        @page { margin: 18mm 16mm; size: A4; }
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button class="btn-pdf" onclick="window.print()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        下载 PDF
      </button>
    </div>
    <main class="wrap">
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
