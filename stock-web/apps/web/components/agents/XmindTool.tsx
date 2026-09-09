"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Download,
  FileText,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Layers,
  Globe,
  RefreshCw,
  Upload,
  Folder,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface XmindFile {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  node_count: number;
  sheet_count: number;
}

interface TreeNode {
  id?: number;
  title: string;
  content: string;
  url: string;
  source_url: string;
  children: TreeNode[];
}

interface SheetInfo {
  sheet_id: string;
  sheet_title: string;
  source_url: string;
  node_count: number;
  tree: TreeNode[];
}

interface FileDetail {
  id: number;
  name: string;
  description: string;
  sheets: SheetInfo[];
}

type Step =
  | "input"
  | "select_file"
  | "parsing"
  | "preview"
  | "merging"
  | "done";

export function XmindTool() {
  const [step, setStep] = useState<Step>("input");
  const [urlInput, setUrlInput] = useState("");
  const [files, setFiles] = useState<XmindFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [newFileName, setNewFileName] = useState("");
  const [showNewFileForm, setShowNewFileForm] = useState(false);
  const [parsedTree, setParsedTree] = useState<TreeNode | null>(null);
  const [parsedUrl, setParsedUrl] = useState("");
  const [parsedTitle, setParsedTitle] = useState("");
  const [parsedNodeCount, setParsedNodeCount] = useState(0);
  const [parsedDrillSheets, setParsedDrillSheets] = useState<
    {
      sheet_id: string;
      sheet_title: string;
      node_count: number;
      tree: TreeNode;
    }[]
  >([]);
  const [previewTab, setPreviewTab] = useState<string>("overview");
  const [conflictInfo, setConflictInfo] = useState<{
    conflict: boolean;
    message: string;
  } | null>(null);
  const [mergeResult, setMergeResult] = useState<{
    sheet_title: string;
    node_count: number;
    total_sheets: number;
  } | null>(null);
  const [fileDetail, setFileDetail] = useState<FileDetail | null>(null);
  const [error, setError] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const detailRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfMode, setPdfMode] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [directoryMode, setDirectoryMode] = useState(false);
  const [directoryFiles, setDirectoryFiles] = useState<File[] | null>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const res = await fetch("/api/xmind/files");
      if (!res.ok) throw new Error("加载失败");
      const data = await res.json();
      setFiles(data.files || []);
    } catch {
      setFiles([]);
    } finally {
      setFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFiles();
  }, [loadFiles]);

  const loadFileDetail = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/xmind/files/${id}`);
      if (!res.ok) throw new Error("加载详情失败");
      const data = await res.json();
      setFileDetail(data);
    } catch {
      setFileDetail(null);
    }
  }, []);

  const handleParse = useCallback(async () => {
    if (!urlInput.trim()) return;
    setStep("parsing");
    setError("");
    try {
      const res = await fetch("/api/xmind/parse-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "解析失败");
      }
      const data = await res.json();
      setParsedTree(data.tree);
      setParsedUrl(data.url);
      setParsedTitle(data.title);
      setParsedNodeCount(data.node_count);
      setParsedDrillSheets(data.drill_sheets || []);
      setPreviewTab("overview");
      setStep("select_file");
    } catch (e) {
      setError(e instanceof Error ? e.message : "解析失败");
      setStep("input");
    }
  }, [urlInput]);

  const handleParsePdf = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("请上传 PDF 文件");
      return;
    }
    setStep("parsing");
    setError("");
    setPdfMode(true);
    setPdfFile(file);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/xmind/parse-pdf", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "PDF 解析失败");
      }
      const data = await res.json();
      setParsedTree(data.tree);
      setParsedUrl("");
      setParsedTitle(file.name.replace(/\.pdf$/i, ""));
      setParsedNodeCount(data.node_count);
      setStep("select_file");
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF 解析失败");
      setStep("input");
    }
  }, []);

  const handleParseDirectory = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setStep("parsing");
    setError("");
    setDirectoryMode(true);
    setDirectoryFiles(files);
    try {
      const formData = new FormData();
      for (const f of files) {
        formData.append("files", f);
      }
      const res = await fetch("/api/xmind/parse-directory", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "目录解析失败");
      }
      const data = await res.json();
      setParsedTree(data.tree);
      setParsedUrl("");
      setParsedTitle(data.title || "文件目录");
      setParsedNodeCount(data.node_count);
      setStep("select_file");
    } catch (e) {
      setError(e instanceof Error ? e.message : "目录解析失败");
      setStep("input");
    }
  }, []);

  const handleCreateFile = useCallback(async () => {
    if (!newFileName.trim()) return;
    try {
      const res = await fetch("/api/xmind/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFileName.trim() }),
      });
      if (!res.ok) throw new Error("创建失败");
      const data = await res.json();
      await loadFiles();
      setSelectedFileId(data.id);
      setShowNewFileForm(false);
      setNewFileName("");
    } catch {
      setError("创建文件失败");
    }
  }, [newFileName, loadFiles]);

  const handleMerge = useCallback(
    async (fileId: number) => {
      setStep("merging");
      setError("");
      try {
        const res = await fetch(`/api/xmind/merge/${fileId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urlInput.trim() }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "合并失败");
        }
        const data = await res.json();
        setMergeResult({
          sheet_title: data.sheet_title,
          node_count: data.node_count,
          total_sheets: data.total_sheets,
        });
        await loadFiles();
        await loadFileDetail(fileId);
        setStep("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "合并失败");
        setStep("select_file");
      }
    },
    [urlInput, loadFiles, loadFileDetail],
  );

  const handleMergePdf = useCallback(
    async (fileId: number, file: File) => {
      setStep("merging");
      setError("");
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/xmind/merge-pdf/${fileId}`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "合并失败");
        }
        const data = await res.json();
        setMergeResult({
          sheet_title: data.sheet_title,
          node_count: data.node_count,
          total_sheets: data.total_sheets,
        });
        await loadFiles();
        await loadFileDetail(fileId);
        setStep("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "合并失败");
        setStep("select_file");
      }
    },
    [loadFiles, loadFileDetail],
  );

  const handleMergeDirectory = useCallback(
    async (fileId: number, files: File[]) => {
      setStep("merging");
      setError("");
      try {
        const formData = new FormData();
        for (const f of files) {
          formData.append("files", f);
        }
        const res = await fetch(`/api/xmind/merge-directory/${fileId}`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "合并失败");
        }
        const data = await res.json();
        setMergeResult({
          sheet_title: data.sheet_title,
          node_count: data.node_count,
          total_sheets: data.total_sheets,
        });
        await loadFiles();
        await loadFileDetail(fileId);
        setStep("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : "合并失败");
        setStep("select_file");
      }
    },
    [loadFiles, loadFileDetail],
  );

  const handleDownload = useCallback((fileId: number) => {
    window.open(`/api/xmind/download/${fileId}`, "_blank");
  }, []);

  const handleDeleteFile = useCallback(
    async (fileId: number) => {
      if (!confirm("确定删除这个 XMind 文件？所有数据将丢失。")) return;
      try {
        const res = await fetch(`/api/xmind/files/${fileId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("删除失败");
        await loadFiles();
        if (selectedFileId === fileId) {
          setSelectedFileId(null);
          setFileDetail(null);
        }
      } catch {
        setError("删除失败");
      }
    },
    [loadFiles, selectedFileId],
  );

  const handleDeleteSheet = useCallback(
    async (fileId: number, sheetId: string) => {
      if (!confirm("确定删除这个子思维导图？")) return;
      try {
        const res = await fetch(`/api/xmind/files/${fileId}/sheet/${sheetId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("删除失败");
        await loadFileDetail(fileId);
        await loadFiles();
      } catch {
        setError("删除失败");
      }
    },
    [loadFileDetail, loadFiles],
  );

  const handleReset = useCallback(() => {
    setStep("input");
    setUrlInput("");
    setParsedTree(null);
    setParsedUrl("");
    setParsedTitle("");
    setParsedNodeCount(0);
    setParsedDrillSheets([]);
    setPreviewTab("overview");
    setConflictInfo(null);
    setMergeResult(null);
    setError("");
    setSelectedFileId(null);
    setFileDetail(null);
    setPdfMode(false);
    setPdfFile(null);
    setDirectoryMode(false);
    setDirectoryFiles(null);
  }, []);

  const toggleNode = useCallback((key: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <div className="p-2 max-w-5xl mx-auto" ref={detailRef}>
      {/* 标题 */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-1 flex items-center gap-2">
          <Layers size={24} className="text-[#f5a623]" />
          XMind 工具
        </h2>
        <p className="text-[var(--text-tertiary)] text-sm">
          输入 URL 或上传 PDF，围绕主题构建全方位知识框架并生成 XMind
          思维导图（含图片 OCR、概览 + 下钻子导图）
        </p>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError("")}
            className="ml-auto text-red-400/60 hover:text-red-400"
          >
            ×
          </button>
        </div>
      )}

      {/* Step 1: URL 输入 */}
      {step === "input" && (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6">
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
            输入要解析的 URL 或上传 PDF 文件
          </label>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2.5">
              <Globe
                size={16}
                className="text-[var(--text-tertiary)] shrink-0"
              />
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && urlInput.trim()) handleParse();
                }}
                placeholder="https://example.com/article"
                className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                autoFocus
              />
            </div>
            <button
              onClick={handleParse}
              disabled={!urlInput.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-[#f5a623] px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-[#e8961a] disabled:opacity-40"
            >
              解析 URL
            </button>
            <div className="flex items-center text-[var(--text-tertiary)] text-xs px-1">
              或
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleParsePdf(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[#f5a623]/50"
            >
              <Upload size={14} className="text-[#f5a623]" />
              上传 PDF
            </button>
            <input
              ref={directoryInputRef}
              type="file"
              // @ts-expect-error webkitdirectory is non-standard but widely supported
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={(e) => {
                const fileList = e.target.files;
                if (fileList && fileList.length > 0) {
                  const fileArray = Array.from(fileList);
                  handleParseDirectory(fileArray);
                }
                e.target.value = "";
              }}
            />
            <button
              onClick={() => directoryInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[#f5a623]/50"
              title="选择文件目录，遍历其中所有文件进行分析整理"
            >
              <Folder size={14} className="text-[#f5a623]" />
              选择目录
            </button>
          </div>

          {/* 已有文件列表 */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-[var(--text-tertiary)]">
                已有 XMind 文件 ({files.length})
              </span>
              <button
                onClick={loadFiles}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                title="刷新"
              >
                <RefreshCw size={12} />
              </button>
            </div>

            {filesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2
                  size={20}
                  className="animate-spin text-[var(--text-tertiary)]"
                />
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-8 text-sm text-[var(--text-tertiary)]">
                暂无 XMind 文件，解析 URL 后可创建新文件
              </div>
            ) : (
              <div className="space-y-2">
                {files.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2.5 group"
                  >
                    <button
                      onClick={() => {
                        setSelectedFileId(f.id);
                        loadFileDetail(f.id);
                      }}
                      className="flex items-center gap-2 min-w-0 flex-1 text-left"
                    >
                      <FileText size={14} className="text-[#f5a623] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm text-[var(--text-primary)] truncate">
                          {f.name}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)]">
                          {f.sheet_count} 个子导图 · {f.node_count} 个节点
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleDownload(f.id)}
                        className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-[#f5a623] transition-colors"
                        title="下载"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteFile(f.id)}
                        className="p-1.5 rounded text-[var(--text-tertiary)] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 文件详情 */}
          {fileDetail && (
            <FileDetailView
              detail={fileDetail}
              onDownload={handleDownload}
              onDeleteSheet={handleDeleteSheet}
              onDelete={handleDeleteFile}
            />
          )}
        </div>
      )}

      {/* Step 2: 解析中 */}
      {step === "parsing" && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-[#f5a623] mb-4" />
          <p className="text-sm text-[var(--text-tertiary)]">
            {directoryMode
              ? "正在遍历目录文件并调用 LLM 智能分析…"
              : pdfMode
                ? "正在提取 PDF 内容并调用 LLM 智能分析…"
                : "正在获取网页内容并调用 LLM 智能分析…"}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            提取概要 · 结构化知识 · 自动补齐
          </p>
        </div>
      )}

      {/* Step 3: 选择文件 & 预览 */}
      {(step === "select_file" || step === "merging") && parsedTree && (
        <div className="space-y-4">
          {/* 解析结果预览 */}
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-400" />
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  解析完成
                </span>
                <span className="text-xs text-[var(--text-tertiary)]">
                  {parsedNodeCount} 个节点
                  {parsedDrillSheets.length > 0 && (
                    <> · {parsedDrillSheets.length} 个下钻子导图</>
                  )}
                </span>
              </div>
              <a
                href={parsedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "text-xs text-[#f5a623] hover:underline flex items-center gap-1",
                  !parsedUrl && "pointer-events-none opacity-60",
                )}
              >
                {parsedTitle.slice(0, 40)}
                {parsedUrl && <ExternalLink size={10} />}
              </a>
            </div>
            {/* Sheet Tab 导航 */}
            {parsedDrillSheets.length > 0 && (
              <div className="flex items-center gap-1 mb-2 flex-wrap">
                <button
                  onClick={() => setPreviewTab("overview")}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs transition-colors",
                    previewTab === "overview"
                      ? "bg-[#f5a623]/15 text-[#f5a623]"
                      : "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
                  )}
                >
                  概览
                </button>
                {parsedDrillSheets.map((ds) => (
                  <button
                    key={ds.sheet_id}
                    onClick={() => setPreviewTab(ds.sheet_id)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs transition-colors max-w-[160px] truncate",
                      previewTab === ds.sheet_id
                        ? "bg-[#f5a623]/15 text-[#f5a623]"
                        : "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
                    )}
                    title={ds.sheet_title}
                  >
                    {ds.sheet_title}
                  </button>
                ))}
              </div>
            )}
            <div className="max-h-60 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-3">
              {previewTab === "overview" || parsedDrillSheets.length === 0
                ? parsedTree && (
                    <TreePreview
                      node={parsedTree}
                      expandedNodes={expandedNodes}
                      onToggle={toggleNode}
                      depth={0}
                    />
                  )
                : parsedDrillSheets
                    .filter((ds) => ds.sheet_id === previewTab)
                    .map((ds) => (
                      <TreePreview
                        key={ds.sheet_id}
                        node={ds.tree}
                        expandedNodes={expandedNodes}
                        onToggle={toggleNode}
                        depth={0}
                      />
                    ))}
            </div>
          </div>

          {/* 选择目标文件 */}
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
            <div className="text-sm font-medium text-[var(--text-primary)] mb-3">
              选择目标 XMind 文件进行合并
            </div>

            {files.length > 0 && (
              <div className="space-y-2 mb-3">
                {files.map((f) => (
                  <div
                    key={f.id}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer transition-all",
                      selectedFileId === f.id
                        ? "border-[#f5a623]/50 bg-[#f5a623]/5"
                        : "border-[var(--border-color)] bg-[var(--bg-primary)] hover:border-[#f5a623]/30",
                    )}
                    onClick={() => setSelectedFileId(f.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={14} className="text-[#f5a623] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm text-[var(--text-primary)] truncate">
                          {f.name}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)]">
                          {f.sheet_count} 个子导图 · {f.node_count} 个节点
                        </div>
                      </div>
                    </div>
                    {selectedFileId === f.id && (
                      <CheckCircle2
                        size={16}
                        className="text-[#f5a623] shrink-0"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 新建文件 */}
            {showNewFileForm ? (
              <div className="flex gap-2 mb-3">
                <input
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newFileName.trim())
                      handleCreateFile();
                  }}
                  placeholder="输入新文件名称"
                  className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[#f5a623]/50"
                  autoFocus
                />
                <button
                  onClick={handleCreateFile}
                  disabled={!newFileName.trim()}
                  className="rounded-lg bg-[#f5a623] px-3 py-2 text-sm font-medium text-black disabled:opacity-40"
                >
                  创建
                </button>
                <button
                  onClick={() => setShowNewFileForm(false)}
                  className="rounded-lg bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-tertiary)]"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewFileForm(true)}
                className="flex items-center gap-1.5 text-sm text-[#f5a623] hover:text-[#e8961a] transition-colors"
              >
                <Plus size={14} />
                新建 XMind 文件
              </button>
            )}

            {/* 合并按钮 */}
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => {
                  if (selectedFileId) {
                    if (directoryMode && directoryFiles) {
                      handleMergeDirectory(selectedFileId, directoryFiles);
                    } else if (pdfMode && pdfFile) {
                      handleMergePdf(selectedFileId, pdfFile);
                    } else {
                      handleMerge(selectedFileId);
                    }
                  }
                }}
                disabled={!selectedFileId || step === "merging"}
                className="flex items-center gap-1.5 rounded-lg bg-[#f5a623] px-4 py-2.5 text-sm font-medium text-black disabled:opacity-40 hover:bg-[#e8961a] transition-colors"
              >
                {step === "merging" ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    LLM 分析中…
                  </>
                ) : (
                  "合并到文件"
                )}
              </button>
              <button
                onClick={handleReset}
                className="rounded-lg bg-[var(--bg-tertiary)] px-4 py-2.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                重新开始
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: 完成 */}
      {step === "done" && (
        <div className="space-y-4">
          {/* 合并结果 */}
          <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 size={18} className="text-green-400" />
              <span className="text-sm font-medium text-[var(--text-primary)]">
                合并成功
              </span>
            </div>
            {conflictInfo?.conflict && (
              <div className="mb-2 flex items-start gap-2 text-xs text-amber-400">
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                <span>{conflictInfo.message}</span>
              </div>
            )}
            {mergeResult && (
              <div className="text-xs text-[var(--text-tertiary)] space-y-1">
                <div>新增子导图: {mergeResult.sheet_title}</div>
                <div>节点数: {mergeResult.node_count}</div>
                <div>文件总子导图数: {mergeResult.total_sheets}</div>
              </div>
            )}
          </div>

          {/* 文件详情 */}
          {fileDetail && (
            <FileDetailView
              detail={fileDetail}
              onDownload={handleDownload}
              onDeleteSheet={handleDeleteSheet}
              onDelete={handleDeleteFile}
            />
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg bg-[#f5a623] px-4 py-2.5 text-sm font-medium text-black hover:bg-[#e8961a] transition-colors"
            >
              <Plus size={14} />
              继续添加内容
            </button>
            {selectedFileId && (
              <button
                onClick={() => handleDownload(selectedFileId)}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-tertiary)] px-4 py-2.5 text-sm text-[var(--text-primary)] hover:text-[#f5a623] transition-colors"
              >
                <Download size={14} />
                下载 XMind 文件
              </button>
            )}
          </div>
        </div>
      )}

      {/* 文件详情（input step 时选中的文件） */}
      {step === "input" && fileDetail && (
        <div className="mt-4">
          <FileDetailView
            detail={fileDetail}
            onDownload={handleDownload}
            onDeleteSheet={handleDeleteSheet}
            onDelete={handleDeleteFile}
          />
        </div>
      )}
    </div>
  );
}

// ── 树形预览组件 ─────────────────────────────────────────────────────────────

function TreePreview({
  node,
  expandedNodes,
  onToggle,
  depth,
}: {
  node: TreeNode;
  expandedNodes: Set<string>;
  onToggle: (key: string) => void;
  depth: number;
}) {
  const key = `${depth}-${node.title}-${node.url}`;
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(key) || depth < 1;

  return (
    <div style={{ marginLeft: depth > 0 ? 16 : 0 }}>
      <div
        className={cn(
          "flex items-start gap-1.5 py-0.5",
          hasChildren && "cursor-pointer",
        )}
        onClick={() => hasChildren && onToggle(key)}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown
              size={12}
              className="mt-0.5 shrink-0 text-[var(--text-tertiary)]"
            />
          ) : (
            <ChevronRight
              size={12}
              className="mt-0.5 shrink-0 text-[var(--text-tertiary)]"
            />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              "text-xs",
              depth === 0
                ? "font-semibold text-[var(--text-primary)]"
                : "text-[var(--text-secondary)]",
            )}
          >
            {node.title}
          </span>
          {node.url && node.url !== node.source_url && (
            <a
              href={node.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-[#f5a623]/70 hover:text-[#f5a623]"
            >
              <ExternalLink size={8} />
            </a>
          )}
          {node.content && (
            <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 whitespace-pre-wrap line-clamp-3">
              {node.content}
            </p>
          )}
        </div>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child, i) => (
            <TreePreview
              key={i}
              node={child}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 文件详情视图 ─────────────────────────────────────────────────────────────

function FileDetailView({
  detail,
  onDownload,
  onDeleteSheet,
  onDelete,
}: {
  detail: FileDetail;
  onDownload: (id: number) => void;
  onDeleteSheet: (fileId: number, sheetId: string) => void;
  onDelete: (id: number) => void;
}) {
  const [activeSheet, setActiveSheet] = useState<string | null>(null);

  useEffect(() => {
    if (detail.sheets.length > 0 && !activeSheet) {
      const overview = detail.sheets.find(
        (s) => s.sheet_id === "overview" || s.sheet_id === "main",
      );
      setActiveSheet(overview ? overview.sheet_id : detail.sheets[0].sheet_id);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
  }, [detail, activeSheet]);

  const activeSheetData = detail.sheets.find((s) => s.sheet_id === activeSheet);

  return (
    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[#f5a623]" />
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {detail.name}
          </span>
          <span className="text-[10px] text-[var(--text-tertiary)]">
            {detail.sheets.length} 个子导图
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onDownload(detail.id)}
            className="flex items-center gap-1.5 rounded-lg bg-[#f5a623]/10 px-3 py-1.5 text-xs text-[#f5a623] hover:bg-[#f5a623]/20 transition-colors"
          >
            <Download size={12} />
            下载 .xmind
          </button>
          <button
            onClick={() => onDelete(detail.id)}
            className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
            title="删除文件"
          >
            <Trash2 size={12} />
            删除
          </button>
        </div>
      </div>

      {detail.sheets.length === 0 ? (
        <div className="text-center py-4 text-xs text-[var(--text-tertiary)]">
          暂无内容
        </div>
      ) : (
        <>
          {/* Sheet Tab 导航 */}
          <div className="flex items-center gap-1 mb-3 flex-wrap">
            {detail.sheets.map((sheet) => {
              const isOverview =
                sheet.sheet_id === "overview" || sheet.sheet_id === "main";
              return (
                <div key={sheet.sheet_id} className="group relative">
                  <button
                    onClick={() => setActiveSheet(sheet.sheet_id)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs transition-colors max-w-[160px] truncate pr-6",
                      activeSheet === sheet.sheet_id
                        ? "bg-[#f5a623]/15 text-[#f5a623]"
                        : "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
                    )}
                    title={sheet.sheet_title}
                  >
                    {isOverview && "概览 · "}
                    {sheet.sheet_title}
                    <span className="ml-1 text-[9px] opacity-60">
                      {sheet.node_count}
                    </span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSheet(detail.id, sheet.sheet_id);
                      if (activeSheet === sheet.sheet_id) setActiveSheet(null);
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    title="删除此子导图"
                  >
                    <Trash2 size={8} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* 当前 Sheet 树形内容 */}
          {activeSheetData && (
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-3 max-h-72 overflow-y-auto">
              {activeSheetData.source_url && (
                <div className="mb-2 flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                  <ExternalLink size={9} />
                  <a
                    href={activeSheetData.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate hover:text-[#f5a623]"
                  >
                    {activeSheetData.source_url}
                  </a>
                </div>
              )}
              {activeSheetData.tree.map((root, i) => (
                <SheetTreePreview key={i} node={root} depth={0} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SheetTreePreview({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children && node.children.length > 0;
  const url = node.url || "";
  const isImage =
    url.startsWith("http") && /\.(jpg|jpeg|png|gif|webp|bmp|svg)/i.test(url);
  const isJumpLink = url.startsWith("xmind://");

  return (
    <div style={{ marginLeft: depth > 0 ? 14 : 0 }}>
      <div
        className="flex items-start gap-1 py-0.5"
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown
              size={10}
              className="mt-0.5 shrink-0 text-[var(--text-tertiary)]"
            />
          ) : (
            <ChevronRight
              size={10}
              className="mt-0.5 shrink-0 text-[var(--text-tertiary)]"
            />
          )
        ) : (
          <span className="w-2.5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 flex-wrap">
            <span
              className={cn(
                "text-[11px]",
                depth === 0
                  ? "font-semibold text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)]",
              )}
            >
              {node.title}
            </span>
            {url && !isJumpLink && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-0.5 text-[10px] text-[#f5a623]/60 hover:text-[#f5a623]"
                title={url}
              >
                {isImage ? (
                  <>
                    <ExternalLink size={8} />
                    <span>查看图片</span>
                  </>
                ) : (
                  <ExternalLink size={8} />
                )}
              </a>
            )}
          </div>
          {node.content && (
            <p
              className={cn(
                "text-[10px] text-[var(--text-tertiary)] mt-0.5 whitespace-pre-wrap",
                depth === 0 ? "leading-relaxed" : "leading-snug",
              )}
            >
              {node.content}
            </p>
          )}
        </div>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child, i) => (
            <SheetTreePreview key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
