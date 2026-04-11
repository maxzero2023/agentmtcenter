import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useClientWebSocket } from "../hooks/useWebSocket";

interface Message {
  role: "user" | "agent" | "system";
  content: string;
}

export default function Chat() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { connected, send, on } = useClientWebSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [done, setDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!connected || !sessionId) return;

    send({ type: "subscribe", sessionId });

    const unsub1 = on("output", (msg) => {
      if (msg.sessionId !== sessionId) return;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "agent") {
          return [...prev.slice(0, -1), { role: "agent", content: last.content + (msg.content as string) }];
        }
        return [...prev, { role: "agent", content: msg.content as string }];
      });
    });

    const unsub2 = on("done", (msg) => {
      if (msg.sessionId !== sessionId) return;
      setDone(true);
      setMessages(prev => [...prev, { role: "system", content: "Agent completed" }]);
    });

    const unsub3 = on("error", (msg) => {
      if (msg.sessionId && msg.sessionId !== sessionId) return;
      setDone(true);
      setMessages(prev => [...prev, { role: "system", content: `Error: ${msg.error ?? msg.message}` }]);
    });

    return () => { unsub1(); unsub2(); unsub3(); };
  }, [connected, sessionId, send, on]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !sessionId || done) return;
    send({ type: "chat", sessionId, content: input });
    setMessages(prev => [...prev, { role: "user", content: input }]);
    setInput("");
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="px-4 py-2 border-b border-slate-700 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${done ? "bg-slate-400" : "bg-green-400 animate-pulse"}`} />
        <span className="text-sm text-slate-300 font-mono">{sessionId}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((msg, i) => (
          <div key={i} className={`${
            msg.role === "user" ? "text-blue-300" :
            msg.role === "system" ? "text-yellow-300 text-xs" :
            "text-slate-200"
          }`}>
            {msg.role === "user" && <span className="text-blue-500 text-xs mr-1">&gt;</span>}
            <pre className="whitespace-pre-wrap font-mono text-sm inline">{msg.content}</pre>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="p-3 border-t border-slate-700 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={done ? "Session ended" : "Type message..."}
          disabled={done}
          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={done || !input.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
