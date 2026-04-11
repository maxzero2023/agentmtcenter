import { useApi } from "../hooks/useApi";
import { useNavigate } from "react-router-dom";
import type { SessionInfo } from "@tm/shared";

export default function Sessions() {
  const { data: sessions, loading, refresh } = useApi<SessionInfo[]>("/api/sessions");
  const navigate = useNavigate();

  if (loading) return <div className="p-4 text-slate-400">Loading...</div>;

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">Sessions</h1>
        <button onClick={refresh} className="text-xs text-slate-400 hover:text-white">Refresh</button>
      </div>
      {sessions?.length === 0 && <p className="text-slate-500 text-sm">No sessions yet</p>}
      {sessions?.map((s) => (
        <div
          key={s.id}
          className="bg-slate-800 rounded-lg p-3 hover:bg-slate-700 cursor-pointer"
          onClick={() => navigate(`/chat/${s.id}`)}
        >
          <div className="flex items-center gap-2 mb-1">
            <StatusDot status={s.status} />
            <span className="text-sm font-medium">{s.agentName}@{s.machineId}</span>
            <span className="text-xs text-slate-500">{s.status}</span>
          </div>
          <p className="text-xs text-slate-400 truncate">{s.instruction || "(no instruction)"}</p>
          <p className="text-xs text-slate-600 mt-1">{new Date(s.createdAt).toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === "running" ? "bg-green-400 animate-pulse" : status === "completed" ? "bg-slate-400" : "bg-red-400";
  return <span className={`w-2 h-2 rounded-full ${color}`} />;
}
