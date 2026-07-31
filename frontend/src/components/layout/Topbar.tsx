import { Bell, LogOut, User, Sun, Moon, Menu, Zap, Check, Trash2, AlertTriangle, ShieldAlert, Plug, ArrowRight, X, Package, CheckCircle2, WifiOff, XCircle } from 'lucide-react';
import { useAuth } from '../../stores/auth';
import { useTheme } from '../../stores/theme';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useWebSocket } from '../../hooks/useWebSocket';

type NotifType = 'alarm' | 'unregister' | 'general';

interface NotifItem {
  id: number;
  severity: string;
  category: string;
  type: NotifType;
  title: string;
  message: string;
  is_read: boolean;
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  olt_id?: number;
  onu_id?: number;
  created_at: string;
}

interface NotifData {
  notifications: NotifItem[];
  unread_count: number;
  alarm_unread: number;
  unregister_unread: number;
  general_unread: number;
}

interface UnregData {
  unregistered: number;
  offline_dyinggasp: number;
  offline_count: number;
  dyinggasp_count: number;
  los_count: number;
  breakdown: { olt_id: number; olt_name: string; count: number }[];
}

const SEVERITY_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  critical: { icon: <AlertTriangle size={14} className="text-danger" />, color: 'text-danger' },
  warning: { icon: <AlertTriangle size={14} className="text-warning" />, color: 'text-warning' },
  info: { icon: <Check size={14} className="text-info" />, color: 'text-info' },
};

const TYPE_CONFIG: Record<NotifType, { icon: typeof ShieldAlert; label: string; badgeClass: string; iconActiveClass: string; headerClass: string }> = {
  alarm: { icon: ShieldAlert, label: 'Network Alarms', badgeClass: 'bg-danger', iconActiveClass: 'text-danger', headerClass: 'text-danger' },
  unregister: { icon: Plug, label: 'Unregistered ONUs', badgeClass: 'bg-warning', iconActiveClass: 'text-warning', headerClass: 'text-warning' },
  general: { icon: Bell, label: 'Notifications', badgeClass: 'bg-accent', iconActiveClass: 'text-accent', headerClass: 'text-accent' },
};

