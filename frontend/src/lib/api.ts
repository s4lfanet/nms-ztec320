const BASE = '';

// Global CSRF protection: inject X-Requested-With header on all state-changing requests
const _origFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const method = (init?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const headers = new Headers(init?.headers);
    if (!headers.has('X-Requested-With')) {
      headers.set('X-Requested-With', 'XMLHttpRequest');
    }
    init = { ...init, headers };
  }
  return _origFetch(input, init);
};

export class ApiError extends Error {
  errorCode?: string;
  status?: number;
  /** Raw response body — carries extra fields like retry_after. */
  data?: Record<string, unknown>;
  constructor(message: string, errorCode?: string, status?: number, data?: Record<string, unknown>) {
    super(message);
    this.errorCode = errorCode;
    this.status = status;
    this.data = data;
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...options.headers as Record<string, string> },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.message || `HTTP ${res.status}`, data.error_code, res.status, data);
  return data as T;
}

export interface IncidentSummary {
  id: number; title: string; status: string; cause: string; category: string;
  node_type: string; node_id: number; node_name: string; olt_id: number | null; olt_name: string;
  affected_count: number; peak_affected: number; assigned: string[];
  acknowledged_by: string; resolved_by: string;
  opened_at: string | null; acknowledged_at: string | null; en_route_at: string | null;
  on_site_at: string | null; resolved_at: string | null; recovered_at: string | null;
  resolution_note: string; merged_into_id: number | null; escalation_level: number;
  lat: number | null; lng: number | null;
}
export interface IncidentLogEntry { id: number; at: string | null; username: string; action: string; status: string; note: string; photo: string }
export interface IncidentDetail extends IncidentSummary {
  maps_url: string; onus: Array<{ id: number; name: string; serial: string; status: string; customer: string; phone: string }>;
  online_now: number; logs: IncidentLogEntry[]; can_handle: boolean;
}

