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
renderer.paragraph = ({ tokens }) => {
  const text = tokens.map((t) => ("text" in t ? t.text : "raw" in t ? (t as { raw: string }).raw : "")).join("");
  return `<p class="md-p">${text}</p>`;
};

// 标题
renderer.heading = ({ tokens, depth }) => {
  const text = tokens.map((t) => ("text" in t ? t.text : "")).join("");
  return `<h${depth} class="md-h${depth}">${text}</h${depth}>`;
};

// 列表
renderer.list = ({ items, ordered }) => {
  const tag = ordered ? "ol" : "ul";
  const inner = items.map((item) => {
    const text = item.tokens
      ? item.tokens.map((t) => ("raw" in t ? (t as { raw: string }).raw : "")).join("")
      : item.text ?? "";
    return `<li class="md-li">${text}</li>`;
  }).join("");
  return `<${tag} class="md-list">${inner}</${tag}>`;
};

// 加粗
renderer.strong = ({ tokens }) => {
  const text = tokens.map((t) => ("raw" in t ? (t as { raw: string }).raw : "")).join("");
  return `<strong class="md-strong">${text}</strong>`;
};

// 斜体
renderer.em = ({ tokens }) => {
  const text = tokens.map((t) => ("raw" in t ? (t as { raw: string }).raw : "")).join("");
  return `<em class="md-em">${text}</em>`;
};

// 水平线
renderer.hr = () => `<hr class="md-hr" />`;

// 表格
renderer.table = ({ header, rows }) => {
  const headerHtml = header.map((h) => `<th class="md-th">${h.tokens?.map((t) => ("raw" in t ? (t as { raw: string }).raw : "")).join("") ?? h.text}</th>`).join("");
  const rowsHtml = rows.map((row) =>
    `<tr class="md-tr">${row.map((cell) => `<td class="md-td">${cell.tokens?.map((t) => ("raw" in t ? (t as { raw: string }).raw : "")).join("") ?? cell.text}</td>`).join("")}</tr>`
  ).join("");
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
        {streaming && <span className="inline-block w-1.5 h-3.5 bg-current ml-0.5 animate-pulse rounded-sm" />}
      </p>
    );
  }

  const html = marked.parse(content) as string;

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
