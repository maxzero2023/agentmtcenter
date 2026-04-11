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
    <div className="p-6 space-y-7 pb-20">
      <div className="flex justify-between items-center">
        <h1 className="font-heading text-2xl font-bold text-[#111827]">Dashboard</h1>
        <button onClick={refresh} className="font-caption text-sm text-[#9CA3AF] active:text-[#6B7280] px-2 py-1">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="MACHINES" value={`${onlineMachines}/${totalMachines}`} sub="online" valueColor="#4A96C4" />
        <StatCard label="AGENTS" value={`${idleAgents}/${totalAgents}`} sub="idle" valueColor="#3B9B6A" />
        <StatCard label="RUNNING" value={String(runningSessions)} sub="sessions" valueColor="#D4973B" />
        <StatCard label="TOTAL" value={String(sessions?.length ?? 0)} sub="sessions" valueColor="#6B7280" />
      </div>

      <section>
        <h2 className="font-heading text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-[1.5px] mb-2.5">Agents</h2>
        <div className="space-y-2">
          {machines && Object.entries(machines).map(([machineId, machine]) => (
            Object.entries(machine.agents).map(([name, agent]) => (
              <div
                key={`${machineId}-${name}`}
                className="flex items-center justify-between bg-white rounded-[10px] border border-[#E5E7EB] px-4 py-3 active:bg-gray-50"
                style={{boxShadow: "0 1px 4px rgba(0,0,0,0.04)"}}
                onClick={() => agent.status === "idle" && navigate(`/dispatch?agent=${name}@${machineId}`)}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${
                    agent.status === "idle" ? "bg-[#3B9B6A]" : agent.status === "busy" ? "bg-[#D4973B]" : "bg-red-400"
                  }`} />
                  <span className="text-[15px] font-medium text-[#111827]">{name}</span>
                  <span className="font-data text-xs text-[#9CA3AF]">@{machine.hostname}</span>
                </div>
                <span className={`font-data text-[11px] font-medium ${
                  agent.status === "idle" ? "text-[#3B9B6A]" : agent.status === "busy" ? "text-[#D4973B]" : "text-red-400"
                }`}>{agent.status}</span>
              </div>
            ))
          ))}
          {(!machines || Object.keys(machines).length === 0) && (
            <p className="font-caption text-sm text-[#D1D5DB] text-center py-6">No agents connected</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-heading text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-[1.5px] mb-2.5">Recent Sessions</h2>
        <div className="space-y-2">
          {(!sessions || sessions.length === 0) && <p className="font-caption text-sm text-[#D1D5DB] text-center py-6">No sessions yet</p>}
          {sessions?.slice(-10).reverse().map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between bg-white rounded-[10px] border border-[#E5E7EB] px-4 py-3 active:bg-gray-50"
              style={{boxShadow: "0 1px 4px rgba(0,0,0,0.04)"}}
              onClick={() => navigate(`/chat/${s.id}`)}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  s.status === "running" ? "bg-[#3B9B6A] animate-pulse" : s.status === "completed" ? "bg-[#D1D5DB]" : "bg-red-400"
                }`} />
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-[#111827] truncate">{s.agentName}@{s.machineId}</p>
                  <p className="text-xs text-[#9CA3AF] truncate">{s.instruction || "(empty)"}</p>
                </div>
              </div>
              <span className={`font-data text-[11px] font-medium flex-shrink-0 ${
                s.status === "running" ? "text-[#3B9B6A]" : s.status === "completed" ? "text-[#D1D5DB]" : "text-red-400"
              }`}>{s.status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, sub, valueColor }: { label: string; value: string; sub: string; valueColor: string }) {
  return (
    <div className="bg-white rounded-[10px] border border-[#E5E7EB] p-4" style={{boxShadow: "0 2px 8px rgba(0,0,0,0.04)"}}>
      <div className="font-heading text-[11px] font-semibold text-[#9CA3AF] tracking-[1.5px]">{label}</div>
      <div className="font-data text-[30px] font-bold mt-1" style={{color: valueColor}}>{value}</div>
      <div className="font-caption text-xs text-[#D1D5DB]">{sub}</div>
    </div>
  );
}
