import { useState, useEffect, useRef, useCallback } from "react";
import { wsUrl } from "./useAuth";

type WsMessage = {
  type: string;
  [key: string]: unknown;
};

export function useClientWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef<Map<string, Set<(msg: WsMessage) => void>>>(new Map());

  useEffect(() => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl("/ws/client"));
    } catch {
      return;
    }

    ws.onopen = () => {
      wsRef.current = ws;
      setConnected(true);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data) as WsMessage;
      const handlers = listenersRef.current.get(msg.type);
      if (handlers) {
        for (const handler of handlers) handler(msg);
      }
      // also fire "*" listeners
      const all = listenersRef.current.get("*");
      if (all) {
        for (const handler of all) handler(msg);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  const send = useCallback((msg: object) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  const on = useCallback((type: string, handler: (msg: WsMessage) => void) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(handler);
    return () => {
      listenersRef.current.get(type)?.delete(handler);
    };
  }, []);

  return { connected, send, on };
}
