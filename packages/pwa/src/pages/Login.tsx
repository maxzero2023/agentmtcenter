import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const { login } = useAuth();
  const defaultServer = typeof window !== "undefined" ? window.location.origin : "";
  const [server, setServer] = useState(defaultServer);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 从 URL hash 读取 token 自动登录：#token=xxx
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
    <div className="h-full flex items-center justify-center p-6 pt-safe pb-safe">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.5} className="w-8 h-8">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight">TM Dispatch</h1>
          <p className="text-xs text-slate-500">Agent Dispatch Center</p>
        </div>

        <div className="space-y-3">
          <input
            type="url"
            placeholder="Server URL"
            value={server}
            onChange={(e) => setServer(e.target.value)}
            required
            className="w-full px-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-sm placeholder:text-slate-600"
          />
          <input
            type="password"
            placeholder="Secret Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            className="w-full px-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-sm placeholder:text-slate-600"
          />
        </div>

        {error && (
          <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p className="text-red-400 text-xs">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-semibold disabled:opacity-50 shadow-lg shadow-blue-600/20"
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
