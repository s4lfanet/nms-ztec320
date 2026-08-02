/**
 * useWebSocket — React hook for real-time WebSocket connections.
 *
 * Usage:
 *   const { lastMessage, isConnected } = useWebSocket('/ws/sync/1');
 *   const { lastMessage, isConnected } = useWebSocket('/ws/dashboard');
 *
 * Features:
 * - Auto-reconnect with exponential backoff
 * - Ping/pong keep-alive (30s interval)
 * - Connection status tracking
 * - Cleanup on unmount
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export interface WSMessage {
  event: string;
  data: Record<string, unknown>;
  ts: number;
}

interface UseWebSocketOptions {
  /** Base WebSocket URL (default: auto-detect from window.location) */
  baseUrl?: string;
  /** Auto-reconnect on disconnect (default: true) */
  reconnect?: boolean;
  /** Max reconnect attempts (default: 10) */
  maxRetries?: number;
  /** Ping interval in ms (default: 30000) */
  pingInterval?: number;
}

interface UseWebSocketReturn {
  lastMessage: WSMessage | null;
  isConnected: boolean;
  isReconnecting: boolean;
  send: (data: string) => void;
  disconnect: () => void;
}

const DEFAULT_OPTIONS: Required<UseWebSocketOptions> = {
  baseUrl: '',
  reconnect: true,
  maxRetries: 10,
  pingInterval: 30_000,
};

export function useWebSocket(
  path: string,
  options: UseWebSocketOptions = {},
): UseWebSocketReturn {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const getWsUrl = useCallback(() => {
    if (opts.baseUrl) {
      return `${opts.baseUrl}${path}`;
    }
    // Auto-detect: same host as page.
    // In production (served via nginx on 80/443, or Cloudflare Tunnel which only
    // forwards port 80/443), route through nginx's /ws/ proxy without an explicit
    // port. In dev (Vite on 3000), connect directly to the WS server on 8765.
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const pagePort = window.location.port;
    const isProdPort = pagePort === '' || pagePort === '80' || pagePort === '443';
    if (isProdPort) {
      return `${proto}//${host}${path}`;
    }
    const wsPort = (window as unknown as { __WS_PORT__?: string }).__WS_PORT__ || '8765';
    return `${proto}//${host}:${wsPort}${path}`;
  }, [path, opts.baseUrl]);

  const cleanup = useCallback(() => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent reconnect on manual disconnect
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    cleanup();

    const url = getWsUrl();
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      setIsReconnecting(false);
      retryCountRef.current = 0;

      // Start ping keep-alive
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, opts.pingInterval);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        if (msg.event !== 'pong') {
          setLastMessage(msg);
        }
      } catch {
        // Non-JSON message, ignore
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      if (pingTimerRef.current) {
        clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }

      // Auto-reconnect with exponential backoff
      if (opts.reconnect && retryCountRef.current < opts.maxRetries) {
        setIsReconnecting(true);
        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30_000);
        retryCountRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connect();
          }
        }, delay);
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror, reconnect logic is there
    };
  }, [getWsUrl, cleanup, opts.reconnect, opts.maxRetries, opts.pingInterval]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [connect, cleanup]);

  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  const disconnect = useCallback(() => {
    mountedRef.current = false;
    cleanup();
    setIsConnected(false);
    setIsReconnecting(false);
  }, [cleanup]);

  return { lastMessage, isConnected, isReconnecting, send, disconnect };
}