export interface IncidentReport {
  success: boolean; days: number; ttr_hours: number; total: number; active: number;
  resolved_handled: number; resolved_self: number; mttr_minutes: number | null; mtta_minutes: number | null;
  ttr_breaches: number; causes: { power: number; fiber: number; mixed: number };
  top_nodes: Array<{ node_type: string; node_id: number; node_name: string; count: number; customers: number }>;
  technicians: Array<{ name: string; resolved: number; avg_minutes: number }>;
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<{ success: boolean; user: User }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User }>('/api/auth/me'),
  updateProfile: (data: { full_name?: string; sidebar_name?: string; password?: string; current_password?: string; theme?: 'dark' | 'light' | 'system'; language?: 'id' | 'en' }) =>
    request<{ success: boolean; must_change_password?: boolean }>('/api/profile', { method: 'POST', body: JSON.stringify(data) }),

  // Insiden gangguan (Fase 3)
  incidents: (status: 'active' | 'closed' | 'all' = 'active') =>
    request<{ success: boolean; incidents: IncidentSummary[]; active_count: number; closed_count: number }>(`/api/incidents?status=${status}`),
  incident: (id: number) => request<{ success: boolean; incident: IncidentDetail }>(`/api/incidents/${id}`),
  incidentReport: (days: number) => request<IncidentReport>(`/api/incidents/report?days=${days}`),
  incidentStatus: (id: number, status: string, note = '') =>
    request<{ success: boolean; incident: IncidentSummary }>(`/api/incidents/${id}/status`, { method: 'POST', body: JSON.stringify({ status, note }) }),
  incidentNote: (id: number, note: string) =>
    request<{ success: boolean }>(`/api/incidents/${id}/notes`, { method: 'POST', body: JSON.stringify({ note }) }),
  incidentPhoto: async (id: number, file: File, note = '') => {
    const fd = new FormData(); fd.append('photo', file); fd.append('note', note);
    const res = await fetch(`${BASE}/api/incidents/${id}/photos`, { method: 'POST', body: fd, credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.message || `HTTP ${res.status}`, data.error_code, res.status, data);
    return data as { success: boolean; photo: string };
  },

  oltImageUpload: async (oltId: number, file: File) => {
    const fd = new FormData(); fd.append('image', file);
    const res = await fetch(`${BASE}/api/olt/${oltId}/image`, { method: 'POST', body: fd, credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.message || `HTTP ${res.status}`, data.error_code, res.status, data);
    return data as { success: boolean; image_url: string; message?: string };
  },
  oltImageDelete: (oltId: number) =>
    request<{ success: boolean; message?: string }>(`/api/olt/${oltId}/image`, { method: 'DELETE' }),

  oltModels: () => request<{ success: boolean; models: OltModelPhoto[] }>('/api/olt-models'),
  oltModelImageUpload: async (vendor: string, model: string, file: File) => {
    const fd = new FormData(); fd.append('vendor', vendor); fd.append('model', model); fd.append('image', file);
    const res = await fetch(`${BASE}/api/olt-models/image`, { method: 'POST', body: fd, credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.message || `HTTP ${res.status}`, data.error_code, res.status, data);
    return data as { success: boolean; key: string; image_url: string };
  },
  oltModelImageDelete: (key: string) =>
    request<{ success: boolean }>(`/api/olt-models/${encodeURIComponent(key)}/image`, { method: 'DELETE' }),

  // Dashboard
  dashboardPulse: (hours = 24) => request<DashboardPulse>(`/api/dashboard/pulse?hours=${hours}`),
  dashboard: (opts?: { nocache?: boolean } | unknown) => request<DashboardData>(`/api/dashboard${opts && typeof opts === 'object' && 'nocache' in opts && opts.nocache ? '?nocache=1' : ''}`),

  // All ONUs
  allOnus: (params?: { olt?: string; status?: string; signal?: string; pon?: string; search?: string; page?: number; page_size?: number; sort_by?: string; sort_dir?: 'asc' | 'desc' }) => {
    const q = new URLSearchParams();
    if (params?.olt && params.olt !== 'all') q.set('olt', params.olt);
    if (params?.status && params.status !== 'all') q.set('status', params.status);
    if (params?.signal && params.signal !== 'all') q.set('signal', params.signal);
    if (params?.pon && params.pon !== 'all') q.set('pon', params.pon);
    if (params?.search) q.set('search', params.search);
    if (params?.page) q.set('page', String(params.page));
    if (params?.page_size) q.set('page_size', String(params.page_size));
    if (params?.sort_by) q.set('sort_by', params.sort_by);
    if (params?.sort_dir) q.set('sort_dir', params.sort_dir);
    const qs = q.toString();
    return request<AllOnusData>(`/api/all-onus${qs ? '?' + qs : ''}`);
  },

  // ONU actions
  updateOnu: (id: number, data: Record<string, unknown>) =>
    request<{ success: boolean }>(`/api/onu/${id}/update`, { method: 'POST', body: JSON.stringify(data) }),
  deleteOnu: (id: number) =>
    request<{ success: boolean; message?: string }>(`/api/onu/${id}/delete`, { method: 'POST' }),
  onuAction: (id: number, action: string) =>
    request<{ success: boolean; message?: string }>(`/api/onu/${id}/action`, { method: 'POST', body: JSON.stringify({ action }) }),
  onuReplace: (id: number, newSerial: string) =>
    request<{ success: boolean; message?: string }>(`/api/onu/${id}/replace`, { method: 'POST', body: JSON.stringify({ new_serial: newSerial }) }),
  onuDetail: (id: number) => request<OnuDetailData>(`/api/onu/${id}/detail`),
  onuLiveDetail: (id: number) => request<{ success: boolean; live_detail: Record<string, unknown> | null; live_detail_error: string | null; history: Array<{ date: string; event: string }>; wan_services_json: string }>(`/api/onu/${id}/live-detail`),
  onuRxHistory: (id: number, range: '24h' | '7d' | '30d' | '90d') => request<{ success: boolean; range: string; points: RxHistoryPoint[] }>(`/api/onu/${id}/rx-history?range=${range}`),
  genieacsGetSettings: () => request<{ nbi_url: string; nbi_user: string; has_password: boolean }>('/api/genieacs/settings'),
  genieacsSaveSettings: (data: { nbi_url: string; nbi_user: string; nbi_password?: string }) => request<{ success: boolean }>('/api/genieacs/settings', { method: 'POST', body: JSON.stringify(data) }),
  genieacsTest: () => request<{ success: boolean; device_count: number; error: string }>('/api/genieacs/test', { method: 'POST' }),
  genieacsFaults: () => request<{ success: boolean; faults: AcsFault[] }>('/api/genieacs/faults'),
  genieacsDeleteFault: (id: string) => request<{ success: boolean; message: string }>(`/api/genieacs/faults/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  genieacsStale: () => request<{ success: boolean; hours: number; devices: { onu_id: number; name: string; device_id: string; last_inform: string }[] }>('/api/genieacs/stale'),
  acsBulkOptions: () => request<{ success: boolean; olts: { id: number; name: string }[]; models: string[]; nodes: { type: string; id: number; name: string }[]; files: { name: string; type: string; oui: string; product_class: string; version: string }[]; max: number }>('/api/genieacs/bulk/options'),
  acsBulkPreview: (filters: AcsBulkFilters) => request<{ success: boolean; count: number; stale: number; too_many: boolean; max: number; items: { onu_id: number; name: string; olt: string; model: string; last_inform: string | null; stale: boolean }[] }>('/api/genieacs/bulk/preview', { method: 'POST', body: JSON.stringify({ filters }) }),
  acsBulkRun: (data: { filters: AcsBulkFilters; action: string; params: Record<string, unknown>; confirm_count: number }) => request<{ success: boolean; message?: string; job: AcsBulkJob }>('/api/genieacs/bulk/run', { method: 'POST', body: JSON.stringify(data) }),
  acsBulkJobs: () => request<{ success: boolean; jobs: AcsBulkJob[] }>('/api/genieacs/bulk/jobs'),
  acsBulkJob: (id: number) => request<{ success: boolean; job: AcsBulkJob }>(`/api/genieacs/bulk/jobs/${id}`),
  acsBulkCancel: (id: number) => request<{ success: boolean }>(`/api/genieacs/bulk/jobs/${id}/cancel`, { method: 'POST' }),
  vpsRoutes: () => request<{ success: boolean; helper: 'ok' | 'missing' | 'no_sudo'; setup_cmd: string; routes: VpsRoute[]; suggestions: { cidr: string; gateway: string; mikrotik_id: number | null; router: string | null; clients: number; covered: boolean }[] }>('/api/vps-routes'),
  vpsRouteAdd: (data: { cidr: string; gateway: string; note?: string; mikrotik_id?: number | null }) => request<{ success: boolean; message?: string; route: VpsRoute }>('/api/vps-routes', { method: 'POST', body: JSON.stringify(data) }),
  vpsRouteDelete: (id: number) => request<{ success: boolean; message?: string }>(`/api/vps-routes/${id}`, { method: 'DELETE' }),
  vpsRouteApply: (id: number) => request<{ success: boolean; message: string }>(`/api/vps-routes/${id}/apply`, { method: 'POST' }),
  vpsRouteTest: (ip: string) => request<{ success: boolean; message?: string; reachable: boolean; ping: { sent: number; received: number; loss_pct: number; avg_rtt_ms: number | null } }>('/api/vps-routes/test', { method: 'POST', body: JSON.stringify({ ip }) }),
  genieacsSync: () => request<{ success: boolean; matched: number; total: number; errors: string[] }>('/api/genieacs/sync', { method: 'POST' }),
  onuTr069: (id: number) => request<{ success: boolean; connected: boolean; match_method?: string; pinned?: boolean; last_synced?: string; params: Tr069Params | null; faults?: AcsFault[] }>(`/api/onu/${id}/tr069`),
  aiSettings: () => request<{ success: boolean; config: Record<string, unknown> }>('/api/ai/settings'),
  aiSaveSettings: (data: Record<string, unknown>) => request<{ success: boolean; config: Record<string, unknown> }>('/api/ai/settings', { method: 'POST', body: JSON.stringify(data) }),
  aiTest: () => request<{ success: boolean; message: string }>('/api/ai/test', { method: 'POST' }),
  aiAsk: (question: string) => request<{ success: boolean; answer: string }>('/api/ai/ask', { method: 'POST', body: JSON.stringify({ question }) }),
  onuTr069Reboot: (id: number) => request<{ success: boolean; message: string; queued?: boolean }>(`/api/onu/${id}/tr069/reboot`, { method: 'POST' }),
  onuTr069Refresh: (id: number) => request<{ success: boolean; message: string; queued?: boolean }>(`/api/onu/${id}/tr069/refresh`, { method: 'POST' }),
  onuTr069SetWifi: (id: number, data: { ssid: string; password?: string; band?: string; index?: number }) => request<{ success: boolean; message: string; queued?: boolean }>(`/api/onu/${id}/tr069/wifi`, { method: 'POST', body: JSON.stringify(data) }),
  onuTr069AddObject: (id: number, object_name: string) => request<{ success: boolean; instance: string; message: string }>(`/api/onu/${id}/tr069/add-object`, { method: 'POST', body: JSON.stringify({ object_name }) }),
  onuTr069DelObject: (id: number, object_name: string) => request<{ success: boolean; message: string; queued?: boolean }>(`/api/onu/${id}/tr069/del-object`, { method: 'POST', body: JSON.stringify({ object_name }) }),
  onuTr069AddWan: (id: number, data: { type: string; vlan_id?: string; username?: string; password?: string; service?: string; nat?: boolean; addressing?: string }) => request<{ success: boolean; instance: string; message: string }>(`/api/onu/${id}/tr069/add-wan`, { method: 'POST', body: JSON.stringify(data) }),
  onuTr069WanBind: (id: number, conn_key: string, vlan_id: string) => request<{ success: boolean; message: string; queued?: boolean }>(`/api/onu/${id}/tr069/wan-bind`, { method: 'POST', body: JSON.stringify({ conn_key, vlan_id }) }),
  onuTr069SetParams: (id: number, params: Record<string, string>) => request<{ success: boolean; message: string; queued?: boolean }>(`/api/onu/${id}/tr069/params`, { method: 'POST', body: JSON.stringify({ params }) }),
  onuTr069SetPppoe: (id: number, data: { username: string; password?: string }) => request<{ success: boolean; message: string; queued?: boolean }>(`/api/onu/${id}/tr069/pppoe`, { method: 'POST', body: JSON.stringify(data) }),
  onuTr069FactoryReset: (id: number) => request<{ success: boolean; message: string; queued?: boolean }>(`/api/onu/${id}/tr069/factory-reset`, { method: 'POST' }),
  onuTr069Tasks: (id: number) => request<{ success: boolean; tasks: { _id: string; name: string; timestamp: string; retries: number }[] }>(`/api/onu/${id}/tr069/tasks`),
  onuMapLock: (id: number, locked: boolean) => request<{ success: boolean; map_locked: boolean }>(`/api/onu/${id}/map-lock`, { method: 'POST', body: JSON.stringify({ locked }) }),
  parseMapsLink: (text: string) => request<{ success: boolean; lat?: number; lng?: number; message?: string }>('/api/ftth/parse-maps-link', { method: 'POST', body: JSON.stringify({ text }) }),
  onuPinsLightweight: () => request<{ success: boolean; pins: OnuPin[] }>('/api/ftth/map/onu-pins'),
  apiTokensList: () => request<{ success: boolean; data: ApiTokenInfo[] }>('/api/v1/tokens'),
  apiTokenCreate: (data: { name: string; abilities?: string; expires_days?: number }) => request<{ success: boolean; data: { token: string; id: number; name: string } }>('/api/v1/tokens', { method: 'POST', body: JSON.stringify(data) }),
  apiTokenRevoke: (id: number) => request<{ success: boolean; data: { id: number; revoked: boolean } }>(`/api/v1/tokens/${id}/revoke`, { method: 'POST' }),
  onuTraffic: (id: number) => request<{ success: boolean; traffic: { downstream_kbps: string; upstream_kbps: string } }>(`/api/onu/${id}/traffic`),
  onuGetStatus: (id: number) => request<{ success: boolean; status?: Record<string, unknown>; data?: Record<string, unknown>; message?: string }>(`/api/onu/${id}/get-status`, { method: 'POST' }),
  onuLiveInfo: (id: number) => request(`/api/onu/${id}/live-info`),
  refreshSignal: (oltId: number) =>
    request<{ success: boolean; updated: number; total: number }>(`/api/olt/${oltId}/refresh-signal`, { method: 'POST' }),

  // RX Color Ranges
  getRxColors: () => request<{ ranges: RxColorRange[] }>('/api/customization/rx-colors'),
  saveRxColors: (ranges: RxColorRange[]) =>
    request<{ success: boolean; message?: string }>('/api/customization/rx-colors', { method: 'POST', body: JSON.stringify({ ranges }) }),

  // OLT
  syncOlt: (oltId: number) => request<{ success: boolean; queued?: boolean; message?: string }>(`/api/olt/${oltId}/sync`, { method: 'POST' }),
  syncAllOlts: () => request(`/api/olt/sync-all`, { method: 'POST' }),
  syncStatus: (oltId: number) => request<SyncStatus>(`/api/olt/${oltId}/sync-status`),
  getOlt: (oltId: number) => request<OltFullData>(`/api/olt/${oltId}`),
  oltLogs: (oltId: number, type: string, lines?: number) => {
    const qs = new URLSearchParams({ type });
    if (lines) qs.set('lines', String(lines));
    return request<{ success: boolean; type: string; total_lines: number; lines: string[]; message?: string }>(`/api/olt/${oltId}/olt-logs?${qs}`);
  },
  syncLogs: (oltId: number, lines?: number) => {
    const qs = new URLSearchParams();
    if (lines) qs.set('lines', String(lines));
    return request<{ success: boolean; total_lines: number; lines: string[]; message?: string }>(`/api/olt/${oltId}/sync-logs?${qs}`);
  },
  onuStatusHistory: (oltId: number, limit?: number, status?: string) => {
    const qs = new URLSearchParams();
    if (limit) qs.set('limit', String(limit));
    if (status && status !== 'all') qs.set('status', status);
    return request<{ success: boolean; total: number; records: OnuStatusHistoryRecord[] }>(`/api/olt/${oltId}/onu-status-history?${qs}`);
  },
  discoverSlots: (oltId: number) => request<{ success: boolean; message: string; cards: unknown[]; fans: unknown[]; temperature: number | null }>(`/api/olt/${oltId}/discover-slots`, { method: 'POST' }),
  testConnection: (oltId: number | null, data: Record<string, unknown>) => {
    const url = oltId ? `/api/olt/${oltId}/test-connection` : '/api/olt/test-connection';
    return request<TestConnectionResult>(url, { method: 'POST', body: JSON.stringify(data) });
  },

  // FTTH Infrastructure
  ftthStats: () => request<FTTHStats>('/api/ftth/stats'),
  ftthQuality: () => request<FTTHQualityReport>('/api/ftth/quality'),
  ftthBudgetSettings: () => request<{ success: boolean; settings: Record<string, number>; defaults: Record<string, number>; splitter_loss: Record<string, number> }>('/api/ftth/budget-settings'),
  ftthBudgetSettingsSave: (data: Record<string, number>) => request<{ success: boolean; settings: Record<string, number> }>('/api/ftth/budget-settings', { method: 'PUT', body: JSON.stringify(data) }),
  ftthTree: () => request<{ success: boolean; tree: FTTHItem[] }>('/api/ftth/tree'),
  ftthMap: () => request<{ success: boolean; markers: FTTHMarker[]; lines: FTTHLine[] }>('/api/ftth/map'),
  ftthOtbList: () => request<{ success: boolean; items: FTTHOtb[] }>('/api/ftth/otb'),
  ftthOtbCreate: (data: Partial<FTTHOtb>) => request<{ success: boolean; item: FTTHOtb }>('/api/ftth/otb', { method: 'POST', body: JSON.stringify(data) }),
  ftthOtbUpdate: (id: number, data: Partial<FTTHOtb>) => request<{ success: boolean; item: FTTHOtb }>(`/api/ftth/otb/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  ftthOtbDelete: (id: number) => request<{ success: boolean }>(`/api/ftth/otb/${id}`, { method: 'DELETE' }),
  ftthOtbPorts: (otbId: number) => request<{ success: boolean; ports: FTTHOtbPort[] }>(`/api/ftth/otb/${otbId}/ports`),
  ftthOtbPortUpdate: (id: number, data: Partial<FTTHOtbPort>) => request<{ success: boolean; port: FTTHOtbPort }>(`/api/ftth/otb-port/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  ftthOdcList: (otbId?: number) => request<{ success: boolean; items: FTTHOdc[] }>(`/api/ftth/odc${otbId ? '?otb_id=' + otbId : ''}`),
  ftthOdcCreate: (data: Partial<FTTHOdc>) => request<{ success: boolean; item: FTTHOdc }>('/api/ftth/odc', { method: 'POST', body: JSON.stringify(data) }),
  ftthOdcUpdate: (id: number, data: Partial<FTTHOdc>) => request<{ success: boolean; item: FTTHOdc }>(`/api/ftth/odc/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  ftthOdcDelete: (id: number) => request<{ success: boolean }>(`/api/ftth/odc/${id}`, { method: 'DELETE' }),
  ftthOdpList: (odcId?: number) => request<{ success: boolean; items: FTTHOdp[] }>(`/api/ftth/odp${odcId ? '?odc_id=' + odcId : ''}`),
  ftthOdpCreate: (data: Partial<FTTHOdp>) => request<{ success: boolean; item: FTTHOdp }>('/api/ftth/odp', { method: 'POST', body: JSON.stringify(data) }),
  ftthOdpUpdate: (id: number, data: Partial<FTTHOdp>) => request<{ success: boolean; item: FTTHOdp }>(`/api/ftth/odp/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  ftthOdpDelete: (id: number) => request<{ success: boolean }>(`/api/ftth/odp/${id}`, { method: 'DELETE' }),
  ftthOdpPorts: (odpId: number) => request<{ success: boolean; ports: FTTHOdpPort[] }>(`/api/ftth/odp/${odpId}/ports`),
  ftthOdpSeedOnuCoords: (odpId: number) => request<{ success: boolean; updated: number; skipped: number; message: string }>(`/api/ftth/odp/${odpId}/seed-onu-coords`, { method: 'POST' }),
  ftthOdpPortUpdate: (id: number, data: Partial<FTTHOdpPort> & { latitude?: number | null; longitude?: number | null }) => request<{ success: boolean; port: FTTHOdpPort; warning?: string | null }>(`/api/ftth/odp-port/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  ftthOdpPortDelete: (id: number) => request<{ success: boolean }>(`/api/ftth/odp-port/${id}`, { method: 'DELETE' }),
  ftthJcList: () => request<{ success: boolean; items: FTTHJc[] }>('/api/ftth/jc'),
  ftthJcCreate: (data: Partial<FTTHJc>) => request<{ success: boolean; item: FTTHJc }>('/api/ftth/jc', { method: 'POST', body: JSON.stringify(data) }),
  ftthJcUpdate: (id: number, data: Partial<FTTHJc>) => request<{ success: boolean; item: FTTHJc }>(`/api/ftth/jc/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  ftthJcDelete: (id: number) => request<{ success: boolean }>(`/api/ftth/jc/${id}`, { method: 'DELETE' }),
  ftthJcSpliceCreate: (jcId: number, data: { core_in: number; core_out: number; label?: string; tube_in_label?: string; tube_out_label?: string }) => request<{ success: boolean; splice: FTTHJcSplice }>(`/api/ftth/jc/${jcId}/splice`, { method: 'POST', body: JSON.stringify(data) }),
  ftthJcSpliceUpdate: (jcId: number, spliceId: number, data: Partial<{ core_in: number; core_out: number; label: string; tube_in_label: string; tube_out_label: string }>) => request<{ success: boolean; splice: FTTHJcSplice }>(`/api/ftth/jc/${jcId}/splice/${spliceId}`, { method: 'PUT', body: JSON.stringify(data) }),
  ftthJcSpliceDelete: (jcId: number, spliceId: number) => request<{ success: boolean }>(`/api/ftth/jc/${jcId}/splice/${spliceId}`, { method: 'DELETE' }),
  ftthAvailableOnus: (oltId?: number) => request<{ success: boolean; onus: FTTHAvailableOnu[] }>(`/api/ftth/available-onus${oltId ? '?olt_id=' + oltId : ''}`),
  ftthCores: (ownerType: 'otb' | 'odc' | 'jc', ownerId: number) => request<{ success: boolean; cores: FTTHFiberCore[] }>(`/api/ftth/cores/${ownerType}/${ownerId}`),
  ftthCoreHistory: (coreId: number) => request<{ success: boolean; history: FTTHCoreHistoryEntry[] }>(`/api/ftth/cores/${coreId}/history`),
  ftthTraceOnu: (onuId: number) => request<{ success: boolean; complete: boolean; hops: FTTHTraceHop[]; message?: string; total_attenuation_db: number | null; budget?: FTTHLossBudget | null }>(`/api/ftth/trace/onu/${onuId}`),

  // Mikrotik link-state monitoring
  mikrotikList: () => request<{ success: boolean; devices: MikrotikDevice[] }>('/api/mikrotik'),
  mikrotikCreate: (data: Partial<MikrotikDevice> & { api_password?: string }) => request<{ success: boolean; device: MikrotikDevice }>('/api/mikrotik', { method: 'POST', body: JSON.stringify(data) }),
  mikrotikUpdate: (id: number, data: Partial<MikrotikDevice> & { api_password?: string }) => request<{ success: boolean; device: MikrotikDevice }>(`/api/mikrotik/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  mikrotikDelete: (id: number) => request<{ success: boolean }>(`/api/mikrotik/${id}`, { method: 'DELETE' }),
  mikrotikTest: (id: number) => request<{ success: boolean; identity?: string; active_sessions?: number; message?: string }>(`/api/mikrotik/${id}/test`, { method: 'POST' }),
  mikrotikPollNow: () => request<{ success: boolean; devices: { name: string; ok: boolean; sessions?: number; error?: string }[]; states: Record<string, number>; reconciled: number; message?: string }>('/api/mikrotik/poll-now', { method: 'POST' }),
  mikrotikMacMatch: (strip = 0, offset = 0) => request<{ success: boolean; matches: MacMatchResult[]; collisions: number; sessions: number; onus_scanned: number; device_errors: string[] }>(`/api/mikrotik/mac-match?strip=${strip}&offset=${offset}`),
  mikrotikMacMatchApply: (pairs: { onu_id: number; name: string }[]) => request<{ success: boolean; updated: number; errors: string[] }>('/api/mikrotik/mac-match', { method: 'POST', body: JSON.stringify({ pairs }) }),
  onuDiagnosis: (onuId: number) => request<{ success: boolean; diagnosis: OnuDiagnosis }>(`/api/onu/${onuId}/diagnosis`),
  onuLinkState: (onuId: number) => request<{ success: boolean; state: OnuLinkState | null }>(`/api/onu/${onuId}/link-state`),
  onuPingClient: (onuId: number) => request<{ success: boolean; source: string; ip: string; ping: { sent: number; received: number; loss_pct: number; avg_rtt_ms: number | null }; state: OnuLinkState; message?: string }>(`/api/onu/${onuId}/ping`, { method: 'POST' }),
  ftthImpact: (nodeType: 'otb' | 'jc' | 'odc' | 'odp', nodeId: number) => request<{ success: boolean; name?: string; total: number; online: number; offline: number; customers: Array<{ id: number; name: string; serial: string; status: string }>; truncated: boolean }>(`/api/ftth/impact/${nodeType}/${nodeId}`),
  ftthPonList: () => request<{ success: boolean; items: FTTHPonPort[] }>('/api/ftth/pon'),
  ftthPonRealPorts: (oltId: number) => request<{ success: boolean; olt_name: string; ports: FTTHRealPonPort[] }>(`/api/ftth/pon/real/${oltId}`),
  ftthPonCreate: (data: Partial<FTTHPonPort>) => request<{ success: boolean; item: FTTHPonPort }>('/api/ftth/pon', { method: 'POST', body: JSON.stringify(data) }),
  ftthPonUpdate: (id: number, data: Partial<FTTHPonPort>) => request<{ success: boolean; item: FTTHPonPort }>(`/api/ftth/pon/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  ftthPonDelete: (id: number) => request<{ success: boolean }>(`/api/ftth/pon/${id}`, { method: 'DELETE' }),
  snmpDevices: () => request<{ success: boolean; devices: SnmpDevice[]; summary: Record<string, number> }>('/api/snmp/devices'),
  snmpDevice: (id: number) => request<{ success: boolean; device: SnmpDevice; ports: SnmpPort[]; sensors: SnmpSensor[]; events: SnmpEvent[]; neighbors: SnmpNeighbor[] }>(`/api/snmp/devices/${id}`),
  snmpDeviceCreate: (data: SnmpDeviceForm) => request<{ success: boolean; device: SnmpDevice }>('/api/snmp/devices', { method: 'POST', body: JSON.stringify(data) }),
  snmpDeviceUpdate: (id: number, data: Partial<SnmpDeviceForm>) => request<{ success: boolean; device: SnmpDevice }>(`/api/snmp/devices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  snmpDeviceDelete: (id: number) => request<{ success: boolean }>(`/api/snmp/devices/${id}`, { method: 'DELETE' }),
  snmpDeviceDiscover: (id: number) => request<{ success: boolean; message: string }>(`/api/snmp/devices/${id}/discover`, { method: 'POST' }),
  snmpTest: (data: Partial<SnmpDeviceForm> & { device_id?: number }) =>
    request<{ success: boolean; ok: boolean; sys_name?: string; sys_descr?: string; vendor?: string; ms?: number; error?: string }>('/api/snmp/test', { method: 'POST', body: JSON.stringify(data) }),
  snmpGraph: (q: { device_id: number; port_id?: number; metrics: string; range: string }) => {
    const qs = new URLSearchParams({ device_id: String(q.device_id), metrics: q.metrics, range: q.range });
    if (q.port_id) qs.set('port_id', String(q.port_id));
    return request<SnmpGraphData>(`/api/snmp/graph?${qs}`);
  },
  snmpDeviceMetrics: (id: number) => request<{ success: boolean; metrics: { metric: string; name: string }[] }>(`/api/snmp/devices/${id}/metrics`),
  snmpPortDetail: (portId: number) => request<{ success: boolean; port: SnmpPort; detail: SnmpPortDetail; macs?: SnmpPortMac[] }>(`/api/snmp/ports/${portId}`),
  snmpDeviceTables: (id: number) => request<{ success: boolean; tables_at: string | null; note: string; arp: SnmpMacRow[]; fdb: SnmpMacRow[]; truncated: boolean }>(`/api/snmp/devices/${id}/tables`),
  snmpDeviceTablesRefresh: (id: number) => request<{ success: boolean; tables_at: string | null; note: string }>(`/api/snmp/devices/${id}/tables/refresh`, { method: 'POST' }),
  snmpSearch: (q: string) => request<{ success: boolean; kind: 'mac' | 'ip' | 'text'; results: SnmpSearchRow[] }>(`/api/snmp/search?q=${encodeURIComponent(q)}`),
  snmpSparks: (deviceId: number) =>
    request<{ success: boolean; points: number; step_s: number; ports: Record<string, { in: (number | null)[]; out: (number | null)[] }> }>(`/api/snmp/devices/${deviceId}/sparks`),
  snmpPortLive: (portId: number) =>
    request<{ success: boolean; ts: number; in: number; out: number; pin: number | null; pout: number | null; in_err: number | null; out_err: number | null; oper: string; hc: boolean; speed_mbps: number | null }>(`/api/snmp/ports/${portId}/live`),
  snmpTopology: () => request<{ success: boolean; nodes: TopoNode[]; links: TopoLink[] }>('/api/snmp/topology'),
  snmpSummary: () => request<SnmpSummary>('/api/snmp/summary'),
  snmpSettings: () => request<SnmpSettingsData>('/api/snmp/settings'),
  snmpSettingsSave: (data: Record<string, number | string>) => request<{ success: boolean; settings: Record<string, number>; general: Record<string, number> }>('/api/snmp/settings', { method: 'PUT', body: JSON.stringify(data) }),
  snmpReport: (q: { month: string; scope: string; tz: number; device_id?: number }) =>
    request<SnmpReportData>(`/api/snmp/report?${new URLSearchParams(Object.entries(q).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))}`),
  snmpReportCsvUrl: (q: { month: string; scope: string; tz: number }) =>
    `/api/snmp/report?${new URLSearchParams({ month: q.month, scope: q.scope, tz: String(q.tz), format: 'csv' })}`,
  snmpRules: (deviceId: number) => request<{ success: boolean; rules: SnmpRule[]; sensors: SnmpRuleSensor[] }>(`/api/snmp/devices/${deviceId}/rules`),
  snmpRuleSave: (deviceId: number, id: number | null, data: Partial<Omit<SnmpRule, 'id' | 'device_id' | 'status' | 'last_value' | 'status_since'>>) =>
    request<{ success: boolean; rule: SnmpRule }>(id ? `/api/snmp/rules/${id}` : `/api/snmp/devices/${deviceId}/rules`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) }),
  snmpRuleDelete: (id: number) => request<{ success: boolean }>(`/api/snmp/rules/${id}`, { method: 'DELETE' }),
  snmpMaintenance: (deviceId?: number) => request<{ success: boolean; items: SnmpMaintenance[] }>(`/api/snmp/maintenance${deviceId ? `?device_id=${deviceId}` : ''}`),
  snmpMaintenanceCreate: (data: { device_id: number | null; start?: string; end: string; reason?: string }) =>
    request<{ success: boolean; item: SnmpMaintenance }>('/api/snmp/maintenance', { method: 'POST', body: JSON.stringify(data) }),
  snmpMaintenanceDelete: (id: number) => request<{ success: boolean }>(`/api/snmp/maintenance/${id}`, { method: 'DELETE' }),
  snmpDigestSend: () => request<{ success: boolean; message: string }>('/api/snmp/digest/send', { method: 'POST' }),
  snmpPortUpdate: (id: number, data: { ignored?: boolean; watched?: boolean }) => request<{ success: boolean; port: SnmpPort }>(`/api/snmp/ports/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  ftthExport: () => '/api/ftth/export',
  ftthExportJson: () => '/api/ftth/export.json',
  ftthCoreSetStatus: (ownerType: 'otb' | 'odc' | 'jc', ownerId: number, core: number, data: { status?: 'available' | 'reserved' | 'damaged'; attenuation_db?: number | null; notes?: string }) =>
    request<{ success: boolean; core: FTTHFiberCore; warning?: string | null }>(`/api/ftth/cores/${ownerType}/${ownerId}/${core}`, { method: 'PUT', body: JSON.stringify(data) }),
  ftthPhotos: (kind: string, id: number) => request<{ success: boolean; photos: FTTHPhoto[]; max: number }>(`/api/ftth/photos/${kind}/${id}`),
  ftthPhotoUpload: async (kind: string, id: number, file: Blob) => {
    const fd = new FormData(); fd.append('photo', file, 'photo.jpg');
    const res = await fetch(`${BASE}/api/ftth/photos/${kind}/${id}`, { method: 'POST', body: fd, credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.message || `HTTP ${res.status}`, data.error_code, res.status, data);
    return data as { success: boolean; photos: FTTHPhoto[] };
  },
  ftthPhotoDelete: (kind: string, id: number, name: string) =>
    request<{ success: boolean; photos: FTTHPhoto[] }>(`/api/ftth/photos/${kind}/${id}/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  ftthPathsList: () => request<{ success: boolean; paths: FTTHFiberPath[] }>('/api/ftth/paths'),
  ftthPathCreate: (data: { from_type: string; from_id: number; to_type: string; to_id: number; coordinates: [number, number][]; path_type?: string }) => request<{ success: boolean; id: number }>('/api/ftth/paths', { method: 'POST', body: JSON.stringify(data) }),
  ftthPathUpdate: (id: number, data: Partial<{ coordinates: [number, number][]; path_type: string }>) => request<{ success: boolean }>(`/api/ftth/paths/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  ftthPathDelete: (id: number) => request<{ success: boolean }>(`/api/ftth/paths/${id}`, { method: 'DELETE' }),
  ftthAutoRoute: (data: { from_lat: number; from_lng: number; to_lat: number; to_lng: number; from_type?: string; from_id?: number; to_type?: string; to_id?: number }) => request<{ success: boolean; id: number; coordinates: [number, number][] }>('/api/ftth/auto-route', { method: 'POST', body: JSON.stringify(data) }),
  ftthImport: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<{ success: boolean; imported: Record<string, number> }>('/api/ftth/import', { method: 'POST', body: formData });
  },
  allOnusExport: () => '/api/all-onus/export',

  metricsHistory: (params: { type: string; olt_id?: number; onu_id?: number; hours?: number }) => {
    const qs = new URLSearchParams({ type: params.type });
    if (params.olt_id) qs.set('olt_id', String(params.olt_id));
    if (params.onu_id) qs.set('onu_id', String(params.onu_id));
    if (params.hours) qs.set('hours', String(params.hours));
    return request<{ success: boolean; data: Array<{ value: number; time: string; type: string }> }>(`/api/metrics/history?${qs}`);
  },

  // Traffic Monitoring
  trafficMeta: () => request<TrafficMetaResponse>('/api/traffic/meta'),
  trafficGrid: (params: { olt_id: number; port_type: 'uplink' | 'pon'; period: string; search?: string }) => {
    const qs = new URLSearchParams({ olt_id: String(params.olt_id), port_type: params.port_type, period: params.period });
    if (params.search) qs.set('search', params.search);
    return request<TrafficGridResponse>(`/api/traffic/grid?${qs}`);
  },
  trafficHistory: (params: { olt_id: number; port_type: 'uplink' | 'pon'; port_name: string; period: string }) => {
    const qs = new URLSearchParams({ olt_id: String(params.olt_id), port_type: params.port_type, port_name: params.port_name, period: params.period });
    return request<TrafficHistoryResponse>(`/api/traffic/history?${qs}`);
  },
  trafficLive: (params: { olt_id: number; port_type: 'uplink' | 'pon'; port_name: string }) => {
    const qs = new URLSearchParams({ olt_id: String(params.olt_id), port_type: params.port_type, port_name: params.port_name });
    return request<TrafficLiveResponse>(`/api/traffic/live?${qs}`);
  },

  // User & Role Management
  users: () => request<{ users: UserData[]; roles: RoleData[] }>('/api/users'),
  technicians: () => request<{ technicians: TechnicianData[] }>('/api/technicians'),
  permissions: () => request<{ permissions: Record<string, string> }>('/api/permissions'),
  createUser: (data: { full_name: string; username: string; password: string; role_id: number | null; phone?: string }) =>
    request<{ success: boolean; message?: string }>('/api/user', { method: 'POST', body: JSON.stringify(data) }),
  getUser: (id: number) => request<{ success: boolean; user: { id: number; full_name: string; username: string; role_id: number | null; phone: string } }>(`/api/user/${id}`),
  updateUser: (id: number, data: { full_name?: string; role_id?: number | null; password?: string; phone?: string }) =>
    request<{ success: boolean; message?: string }>(`/api/user/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: number) =>
    request<{ success: boolean; message?: string }>(`/api/user/${id}`, { method: 'DELETE' }),
  createRole: (data: { name: string; description: string; permissions: string[] }) =>
    request<{ success: boolean; message?: string }>('/api/role', { method: 'POST', body: JSON.stringify(data) }),
  updateRole: (id: number, data: { name?: string; description?: string; permissions?: string[] }) =>
    request<{ success: boolean; message?: string }>(`/api/role/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteRole: (id: number) =>
    request<{ success: boolean; message?: string }>(`/api/role/${id}`, { method: 'DELETE' }),

  // Action Logs
  actionLogs: (params: { page?: number; per_page?: number; category?: string; search?: string; username?: string; ip?: string }) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.per_page) qs.set('per_page', String(params.per_page));
    if (params.category) qs.set('category', params.category);
    if (params.search) qs.set('search', params.search);
    if (params.username) qs.set('username', params.username);
    if (params.ip) qs.set('ip', params.ip);
    return request<ActionLogsResponse>(`/api/action-logs?${qs}`);
  },
  actionLogsVerify: () => request<{ verified: boolean; checked: number; first_bad_id: number | null; archived: boolean; detail: string }>('/api/action-logs/verify'),
  mtSecurity: (hours = 24, deviceId?: number) =>
    request<MtSecSummary & { success: boolean }>(`/api/mikrotik/security?hours=${hours}${deviceId ? `&device_id=${deviceId}` : ''}`),
  mtSecuritySettings: () => request<{ success: boolean; settings: MtSecSettings; limits: Record<string, [number, number]>; ai_enabled: boolean }>('/api/mikrotik/security/settings'),
  mtSecuritySave: (data: Partial<MtSecSettings>) =>
    request<{ success: boolean; changed: string[]; invalid: string[]; settings: MtSecSettings }>('/api/mikrotik/security/settings', { method: 'PUT', body: JSON.stringify(data) }),
  mtSecurityAudit: (deviceId: number) =>
    request<{ success: boolean; audit: MtAudit; message?: string }>(`/api/mikrotik/security/audit/${deviceId}`, { method: 'POST' }),
  ipLookupSettings: () => request<IpLookupConfig & { success: boolean }>('/api/ip-lookup/settings'),
  ipLookupSave: (data: { provider?: IpLookupConfig['provider']; token?: string }) =>
    request<IpLookupConfig & { success: boolean }>('/api/ip-lookup/settings', { method: 'PUT', body: JSON.stringify(data) }),
  actionLogsArchive: (days: number) => request<{ success: boolean; archived: number; file: string | null; detail: string }>('/api/action-logs/archive', { method: 'POST', body: JSON.stringify({ days }) }),

  // Web Push (VAPID) — Fase 14
  pushVapidKey: () => request<{ success: boolean; public_key: string }>('/api/push/vapid-key'),
  pushSubscribe: (sub: { endpoint: string; keys: Record<string, string> }) =>
    request<{ success: boolean }>('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub) }),
  pushUnsubscribe: (endpoint: string) =>
    request<{ success: boolean }>('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  pushTest: () => request<{ success: boolean; sent: number }>('/api/push/test', { method: 'POST' }),

  // Notifications (bell alerts)
  notifications: (params?: { limit?: number; type?: 'alarm' | 'unregister' | 'general' }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.type) qs.set('type', params.type);
    return request<NotificationsResponse>(`/api/notifications?${qs}`);
  },

  // System Config
  getSystemConfig: () => request<{ success: boolean; config: Record<string, string> }>('/api/system-config'),
  updateSystemConfig: (data: Record<string, string>) =>
    request<{ success: boolean }>('/api/system-config', { method: 'PUT', body: JSON.stringify(data) }),

};

export interface UserData {
  id: number; full_name: string; username: string; role: string; role_id: number; phone: string;
  /** server lama tidak mengirim */
  is_super_admin?: boolean;
}
export interface RoleData {
  id: number; name: string; description: string; permissions: string; is_system: boolean;
}
export interface TechnicianData {
  id: number; full_name: string; username: string; phone: string;
}

export interface RxColorRange {
  min: number; max: number; color: string; label?: string;
}

export interface RxHistoryPoint {
  t: string;
  rx?: number | null;
  tx?: number | null;
  onu_rx?: number | null;
  rx_min?: number | null;
  rx_avg?: number | null;
  rx_max?: number | null;
  tx_avg?: number | null;
  onu_rx_avg?: number | null;
  samples?: number;
}

export interface PulseOlt { drops: number[]; recovers: number[]; online: number[]; level: number[]; total: number }
export interface DashboardPulse {
  success: boolean; hours: number; start: string; buckets: string[]; total_onu: number;
  online: number[]; drops: number[]; olts: Record<number, PulseOlt>;
}

export interface VpsRoute {
  id: number; cidr: string; gateway: string; mikrotik_id: number | null; note: string; enabled: boolean;
  status: 'pending' | 'ok' | 'error'; last_error: string; applied_at: string | null; active?: boolean | null;
}

export interface AcsBulkFilters { olt_id?: number; model?: string; node_type?: string; node_id?: number; status?: string }
export interface AcsBulkJob {
  id: number; action: string; params: Record<string, unknown>; filters: AcsBulkFilters;
  total: number; done: number; queued: number; failed: number;
  status: 'running' | 'finished' | 'cancelled'; created_by: string; created_at: string | null; finished_at: string | null;
  items?: { onu_id: number; name: string; status: string; message: string }[];
}

export interface AcsFault {
  _id: string; device: string; channel: string; code: string; message: string; retries: number; timestamp: string;
  onu_id?: number | null; onu_name?: string | null;
}

export interface Tr069Params {
  _id: string;
  last_inform: string;
  software_version: string;
  hardware_version?: string;
  uptime?: string;
  model: string;
  vendor: string;
  wifi_clients?: number;
  ssids?: { ssid: string; band: string; active: boolean; index: number; channel?: number | string | null }[];
  hosts?: { name: string; ip: string; mac: string; via: string; active: boolean | null }[];
  optical_rx_dbm?: number | null;
  wan_conns?: { key: string; index: number; type: string; username: string; ip: string; status: string; enabled: boolean | null; service: string }[];
  wan_ip: string;
  pppoe_username: string;
  ssid_24g: string;
  ssid_5g: string;
  data_model?: 'tr098' | 'tr181';
}

export interface OnuPin {
  id: number;
  lat: number;
  lng: number;
  status: string;
  name: string;
  map_locked: boolean;
}

export interface ApiTokenInfo {
  id: number;
  name: string;
  prefix: string;
  user: string;
  abilities: string;
  revoked: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  last_used_ip: string;
  created_at: string | null;
}

export interface TrafficPortMeta {
  port_name: string;
  admin_status: string;
  onu_count?: number;
  onu_online?: number;
}
export interface TrafficOltMeta {
  id: number;
  name: string;
  uplinks: TrafficPortMeta[];
  pon_ports: TrafficPortMeta[];
}
export interface TrafficMetaResponse {
  success: boolean;
  olts: TrafficOltMeta[];
}
export interface TrafficPoint {
  t: string;
  rx: number;
  tx: number;
}
export interface TrafficCard {
  port_name: string;
  points: TrafficPoint[];
  current_rx: number;
  current_tx: number;
  has_data: boolean;
}
export interface TrafficGridResponse {
  success: boolean;
  olt_name: string;
  port_type: string;
  period: string;
  cards: TrafficCard[];
}
export interface TrafficHistoryResponse {
  success: boolean;
  period: string;
  points: TrafficPoint[];
  has_data: boolean;
}
export interface TrafficLiveResponse {
  success: boolean;
  rx_mbps: number;
  tx_mbps: number;
  ts: number;
}

/** Info IP dari cache server: publik → ISP/ASN/negara; non-publik → scope. */
export interface IpInfoData {
  scope?: 'private' | 'loopback' | 'cgnat';
  asn?: string; as_name?: string; as_domain?: string;
  country_code?: string; country?: string; region?: string; city?: string;
}
export type MtSecKind = 'bruteforce' | 'distributed' | 'success_after_fail' | 'new_ip' | 'user_change' | 'fw_list' | 'audit';
export interface MtAuditFinding { id: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; fix: string }
export interface MtAudit { at: string | null; score: number | null; version: string; findings: MtAuditFinding[]; error: string }
export interface MtSecSettings {
  mt_sec_enabled: number; mt_sec_interval: number; mt_sec_bf_threshold: number; mt_sec_bf_minutes: number;
  mt_sec_dist_threshold: number; mt_sec_quiet_minutes: number; mt_sec_alert_success: number;
  mt_sec_alert_new_ip: number; mt_sec_alert_user_change: number; mt_sec_ai_analysis: number;
  mt_sec_retention_days: number; mt_sec_whitelist: string;
  mt_sec_alert_fw: number; mt_sec_fw_digest_minutes: number; mt_sec_alert_audit: number; mt_audit_hours: number;
  mt_sec_fw_lists: string;
}
export interface MtSecSummary {
  hours: number;
  ip_lookup?: IpLookupConfig['provider'];
  totals: { fails: number; attackers: number; logins: number; user_changes: number; open_alerts: number; fw_new: number };
  fw_lists: { list: string; router: string; active: number; seen: number;
    recent: { ip: string; active: boolean; first_seen: string | null; last_seen: string | null; times: number;
      comment: string; customer: string; info?: IpInfoData | null }[] }[];
  routers: { id: number; name: string; host: string; enabled: boolean; reachable: boolean; fails: number;
    attackers: number; logins: number; open_alerts: number; last_read_at: string | null; learning: boolean; error: string;
    audit: MtAudit | null }[];
  attackers: { ip: string; count: number; users: string[]; via: string[]; routers: string[]; last: string | null;
    info?: IpInfoData | null }[];
  alerts: { id: number; router: string; kind: MtSecKind; key: string; severity: string; count: number; detail: string;
    opened_at: string | null; last_seen_at: string | null; closed_at: string | null; ai_text: string }[];
  events: { id: number; router: string; kind: 'login_fail' | 'login_ok' | 'user_change' | 'fw_list' | 'audit'; user: string; ip: string;
    via: string; by: string; new_ip: boolean; message: string; at: string | null }[];
}
export interface IpLookupConfig { provider: 'off' | 'ipinfo' | 'ip-api'; has_token: boolean }
export interface ActionLogEntry {
  id: number; username: string; action: string; category: string;
  target: string; detail: string; ip_address: string; created_at: string | null;
  /** negara dari Cloudflare saat kejadian (CF-IPCountry) */
  ip_country?: string;
  user_agent?: string;
  ip_info?: IpInfoData | null;
}
export interface ActionLogsResponse {
  logs: ActionLogEntry[];
  total: number; page: number; per_page: number; pages: number;
  categories: string[];
  ip_lookup?: IpLookupConfig & { can_edit: boolean };
}

export interface NotificationEntry {
  id: number;
  severity: string;
  category: string;
  type: 'alarm' | 'unregister' | 'general';
  title: string;
  message: string;
  is_read: boolean;
  acknowledged: boolean;
  resolved: boolean;
  olt_id?: number;
  onu_id?: number;
  created_at: string | null;
}

export interface NotificationsResponse {
  notifications: NotificationEntry[];
  unread_count: number;
  alarm_unread: number;
  unregister_unread: number;
  general_unread: number;
}

// Types
export interface User {
  id: number;
  full_name: string;
  username: string;
  role: string;
  permissions: string[];
  sidebar_name: string;
  logo_url?: string | null;
  is_super_admin?: boolean;
  must_change_password?: boolean;
  theme?: 'dark' | 'light' | 'system';
  language?: 'id' | 'en';
  phone?: string;
  tenant_id?: number | null;
  subscription?: {
    is_active: boolean;
    days_remaining: number;
    max_olts: number;
    package_name: string;
    end_date: string | null;
  } | null;
}

export interface FanInfo {
  number: number;
  status: string;
  rpm: number;
  speed_level: string;
}

export interface OltModelPhoto {
  key: string; vendor: string; model: string; olt_count: number; image_url: string | null;
}

export interface FTTHQualityIssue { kind: string; id: number; name: string; message: string }
export interface FTTHQualityReport {
  success: boolean;
  total: number;
  counts: Record<string, number>;
  issues: Record<string, FTTHQualityIssue[]>;
  onus_unassigned: number;
  onus_total: number;
}

export interface CardInfo {
  slot: number;
  card_type: string;
  status: string;
  total_ports: number;
  ports_up?: number;
  ports_down?: number;
  cpu_usage?: number;
  memory_usage?: number;
  memory_total?: number;
  temperature?: number | null;
}

export interface OltInfo {
  id: number;
  name: string;
  ip_address: string;
  model: string;
  firmware_version: string;
  vendor?: string;
  is_online: boolean;
  total_onu: number;
  online_onu: number;
  los_onu: number;
  dyinggasp_onu: number;
  offline_onu: number;
  temperature: number | null;
  last_sync: string | null;
  connection_status: string;
  snmp_status?: string;
  telnet_status?: string;
  ssh_enabled?: boolean;
  uptime?: number;
  serial_number?: string;
  polling_interval?: number;
  total_fan?: number;
  fans: FanInfo[];
  cards: CardInfo[];
  uplink_count: number;
  image_url?: string | null;
  image_source?: 'olt' | 'model' | null;
}

export interface DashboardData {
  stats: {
    total_olts: number;
    total_onu: number;
    online: number;
    online_pct: number;
    los: number;
    los_pct: number;
    dyinggasp: number;
    dyinggasp_pct: number;
    offline: number;
    offline_pct: number;
    other: number;
  };
  olts: OltInfo[];
  subscription?: {
    is_active: boolean;
    days_remaining: number;
    max_olts: number;
    used_olts: number;
    remaining_olts: number;
    package_name: string;
    start_date: string | null;
    end_date: string | null;
    renewal_ref?: string;
  } | null;
}

export interface ONUData {
  id: number;
  olt_id: number;
  olt_name: string;
  olt_vendor: string;
  name: string;
  description: string;
  pppoe: string;
  onu_id_str: string;
  status: string;
  rx_power: number | null;
  onu_rx_power: number | null;
  tx_power: number | null;
  serial_number: string;
  actual_type: string;
  onu_type: string;
  frame: number;
  slot: number;
  port: number;
  onu_id: number;
  card: string;
  distance: number | null;
  technician_id: number | null;
  technician_name: string;
  technician_phone: string;
  odp_name: string;
  odp_port_number: number | null;
  odp_port_id: number | null;
  customer_name: string;
  customer_phone: string;
  latitude: number | null;
  longitude: number | null;
  map_locked?: boolean;
  last_seen: string | null;
  last_online: string | null;
  last_offline: string | null;
  wifi_config: string;
}

export interface SignalStats {
  [key: string]: number | undefined | { count: number; pct: number; label?: string; min?: number; max?: number; rx_olt?: number; rx_onu?: number };
  los: number;
  na: number;
  na_pct: number;
  /** jumlah unik LOS atau tanpa RX (kartu "LOS / N/A"); server lama tidak mengirim */
  los_na?: number;
  los_na_pct?: number;
  online: number;
  offline: number;
  dyinggasp: number;
  total: number;
}

export interface PonPortEntry {
  value: string;
  label: string;
  port: number;
}

export interface PonSlotGroup {
  slot: number;
  card_type: string;
  card_status: string;
  ports: PonPortEntry[];
}

export interface AllOnusData {
  onus: ONUData[];
  signal_stats: SignalStats;
  olts: OltInfo[];
  pon_ports: PonSlotGroup[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface OnuDetailData {
  onu: ONUData;
  live_detail: Record<string, unknown> | null;
  history: Array<{ date: string; event: string }>;
  wan_services_json: string;
}

export interface SyncStatus {
  progress: number;
  status: string;
  message: string;
}

export interface OltFullData {
  success: boolean;
  id: number;
  name: string;
  ip_address: string;
  vendor: string;
  model: string;
  firmware_version: string;
  snmp_enabled: boolean;
  snmp_community: string;
  snmp_community_write: string;
  snmp_port: number;
  telnet_enabled: boolean;
  telnet_port: number;
  web_port: number;
  ssh_enabled: boolean;
  ssh_port: number;
  cli_username: string;
  cli_password: string;
  monitoring_enabled: boolean;
  polling_interval: number;
  is_online: boolean;
  connection_status: string;
  snmp_status: string;
  telnet_status: string;
}

export interface TestConnectionResult {
  success: boolean;
  results: {
    snmp: { ok: boolean; message: string };
    telnet: { ok: boolean; message: string };
    web?: { ok: boolean; message: string };
  };
}

// FTTH Types
export interface FTTHStats {
  success: boolean;
  onu_stats: {
    total: number;
    online: number;
    offline: number;
    los: number;
    dyinggasp: number;
    unregister: number;
  };
  per_olt: {
    olt_id: number;
    olt_name: string;
    total: number;
    online: number;
    offline: number;
    los: number;
    dyinggasp: number;
    unregister: number;
    is_online: boolean;
  }[];
  per_pon: {
    port_id: number;
    port_name: string;
    olt_id: number;
    olt_name: string;
    total: number;
    online: number;
    offline: number;
    admin_status: string;
  }[];
  infrastructure: {
    total_otb: number;
    total_odc: number;
    total_odp: number;
    total_odp_ports: number;
    used_odp_ports: number;
    available_odp_ports: number;
  };
  orphans: {
    total: number;
    onus_without_odp: number;
    odps_without_odc: number;
    odcs_without_otb: number;
    otbs_without_olt: number;
    onus_without_technician: number;
    onus_without_coordinates: number;
  };
}

export interface SnmpDevice {
  id: number; name: string; host: string; port: number; snmp_version: '1' | '2c' | '3';
  v3_user: string; v3_level: string; v3_auth_proto: string; v3_priv_proto: string;
  has_community: boolean; community?: string; has_auth_pass: boolean; has_priv_pass: boolean;
  enabled: boolean; location: string; notes: string;
  sys_name: string; sys_descr: string; sys_location: string; sys_contact: string;
  vendor: string; os_name: string; hardware: string; os_version: string; serial: string;
  discovered_at: string | null;
  status: 'up' | 'down' | 'warn' | 'unknown'; status_reason: string; status_changed_at: string | null;
  last_poll_at: string | null; last_ok_at: string | null; poll_ms: number | null;
  uptime_s: number | null; cpu_pct: number | null; mem_pct: number | null; temperature: number | null;
  ports_total: number; ports_up: number; ports_down: number;
  parent_id?: number | null; in_maintenance?: boolean; parent_down?: string;
}
export interface SnmpRule {
  id: number; device_id: number; port_id: number | null; metric: string; name: string; op: 'gt' | 'lt';
  warn: number | null; crit: number | null; minutes: number; enabled: boolean;
  status: 'unknown' | 'ok' | 'warning' | 'down'; last_value: number | null; status_since: string | null;
}
export interface SnmpRuleSensor { metric: string; name: string; kind: string; unit: string }
export interface SnmpMaintenance {
  id: number; device_id: number | null; device_name: string; start: string | null; end: string | null;
  reason: string; created_by: string; active: boolean;
}
export interface SnmpDeviceForm {
  name: string; host: string; port?: number; snmp_version: '1' | '2c' | '3'; community?: string;
  v3_user?: string; v3_level?: string; v3_auth_proto?: string; v3_auth_pass?: string; v3_priv_proto?: string; v3_priv_pass?: string;
  location?: string; notes?: string; enabled?: boolean; parent_id?: number | null;
}
export interface SnmpPortDetail {
  mtu: number | null; duplex: string; ip_addrs: string[];
  sfp: { vendor: string; part: string; serial: string; type: string; connector: number | null; wavelength_nm: number | null; link_m: number | null; rates: string } | null;
  optical: { rx_dbm: number | null; tx_dbm: number | null; temp_c: number | null; volt: number | null; bias_ma: number | null; rx_loss: boolean | null; tx_fault: boolean | null; at: string | null } | null;
  stats: Record<string, number>; stats_at: string | null;
}
export interface SnmpPort {
  id: number; if_index: number; name: string; descr: string; alias: string; if_type: number | null;
  speed_mbps: number | null; mac: string; admin_status: string; oper_status: string; status_changed_at: string | null;
  ignored: boolean; in_bps: number | null; out_bps: number | null; in_err_rate: number | null; out_err_rate: number | null;
  in_pps?: number | null; out_pps?: number | null; has_counters?: boolean;
  rx_dbm?: number | null; tx_dbm?: number | null; rx_loss?: boolean | null; sfp_type?: string | null;
  in_errors: number | null; out_errors: number | null; util_pct: number | null; watched: boolean;
}
export interface TopoNode {
  id: string; device_id: number | null; name: string; host: string; status: string; vendor: string; hardware: string; external: boolean;
}
export interface TopoLink {
  id: string; source: string; target: string;
  source_port: { port_id: number | null; port: string; alias: string }; target_port: { port_id: number | null; port: string; alias: string };
  protocols: string[]; speed_mbps: number | null; util_pct: number | null; in_bps: number | null; out_bps: number | null;
  oper_status: string; last_seen: string | null;
}
export interface SnmpNeighbor {
  id: number; protocol: string; local_port: string; local_port_id: number | null; remote_name: string; remote_ip: string;
  remote_chassis: string; remote_port: string; remote_platform: string; remote_device_id: number | null;
  remote_device_name: string; last_seen: string | null;
}
export interface SnmpProblem {
  category: string; severity: string; title: string; device_id: number; device_name: string; port_id: number | null; since: string | null;
}
export interface SnmpPortBrief {
  port_id: number; device_id: number; device_name: string; name: string; alias: string; speed_mbps: number | null;
  oper_status: string; in_bps: number | null; out_bps: number | null; util_pct: number | null; watched: boolean; err_rate: number;
}
export interface SnmpSummary {
  success: boolean;
  counts: { total: number; up: number; warn: number; down: number; unknown: number; disabled: number };
  problems: SnmpProblem[]; top_ports: SnmpPortBrief[]; watched_ports: SnmpPortBrief[];
}
export interface SnmpReportDir { avg_bps: number | null; max_bps: number | null; p95_bps: number | null; volume_bytes: number }
export interface SnmpReportPort {
  port_id: number; device_id: number; device_name: string; port: string; alias: string; speed_mbps: number | null; watched: boolean;
  in: SnmpReportDir; out: SnmpReportDir; peak_util_pct: number | null; p95_util_pct: number | null; coverage_pct: number;
}
export interface SnmpReportData {
  success: boolean; month: string; start: string; end: string; ports: SnmpReportPort[];
  devices: { device_id: number; device_name: string; host: string; availability_pct: number | null; downtime_min: number | null;
    cpu_avg: number | null; cpu_max: number | null; temp_max: number | null }[];
}
export interface SnmpGraphStat { current: number | null; avg: number | null; max: number | null; p95: number | null; samples: number }
export interface SnmpGraphData {
  success: boolean; source: 'raw' | 'hourly'; range: string;
  series: Record<string, { t: string; avg: number; max: number | null }[]>;
  stats: Record<string, SnmpGraphStat>;
}
export interface SnmpSensor { id: number; kind: string; name: string; value: number | null; unit: string; updated_at: string | null }
export interface SnmpEvent { id: number; kind: string; severity: string; message: string; port_id: number | null; created_at: string | null }

export interface FTTHFieldInfo {
  cable_label: string;
  cable_type: string;
  cable_cores: number | null;
  cable_route: string;
  node_status: 'planned' | 'active' | 'maintenance' | 'retired';
  installed_at: string | null;
}

export interface FTTHPhoto { name: string; size: number; mtime: number; url: string }

export interface FTTHOtb extends Partial<FTTHFieldInfo> {
  id: number;
  name: string;
  type: string;
  model: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  olt_id: number | null;
  olt_name: string;
  pon_port: string;
  total_cores: number;
  fibers_per_tube: number;
  feed_source: 'pon' | 'jc';
  jc_id: number | null;
  jc_name: string;
  jc_core_number: number | null;
  cable_length_meters: number | null;
  cable_attenuation_per_km: number;
  cable_attenuation_db: number | null;
  description: string;
  odc_count: number;
  used_cores: number;
  available_cores: number;
  is_active: boolean;
}

export interface FTTHOtbPort {
  id: number;
  otb_id: number;
  port_number: number;
  label: string;
  description: string;
  status: string;
  odc_id: number | null;
  odc_name: string;
}

export interface FTTHOdc extends Partial<FTTHFieldInfo> {
  id: number;
  name: string;
  model: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  otb_id: number | null;
  otb_name: string;
  otb_core_number: number;
  feed_source: 'otb' | 'jc';
  jc_id: number | null;
  jc_name: string;
  jc_core_number: number | null;
  total_cores: number;
  fibers_per_tube: number;
  splitter_model: string;
  splitter_ratio_type: 'even' | 'uneven';
  splitter_tap_loss_db: number | null;
  splitter_through_loss_db: number | null;
  cable_length_meters: number | null;
  cable_attenuation_per_km: number;
  cable_attenuation_db: number | null;
  description: string;
  odp_count: number;
  used_cores: number;
  available_cores: number;
  is_active: boolean;
}

export interface FTTHOdp extends Partial<FTTHFieldInfo> {
  id: number;
  name: string;
  model: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  odc_id: number | null;
  odc_name: string;
  odc_core_number: number;
  feed_source: 'odc' | 'jc' | 'odp';
  jc_id: number | null;
  jc_name: string;
  jc_core_number: number | null;
  parent_odp_port_id: number | null;
  parent_odp_id: number | null;
  parent_odp_name: string;
  parent_odp_port_number: number | null;
  total_ports: number;
  splitter_model: string;
  splitter_ratio_type: 'even' | 'uneven';
  splitter_tap_loss_db: number | null;
  splitter_through_loss_db: number | null;
  cable_length_meters: number | null;
  cable_attenuation_per_km: number;
  cable_attenuation_db: number | null;
  description: string;
  used_ports: number;
  available_ports: number;
  is_active: boolean;
}

export interface FTTHJc extends Partial<FTTHFieldInfo> {
  id: number;
  name: string;
  closure_type: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  total_cores: number;
  fibers_per_tube: number;
  parent_type: 'pon' | 'otb' | 'odc' | 'odp_port' | 'jc' | null;
  parent_id: number | null;
  parent_name: string;
  cable_length_meters: number | null;
  cable_attenuation_per_km: number;
  cable_attenuation_db: number | null;
  description: string;
  splice_count: number;
  splices: FTTHJcSplice[];
}

export interface FTTHJcSplice {
  id: number;
  jc_id: number;
  core_in: number;
  core_out: number;
  label: string;
  tube_in_label: string;
  tube_out_label: string;
}

export interface FTTHOdpPort {
  id: number;
  odp_id: number;
  port_number: number;
  onu_id: number | null;
  status: string;
  customer_name: string;
  customer_phone: string;
  description: string;
  feed_source: 'direct' | 'jc';
  jc_id: number | null;
  jc_name: string;
  jc_core_number: number | null;
  onu_name: string;
  onu_serial: string;
  onu_status: string;
  onu_id_str: string;
  fed_odp_id: number | null;
  fed_odp_name: string;
  onu_latitude?: number | null;
  onu_longitude?: number | null;
  cable_length_meters: number | null;
  cable_attenuation_per_km: number;
  cable_attenuation_db: number | null;
}

export interface FTTHAvailableOnu {
  id: number;
  name: string;
  serial: string;
  onu_id_str: string;
  olt_id: number;
  olt_name: string;
}

export interface FTTHLossBudget {
  items: { kind: 'cable' | 'splitter' | 'connector' | 'splice'; label: string; db: number; assumed: boolean }[];
  total_db: number;
  assumed_count: number;
  missing: string[];
  olt_tx_dbm: number;
  olt_tx_assumed: boolean;
  expected_rx_dbm: number;
  measured_rx_dbm: number | null;
  delta_db: number | null;
  tolerance_db: number;
  verdict: 'ok' | 'worse' | 'better' | 'incomplete' | 'unknown';
}

export interface FTTHTraceHop {
  type: 'olt' | 'otb' | 'jc' | 'odc' | 'odp' | 'onu' | 'gap';
  id?: number;
  name?: string;
  detail?: string;      // olt: PON identifier
  core?: number;        // otb / odc: which core is used
  core_in?: number;     // jc: incoming core
  core_out?: number;    // jc: outgoing core
  splice_label?: string;
  port?: number;        // odp: port number
  serial?: string;      // onu
  status?: string;      // onu
  message?: string;     // gap: what's missing
  cable_attenuation_db?: number | null;       // otb/odc/jc/odp: this segment's own incoming-cable loss
  drop_cable_attenuation_db?: number | null;  // odp: the ODP-port's own drop-cable loss to the customer
}

export interface FTTHFiberCore {
  id: number;
  owner_type: 'otb' | 'odc' | 'jc';
  owner_id: number;
  core_number: number;
  status: 'available' | 'used' | 'reserved' | 'damaged';
  assigned_to_type: string | null;
  assigned_to_id: number | null;
  attenuation_db: number | null;
  notes: string;
  updated_at: string | null;
}

export interface FTTHCoreHistoryEntry {
  id: number;
  action: 'assigned' | 'unassigned' | 'status_change';
  previous_status: string | null;
  new_status: string | null;
  assigned_to_type: string | null;
  assigned_to_id: number | null;
  performed_by: string;
  reason: string;
  created_at: string | null;
}

export interface FTTHOdpTree extends FTTHOdp { ports: FTTHOdpPort[]; odps: FTTHOdpTree[] }
export interface FTTHOdcTree extends FTTHOdc { odps: FTTHOdpTree[]; jcs: FTTHJcTree[] }
export interface FTTHJcTree extends FTTHJc { splices: FTTHJcSplice[]; odcs: FTTHOdcTree[]; odps: FTTHOdpTree[]; jcs: FTTHJcTree[] }

export interface FTTHItem extends FTTHOtb {
  odcs: FTTHOdcTree[];
  jcs: FTTHJcTree[];
}

export interface FTTHMarker {
  type: string;
  id: number;
  name: string;
  lat: number;
  lng: number;
  subtype?: string;
  status?: string;
  serial?: string;
  olt_id?: number;
  olt_name?: string;
  onu_id_str?: string;
  rx_power?: number | null;
  tx_power?: number | null;
  onu_rx_power?: number | null;
}

export interface FTTHLine {
  from_lat: number;
  from_lng: number;
  to_lat: number;
  to_lng: number;
  from_type: string;
  to_type: string;
  from_id?: number;
  to_id?: number;
  label: string;
  link_state?: 'ok' | 'slow' | 'down' | 'no_session' | 'unknown';
  pppoe_ip?: string;
  rtt_ms?: number | null;
  loss_pct?: number | null;
  session_uptime?: string;
  link_checked_at?: string | null;
}

export interface MikrotikDevice {
  id: number;
  name: string;
  host: string;
  api_mode: 'api' | 'rest';
  api_port: number;
  api_ssl: boolean;
  api_user: string;
  has_password: boolean;
  enabled: boolean;
  ping_enabled: boolean;
  ping_batch: number;
  ping_source?: 'mikrotik' | 'vps';
  cpu_load?: number | null;
  mem_used_pct?: number | null;
  temperature?: number | null;
  ros_uptime?: string;
  ros_version?: string;
  board?: string;
  health_at?: string | null;
  last_ok: boolean;
  last_error: string;
  last_polled_at: string | null;
}

export interface MacMatchResult {
  onu_id: number;
  onu_index: string;
  onu_name: string;
  serial: string;
  olt_id: number;
  session_name: string;
  caller_id: string;
  address: string;
  uptime: string;
  device: string;
  match: string;
  delta?: number;
  collision: boolean;
}

export type DiagLevel = 'ok' | 'info' | 'warning' | 'critical';
export interface OnuDiagnosis {
  level: DiagLevel;
  code: string;
  title: string;
  action: string | null;
  findings: { code: string; level: DiagLevel; text: string }[];
  pppoe: { user: string | null; ip: string | null; session_up: boolean; uptime: string | null; link_state: string;
           rtt_ms: number | null; loss_pct: number | null; router: string | null; checked_at: string | null } | null;
  events_24h: { pppoe_drops: number; onu_drops: number };
  recent_events: { event: 'up' | 'down' | 'reconnect'; at: string; ip: string | null; prev_uptime: string | null }[];
}

export interface OnuLinkState {
  link_state: 'ok' | 'slow' | 'down' | 'no_session' | 'unknown';
  pppoe_user: string;
  pppoe_ip: string;
  session_up: boolean;
  session_uptime: string;
  rtt_ms: number | null;
  loss_pct: number | null;
  checked_at: string | null;
  ping_checked_at: string | null;
}

export interface FTTHFiberPath {
  id: number;
  from_type: string;
  from_id: number;
  to_type: string;
  to_id: number;
  coordinates: [number, number][];
  path_type: string;
}

export interface FTTHPonPort {
  id: number;
  olt_id: number | null;
  olt_name: string;
  frame: number;
  slot: number;
  port: number;
  pon_name: string;
  otb_id: number | null;
  otb_name: string;
  otb_core_number: number;
  description: string;
  total_onu: number;
  online_onu: number;
  offline_onu: number;
}

export interface FTTHRealPonPort {
  port_name: string;
  frame: number;
  slot: number;
  port: number;
  onu_count: number;
  onu_online: number;
  already_mapped: boolean;
}

export interface OnuStatusHistoryRecord {
  id: number;
  onu_id: number;
  onu_name: string;
  onu_index: string;
  serial_number: string;
  old_status: string;
  new_status: string;
  dereg_reason: string;
  rx_power: number | null;
  distance: number | null;
  source: string;
  created_at: string | null;
}

// (methods appended below inside api object)

export interface SnmpSettingsData {
  success: boolean;
  settings: Record<string, number>;
  defaults: Record<string, number>;
  general: Record<string, number>;
  digest?: { snmp_digest_enabled: number; snmp_digest_day: number; snmp_digest_hour: number };
  general_defaults: Record<string, number>;
  general_limits: Record<string, [number, number]>;
  /** community hanya dikirim ke pengelola perangkat (settings_ip_olts) */
  new_device: { snmp_version: '1' | '2c' | '3'; has_community: boolean; community?: string };
  last_cycle: { at: string | null; secs: number | null; devices: number; failed: number };
  volume: { raw: number; hourly: number; events: number; arp?: number; fdb?: number } | null;
}

/** Baris tabel ARP / MAC (FDB) perangkat SNMP. */
export interface SnmpMacRow {
  mac: string;
  ip?: string;
  vlan?: number | null;
  port_id: number | null;
  port: string;
  port_alias: string;
  first_seen: string | null;
  last_seen: string | null;
  /** masih ada di pembacaan terakhir perangkat */
  active: boolean;
}

export interface SnmpSearchRow extends SnmpMacRow {
  type: 'arp' | 'fdb';
  device_id: number;
  device: string;
  ip: string;
  /** pelanggan PPPoE yang caller-id / IP sesinya cocok */
  onu: { id: number; name: string; pppoe: string } | null;
}

export interface SnmpPortMac {
  mac: string;
  vlan: number | null;
  ip: string;
  source: 'fdb' | 'arp';
  last_seen: string | null;
  active: boolean;
}
