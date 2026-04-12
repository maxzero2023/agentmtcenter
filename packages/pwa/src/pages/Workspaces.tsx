import { useState, useMemo } from "react";
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
  machine: string;
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
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);

  const machines = useMemo(() => {
    if (!workspaces) return [];
    const set = new Set(workspaces.map(w => w.machine));
    return Array.from(set).sort();
  }, [workspaces]);

  // 默认选中第一台机器
  const activeMachine = selectedMachine ?? machines[0] ?? null;

  const filtered = useMemo(() => {
    if (!workspaces || !activeMachine) return workspaces ?? [];
    return workspaces.filter(w => w.machine === activeMachine);
  }, [workspaces, activeMachine]);

  if (loading) return <div className="p-6 text-[#9CA3AF] text-sm">Loading...</div>;

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
    <div className="p-6 space-y-4 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-[#111827]">Projects</h1>
          <p className="font-caption text-xs text-[#9CA3AF] mt-0.5">{filtered.length} workspaces</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowNew(!showNew)} className="font-heading text-[13px] px-3.5 py-1.5 bg-[#4A96C4] hover:bg-[#3A7CA5] rounded-lg font-semibold text-white" style={{boxShadow: "0 2px 8px rgba(74,150,196,0.12)"}}>
            + New
          </button>
          <button onClick={refresh} className="font-caption text-sm text-[#9CA3AF] active:text-[#6B7280] px-2 py-1.5">
            Refresh
          </button>
        </div>
      </div>

      {/* Machine switcher */}
      {machines.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {machines.map(m => (
            <button
              key={m}
              onClick={() => setSelectedMachine(m)}
              className={`font-data text-[11px] px-3 py-1.5 rounded-lg flex-shrink-0 font-medium border ${
                m === activeMachine
                  ? "bg-[#4A96C4]/10 text-[#4A96C4] border-[#4A96C4]/20"
                  : "bg-white text-[#9CA3AF] border-[#E5E7EB] active:bg-gray-50"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {/* Single machine indicator */}
      {machines.length === 1 && (
        <div className="font-data text-[11px] text-[#9CA3AF] flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3B9B6A]" />
          {machines[0]}
        </div>
      )}

      {showNew && (
        <form onSubmit={handleCreate} className="bg-white rounded-[10px] p-4 space-y-3 border border-[#E5E7EB]" style={{boxShadow: "0 2px 8px rgba(0,0,0,0.06)"}}>
          <input placeholder="Project path (e.g. /Users/max/project)" value={newPath} onChange={(e) => setNewPath(e.target.value)} required className="w-full px-3 py-2.5 bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg text-sm text-[#111827] placeholder:text-[#D1D5DB]" />
          <input placeholder="Initial message (optional)" value={newMsg} onChange={(e) => setNewMsg(e.target.value)} className="w-full px-3 py-2.5 bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg text-sm text-[#111827] placeholder:text-[#D1D5DB]" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setNewAgent("claude")} className={`flex-1 py-2 rounded-lg text-xs font-medium ${newAgent === "claude" ? "bg-[#D4973B]/10 text-[#D4973B] border border-[#D4973B]/20" : "bg-[#F3F4F6] text-[#9CA3AF] border border-[#E5E7EB]"}`}>Claude Code</button>
            <button type="button" onClick={() => setNewAgent("cursor")} className={`flex-1 py-2 rounded-lg text-xs font-medium ${newAgent === "cursor" ? "bg-[#4A96C4]/10 text-[#4A96C4] border border-[#4A96C4]/20" : "bg-[#F3F4F6] text-[#9CA3AF] border border-[#E5E7EB]"}`}>Cursor</button>
          </div>
          <button type="submit" disabled={creating || !newPath.trim()} className="font-heading w-full py-2.5 bg-[#4A96C4] hover:bg-[#3A7CA5] rounded-lg text-sm font-semibold text-white disabled:opacity-50">{creating ? "Creating..." : `Create ${newAgent === "claude" ? "CC" : "Cursor"} Session`}</button>
        </form>
      )}

      <div className="space-y-2.5">
        {filtered.map((ws) => (
          <div key={ws.id} className="bg-white rounded-[10px] overflow-hidden border border-[#E5E7EB]" style={{boxShadow: "0 2px 8px rgba(0,0,0,0.04)"}}>
            <div className="flex items-center justify-between px-4 py-3 active:bg-gray-50" onClick={() => toggle(ws.id)}>
              <div className="flex items-center min-w-0 gap-2">
                <span className={`font-data text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${
                  ws.source === "claude" ? "bg-[#D4973B]/10 text-[#D4973B]" : "bg-[#4A96C4]/10 text-[#4A96C4]"
                }`}>
                  {ws.source === "claude" ? "CC" : "Cur"}
                </span>
                <span className="text-[15px] font-semibold text-[#111827] truncate">{ws.name}</span>
                <span className="font-data text-[11px] text-[#9CA3AF] flex-shrink-0">{ws.sessions.length}</span>
              </div>
              <div className="flex items-center gap-2.5 flex-shrink-0">
                {ws.path && (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); navigate(`/workspace/${ws.id}/files`); }} className="font-data text-[10px] px-2 py-1 rounded-md bg-[#F3F4F6] text-[#6B7280] active:bg-[#E5E7EB] font-medium">Git</button>
                    <button onClick={(e) => { e.stopPropagation(); setShowNew(true); setNewPath(ws.path); setNewAgent(ws.source); }} className="text-xs text-[#4A96C4] active:text-[#3A7CA5] w-6 h-6 flex items-center justify-center">+</button>
                  </>
                )}
                <svg className={`w-3 h-3 text-[#D1D5DB] transition-transform ${expanded.has(ws.id) ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            {expanded.has(ws.id) && (
              <div className="border-t border-[#E5E7EB]">
                {ws.sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-2.5 active:bg-gray-50 border-b border-[#F0F1F3] last:border-0" onClick={(e) => { e.stopPropagation(); navigate(`/workspace/${ws.id}/session/${s.id}`); }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-[#6B7280] truncate leading-relaxed">{s.firstMessage}</p>
                      <p className="font-data text-[10px] text-[#D1D5DB] mt-0.5">
                        {s.messageCount > 0 ? `${s.messageCount} msgs` : (s.linesAdded || s.linesRemoved) ? `+${s.linesAdded}/-${s.linesRemoved}` : ""}
                        {s.filesChanged ? ` \u00b7 ${s.filesChanged} files` : ""}
                        {s.timestamp ? ` \u00b7 ${new Date(s.timestamp).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <svg className="w-3.5 h-3.5 text-[#E5E7EB] flex-shrink-0 ml-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
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
