import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { wsUrl } from "../hooks/useAuth";

interface Message {
  role: "user" | "agent" | "system";
  content: string;
}

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  function handleDispatch(e: React.FormEvent) {
    e.preventDefault();
    if (!agentId || dispatching) return;
    setDispatching(true);
    setError(null);
    setMessages([]);
    setDone(false);
    setSessionId(null);

    const ws = new WebSocket(wsUrl("/ws/client"));
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "dispatch", agentId, instruction }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "session_created":
          setSessionId(msg.sessionId);
          setDispatching(false);
          break;
        case "output":
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === "agent") {
              return [...prev.slice(0, -1), { role: "agent", content: last.content + msg.content }];
            }
            return [...prev, { role: "agent", content: msg.content }];
          });
          break;
        case "done":
          setDone(true);
          setMessages(prev => [...prev, { role: "system", content: "Completed" }]);
          break;
        case "error":
          if (msg.sessionId) {
            setDone(true);
            setMessages(prev => [...prev, { role: "system", content: `Error: ${msg.error}` }]);
          } else {
            setError(msg.message);
            setDispatching(false);
          }
          break;
      }
    };

    ws.onerror = () => {
      setError("WebSocket connection failed");
      setDispatching(false);
    };
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
      <div className="p-4 space-y-5 pb-20">
        <h1 className="text-lg font-bold tracking-tight">Dispatch</h1>
        <form onSubmit={handleDispatch} className="space-y-3">
          <input
            placeholder="agentName@machineId"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            required
            className="w-full px-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-sm placeholder:text-slate-600"
          />
          <textarea
            placeholder="Instruction..."
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={4}
            className="w-full px-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-sm resize-none placeholder:text-slate-600"
          />
          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}
          <button
            type="submit"
            disabled={!agentId}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-semibold disabled:opacity-50 shadow-lg shadow-blue-600/20"
          >
            Send
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-app">
      <div className="px-4 py-2.5 border-b border-slate-700/50 flex items-center gap-2.5 bg-slate-900/50">
        <span className={`w-2 h-2 rounded-full ${done ? "bg-slate-500" : "bg-green-400 animate-pulse"}`} />
        <span className="text-sm font-medium text-slate-300">{agentId}</span>
        <span className="text-xs text-slate-600 font-mono">{sessionId ?? "connecting..."}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "system" ? (
              <div className="w-full text-center py-1">
                <span className="text-[10px] text-yellow-500/70 bg-yellow-500/5 px-2.5 py-1 rounded-full">{msg.content}</span>
              </div>
            ) : (
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-br-md"
                  : "bg-slate-800/80 text-slate-200 rounded-bl-md border border-slate-700/30"
              }`}>
                <pre className="selectable whitespace-pre-wrap font-mono text-xs leading-relaxed">{msg.content}</pre>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleChat} className="p-2.5 border-t border-slate-700/50 flex gap-2 bg-slate-900/50">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={done ? "Session ended" : "Type message..."}
          disabled={done}
          className="flex-1 px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm disabled:opacity-50 placeholder:text-slate-600"
        />
        <button
          type="submit"
          disabled={done || !input.trim()}
          className="w-9 h-9 flex items-center justify-center bg-blue-600 active:bg-blue-500 rounded-xl disabled:opacity-30 flex-shrink-0"
        >
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
