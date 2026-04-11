import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { wsUrl } from "../hooks/useAuth";

interface Message { role: "user" | "agent" | "system"; content: string; }

export default function Dispatch() {
  const [params] = useSearchParams();
  const [agentId, setAgentId] = useState(params.get("agent") ?? "");
  const [instruction, setInstruction] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { return () => { wsRef.current?.close(); }; }, []);

  function handleDispatch(e: React.FormEvent) {
    e.preventDefault();
    if (!agentId || dispatching) return;
    setDispatching(true); setError(null); setMessages([]); setDone(false); setSessionId(null);
    const ws = new WebSocket(wsUrl("/ws/client"));
    wsRef.current = ws;
    ws.onopen = () => { ws.send(JSON.stringify({ type: "dispatch", agentId, instruction })); };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "session_created": setSessionId(msg.sessionId); setDispatching(false); break;
        case "output": setMessages(prev => { const last = prev[prev.length - 1]; if (last?.role === "agent") return [...prev.slice(0, -1), { role: "agent", content: last.content + msg.content }]; return [...prev, { role: "agent", content: msg.content }]; }); break;
        case "done": setDone(true); setMessages(prev => [...prev, { role: "system", content: "Completed" }]); break;
        case "error": if (msg.sessionId) { setDone(true); setMessages(prev => [...prev, { role: "system", content: `Error: ${msg.error}` }]); } else { setError(msg.message); setDispatching(false); } break;
      }
    };
    ws.onerror = () => { setError("WebSocket connection failed"); setDispatching(false); };
  }

  function handleChat(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !sessionId || done || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type: "chat", sessionId, content: input }));
    setMessages(prev => [...prev, { role: "user", content: input }]);
    setInput("");
  }

  if (!sessionId && !dispatching) {
    return (
      <div className="p-6 space-y-5 pb-20">
        <h1 className="font-heading text-2xl font-bold text-[#111827]">Dispatch</h1>
        <form onSubmit={handleDispatch} className="space-y-3.5">
          <input placeholder="agentName@machineId" value={agentId} onChange={(e) => setAgentId(e.target.value)} required className="w-full px-4 py-3 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] placeholder:text-[#D1D5DB]" style={{boxShadow: "0 1px 4px rgba(0,0,0,0.04)"}} />
          <textarea placeholder="Instruction..." value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={4} className="w-full px-4 py-3 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] resize-none placeholder:text-[#D1D5DB]" style={{boxShadow: "0 1px 4px rgba(0,0,0,0.04)"}} />
          {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-[10px]"><p className="text-red-600 text-xs">{error}</p></div>}
          <button type="submit" disabled={!agentId} className="font-heading w-full py-3 bg-[#4A96C4] hover:bg-[#3A7CA5] rounded-[10px] text-sm font-semibold text-white disabled:opacity-50" style={{boxShadow: "0 4px 16px rgba(74,150,196,0.15)"}}>Send</button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-app">
      <div className="px-4 py-2.5 border-b border-[#E5E7EB] flex items-center gap-2.5 bg-white">
        <span className={`w-2 h-2 rounded-full ${done ? "bg-[#D1D5DB]" : "bg-[#3B9B6A] animate-pulse"}`} />
        <span className="text-sm font-medium text-[#111827]">{agentId}</span>
        <span className="font-data text-xs text-[#9CA3AF]">{sessionId ?? "connecting..."}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-[#F3F4F6]">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "system" ? (
              <div className="w-full text-center py-1">
                <span className="font-caption text-[10px] text-[#D4973B] bg-[#D4973B]/8 px-2.5 py-1 rounded-full">{msg.content}</span>
              </div>
            ) : (
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                msg.role === "user" ? "bg-[#4A96C4] text-white rounded-br-md" : "bg-white text-[#374151] rounded-bl-md border border-[#E5E7EB]"
              }`} style={msg.role === "user" ? {boxShadow: "0 2px 8px rgba(74,150,196,0.12)"} : {boxShadow: "0 1px 4px rgba(0,0,0,0.04)"}}>
                <pre className="selectable whitespace-pre-wrap font-data text-xs leading-relaxed">{msg.content}</pre>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleChat} className="p-2.5 border-t border-[#E5E7EB] flex gap-2 bg-white">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={done ? "Session ended" : "Type message..."} disabled={done} className="flex-1 px-3.5 py-2 bg-[#F3F4F6] border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] disabled:opacity-50 placeholder:text-[#D1D5DB]" />
        <button type="submit" disabled={done || !input.trim()} className="w-9 h-9 flex items-center justify-center bg-[#4A96C4] active:bg-[#3A7CA5] rounded-[10px] disabled:opacity-30 flex-shrink-0" style={{boxShadow: "0 2px 6px rgba(74,150,196,0.15)"}}>
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
        </button>
      </form>
    </div>
  );
}
