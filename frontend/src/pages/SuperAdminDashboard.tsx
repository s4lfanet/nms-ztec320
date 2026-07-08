import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate, cn } from '../lib/utils';
import {
  Building2, Users, Server, Radio, Shield, AlertTriangle,
  CheckCircle, XCircle, ArrowRight, Clock, Package
} from 'lucide-react';

export function SuperAdminDashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: api.adminDashboard,
    refetchInterval: 30000,
  });

  if (isLoading) return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-64 bg-glass rounded-lg" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="glass-card p-4 h-28" />)}
      </div>
      <div className="glass-card p-5 h-96" />
    </div>
  );

  const stats = data?.stats;
  const tenants = data?.tenants || [];
  const expiringSoon = data?.expiring_soon || [];
  const expired = data?.expired || [];

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Shield size={20} className="text-accent" />
            Super Admin Dashboard
          </h1>
          <p className="text-tx3 text-xs mt-0.5">Tenant & subscription overview</p>
        </div>
        <button onClick={() => navigate('/dashboard/admin')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-all w-full sm:w-auto justify-center">
          <Shield size={16} /> Manage Tenants
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <AdminStatCard icon={<Building2 size={18} />} label="Total Tenants" value={stats?.total_tenants ?? 0}
          sub={`${stats?.active_subscriptions ?? 0} active subs`} color="accent" />
        <AdminStatCard icon={<Server size={18} />} label="Total OLTs" value={stats?.total_olts ?? 0}
          sub={`${stats?.total_onus ?? 0} ONUs across all`} color="info" />
        <AdminStatCard icon={<Users size={18} />} label="Total Users" value={stats?.total_users ?? 0}
          sub="across all tenants" color="success" />
        <AdminStatCard icon={<AlertTriangle size={18} />} label="Expiring Soon" value={stats?.expiring_soon ?? 0}
          sub={`${stats?.expired_subscriptions ?? 0} expired`} color={stats?.expiring_soon || stats?.expired_subscriptions ? 'danger' : 'muted'} />
      </div>

      {/* Expiring Soon Alert */}
      {expiringSoon.length > 0 && (
        <div className="glass-card p-4 border border-warning/30">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-warning" />
            <h3 className="text-sm font-semibold">Subscriptions Expiring Soon (≤7 days)</h3>
          </div>
          <div className="space-y-2">
            {expiringSoon.map(t => (
              <div key={t.id} className="flex items-center justify-between p-2.5 rounded-lg bg-warning/5 border border-warning/15">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center">
                    <Building2 size={14} className="text-warning" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-tx3">{t.subdomain} · {t.subscription?.package_name} · OLT {t.olt_count}/{t.subscription?.max_olts ?? 0}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-warning font-medium">{t.subscription?.days_remaining}d remaining</div>
                    <div className="text-xs text-tx3">{t.subscription?.end_date ? formatDate(t.subscription.end_date) : '-'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expired Tenants */}
      {expired.length > 0 && (
        <div className="glass-card p-4 border border-danger/30">
          <div className="flex items-center gap-2 mb-3">
            <XCircle size={16} className="text-danger" />
            <h3 className="text-sm font-semibold">Expired / No Subscription</h3>
          </div>
          <div className="space-y-2">
            {expired.map(t => (
              <div key={t.id} className="flex items-center justify-between p-2.5 rounded-lg bg-danger/5 border border-danger/15">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-danger/15 flex items-center justify-center">
                    <Building2 size={14} className="text-danger" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-tx3">{t.subdomain}</div>
                  </div>
                </div>
                <span className="text-xs text-danger font-medium">
                  {t.subscription ? 'Expired' : 'No subscription'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tenant Table */}
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-brd flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Building2 size={16} /> All Tenants</h2>
          <span className="text-xs text-tx3">{tenants.length} tenants</span>
        </div>
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brd">
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">Tenant</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">Package</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">OLTs (Used/Limit)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">ONUs</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-tx3 uppercase">Subscription Period</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-tx3 uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t.id} className="border-b border-brd/50 hover:bg-glass/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                        <Building2 size={16} className="text-accent" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{t.name}</div>
                        <div className="text-xs text-tx3">{t.subdomain}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-tx2">{t.subscription?.package_name || '-'}</td>
                  <td className="px-4 py-3">
                    {t.subscription?.is_active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/15 text-success">
                        <CheckCircle size={11} /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-danger/15 text-danger">
                        <XCircle size={11} /> Expired
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Server size={12} className="text-tx3" />
                      <span className={cn('font-medium', t.olt_count >= (t.subscription?.max_olts ?? 0) ? 'text-danger' : 'text-tx1')}>{t.olt_count}</span>
                      <span className="text-tx3 text-xs">/ {t.subscription?.max_olts ?? 0}</span>
                    </div>
                    {t.subscription && t.olt_count < t.subscription.max_olts && (
                      <div className="text-[10px] text-tx3 mt-0.5">{t.subscription.max_olts - t.olt_count} slot remaining</div>
                    )}
                    {t.subscription && t.olt_count >= t.subscription.max_olts && (
                      <div className="text-[10px] text-danger mt-0.5">Limit reached</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="flex items-center gap-1"><Radio size={12} className="text-tx3" /> {t.onu_count}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {t.subscription?.end_date ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-tx2">
                          <Clock size={10} className="text-tx3" />
                          {formatDate(t.subscription.end_date)}
                        </div>
                        <div className="flex items-center gap-1">
                          <Package size={10} className="text-tx3" />
                          <span className="text-tx3">{t.subscription.package_name}</span>
                        </div>
                        <div className={cn('text-[10px] font-medium', t.subscription.days_remaining <= 7 ? 'text-danger' : t.subscription.days_remaining <= 14 ? 'text-warning' : 'text-success')}>
                          {t.subscription.days_remaining > 0 ? `${t.subscription.days_remaining}d remaining` : 'Expired'}
                        </div>
                      </div>
                    ) : <span className="text-tx3">-</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => navigate('/dashboard/admin')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 text-xs font-medium transition-colors">
                      Manage <ArrowRight size={12} />
                    </button>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-tx3">
                  <Building2 size={40} className="mx-auto mb-3 opacity-30" />
                  <p>No tenants yet</p>
                  <p className="text-xs mt-1">Create tenants in Admin Panel</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-brd/50">
          {tenants.map(t => (
            <div key={t.id} className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <Building2 size={16} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{t.name}</div>
                  <div className="text-xs text-tx3 truncate">{t.subdomain}</div>
                </div>
                {t.subscription?.is_active ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/15 text-success flex-shrink-0">
                    <CheckCircle size={11} /> Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-danger/15 text-danger flex-shrink-0">
                    <XCircle size={11} /> Expired
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-tx3 text-[10px] uppercase">Package</div>
                  <div className="font-medium truncate">{t.subscription?.package_name || '-'}</div>
                </div>
                <div>
                  <div className="text-tx3 text-[10px] uppercase">OLTs</div>
                  <div className={cn('font-medium', t.olt_count >= (t.subscription?.max_olts ?? 0) ? 'text-danger' : 'text-tx1')}>{t.olt_count}/{t.subscription?.max_olts ?? 0}</div>
                </div>
                <div>
                  <div className="text-tx3 text-[10px] uppercase">ONUs</div>
                  <div className="font-medium">{t.onu_count}</div>
                </div>
              </div>
              {t.subscription?.end_date && (
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-tx2"><Clock size={10} /> {formatDate(t.subscription.end_date)}</span>
                  <span className={cn('font-medium', t.subscription.days_remaining <= 7 ? 'text-danger' : t.subscription.days_remaining <= 14 ? 'text-warning' : 'text-success')}>
                    {t.subscription.days_remaining > 0 ? `${t.subscription.days_remaining}d left` : 'Expired'}
                  </span>
                </div>
              )}
              <button onClick={() => navigate('/dashboard/admin')}
                className="w-full inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 text-xs font-medium transition-colors">
                Manage <ArrowRight size={12} />
              </button>
            </div>
          ))}
          {tenants.length === 0 && (
            <div className="text-center py-12 text-tx3">
              <Building2 size={40} className="mx-auto mb-3 opacity-30" />
              <p>No tenants yet</p>
              <p className="text-xs mt-1">Create tenants in Admin Panel</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminStatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: number; sub?: string; color: string;
}) {
  const border: Record<string, string> = {
    accent: 'border-accent/20 bg-accent/5',
    success: 'border-success/20 bg-success/5',
    danger: 'border-danger/20 bg-danger/5',
    warning: 'border-warning/20 bg-warning/5',
    info: 'border-info/20 bg-info/5',
    muted: 'border-brd',
  };
  const tc: Record<string, string> = {
    accent: 'text-accent', success: 'text-success', danger: 'text-danger',
    warning: 'text-warning', info: 'text-info', muted: 'text-tx3',
  };
  return (
    <div className={cn('glass-card p-3 md:p-4 border', border[color] || border.accent)}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-tx3 uppercase tracking-wide font-medium">{label}</p>
        <span className={tc[color] || tc.accent}>{icon}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className={cn('text-[11px] mt-1', tc[color])}>{sub}</div>}
    </div>
  );
}
