import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { useState } from "react";

interface FileEntry {
  name: string;
  isDir: boolean;
  size: number;
  mtime: string;
}

interface DirResult {
  type: "dir";
  path: string;
  entries: FileEntry[];
  root: string;
}

interface FileResult {
  type: "file";
  path: string;
  content: string;
  size: number;
}

interface GitStatus {
  branch: string;
  lastCommit: string;
  files: Array<{ status: string; file: string }>;
}

interface GitCommit {
  hash: string;
  short: string;
  message: string;
  author: string;
  time: string;
}

type Tab = "files" | "changes" | "log";

export default function WorkspaceFiles() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPath = searchParams.get("path") || ".";
  const [tab, setTab] = useState<Tab>("changes");
  const [selectedRef, setSelectedRef] = useState<string | null>(null);

  const { data: dirData, loading: dirLoading } = useApi<DirResult | FileResult>(
    `/api/workspaces/${workspaceId}/files?path=${encodeURIComponent(currentPath)}`,
    [currentPath]
  );
  const { data: gitStatus } = useApi<GitStatus>(`/api/workspaces/${workspaceId}/git/status`);
  const { data: gitLog } = useApi<GitCommit[]>(`/api/workspaces/${workspaceId}/git/log`);

  const diffUrl = selectedRef
    ? `/api/workspaces/${workspaceId}/git/diff?ref=${selectedRef}`
    : `/api/workspaces/${workspaceId}/git/diff`;
  const { data: diffData, loading: diffLoading } = useApi<{ diff: string }>(diffUrl, [selectedRef]);

  function navigateTo(path: string) {
    setSearchParams({ path });
  }

  function goUp() {
    const parts = currentPath.split("/").filter(Boolean);
    parts.pop();
    navigateTo(parts.length ? parts.join("/") : ".");
  }

  const tabClass = (t: Tab) =>
    `flex-1 py-2.5 text-xs font-medium text-center relative ${
      tab === t ? "text-blue-400" : "text-slate-500 active:text-slate-300"
    }`;

  return (
    <div className="flex flex-col h-app">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-slate-700/50 bg-slate-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <button onClick={() => navigate(-1)} className="text-slate-500 active:text-white flex-shrink-0">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{workspaceId?.split(":").pop()?.split("-").pop()}</p>
              {gitStatus && (
                <p className="text-[10px] text-slate-500 truncate">
                  <span className="text-blue-400/70">{gitStatus.branch}</span>
                  {" \u00b7 "}
                  {gitStatus.lastCommit}
                </p>
              )}
            </div>
          </div>
          {gitStatus && gitStatus.files.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-full flex-shrink-0 font-medium">
              {gitStatus.files.length} changed
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700/50">
        <button className={tabClass("changes")} onClick={() => { setTab("changes"); setSelectedRef(null); }}>
          Changes{gitStatus?.files.length ? ` (${gitStatus.files.length})` : ""}
          {tab === "changes" && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-blue-400 rounded-full" />}
        </button>
        <button className={tabClass("log")} onClick={() => setTab("log")}>
          Log
          {tab === "log" && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-blue-400 rounded-full" />}
        </button>
        <button className={tabClass("files")} onClick={() => setTab("files")}>
          Files
          {tab === "files" && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-blue-400 rounded-full" />}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "changes" && (
          <div>
            {gitStatus && gitStatus.files.length > 0 && (
              <div className="border-b border-slate-700/30">
                {gitStatus.files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-3.5 py-2 border-b border-slate-700/20 last:border-0">
                    <span className={`text-[10px] font-mono w-5 text-center flex-shrink-0 font-bold ${
                      f.status === "M" ? "text-yellow-400" :
                      f.status === "A" ? "text-green-400" :
                      f.status === "D" ? "text-red-400" :
                      f.status === "?" ? "text-slate-600" : "text-blue-400"
                    }`}>
                      {f.status}
                    </span>
                    <span className="selectable text-xs text-slate-300 truncate font-mono">{f.file}</span>
                  </div>
                ))}
              </div>
            )}
            <DiffView diff={diffData?.diff} loading={diffLoading} />
          </div>
        )}

        {tab === "log" && (
          <div>
            {gitLog?.map((commit) => (
              <div
                key={commit.hash}
                className={`px-3.5 py-2.5 border-b border-slate-700/20 active:bg-slate-800/60 ${
                  selectedRef === commit.hash ? "bg-slate-800/60 border-l-2 border-l-blue-500" : ""
                }`}
                onClick={() => { setSelectedRef(commit.hash!); setTab("changes"); }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded flex-shrink-0">{commit.short}</span>
                  <span className="text-xs text-slate-300 truncate">{commit.message}</span>
                </div>
                <p className="text-[10px] text-slate-600 mt-1">{commit.author} \u00b7 {commit.time}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "files" && (
          <div>
            {/* Breadcrumb */}
            <div className="px-3.5 py-2 border-b border-slate-700/30 flex items-center gap-1 flex-wrap bg-slate-900/30">
              <button onClick={() => navigateTo(".")} className="text-xs text-blue-400 active:text-blue-300">/</button>
              {currentPath !== "." && currentPath.split("/").map((part, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="text-xs text-slate-700">/</span>
                  <button
                    onClick={() => navigateTo(arr.slice(0, i + 1).join("/"))}
                    className="text-xs text-blue-400 active:text-blue-300"
                  >
                    {part}
                  </button>
                </span>
              ))}
              {currentPath !== "." && (
                <button onClick={goUp} className="text-xs text-slate-600 ml-auto active:text-white">..</button>
              )}
            </div>

            {dirLoading && <div className="p-4 text-slate-600 text-xs text-center">Loading...</div>}

            {dirData?.type === "dir" && (
              <div>
                {(dirData as DirResult).entries.map((entry) => (
                  <div
                    key={entry.name}
                    className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-700/20 active:bg-slate-800/60"
                    onClick={() => navigateTo(currentPath === "." ? entry.name : `${currentPath}/${entry.name}`)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-sm flex-shrink-0 opacity-60">{entry.isDir ? "\ud83d\udcc1" : "\ud83d\udcc4"}</span>
                      <span className="selectable text-xs text-slate-300 truncate font-mono">{entry.name}</span>
                    </div>
                    {!entry.isDir && (
                      <span className="text-[10px] text-slate-600 flex-shrink-0 ml-2">{formatSize(entry.size)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {dirData?.type === "file" && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <button onClick={goUp} className="text-xs text-blue-400 active:text-blue-300 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Back
                  </button>
                  <span className="text-[10px] text-slate-600">{formatSize((dirData as FileResult).size)}</span>
                </div>
                <pre className="selectable text-xs font-mono text-slate-300 bg-slate-900/80 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed border border-slate-700/30">
                  {(dirData as FileResult).content}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DiffView({ diff, loading }: { diff?: string; loading: boolean }) {
  if (loading) return <div className="p-6 text-slate-600 text-xs text-center">Loading diff...</div>;
  if (!diff || diff === "(no changes)") {
    return <div className="p-6 text-slate-600 text-xs text-center">No changes</div>;
  }

  const lines = diff.split("\n");

  return (
    <pre className="selectable text-xs font-mono leading-relaxed p-2.5 overflow-x-auto">
      {lines.map((line, i) => {
        let cls = "text-slate-500";
        if (line.startsWith("+") && !line.startsWith("+++")) cls = "text-green-400 bg-green-500/5";
        else if (line.startsWith("-") && !line.startsWith("---")) cls = "text-red-400 bg-red-500/5";
        else if (line.startsWith("@@")) cls = "text-blue-400/70 bg-blue-500/5";
        else if (line.startsWith("diff ") || line.startsWith("index ")) cls = "text-slate-700";
        else if (line.startsWith("=== ")) cls = "text-yellow-400 font-bold bg-yellow-500/5";
        else if (line.startsWith("commit ")) cls = "text-yellow-400";
        else if (line.startsWith("Author:") || line.startsWith("Date:")) cls = "text-slate-600";

        return (
          <div key={i} className={`px-1.5 rounded-sm ${cls}`}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}
