import { useEffect, useRef, useState, useCallback } from "react";
import { WS_BASE } from "./api";

export type WebSocketEvent = {
  event: string;
  workflow_id?: number;
  task_id?: number;
  step_id?: number;
  step_type?: string;
  agent_name?: string;
  [key: string]: any;
};

type WebSocketMessage = {
  type: "snapshot" | "event";
  running_tasks?: Array<{
    id: number;
    type: "task" | "workflow";
    agent_name: string;
    title: string;
    status: string;
  }>;
  active_agents?: string[];
  payload?: WebSocketEvent;
};

type UseWebSocketReturn = {
  isConnected: boolean;
  runningTasks: WebSocketMessage["running_tasks"];
  activeAgents: WebSocketMessage["active_agents"];
  lastEvent: WebSocketEvent | null;
  refresh: () => void;
};

export function useActivityWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [runningTasks, setRunningTasks] = useState<WebSocketMessage["running_tasks"]>([]);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = `${WS_BASE}/ws/activity/`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      console.log("[WS] Connected to activity stream");
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log("[WS] Disconnected, reconnecting in 3s...");
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = (err) => {
      console.error("[WS] Error", err);
      setIsConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        if (data.running_tasks) setRunningTasks(data.running_tasks);
        if (data.active_agents) setActiveAgents(data.active_agents);
        if (data.type === "event" && data.payload) {
          setLastEvent(data.payload);
        }
      } catch {
        console.error("[WS] Failed to parse message");
      }
    };

    wsRef.current = ws;
  }, []);

  const refresh = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "refresh" }));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return { isConnected, runningTasks, activeAgents, lastEvent, refresh };
}