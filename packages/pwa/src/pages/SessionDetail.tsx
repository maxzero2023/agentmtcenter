import { useParams, useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { useRef, useEffect, useState, useCallback } from "react";
import { wsUrl, apiUrl, apiHeaders } from "../hooks/useAuth";

interface Message {
  role: string;
  content: string;
  timestamp: string;
}

interface Command {
  name: string;
  type: "skill" | "builtin" | "plugin";
  source?: string;
}

export default function SessionDetail() {
  const { workspaceId, sessionId } = useParams<{ workspaceId: string; sessionId: string }>();
  const navigate = useNavigate();
  const { data, loading } = useApi<{ messages: Message[] }>(`/api/workspaces/${workspaceId}/sessions/${sessionId}`);
  const { data: commands } = useApi<Command[]>("/api/workspaces/commands");
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  const [watching, setWatching] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [cmdFilter, setCmdFilter] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const allMessages = [...(data?.messages ?? []), ...liveMessages];

  const filteredCommands = commands?.filter(c =>
    !cmdFilter || c.name.toLowerCase().includes(cmdFilter.toLowerCase())
  ) ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length]);

  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  useEffect(() => {
    if (input === "/") {
      setShowCommands(true);
      setCmdFilter("");
    } else if (input.startsWith("/")) {
      setCmdFilter(input);
    } else {
      setShowCommands(false);
    }
  }, [input]);

  const ensureWatching = useCallback(() => {
    if (wsRef.current || !workspaceId || !sessionId) return;
    const ws = new WebSocket(wsUrl("/ws/client"));
    wsRef.current = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "watch_workspace", workspaceId, sessionId }));
      setWatching(true);
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "workspace_message" && msg.sessionId === sessionId) {
        setLiveMessages(prev => [...prev, {
          role: msg.role, content: msg.content, timestamp: msg.timestamp,
        }]);
        setSending(false);
      }
    };
    ws.onclose = () => { wsRef.current = null; setWatching(false); };
  }, [workspaceId, sessionId]);

  async function sendMessage(message: string) {
    if (!message.trim() || !workspaceId || !sessionId || sending) return;
    setInput("");
    setSending(true);
    setShowCommands(false);
    ensureWatching();
    try {
      await fetch(apiUrl("/api/workspaces/chat"), {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ workspaceId, sessionId, message }),
      });
    } catch { setSending(false); }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function selectCommand(cmd: string) {
    setInput(cmd + " ");
    setShowCommands(false);
  }

  if (loading) return <div className="p-4 text-slate-400 text-sm">Loading...</div>;

  return (
    <div className="flex flex-col h-app">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-slate-700/50 flex items-center justify-between bg-slate-900/50">
        <div className="flex items-center gap-2.5 min-w-0">
          <button onClick={() => navigate(-1)} className="text-slate-500 active:text-white flex-shrink-0">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="min-w-0">
            <span className="text-xs text-slate-400 font-mono block truncate">{sessionId?.slice(0, 12)}...</span>
            <span className="text-[10px] text-slate-600">{allMessages.length} messages</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!watching ? (
            <button onClick={ensureWatching} className="text-xs px-2.5 py-1 bg-green-600/20 text-green-400 border border-green-500/30 rounded-lg font-medium">
              Live Sync
            </button>
          ) : (
            <span className="text-xs px-2.5 py-1 text-green-400 flex items-center gap-1.5 bg-green-500/10 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Live
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {allMessages.map((msg, i) => {
          const isUser = msg.role === "user";
          const isLive = i >= (data?.messages.length ?? 0);
          return (
            <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                isUser
                  ? "bg-blue-600 text-white rounded-br-md"
                  : "bg-slate-800/80 text-slate-200 rounded-bl-md border border-slate-700/30"
              } ${isLive ? "ring-1 ring-green-500/30" : ""}`}>
                {msg.timestamp && (
                  <p className={`text-[10px] mb-1 ${isUser ? "text-blue-200/60" : "text-slate-500"}`}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                    {isLive && <span className="ml-1 text-green-400">LIVE</span>}
                  </p>
                )}
                <pre className="selectable whitespace-pre-wrap font-mono text-xs leading-relaxed">{msg.content}</pre>
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-slate-800/60 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Command palette */}
      {showCommands && (
        <div className="max-h-48 overflow-y-auto border-t border-slate-700/50 bg-slate-900/95">
          {filteredCommands.map((cmd) => (
            <button
              key={cmd.name}
              onClick={() => selectCommand(cmd.name)}
              className="w-full text-left px-3.5 py-2 active:bg-slate-700 flex items-center gap-2 border-b border-slate-700/20 last:border-0"
            >
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                cmd.type === "builtin" ? "bg-slate-700/50 text-slate-400" :
                cmd.type === "plugin" ? "bg-cyan-500/10 text-cyan-400" :
                "bg-purple-500/10 text-purple-400"
              }`}>
                {cmd.type}
              </span>
              <span className="text-sm text-slate-300">{cmd.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-2.5 border-t border-slate-700/50 flex gap-2 bg-slate-900/50">
        <button
          type="button"
          onClick={() => setShowCommands(!showCommands)}
          className="w-9 h-9 flex items-center justify-center bg-slate-800 active:bg-slate-700 rounded-xl text-sm text-slate-400 font-mono flex-shrink-0"
        >
          /
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message or /command..."
          disabled={sending}
          className="flex-1 px-3.5 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm disabled:opacity-50 placeholder:text-slate-600"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
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
