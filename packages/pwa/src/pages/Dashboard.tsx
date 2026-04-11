import { useApi } from "../hooks/useApi";
import { useNavigate } from "react-router-dom";
import type { MachineInfo, SessionInfo } from "@tm/shared";

export default function Dashboard() {
  const { data: machines, refresh: refreshMachines } = useApi<Record<string, MachineInfo>>("/api/machines");
  const { data: sessions, refresh: refreshSessions } = useApi<SessionInfo[]>("/api/sessions");
  const navigate = useNavigate();

  const onlineMachines = machines ? Object.values(machines).filter(m => m.online).length : 0;
  const totalMachines = machines ? Object.keys(machines).length : 0;
  const totalAgents = machines ? Object.values(machines).flatMap(m => Object.keys(m.agents)).length : 0;
  const idleAgents = machines ? Object.values(machines).flatMap(m => Object.values(m.agents)).filter(a => a.status === "idle").length : 0;
  const runningSessions = sessions?.filter(s => s.status === "running").length ?? 0;

  function refresh() { refreshMachines(); refreshSessions(); }

  return (
    <div className="p-4 space-y-5 pb-20">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-bold tracking-tight">Dashboard</h1>
        <button onClick={refresh} className="text-xs text-slate-500 active:text-white px-2 py-1 rounded-lg">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Machines" value={`${onlineMachines}/${totalMachines}`} sub="online" color="blue" />
        <StatCard label="Agents" value={`${idleAgents}/${totalAgents}`} sub="idle" color="green" />
        <StatCard label="Running" value={String(runningSessions)} sub="sessions" color="yellow" />
        <StatCard label="Total" value={String(sessions?.length ?? 0)} sub="sessions" color="slate" />
      </div>

      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Agents</h2>
        <div className="space-y-1.5">
          {machines && Object.entries(machines).map(([machineId, machine]) => (
            Object.entries(machine.agents).map(([name, agent]) => (
              <div
                key={`${machineId}-${name}`}
                className="flex items-center justify-between bg-slate-800/60 rounded-xl px-3.5 py-2.5 active:bg-slate-700"
                onClick={() => agent.status === "idle" && navigate(`/dispatch?agent=${name}@${machineId}`)}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${
                    agent.status === "idle" ? "bg-green-400" : agent.status === "busy" ? "bg-yellow-400" : "bg-red-400"
                  }`} />
                  <span className="text-sm font-medium">{name}</span>
                  <span className="text-xs text-slate-500">@{machine.hostname}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  agent.status === "idle" ? "bg-green-500/10 text-green-400" :
                  agent.status === "busy" ? "bg-yellow-500/10 text-yellow-400" :
                  "bg-slate-700 text-slate-400"
                }`}>{agent.status}</span>
              </div>
            ))
          ))}
          {(!machines || Object.keys(machines).length === 0) && (
            <p className="text-xs text-slate-600 text-center py-4">No agents connected</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Recent Sessions</h2>
        <div className="space-y-1.5">
          {(!sessions || sessions.length === 0) && <p className="text-xs text-slate-600 text-center py-4">No sessions yet</p>}
          {sessions?.slice(-10).reverse().map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between bg-slate-800/60 rounded-xl px-3.5 py-2.5 active:bg-slate-700"
              onClick={() => navigate(`/chat/${s.id}`)}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  s.status === "running" ? "bg-green-400 animate-pulse" : s.status === "completed" ? "bg-slate-500" : "bg-red-400"
                }`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.agentName}@{s.machineId}</p>
                  <p className="text-xs text-slate-500 truncate">{s.instruction || "(empty)"}</p>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                s.status === "running" ? "bg-green-500/10 text-green-400" :
                s.status === "completed" ? "bg-slate-700 text-slate-400" :
                "bg-red-500/10 text-red-400"
              }`}>{s.status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colors: Record<string, string> = {
    blue: "from-blue-500/10 to-transparent border-blue-500/20",
    green: "from-green-500/10 to-transparent border-green-500/20",
    yellow: "from-yellow-500/10 to-transparent border-yellow-500/20",
    slate: "from-slate-500/5 to-transparent border-slate-500/20",
  };
  const textColors: Record<string, string> = {
    blue: "text-blue-400", green: "text-green-400", yellow: "text-yellow-400", slate: "text-slate-400",
  };

  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-xl p-3.5`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-0.5 ${textColors[color]}`}>{value}</div>
      <div className="text-xs text-slate-600">{sub}</div>
    </div>
  );
}
