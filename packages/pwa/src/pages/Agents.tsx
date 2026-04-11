import { useApi } from "../hooks/useApi";
import { useNavigate } from "react-router-dom";
import type { MachineInfo } from "@tm/shared";

export default function Agents() {
  const { data: machines, loading, refresh } = useApi<Record<string, MachineInfo>>("/api/machines");
  const navigate = useNavigate();

  if (loading) return <div className="p-4 text-slate-400">Loading...</div>;

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">Agents</h1>
        <button onClick={refresh} className="text-xs text-slate-400 hover:text-white">Refresh</button>
      </div>
      {machines && Object.entries(machines).map(([machineId, machine]) => (
        <div key={machineId} className="bg-slate-800 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2 h-2 rounded-full ${machine.online ? "bg-green-400" : "bg-red-400"}`} />
            <span className="text-sm font-medium">{machine.hostname}</span>
            <span className="text-xs text-slate-500">{machine.tailscaleIp}</span>
          </div>
          <div className="space-y-1">
            {Object.entries(machine.agents).map(([name, agent]) => (
              <div
                key={name}
                className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-slate-700 cursor-pointer"
                onClick={() => agent.status === "idle" && navigate(`/dispatch?agent=${name}@${machineId}`)}
              >
                <div className="flex items-center gap-2">
                  <StatusDot status={agent.status} />
                  <span className="text-sm">{name}</span>
                  {agent.tags.length > 0 && (
                    <span className="text-xs text-slate-500">[{agent.tags.join(", ")}]</span>
                  )}
                </div>
                <span className="text-xs text-slate-500">{agent.status}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === "idle" ? "bg-green-400" : status === "busy" ? "bg-yellow-400" : "bg-red-400";
  return <span className={`w-2 h-2 rounded-full ${color}`} />;
}
