import { useParams, useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { useRef, useEffect, useState, useCallback } from "react";
import { wsUrl, apiUrl, apiHeaders, getAuth } from "../hooks/useAuth";
import { useVoice } from "../hooks/useVoice";

interface Message { role: string; content: string; timestamp: string; attachment?: { name: string; type: string }; }
interface Command { name: string; type: "skill" | "builtin" | "plugin"; source?: string; }

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
  const [attachments, setAttachments] = useState<Array<{ name: string; path: string; type: string }>>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const allMessages = [...(data?.messages ?? []), ...liveMessages];
  const filteredCommands = commands?.filter(c => !cmdFilter || c.name.toLowerCase().includes(cmdFilter.toLowerCase())) ?? [];

  const voice = useVoice(useCallback((text: string) => {
    setInput(prev => prev ? prev + " " + text : text);
  }, []));

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [allMessages.length]);
  useEffect(() => { return () => { wsRef.current?.close(); }; }, []);
  useEffect(() => {
    if (input === "/") { setShowCommands(true); setCmdFilter(""); }
    else if (input.startsWith("/")) { setCmdFilter(input); }
    else { setShowCommands(false); }
  }, [input]);

  const ensureWatching = useCallback(() => {
    if (wsRef.current || !workspaceId || !sessionId) return;
    const ws = new WebSocket(wsUrl("/ws/client"));
    wsRef.current = ws;
    ws.onopen = () => { ws.send(JSON.stringify({ type: "watch_workspace", workspaceId, sessionId })); setWatching(true); };
    ws.onmessage = (event) => { const msg = JSON.parse(event.data); if (msg.type === "workspace_message" && msg.sessionId === sessionId) { setLiveMessages(prev => [...prev, { role: msg.role, content: msg.content, timestamp: msg.timestamp }]); setSending(false); } };
    ws.onclose = () => { wsRef.current = null; setWatching(false); };
  }, [workspaceId, sessionId]);

  async function uploadFile(file: File) {
    const auth = getAuth();
    if (!auth) return;
    const form = new FormData();
    form.append("file", file);
    form.append("workspaceId", workspaceId || "");
    const res = await fetch(apiUrl("/api/workspaces/upload"), {
      method: "POST",
      headers: { Authorization: `Bearer ${auth.token}` },
      body: form,
    });
    if (res.ok) {
      const data = await res.json() as { path: string; name: string; type: string };
      setAttachments(prev => [...prev, data]);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      await uploadFile(file);
    }
    e.target.value = "";
  }

  const isCursor = workspaceId?.startsWith("cursor") ?? false;

  async function sendMessage(message: string) {
    if ((!message.trim() && attachments.length === 0) || !workspaceId || !sessionId || sending) return;
    let fullMessage = message;
    if (attachments.length > 0) {
      const refs = attachments.map(a =>
        a.type.startsWith("image/")
          ? `[Image: ${a.path}]`
          : `Read the file at ${a.path}`
      ).join("\n");
      fullMessage = refs + (message ? "\n" + message : "");
    }
    setInput(""); setAttachments([]); setSending(true); setShowCommands(false); ensureWatching();
    try {
      const res = await fetch(apiUrl("/api/workspaces/chat"), { method: "POST", headers: apiHeaders(), body: JSON.stringify({ workspaceId, sessionId, message: fullMessage }) });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setLiveMessages(prev => [...prev, { role: "system" as string, content: err.error || "Failed to send", timestamp: new Date().toISOString() }]);
        setSending(false);
      }
    } catch { setSending(false); }
  }

  if (loading) return <div className="p-6 text-[#9CA3AF] text-sm">Loading...</div>;

  return (
    <div className="flex flex-col h-app">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-[#E5E7EB] flex items-center justify-between bg-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <button onClick={() => navigate(-1)} className="text-[#9CA3AF] active:text-[#6B7280] flex-shrink-0">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {isCursor && <span className="font-data text-[9px] px-1 py-0.5 rounded bg-[#4A96C4]/10 text-[#4A96C4] font-semibold">Cur</span>}
              <span className="font-data text-[13px] text-[#374151] font-medium truncate">{sessionId?.slice(0, 12)}...</span>
            </div>
            <span className="font-caption text-[11px] text-[#9CA3AF]">{allMessages.length} messages</span>
          </div>
        </div>
        {!watching ? (
          <button onClick={ensureWatching} className="font-data text-[11px] px-2.5 py-1 bg-[#3B9B6A]/10 text-[#3B9B6A] border border-[#3B9B6A]/20 rounded-lg font-medium">Live Sync</button>
        ) : (
          <span className="font-data text-[11px] px-2.5 py-1 text-[#3B9B6A] flex items-center gap-1.5 bg-[#3B9B6A]/8 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3B9B6A] animate-pulse" /> Live
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-[#F3F4F6]">
        {allMessages.map((msg, i) => {
          const isUser = msg.role === "user";
          const isLive = i >= (data?.messages.length ?? 0);
          return (
            <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                isUser ? "bg-[#4A96C4] text-white rounded-br-md" : "bg-white text-[#374151] rounded-bl-md border border-[#E5E7EB]"
              } ${isLive ? "ring-1 ring-[#3B9B6A]/30" : ""}`}
              style={isUser ? {boxShadow: "0 2px 8px rgba(74,150,196,0.12)"} : {boxShadow: "0 1px 4px rgba(0,0,0,0.04)"}}>
                {msg.timestamp && (
                  <p className={`font-caption text-[10px] mb-1 ${isUser ? "text-white/50" : "text-[#D1D5DB]"}`}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                    {isLive && <span className="ml-1 text-[#3B9B6A] not-italic">LIVE</span>}
                  </p>
                )}
                <pre className="selectable whitespace-pre-wrap font-data text-xs leading-relaxed">{msg.content}</pre>
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 border border-[#E5E7EB]">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#D1D5DB] animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-[#D1D5DB] animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-[#D1D5DB] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Command palette */}
      {showCommands && (
        <div className="max-h-48 overflow-y-auto border-t border-[#E5E7EB] bg-white">
          {filteredCommands.map((cmd) => (
            <button key={cmd.name} onClick={() => { setInput(cmd.name + " "); setShowCommands(false); }} className="w-full text-left px-4 py-2 active:bg-gray-50 flex items-center gap-2 border-b border-[#F0F1F3] last:border-0">
              <span className={`font-data text-[10px] px-1.5 py-0.5 rounded font-medium ${
                cmd.type === "builtin" ? "bg-[#F3F4F6] text-[#6B7280]" : cmd.type === "plugin" ? "bg-[#4A96C4]/8 text-[#4A96C4]" : "bg-purple-50 text-purple-600"
              }`}>{cmd.type}</span>
              <span className="text-sm text-[#374151]">{cmd.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="px-3 py-1.5 border-t border-[#E5E7EB] bg-[#F9FAFB] flex gap-2 overflow-x-auto">
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-white border border-[#E5E7EB] rounded-lg px-2 py-1 flex-shrink-0">
              <span className="text-[10px]">{a.type.startsWith("image/") ? "\ud83d\uddbc\ufe0f" : "\ud83d\udcce"}</span>
              <span className="font-data text-[10px] text-[#374151] max-w-[100px] truncate">{a.name}</span>
              <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="text-[#9CA3AF] text-xs leading-none">&times;</button>
            </div>
          ))}
        </div>
      )}

      {/* Input bar */}
      <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="p-2 border-t border-[#E5E7EB] flex gap-1.5 bg-white items-center">
        <input type="file" ref={fileRef} onChange={handleFileSelect} multiple accept="image/*,.txt,.ts,.tsx,.js,.jsx,.json,.md,.py,.css,.html" className="hidden" />

        {/* / command */}
        <button type="button" onClick={() => setShowCommands(!showCommands)} className="w-8 h-8 flex items-center justify-center bg-[#F3F4F6] active:bg-[#E5E7EB] rounded-lg font-data text-sm text-[#9CA3AF] flex-shrink-0 border border-[#E5E7EB]">/</button>

        {/* Attachment */}
        <button type="button" onClick={() => fileRef.current?.click()} className="w-8 h-8 flex items-center justify-center bg-[#F3F4F6] active:bg-[#E5E7EB] rounded-lg flex-shrink-0 border border-[#E5E7EB]">
          <svg className="w-4 h-4 text-[#9CA3AF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>

        {/* Voice */}
        {voice.supported && (
          <button type="button" onClick={voice.toggle} className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 border ${voice.listening ? "bg-red-50 border-red-300" : "bg-[#F3F4F6] border-[#E5E7EB] active:bg-[#E5E7EB]"}`}>
            <svg className={`w-4 h-4 ${voice.listening ? "text-red-500" : "text-[#9CA3AF]"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}

        {/* Text input */}
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={voice.listening ? "Listening..." : "Message..."} disabled={sending} className="flex-1 min-w-0 px-3 py-1.5 bg-[#F3F4F6] border border-[#E5E7EB] rounded-lg text-sm text-[#111827] disabled:opacity-50 placeholder:text-[#D1D5DB]" />

        {/* Send */}
        <button type="submit" disabled={sending || (!input.trim() && attachments.length === 0)} className="w-8 h-8 flex items-center justify-center bg-[#4A96C4] active:bg-[#3A7CA5] rounded-lg disabled:opacity-30 flex-shrink-0" style={{boxShadow: "0 2px 6px rgba(74,150,196,0.15)"}}>
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
        </button>
      </form>
    </div>
  );
}
