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

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...options.headers as Record<string, string> },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<{ success: boolean; user: User }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User }>('/api/auth/me'),

  // Public (no auth)
  publicPackages: () => request<PublicPackage[]>('/api/public/packages'),
  publicRegister: (data: RegisterData) =>
    request<{ success: boolean; tenant_id: number; subscription_id: number; invoice_id: number; package: PublicPackage }>('/api/public/register', {
      method: 'POST', body: JSON.stringify(data),
    }),
  publicRegisterPay: (data: { tenant_id: number; subscription_id: number; package_id: number; payment_method: string }) =>
    request<{ success: boolean; payment_url: string; merchant_order_id: string }>('/api/public/register/pay', {
      method: 'POST', body: JSON.stringify(data),
    }),
  publicRegistrationStatus: (orderId: string) =>
    request<{ success: boolean; status: string; tenant_status: string; tenant_name: string; subdomain: string; amount: number }>(`/api/public/registration-status/${orderId}`),

  // Dashboard
  dashboard: (opts?: { nocache?: boolean } | unknown) => request<DashboardData>(`/api/dashboard${opts && typeof opts === 'object' && 'nocache' in opts && opts.nocache ? '?nocache=1' : ''}`),

  // All ONUs
  allOnus: (params?: { olt?: string; status?: string; pon?: string; search?: string; page?: number; page_size?: number; sort_by?: string; sort_dir?: 'asc' | 'desc' }) => {
    const q = new URLSearchParams();
    if (params?.olt && params.olt !== 'all') q.set('olt', params.olt);
    if (params?.status && params.status !== 'all') q.set('status', params.status);
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
  onuLiveDetail: (id: number) => request<{ success: boolean; live_detail: Record<string, unknown> | null; history: Array<{ date: string; event: string }>; wan_services_json: string }>(`/api/onu/${id}/live-detail`),
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
  syncOlt: (oltId: number) => request(`/api/olt/${oltId}/sync`, { method: 'POST' }),
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
  ftthTree: () => request<{ success: boolean; tree: FTTHItem[] }>('/api/ftth/tree'),
  ftthMap: () => request<{ success: boolean; markers: FTTHMarker[]; lines: FTTHLine[] }>('/api/ftth/map'),
  ftthOtbList: () => request<{ success: boolean; items: FTTHOtb[] }>('/api/ftth/otb'),
  ftthOtbCreate: (data: Partial<FTTHOtb>) => request<{ success: boolean; item: FTTHOtb }>('/api/ftth/otb', { method: 'POST', body: JSON.stringify(data) }),
  ftthOtbUpdate: (id: number, data: Partial<FTTHOtb>) => request<{ success: boolean; item: FTTHOtb }>(`/api/ftth/otb/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  ftthOtbDelete: (id: number) => request<{ success: boolean }>(`/api/ftth/otb/${id}`, { method: 'DELETE' }),
  ftthOdcList: (otbId?: number) => request<{ success: boolean; items: FTTHOdc[] }>(`/api/ftth/odc${otbId ? '?otb_id=' + otbId : ''}`),
  ftthOdcCreate: (data: Partial<FTTHOdc>) => request<{ success: boolean; item: FTTHOdc }>('/api/ftth/odc', { method: 'POST', body: JSON.stringify(data) }),
  ftthOdcUpdate: (id: number, data: Partial<FTTHOdc>) => request<{ success: boolean; item: FTTHOdc }>(`/api/ftth/odc/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  ftthOdcDelete: (id: number) => request<{ success: boolean }>(`/api/ftth/odc/${id}`, { method: 'DELETE' }),
  ftthOdpList: (odcId?: number) => request<{ success: boolean; items: FTTHOdp[] }>(`/api/ftth/odp${odcId ? '?odc_id=' + odcId : ''}`),
  ftthOdpCreate: (data: Partial<FTTHOdp>) => request<{ success: boolean; item: FTTHOdp }>('/api/ftth/odp', { method: 'POST', body: JSON.stringify(data) }),
  ftthOdpUpdate: (id: number, data: Partial<FTTHOdp>) => request<{ success: boolean; item: FTTHOdp }>(`/api/ftth/odp/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  ftthOdpDelete: (id: number) => request<{ success: boolean }>(`/api/ftth/odp/${id}`, { method: 'DELETE' }),
  ftthOdpPorts: (odpId: number) => request<{ success: boolean; ports: FTTHOdpPort[] }>(`/api/ftth/odp/${odpId}/ports`),
  ftthOdpPortUpdate: (id: number, data: Partial<FTTHOdpPort>) => request<{ success: boolean; port: FTTHOdpPort }>(`/api/ftth/odp-port/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  ftthOdpPortDelete: (id: number) => request<{ success: boolean }>(`/api/ftth/odp-port/${id}`, { method: 'DELETE' }),
  ftthAvailableOnus: (oltId?: number) => request<{ success: boolean; onus: FTTHAvailableOnu[] }>(`/api/ftth/available-onus${oltId ? '?olt_id=' + oltId : ''}`),
  ftthPonList: () => request<{ success: boolean; items: FTTHPonPort[] }>('/api/ftth/pon'),
  ftthPonCreate: (data: Partial<FTTHPonPort>) => request<{ success: boolean; item: FTTHPonPort }>('/api/ftth/pon', { method: 'POST', body: JSON.stringify(data) }),
  ftthPonUpdate: (id: number, data: Partial<FTTHPonPort>) => request<{ success: boolean; item: FTTHPonPort }>(`/api/ftth/pon/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  ftthPonDelete: (id: number) => request<{ success: boolean }>(`/api/ftth/pon/${id}`, { method: 'DELETE' }),
  ftthExport: () => '/api/ftth/export',
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
  actionLogs: (params: { page?: number; per_page?: number; category?: string; search?: string; username?: string }) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.per_page) qs.set('per_page', String(params.per_page));
    if (params.category) qs.set('category', params.category);
    if (params.search) qs.set('search', params.search);
    if (params.username) qs.set('username', params.username);
    return request<ActionLogsResponse>(`/api/action-logs?${qs}`);
  },

  // Subscription status
  subscriptionStatus: () => request<SubscriptionStatus>('/api/subscription/status'),

  // Admin — Dashboard
  adminDashboard: () => request<AdminDashboardData>('/api/admin/dashboard'),

  // Admin — Packages
  adminPackages: () => request<SubscriptionPackage[]>('/api/admin/packages'),
  adminCreatePackage: (data: Partial<SubscriptionPackage>) =>
    request<{ success: boolean; id: number }>('/api/admin/package', { method: 'POST', body: JSON.stringify(data) }),
  adminUpdatePackage: (id: number, data: Partial<SubscriptionPackage>) =>
    request<{ success: boolean }>(`/api/admin/package/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  adminDeletePackage: (id: number) =>
    request<{ success: boolean }>(`/api/admin/package/${id}`, { method: 'DELETE' }),

  // Admin — Tenants
  adminTenants: () => request<Tenant[]>('/api/admin/tenants'),
  adminCreateTenant: (data: { name: string; subdomain: string; contact_name?: string; contact_email?: string; contact_phone?: string; admin_name?: string; admin_username?: string; admin_password?: string }) =>
    request<{ success: boolean; id: number }>('/api/admin/tenant', { method: 'POST', body: JSON.stringify(data) }),
  adminUpdateTenant: (id: number, data: Partial<Tenant>) =>
    request<{ success: boolean }>(`/api/admin/tenant/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  adminDeleteTenant: (id: number) =>
    request<{ success: boolean }>(`/api/admin/tenant/${id}`, { method: 'DELETE' }),

  // Admin — Subscriptions
  adminSubscriptions: () => request<Subscription[]>('/api/admin/subscriptions'),
  adminCreateSubscription: (data: { tenant_id: number; package_id: number; auto_renew?: boolean }) =>
    request<{ success: boolean; id: number; end_date: string }>('/api/admin/subscription', { method: 'POST', body: JSON.stringify(data) }),
  adminUpdateSubscription: (id: number, data: { status?: string; auto_renew?: boolean; end_date?: string }) =>
    request<{ success: boolean }>(`/api/admin/subscription/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  adminDeleteSubscription: (id: number) =>
    request<{ success: boolean }>(`/api/admin/subscription/${id}`, { method: 'DELETE' }),
  adminExtendSubscription: (id: number, days: number) =>
    request<{ success: boolean; end_date: string }>(`/api/admin/subscription/${id}/extend`, { method: 'POST', body: JSON.stringify({ days }) }),
  adminTransactions: () => request<TransactionRecord[]>('/api/admin/transactions'),
  adminInvoices: () => request<InvoiceRecord[]>('/api/admin/invoices'),

  // System Config
  getSystemConfig: () => request<{ success: boolean; config: Record<string, string> }>('/api/system-config'),
  updateSystemConfig: (data: Record<string, string>) =>
    request<{ success: boolean }>('/api/system-config', { method: 'PUT', body: JSON.stringify(data) }),

  // Renewal & Payment
  getRenewalInfo: (ref: string) => request<RenewalData>(`/api/renewal/${ref}`),
  getPaymentMethods: (amount: number) =>
    request<{ success: boolean; payment_methods: PaymentMethod[] }>(`/api/payment/methods?amount=${amount}`),
  createRenewalPayment: (ref: string, packageId?: number, paymentMethod?: string) =>
    request<{ success: boolean; payment_url: string; merchant_order_id: string }>(`/api/renewal/${ref}/pay`, {
      method: 'POST', body: JSON.stringify({ package_id: packageId, payment_method: paymentMethod }),
    }),
  checkPaymentStatus: (orderId: string) =>
    request<{ success: boolean; status: string; amount: number; payment_method: string; created_at: string; paid_at: string | null }>(`/api/payment/status/${orderId}`),
  tenantInvoices: () => request<InvoiceRecord[]>('/api/subscription/invoices'),
};

export interface UserData {
  id: number; full_name: string; username: string; role: string; role_id: number; phone: string;
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

export interface ActionLogEntry {
  id: number; username: string; action: string; category: string;
  target: string; detail: string; ip_address: string; created_at: string | null;
}
export interface ActionLogsResponse {
  logs: ActionLogEntry[];
  total: number; page: number; per_page: number; pages: number;
  categories: string[];
}

// Types
export interface User {
  id: number;
  full_name: string;
  username: string;
  role: string;
  permissions: string[];
  sidebar_name: string;
  is_super_admin?: boolean;
  tenant_id?: number | null;
  subscription?: {
    is_active: boolean;
    days_remaining: number;
    max_olts: number;
    package_name: string;
    end_date: string | null;
  } | null;
}

export interface SubscriptionPackage {
  id: number;
  name: string;
  description: string;
  price: number;
  max_olts: number;
  duration_days: number;
  features: string;
  is_active: boolean;
  created_at: string | null;
}

export interface Tenant {
  id: number;
  name: string;
  subdomain: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  status: string;
  created_at: string | null;
  user_count: number;
  olt_count: number;
  subscription?: {
    package_name: string;
    end_date: string | null;
    days_remaining: number;
    is_active: boolean;
  } | null;
}

export interface Subscription {
  id: number;
  tenant_id: number;
  tenant_name: string;
  package_id: number;
  package_name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  auto_renew: boolean;
  is_active: boolean;
  days_remaining: number;
}

export interface SubscriptionStatus {
  is_super_admin?: boolean;
  is_active?: boolean;
  days_remaining?: number;
  max_olts?: number;
  package_name?: string;
  end_date?: string | null;
  start_date?: string | null;
  message?: string;
  renewal_ref?: string;
}

export interface PaymentMethod {
  paymentMethod: string;
  paymentName: string;
  paymentImage: string;
  totalFee: string;
}

export interface RenewalData {
  success: boolean;
  tenant: {
    name: string;
    subdomain: string;
    contact_name: string;
    contact_phone: string;
    contact_email: string;
  };
  subscription: {
    id: number;
    status: string;
    start_date: string;
    end_date: string;
    days_remaining: number;
    is_active: boolean;
  };
  package: {
    id: number;
    name: string;
    description: string;
    price: number;
    max_olts: number;
    duration_days: number;
  };
  packages: Array<{
    id: number;
    name: string;
    description: string;
    price: number;
    max_olts: number;
    duration_days: number;
  }>;
}

export interface FanInfo {
  number: number;
  status: string;
  rpm: number;
  speed_level: string;
}

export interface TransactionRecord {
  id: number;
  merchant_order_id: string;
  tenant_name: string;
  tenant_id: number;
  package_name: string;
  amount: number;
  status: string;
  payment_method: string;
  reference: string;
  created_at: string;
  paid_at: string | null;
}

export interface InvoiceRecord {
  id: number;
  invoice_number: string;
  tenant_name: string;
  tenant_id: number;
  package_id: number;
  package_name: string;
  amount: number;
  status: string;
  invoice_type: string;
  description: string;
  due_date: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface CardInfo {
  slot: number;
  card_type: string;
  status: string;
  total_ports: number;
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

export interface AdminDashboardData {
  stats: {
    total_tenants: number;
    active_subscriptions: number;
    expired_subscriptions: number;
    expiring_soon: number;
    total_olts: number;
    total_onus: number;
    total_users: number;
  };
  tenants: Array<{
    id: number;
    name: string;
    subdomain: string;
    olt_count: number;
    onu_count: number;
    subscription: {
      package_name: string;
      max_olts: number;
      days_remaining: number;
      is_active: boolean;
      start_date: string | null;
      end_date: string | null;
    } | null;
  }>;
  expiring_soon: Array<{
    id: number;
    name: string;
    subdomain: string;
    olt_count: number;
    onu_count: number;
    subscription: {
      package_name: string;
      max_olts: number;
      days_remaining: number;
      is_active: boolean;
      start_date: string | null;
      end_date: string | null;
    } | null;
  }>;
  expired: Array<{
    id: number;
    name: string;
    subdomain: string;
    olt_count: number;
    onu_count: number;
    subscription: {
      package_name: string;
      max_olts: number;
      days_remaining: number;
      is_active: boolean;
      start_date: string | null;
      end_date: string | null;
    } | null;
  }>;
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
  last_seen: string | null;
  last_online: string | null;
  last_offline: string | null;
  wifi_config: string;
}

export interface SignalStats {
  [key: string]: number | { count: number; pct: number; label?: string; min?: number; max?: number; rx_olt?: number; rx_onu?: number };
  los: number;
  na: number;
  na_pct: number;
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

export interface FTTHOtb {
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
  description: string;
  odc_count: number;
  used_cores: number;
  available_cores: number;
  is_active: boolean;
}

export interface FTTHOdc {
  id: number;
  name: string;
  model: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  otb_id: number | null;
  otb_name: string;
  otb_core_number: number;
  total_cores: number;
  splitter_model: string;
  description: string;
  odp_count: number;
  used_cores: number;
  available_cores: number;
  is_active: boolean;
}

export interface FTTHOdp {
  id: number;
  name: string;
  model: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  odc_id: number | null;
  odc_name: string;
  odc_core_number: number;
  total_ports: number;
  splitter_model: string;
  description: string;
  used_ports: number;
  available_ports: number;
  is_active: boolean;
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
  onu_name: string;
  onu_serial: string;
  onu_status: string;
  onu_id_str: string;
}

export interface FTTHAvailableOnu {
  id: number;
  name: string;
  serial: string;
  onu_id_str: string;
  olt_id: number;
  olt_name: string;
}

export interface FTTHItem extends FTTHOtb {
  odcs: (FTTHOdc & { odps: (FTTHOdp & { ports: FTTHOdpPort[] })[] })[];
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

export interface PublicPackage {
  id: number;
  name: string;
  description: string;
  price: number;
  max_olts: number;
  duration_days: number;
}

export interface RegisterData {
  name: string;
  subdomain: string;
  contact_name: string;
  contact_email?: string;
  contact_phone: string;
  admin_name?: string;
  admin_username: string;
  admin_password: string;
  package_id: number;
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
