import { useState } from "react";
import { useApi, postApi } from "../hooks/useApi";
import { useNavigate } from "react-router-dom";

interface SessionSummary {
  id: string;
  firstMessage: string;
  timestamp: string;
  messageCount: number;
  linesAdded?: number;
  linesRemoved?: number;
  filesChanged?: number;
}

interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  source: "claude" | "cursor";
  sessions: SessionSummary[];
}

export default function Workspaces() {
  const { data: workspaces, loading, refresh } = useApi<WorkspaceInfo[]>("/api/workspaces");
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showNew, setShowNew] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newMsg, setNewMsg] = useState("");
  const [newAgent, setNewAgent] = useState<"claude" | "cursor">("claude");
  const [creating, setCreating] = useState(false);

  if (loading) return <div className="p-4 text-slate-400 text-sm">Loading...</div>;

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newPath.trim() || creating) return;
    setCreating(true);
    try {
      await postApi("/api/workspaces/new", {
        path: newPath.trim(),
        message: newMsg.trim() || undefined,
        agent: newAgent,
      });
      setShowNew(false);
      setNewPath("");
      setNewMsg("");
      setTimeout(refresh, 3000);
    } catch (err) {
      alert((err as Error).message);
    }
    setCreating(false);
  }

  return (
    <div className="p-4 space-y-3 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Projects</h1>
          <p className="text-xs text-slate-500 mt-0.5">{workspaces?.length ?? 0} workspaces</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowNew(!showNew)} className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium shadow-sm">
            + New
          </button>
          <button onClick={refresh} className="text-xs text-slate-500 active:text-white px-2 py-1.5">
            Refresh
          </button>
        </div>
      </div>

      {showNew && (
        <form onSubmit={handleCreate} className="bg-slate-800/60 rounded-xl p-3.5 space-y-2.5 border border-slate-700/50">
          <input
            placeholder="Project path (e.g. /Users/max/project)"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            required
            className="w-full px-3 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg text-sm placeholder:text-slate-600"
          />
          <input
            placeholder="Initial message (optional)"
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            className="w-full px-3 py-2.5 bg-slate-900/60 border border-slate-700 rounded-lg text-sm placeholder:text-slate-600"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNewAgent("claude")}
              className={`flex-1 py-2 rounded-lg text-xs font-medium ${newAgent === "claude" ? "bg-orange-600/20 text-orange-300 border border-orange-500/30" : "bg-slate-800 text-slate-500 border border-slate-700"}`}
            >
              Claude Code
            </button>
            <button
              type="button"
              onClick={() => setNewAgent("cursor")}
              className={`flex-1 py-2 rounded-lg text-xs font-medium ${newAgent === "cursor" ? "bg-blue-600/20 text-blue-300 border border-blue-500/30" : "bg-slate-800 text-slate-500 border border-slate-700"}`}
            >
              Cursor
            </button>
          </div>
          <button
            type="submit"
            disabled={creating || !newPath.trim()}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {creating ? "Creating..." : `Create ${newAgent === "claude" ? "CC" : "Cursor"} Session`}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {workspaces?.map((ws) => (
          <div key={ws.id} className="bg-slate-800/60 rounded-xl overflow-hidden border border-slate-700/30">
            <div
              className="flex items-center justify-between px-3.5 py-2.5 active:bg-slate-700/50"
              onClick={() => toggle(ws.id)}
            >
              <div className="flex items-center min-w-0 gap-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium flex-shrink-0 ${
                  ws.source === "claude" ? "bg-orange-500/15 text-orange-400" : "bg-blue-500/15 text-blue-400"
                }`}>
                  {ws.source === "claude" ? "CC" : "Cur"}
                </span>
                <span className="text-sm font-medium truncate">{ws.name}</span>
                <span className="text-xs text-slate-600 flex-shrink-0">{ws.sessions.length}</span>
              </div>
              <div className="flex items-center gap-2.5 flex-shrink-0">
                {ws.path && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/workspace/${ws.id}/files`); }}
                      className="text-[10px] px-2 py-1 rounded-md bg-slate-700/50 text-slate-400 active:bg-slate-600 font-medium"
                    >
                      Git
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowNew(true); setNewPath(ws.path); setNewAgent(ws.source); }}
                      className="text-xs text-blue-400 active:text-blue-300 w-6 h-6 flex items-center justify-center"
                    >
                      +
                    </button>
                  </>
                )}
                <svg
                  className={`w-3 h-3 text-slate-600 transition-transform ${expanded.has(ws.id) ? "rotate-90" : ""}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                >
                  <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            {expanded.has(ws.id) && (
              <div className="border-t border-slate-700/40">
                {ws.sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-3.5 py-2.5 active:bg-slate-700/50 border-b border-slate-700/20 last:border-0"
                    onClick={(e) => { e.stopPropagation(); navigate(`/workspace/${ws.id}/session/${s.id}`); }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-300 truncate leading-relaxed">{s.firstMessage}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        {s.messageCount > 0
                          ? `${s.messageCount} msgs`
                          : (s.linesAdded || s.linesRemoved)
                            ? `+${s.linesAdded}/-${s.linesRemoved}`
                            : ""
                        }
                        {s.filesChanged ? ` \u00b7 ${s.filesChanged} files` : ""}
                        {s.timestamp ? ` \u00b7 ${new Date(s.timestamp).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <svg className="w-3.5 h-3.5 text-slate-700 flex-shrink-0 ml-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
