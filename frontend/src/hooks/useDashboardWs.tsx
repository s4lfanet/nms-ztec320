/**
 * Shared /ws/dashboard connection.
 *
 * Topbar, Dashboard, AllOnus, and FtthInfrastructure each used to call
 * useWebSocket('/ws/dashboard') independently — 4 separate WebSocket
 * connections (4 token fetches, 4 ping timers) to the exact same endpoint
 * for the exact same purpose (react-query cache invalidation on
 * alert/onu_change events). Topbar lives in the persistent AppShell layout
 * and never unmounts, but the page-level hook instances mount/unmount on
 * every navigation between those pages — tearing down and recreating a
 * WebSocket connection on every click between Dashboard/AllOnus/FTTH.
 *
 * One shared connection at the AppShell level, provided via context,
 * removes both the redundant connections and that mount/unmount churn.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useWebSocket, type WSMessage } from './useWebSocket';

const DashboardWsContext = createContext<WSMessage | null>(null);

export function DashboardWsProvider({ children }: { children: ReactNode }) {
  const { lastMessage } = useWebSocket('/ws/dashboard', { reconnect: true });
  return <DashboardWsContext.Provider value={lastMessage}>{children}</DashboardWsContext.Provider>;
}

/** Latest message from the shared /ws/dashboard connection, or null before the first one arrives. */
export function useDashboardWs(): WSMessage | null {
  return useContext(DashboardWsContext);
}
