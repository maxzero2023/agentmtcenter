import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const { login } = useAuth();
  const defaultServer = typeof window !== "undefined" ? window.location.origin : "";
  const [server, setServer] = useState(defaultServer);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/token=([^&]+)/);
    if (match) {
      const hashToken = decodeURIComponent(match[1]!);
      window.location.hash = "";
      setToken(hashToken);
      setLoading(true);
      login(defaultServer, hashToken).then(err => {
        if (err) { setError(err); setLoading(false); }
      });
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const err = await login(server.replace(/\/$/, ""), token);
      if (err) { setError(err); }
    } catch (ex) {
      setError(String(ex));
    }
    setLoading(false);
  }

  return (
    <div className="h-full flex items-center justify-center p-8 pt-safe pb-safe">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-7">
        <div className="text-center space-y-3">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-b from-[#4A96C4] to-[#3A7CA5] flex items-center justify-center" style={{boxShadow: "0 8px 28px rgba(74,150,196,0.12)"}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} className="w-9 h-9">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="font-heading text-2xl font-bold text-[#111827]">TM Dispatch</h1>
          <p className="font-caption text-sm text-[#9CA3AF]">Agent Dispatch Center</p>
        </div>

        <div className="space-y-3.5">
          <input
            type="url"
            placeholder="Server URL"
            value={server}
            onChange={(e) => setServer(e.target.value)}
            required
            className="w-full px-4 py-3 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] placeholder:text-[#D1D5DB]"
            style={{boxShadow: "0 1px 4px rgba(0,0,0,0.04)"}}
          />
          <input
            type="password"
            placeholder="Secret Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            className="w-full px-4 py-3 bg-white border border-[#E5E7EB] rounded-[10px] text-sm text-[#111827] placeholder:text-[#D1D5DB]"
            style={{boxShadow: "0 1px 4px rgba(0,0,0,0.04)"}}
          />
        </div>

        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-[10px]">
            <p className="text-red-600 text-xs">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="font-heading w-full py-3 bg-[#4A96C4] hover:bg-[#3A7CA5] rounded-[10px] text-sm font-semibold text-white disabled:opacity-50"
          style={{boxShadow: "0 4px 16px rgba(74,150,196,0.15)"}}
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Connecting...
            </span>
          ) : "Connect"}
        </button>
      </form>
    </div>
  );
}
