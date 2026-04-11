import { useApi } from "../hooks/useApi";
import { useNavigate } from "react-router-dom";
import type { MachineInfo } from "@tm/shared";

export default function Agents() {
  const { data: machines, loading, refresh } = useApi<Record<string, MachineInfo>>("/api/machines");
  const navigate = useNavigate();

  if (loading) return <div className="p-6 text-[#9CA3AF] text-sm">Loading...</div>;

  const entries = machines ? Object.entries(machines) : [];

  return (
    <div className="p-6 space-y-5 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-heading text-2xl font-bold text-[#111827]">Agents</h1>
          <p className="font-caption text-xs text-[#9CA3AF] mt-0.5">{entries.length} machines</p>
        </div>
        <button onClick={refresh} className="font-caption text-sm text-[#9CA3AF] active:text-[#6B7280] px-2 py-1">Refresh</button>
      </div>

      {entries.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[#9CA3AF] text-sm">No machines registered</p>
          <p className="font-caption text-xs text-[#D1D5DB] mt-1">Run tm-agent on remote machines to register</p>
        </div>
      )}

      <div className="space-y-3">
        {entries.map(([machineId, machine]) => (
          <div key={machineId} className="bg-white rounded-[10px] border border-[#E5E7EB] overflow-hidden" style={{boxShadow: "0 2px 8px rgba(0,0,0,0.04)"}}>
            <div className="px-4 py-3 flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${machine.online ? "bg-[#3B9B6A]" : "bg-[#D1D5DB]"}`} />
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-[#111827]">{machine.hostname}</p>
                <p className="font-data text-[10px] text-[#9CA3AF]">{machine.os} · {machineId.slice(0, 12)}</p>
              </div>
              <span className={`font-data text-[10px] font-medium ml-auto flex-shrink-0 ${machine.online ? "text-[#3B9B6A]" : "text-[#D1D5DB]"}`}>
                {machine.online ? "ONLINE" : "OFFLINE"}
              </span>
            </div>

            <div className="border-t border-[#E5E7EB]">
              {Object.entries(machine.agents).map(([name, agent]) => (
                <div
                  key={name}
                  className="flex items-center justify-between px-4 py-2.5 border-b border-[#F0F1F3] last:border-0 active:bg-gray-50"
                  onClick={() => agent.status === "idle" && navigate(`/dispatch?agent=${name}@${machineId}`)}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      agent.status === "idle" ? "bg-[#3B9B6A]" : agent.status === "busy" ? "bg-[#D4973B]" : "bg-[#D1D5DB]"
                    }`} />
                    <span className="text-sm font-medium text-[#374151]">{name}</span>
                    {agent.tags.length > 0 && (
                      <span className="font-data text-[10px] text-[#9CA3AF]">{agent.tags.join(", ")}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-data text-[11px] font-medium ${
                      agent.status === "idle" ? "text-[#3B9B6A]" : agent.status === "busy" ? "text-[#D4973B]" : "text-[#D1D5DB]"
                    }`}>{agent.status}</span>
                    {agent.status === "idle" && (
                      <svg className="w-3.5 h-3.5 text-[#D1D5DB]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
