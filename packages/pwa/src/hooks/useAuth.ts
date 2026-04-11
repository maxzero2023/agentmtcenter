import { useSyncExternalStore } from "react";

const STORAGE_KEY = "tm-auth";

interface AuthState {
  server: string;
  token: string;
}

// 共享状态 — 所有 useAuth 实例同步
let _auth: AuthState | null = (() => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? JSON.parse(saved) : null;
})();
const _listeners = new Set<() => void>();
function _notify() { _listeners.forEach(fn => fn()); }
function _subscribe(fn: () => void) { _listeners.add(fn); return () => _listeners.delete(fn); }
function _getSnapshot() { return _auth; }

export function useAuth() {
  const auth = useSyncExternalStore(_subscribe, _getSnapshot);

  async function login(server: string, secretToken: string): Promise<string | null> {
    try {
      const res = await fetch(`${server}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: secretToken }),
      });
      if (!res.ok) {
        const err = await res.json();
        return (err as { error: string }).error;
      }
      const { jwt } = (await res.json()) as { jwt: string };
      const state: AuthState = { server, token: jwt };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      _auth = state;
      _notify();
      return null;
    } catch {
      return "无法连接服务器";
    }
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    _auth = null;
    _notify();
  }

  return { auth, login, logout, isAuthenticated: !!auth };
}

export function getAuth(): AuthState | null {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved ? JSON.parse(saved) : null;
}

// API 用相对路径（同源），不依赖保存的 server URL
export function apiUrl(path: string): string {
  return path;
}

export function apiHeaders(): Record<string, string> {
  const auth = getAuth();
  if (!auth) return { "Content-Type": "application/json" };
  return {
    Authorization: `Bearer ${auth.token}`,
    "Content-Type": "application/json",
  };
}

export function wsUrl(path: string): string {
  const auth = getAuth();
  if (!auth) throw new Error("Not authenticated");
  const origin = typeof window !== "undefined" ? window.location.origin : auth.server;
  return origin.replace(/^http/, "ws") + path + `?token=${auth.token}`;
}