function NotifDropdown({
  type, notifs, unregData, onClose, onNavigate,
}: {
  type: NotifType;
  notifs: NotifItem[];
  unregData?: UnregData;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const qc = useQueryClient();
  const TypeIcon = TYPE_CONFIG[type].icon;

  const markReadMut = useMutation({
    mutationFn: async (id: number) => fetch(`/api/notifications/${id}/read`, { method: 'POST', credentials: 'include' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllMut = useMutation({
    mutationFn: async () => fetch(`/api/notifications/read-all?type=${type}`, { method: 'POST', credentials: 'include' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const ackMut = useMutation({
    mutationFn: async (id: number) => fetch(`/api/notifications/${id}/acknowledge`, { method: 'POST', credentials: 'include' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const ackAllMut = useMutation({
    mutationFn: async () => fetch(`/api/notifications/acknowledge-all?type=${type}`, { method: 'POST', credentials: 'include' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const clearReadMut = useMutation({
    mutationFn: async () => fetch('/api/notifications/clear', { method: 'POST', credentials: 'include' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unreadCount = notifs.filter(n => !n.is_read).length;

  // Map notification category to AllOnus status filter
  const categoryToStatus: Record<string, string> = {
    offline: 'offline',
    offline_batch: 'offline',
    dyinggasp: 'dyinggasp',
    dyinggasp_batch: 'dyinggasp',
    los: 'los',
    los_batch: 'los',
    signal: 'los',
    signal_drop: 'los',
    signal_drop_batch: 'los',
  };

  const handleNotifClick = (n: NotifItem) => {
    if (!n.is_read) markReadMut.mutate(n.id);
    if (type === 'alarm') {
      const status = categoryToStatus[n.category];
      if (status) {
        onClose();
        onNavigate(`/dashboard/onus?filter=${status}`);
      }
    } else if (type === 'unregister') {
      onClose();
      onNavigate('/dashboard/onus/register');
    }
  };

  return (
    <div className="fixed md:absolute left-2 right-2 md:left-auto md:right-0 top-14 md:top-12 w-auto md:w-96 max-h-[80vh] md:max-h-[75vh] rounded-2xl z-50 animate-fade-in overflow-hidden flex flex-col shadow-2xl shadow-black/40 border border-brd"
      style={{ background: 'var(--bg-surface)', backdropFilter: 'blur(20px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-brd">
        <div className="flex items-center gap-2">
          <TypeIcon size={16} className={TYPE_CONFIG[type].headerClass} />
          <span className="font-semibold text-sm">{TYPE_CONFIG[type].label}</span>
          {unreadCount > 0 && (
            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold text-white', TYPE_CONFIG[type].badgeClass)}>{unreadCount}</span>
          )}
        </div>
        <div className="flex gap-1">
          {unreadCount > 0 && (
            <button onClick={() => ackAllMut.mutate()} className="p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-success transition-colors" title="Acknowledge all">
              <CheckCircle2 size={14} />
            </button>
          )}
          {unreadCount > 0 && (
            <button onClick={() => markAllMut.mutate()} className="p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-accent transition-colors" title="Mark all read">
              <Check size={14} />
            </button>
          )}
          <button onClick={() => clearReadMut.mutate()} className="p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-danger transition-colors" title="Clear read">
            <Trash2 size={14} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-glass text-tx3 hover:text-tx1 transition-colors" title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Unregister: show breakdown + quick register link */}
      {type === 'unregister' && unregData && unregData.unregistered > 0 && (
        <div
          onClick={() => { onClose(); onNavigate('/dashboard/onus/register'); }}
          className="px-4 py-3 bg-warning/10 border-b border-warning/20 cursor-pointer hover:bg-warning/15 transition-colors group"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-warning/20 flex items-center justify-center flex-shrink-0">
              <Plug size={16} className="text-warning" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-warning">{unregData.unregistered} Unregistered ONU{unregData.unregistered > 1 ? 's' : ''}</div>
              <div className="text-xs text-tx3 mt-0.5">Tap to register now</div>
            </div>
            <ArrowRight size={16} className="text-warning/50 group-hover:text-warning group-hover:translate-x-1 transition-all" />
          </div>
          {unregData.breakdown.slice(0, 3).map((b, i) => (
            <div key={i} className="text-xs text-tx3 mt-1.5 pl-10">{b.olt_name}: {b.count} ONU(s)</div>
          ))}
        </div>
      )}

      {/* Alarm: show offline/dyinggasp/los summary as separate clickable rows */}
      {type === 'alarm' && unregData && unregData.offline_dyinggasp > 0 && (
        <div className="border-b border-brd/50">
          {unregData.dyinggasp_count > 0 && (
            <div
              onClick={() => { onClose(); onNavigate('/dashboard/onus?filter=dyinggasp'); }}
              className="px-4 py-2.5 bg-warning/5 cursor-pointer hover:bg-warning/10 transition-colors group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-warning/15 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={14} className="text-warning" />
                </div>
                <div className="flex-1">
                  <span className="text-xs font-medium text-warning">{unregData.dyinggasp_count} ONU{unregData.dyinggasp_count > 1 ? 's' : ''} DyingGasp</span>
                </div>
                <ArrowRight size={14} className="text-warning/50 group-hover:text-warning group-hover:translate-x-1 transition-all" />
              </div>
            </div>
          )}
          {unregData.offline_count > 0 && (
            <div
              onClick={() => { onClose(); onNavigate('/dashboard/onus?filter=offline'); }}
              className="px-4 py-2.5 bg-danger/5 cursor-pointer hover:bg-danger/10 transition-colors group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-danger/15 flex items-center justify-center flex-shrink-0">
                  <WifiOff size={14} className="text-danger" />
                </div>
                <div className="flex-1">
                  <span className="text-xs font-medium text-danger">{unregData.offline_count} ONU{unregData.offline_count > 1 ? 's' : ''} Offline</span>
                </div>
                <ArrowRight size={14} className="text-danger/50 group-hover:text-danger group-hover:translate-x-1 transition-all" />
              </div>
            </div>
          )}
          {unregData.los_count > 0 && (
            <div
              onClick={() => { onClose(); onNavigate('/dashboard/onus?filter=los'); }}
              className="px-4 py-2.5 bg-danger/5 cursor-pointer hover:bg-danger/10 transition-colors group"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-danger/15 flex items-center justify-center flex-shrink-0">
                  <XCircle size={14} className="text-danger" />
                </div>
                <div className="flex-1">
                  <span className="text-xs font-medium text-danger">{unregData.los_count} ONU{unregData.los_count > 1 ? 's' : ''} LOS</span>
                </div>
                <ArrowRight size={14} className="text-danger/50 group-hover:text-danger group-hover:translate-x-1 transition-all" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notification list */}
      <div className="overflow-y-auto flex-1 max-h-[55vh] md:max-h-[50vh] overscroll-contain">
        {notifs.length === 0 ? (
          <div className="py-10 text-center">
            <TypeIcon size={28} className="text-tx3/40 mx-auto mb-2" />
            <p className="text-tx3 text-sm">No {TYPE_CONFIG[type].label.toLowerCase()}</p>
          </div>
        ) : (
          notifs.map((n) => {
            const sev = n.severity || 'info';
            const sc = SEVERITY_CONFIG[sev] || SEVERITY_CONFIG.info;
            const isAcked = n.acknowledged;
            return (
              <div
                key={n.id}
                onClick={() => handleNotifClick(n)}
                className={cn(
                  'px-4 py-3 border-b border-brd/50 cursor-pointer hover:bg-glass/50 transition-colors group',
                  !n.is_read && 'bg-accent/5',
                  isAcked && 'opacity-60'
                )}
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex-shrink-0">{sc.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{n.title}</span>
                      {isAcked && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-success/15 text-success flex-shrink-0">
                          <CheckCircle2 size={9} /> ACK
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-tx3 mt-0.5 line-clamp-2">{n.message.split('\n')[0]}</div>
                    <div className="text-[10px] text-tx3/70 mt-1 flex items-center gap-2">
                      <span>{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</span>
                      {isAcked && n.acknowledged_by && <span className="text-success/70">by {n.acknowledged_by}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    {!n.is_read && <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
                    {!isAcked && (
                      <button
                        onClick={(e) => { e.stopPropagation(); ackMut.mutate(n.id); }}
                        className="p-1 rounded hover:bg-success/15 text-tx3 hover:text-success transition-colors opacity-0 group-hover:opacity-100"
                        title="Acknowledge"
                      >
                        <CheckCircle2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [showMenu, setShowMenu] = useState(false);
  const [openNotif, setOpenNotif] = useState<NotifType | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const notifRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: notifData } = useQuery<NotifData>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const r = await fetch('/api/notifications?limit=50', { credentials: 'include' });
      if (!r.ok) return { notifications: [], unread_count: 0, alarm_unread: 0, unregister_unread: 0, general_unread: 0 };
      return r.json();
    },
    refetchInterval: 10000,
  });

  // WebSocket listener — real-time alert push from backend
  const { lastMessage: alertWsMsg } = useWebSocket('/ws/dashboard', { reconnect: true });
  useEffect(() => {
    if (alertWsMsg && alertWsMsg.event === 'alert') {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['unregistered-count'] });
    }
  }, [alertWsMsg, qc]);

  const { data: unregData } = useQuery<UnregData>({
    queryKey: ['unregistered-count'],
    queryFn: async () => {
      const r = await fetch('/api/unregistered-count', { credentials: 'include' });
      if (!r.ok) return { unregistered: 0, offline_dyinggasp: 0, breakdown: [] };
      return r.json();
    },
    refetchInterval: 60000,
  });

  const allNotifs = notifData?.notifications || [];
  const alarmUnread = notifData?.alarm_unread || 0;
  const unregUnread = notifData?.unregister_unread || 0;
  const generalUnread = notifData?.general_unread || 0;

  // Also add unregistered ONU count from separate API to unregister badge
  const unregCount = unregData?.unregistered || 0;
  const unregisterBadge = unregUnread + unregCount;

  // Filter notifications by type for each dropdown
  const alarmNotifs = useMemo(() => allNotifs.filter(n => n.type === 'alarm'), [allNotifs]);
  const unregNotifs = useMemo(() => allNotifs.filter(n => n.type === 'unregister'), [allNotifs]);
  const generalNotifs = useMemo(() => allNotifs.filter(n => n.type === 'general'), [allNotifs]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setOpenNotif(null);
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  const renderNotifIcon = (type: NotifType, badge: number) => {
    const cfg = TYPE_CONFIG[type];
    const Icon = cfg.icon;
    const isOpen = openNotif === type;
    return (
      <button
        key={type}
        onClick={() => setOpenNotif(isOpen ? null : type)}
        className={cn('relative p-2 rounded-lg hover:bg-glass transition-all active:scale-95', isOpen && 'bg-glass')}
        title={cfg.label}
      >
        <Icon size={18} className={cn('text-tx2 transition-colors', isOpen && cfg.iconActiveClass)} />
        {badge > 0 && (
          <div className={cn(
            'absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center animate-pulse-once',
            cfg.badgeClass
          )}>
            {badge > 99 ? '99+' : badge}
          </div>
        )}
      </button>
    );
  };

  return (
    <header className="sticky top-0 z-30 h-14 md:h-16 flex items-center justify-between px-3 md:px-6 bg-surface/80 backdrop-blur-xl border-b border-brd transition-colors duration-300">
      <div className="flex items-center gap-2">
        <button onClick={onMenuClick} className="p-2 rounded-lg hover:bg-glass transition-colors lg:hidden active:scale-95">
          <Menu size={20} className="text-tx2" />
        </button>
        <div className="flex items-center gap-1.5 lg:hidden">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
            <Zap size={15} className="text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight">{user?.sidebar_name || 'Salfanet NMS'}</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {user?.subscription && !user.subscription.is_active && (
          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-danger/10 text-danger text-xs font-medium">
            <AlertTriangle size={14} /> Subscription Expired
          </span>
        )}
        {user?.subscription && user.subscription.is_active && user.subscription.days_remaining <= 7 && (
          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-warning/10 text-warning text-xs font-medium">
            <AlertTriangle size={14} /> {user.subscription.days_remaining}d left
          </span>
        )}
        {user?.subscription && user.subscription.is_active && user.subscription.days_remaining > 7 && (
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-success/10 text-success text-xs font-medium">
            <Package size={13} /> {user.subscription.package_name} · {user.subscription.days_remaining}d
          </span>
        )}
        <button onClick={toggle} title={theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
          className="p-2 rounded-lg hover:bg-glass transition-all duration-300 text-tx2 hover:text-tx1 active:scale-95">
          <span className="block transition-transform duration-300 ease-in-out" style={{ transform: theme === 'dark' ? 'rotate(0deg)' : 'rotate(180deg)' }}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </span>
        </button>

        {/* Notification Icons — 3 separate categories */}
        <div className="relative flex items-center gap-0.5" ref={notifRef}>
          {renderNotifIcon('alarm', alarmUnread)}
          {renderNotifIcon('unregister', unregisterBadge)}
          {renderNotifIcon('general', generalUnread)}

          {openNotif === 'alarm' && (
            <NotifDropdown type="alarm" notifs={alarmNotifs} unregData={unregData} onClose={() => setOpenNotif(null)} onNavigate={handleNavigate} />
          )}
          {openNotif === 'unregister' && (
            <NotifDropdown type="unregister" notifs={unregNotifs} unregData={unregData} onClose={() => setOpenNotif(null)} onNavigate={handleNavigate} />
          )}
          {openNotif === 'general' && (
            <NotifDropdown type="general" notifs={generalNotifs} unregData={unregData} onClose={() => setOpenNotif(null)} onNavigate={handleNavigate} />
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-2 p-1.5 pr-2 rounded-lg hover:bg-glass transition-colors active:scale-95"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent/30 to-accent/10 flex items-center justify-center ring-1 ring-accent/20">
              <User size={16} className="text-accent" />
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-sm font-medium leading-tight">{user?.full_name || 'Admin'}</div>
              <div className="text-[10px] text-tx3 leading-tight">{user?.role || 'User'}</div>
            </div>
          </button>

          {showMenu && (
            <div className="absolute right-0 top-12 w-52 py-1.5 glass-card rounded-xl z-50 animate-fade-in shadow-2xl shadow-black/20">
              <div className="px-4 py-2.5 border-b border-brd">
                <div className="text-sm font-medium">{user?.full_name || 'Admin'}</div>
                <div className="text-xs text-tx3">{user?.username || ''}</div>
                {user?.is_super_admin && (
                  <div className="text-[10px] text-accent font-medium mt-0.5">Super Admin</div>
                )}
                {user?.subscription && (
                  <div className="text-[10px] mt-0.5">
                    <span className={user.subscription.is_active ? 'text-success' : 'text-danger'}>
                      {user.subscription.package_name} — {user.subscription.is_active ? `${user.subscription.days_remaining}d left` : 'Expired'}
                    </span>
                  </div>
                )}
              </div>
              <button onClick={() => { setShowMenu(false); navigate('/dashboard/profile'); }} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-glass transition-colors">
                <User size={16} className="text-tx3" /> My Profile
              </button>
              <hr className="border-brd my-1" />
              <button
                onClick={() => logout()}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors"
              >
                <LogOut size={16} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
