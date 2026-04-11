import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { useState } from "react";

interface FileEntry { name: string; isDir: boolean; size: number; mtime: string; }
interface DirResult { type: "dir"; path: string; entries: FileEntry[]; root: string; }
interface FileResult { type: "file"; path: string; content: string; size: number; }
interface GitStatus { branch: string; lastCommit: string; files: Array<{ status: string; file: string }>; }
interface GitCommit { hash: string; short: string; message: string; author: string; time: string; }
type Tab = "files" | "changes" | "log";

export default function WorkspaceFiles() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPath = searchParams.get("path") || ".";
  const [tab, setTab] = useState<Tab>("changes");
  const [selectedRef, setSelectedRef] = useState<string | null>(null);

  const { data: dirData, loading: dirLoading } = useApi<DirResult | FileResult>(`/api/workspaces/${workspaceId}/files?path=${encodeURIComponent(currentPath)}`, [currentPath]);
  const { data: gitStatus } = useApi<GitStatus>(`/api/workspaces/${workspaceId}/git/status`);
  const { data: gitLog } = useApi<GitCommit[]>(`/api/workspaces/${workspaceId}/git/log`);
  const diffUrl = selectedRef ? `/api/workspaces/${workspaceId}/git/diff?ref=${selectedRef}` : `/api/workspaces/${workspaceId}/git/diff`;
  const { data: diffData, loading: diffLoading } = useApi<{ diff: string }>(diffUrl, [selectedRef]);

  function navigateTo(path: string) { setSearchParams({ path }); }
  function goUp() { const parts = currentPath.split("/").filter(Boolean); parts.pop(); navigateTo(parts.length ? parts.join("/") : "."); }

  const tabClass = (t: Tab) => `font-heading flex-1 py-2.5 text-xs font-semibold text-center relative ${tab === t ? "text-[#4A96C4]" : "text-[#9CA3AF] active:text-[#6B7280]"}`;

  return (
    <div className="flex flex-col h-app">
      <div className="px-4 py-2.5 border-b border-[#E5E7EB] bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <button onClick={() => navigate(-1)} className="text-[#9CA3AF] active:text-[#6B7280] flex-shrink-0">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div className="min-w-0">
              <p className="font-heading text-[16px] font-semibold text-[#111827] truncate">{workspaceId?.split(":").pop()?.split("-").pop()}</p>
              {gitStatus && (
                <p className="font-data text-[10px] text-[#9CA3AF] truncate">
                  <span className="text-[#4A96C4]">{gitStatus.branch}</span>{" \u00b7 "}{gitStatus.lastCommit}
                </p>
              )}
            </div>
          </div>
          {gitStatus && gitStatus.files.length > 0 && (
            <span className="font-data text-[10px] px-2 py-0.5 bg-[#D4973B]/8 text-[#D4973B] border border-[#D4973B]/15 rounded-full flex-shrink-0 font-medium">{gitStatus.files.length} changed</span>
          )}
        </div>
      </div>

      <div className="flex border-b border-[#E5E7EB]">
        <button className={tabClass("changes")} onClick={() => { setTab("changes"); setSelectedRef(null); }}>
          Changes{gitStatus?.files.length ? ` (${gitStatus.files.length})` : ""}
          {tab === "changes" && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[#4A96C4] rounded-full" />}
        </button>
        <button className={tabClass("log")} onClick={() => setTab("log")}>
          Log{tab === "log" && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[#4A96C4] rounded-full" />}
        </button>
        <button className={tabClass("files")} onClick={() => setTab("files")}>
          Files{tab === "files" && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[#4A96C4] rounded-full" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "changes" && (
          <div>
            {gitStatus && gitStatus.files.length > 0 && (
              <div className="border-b border-[#E5E7EB]">
                {gitStatus.files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-4 py-2 border-b border-[#F0F1F3] last:border-0">
                    <span className={`font-data text-[11px] w-5 text-center flex-shrink-0 font-bold ${
                      f.status === "M" ? "text-[#D4973B]" : f.status === "A" ? "text-[#3B9B6A]" : f.status === "D" ? "text-[#DC2626]" : "text-[#9CA3AF]"
                    }`}>{f.status}</span>
                    <span className="selectable font-data text-[11px] text-[#6B7280] truncate">{f.file}</span>
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
              <div key={commit.hash} className={`px-4 py-2.5 border-b border-[#F0F1F3] active:bg-gray-50 ${selectedRef === commit.hash ? "bg-[#4A96C4]/5 border-l-2 border-l-[#4A96C4]" : ""}`}
                onClick={() => { setSelectedRef(commit.hash!); setTab("changes"); }}>
                <div className="flex items-center gap-2">
                  <span className="font-data text-[10px] text-[#4A96C4] bg-[#4A96C4]/8 px-1.5 py-0.5 rounded flex-shrink-0">{commit.short}</span>
                  <span className="text-xs text-[#374151] truncate">{commit.message}</span>
                </div>
                <p className="font-caption text-[10px] text-[#9CA3AF] mt-1">{commit.author} \u00b7 {commit.time}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "files" && (
          <div>
            <div className="px-4 py-2 border-b border-[#E5E7EB] flex items-center gap-1 flex-wrap bg-[#F9FAFB]">
              <button onClick={() => navigateTo(".")} className="font-data text-xs text-[#4A96C4]">/</button>
              {currentPath !== "." && currentPath.split("/").map((part, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="text-xs text-[#D1D5DB]">/</span>
                  <button onClick={() => navigateTo(arr.slice(0, i + 1).join("/"))} className="font-data text-xs text-[#4A96C4]">{part}</button>
                </span>
              ))}
              {currentPath !== "." && <button onClick={goUp} className="font-data text-xs text-[#9CA3AF] ml-auto">..</button>}
            </div>

            {dirLoading && <div className="p-4 text-[#9CA3AF] text-xs text-center">Loading...</div>}

            {dirData?.type === "dir" && (dirData as DirResult).entries.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between px-4 py-2.5 border-b border-[#F0F1F3] active:bg-gray-50"
                onClick={() => navigateTo(currentPath === "." ? entry.name : `${currentPath}/${entry.name}`)}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-sm flex-shrink-0 opacity-50">{entry.isDir ? "\ud83d\udcc1" : "\ud83d\udcc4"}</span>
                  <span className="selectable font-data text-xs text-[#374151] truncate">{entry.name}</span>
                </div>
                {!entry.isDir && <span className="font-data text-[10px] text-[#D1D5DB] flex-shrink-0 ml-2">{formatSize(entry.size)}</span>}
              </div>
            ))}

            {dirData?.type === "file" && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <button onClick={goUp} className="text-xs text-[#4A96C4] flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Back
                  </button>
                  <span className="font-data text-[10px] text-[#9CA3AF]">{formatSize((dirData as FileResult).size)}</span>
                </div>
                <pre className="selectable font-data text-xs text-[#374151] bg-[#F9FAFB] rounded-[10px] p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed border border-[#E5E7EB]">
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
  if (loading) return <div className="p-6 text-[#9CA3AF] text-xs text-center">Loading diff...</div>;
  if (!diff || diff === "(no changes)") return <div className="p-6 text-[#9CA3AF] text-xs text-center">No changes</div>;

  return (
    <pre className="selectable font-data text-[10px] leading-relaxed p-3 overflow-x-auto bg-[#F9FAFB]">
      {diff.split("\n").map((line, i) => {
        let cls = "text-[#9CA3AF]";
        if (line.startsWith("+") && !line.startsWith("+++")) cls = "text-[#3B9B6A] bg-[#3B9B6A]/5";
        else if (line.startsWith("-") && !line.startsWith("---")) cls = "text-[#DC2626] bg-[#DC2626]/5";
        else if (line.startsWith("@@")) cls = "text-[#4A96C4] bg-[#4A96C4]/5";
        else if (line.startsWith("diff ") || line.startsWith("index ")) cls = "text-[#D1D5DB]";
        else if (line.startsWith("=== ")) cls = "text-[#D4973B] font-bold bg-[#D4973B]/5";
        else if (line.startsWith("commit ")) cls = "text-[#D4973B]";
        else if (line.startsWith("Author:") || line.startsWith("Date:")) cls = "text-[#9CA3AF]";
        return <div key={i} className={`px-1.5 rounded-sm ${cls}`}>{line || " "}</div>;
      })}
    </pre>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}
