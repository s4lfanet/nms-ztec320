import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Server, Radio,
  Sliders, ChevronDown, ChevronRight, ChevronLeft, X, Zap, FileText, ScrollText, Activity, BookOpen, MonitorSmartphone, Terminal as TerminalIcon, Heart
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { useAuth } from '../../stores/auth';

interface NavItem {
  labelKey: string;
  icon: React.ReactNode;
  path?: string;
  permission?: string;
  children?: { labelKey: string; path: string; permission?: string }[];
}

const navItems: NavItem[] = [
  { labelKey: 'nav.dashboard', icon: <LayoutDashboard size={20} />, path: '/dashboard', permission: 'view_dashboard' },
  {
    labelKey: 'nav.onu', icon: <Radio size={20} />, permission: 'view_dashboard',
    children: [
      { labelKey: 'nav.allOnus', path: '/dashboard/onus' },
      { labelKey: 'nav.unconfigured', path: '/dashboard/onus/unconfigured', permission: 'add_onu' },
      { labelKey: 'nav.provision', path: '/dashboard/onus/provision', permission: 'add_onu' },
      { labelKey: 'nav.preconfig', path: '/dashboard/onus/pre-config', permission: 'add_onu' },
      { labelKey: 'nav.registerWizard', path: '/dashboard/onus/register', permission: 'add_onu' },
    ],
  },
  {
    labelKey: 'nav.templates', icon: <FileText size={20} />, permission: 'manage_templates',
    children: [
      { labelKey: 'nav.templates', path: '/dashboard/templates', permission: 'manage_templates' },
      { labelKey: 'nav.tr069Profile', path: '/dashboard/templates/tr069-profile', permission: 'manage_tr069' },
    ],
  },
  { labelKey: 'nav.traffic', icon: <Activity size={20} />, path: '/dashboard/traffic', permission: 'view_dashboard' },
  {
    labelKey: 'nav.infrastructure', icon: <Server size={20} />, permission: 'view_dashboard',
    children: [
      { labelKey: 'nav.oltSettings', path: '/dashboard/settings/olts', permission: 'settings_ip_olts' },
      { labelKey: 'nav.mikrotik', path: '/dashboard/settings/mikrotik', permission: 'settings_ip_olts' },
      { labelKey: 'nav.autoProvision', path: '/dashboard/settings/auto-provision', permission: 'settings_ip_olts' },
      { labelKey: 'nav.ftthOverview', path: '/dashboard/ftth', permission: 'view_dashboard' },
      { labelKey: 'nav.ponPorts', path: '/dashboard/ftth?tab=pon', permission: 'view_dashboard' },
      { labelKey: 'nav.otb', path: '/dashboard/ftth?tab=otb', permission: 'view_dashboard' },
      { labelKey: 'nav.odc', path: '/dashboard/ftth?tab=odc', permission: 'view_dashboard' },
      { labelKey: 'nav.odp', path: '/dashboard/ftth?tab=odp', permission: 'view_dashboard' },
      { labelKey: 'nav.ftthMap', path: '/dashboard/ftth?tab=map', permission: 'view_dashboard' },
    ],
  },
  {
    labelKey: 'nav.system', icon: <Sliders size={20} />, permission: undefined,
    children: [
      { labelKey: 'nav.customization', path: '/dashboard/customization', permission: 'customization' },
      { labelKey: 'nav.users', path: '/dashboard/users', permission: 'manage_users' },
      { labelKey: 'nav.alertSettings', path: '/dashboard/settings/alerts', permission: 'customization' },
      { labelKey: 'nav.cloudflare', path: '/dashboard/settings/cloudflare', permission: 'super_admin' },
      { labelKey: 'nav.systemUpdate', path: '/dashboard/settings/update', permission: 'super_admin' },
      { labelKey: 'nav.alertHistory', path: '/dashboard/alerts/history', permission: 'view_dashboard' },
    ],
  },
  { labelKey: 'nav.guide', icon: <BookOpen size={20} />, path: '/dashboard/guide' },
  { labelKey: 'nav.activityLog', icon: <ScrollText size={20} />, path: '/dashboard/logs', permission: 'manage_users' },
  { labelKey: 'nav.oltLogs', icon: <MonitorSmartphone size={20} />, path: '/dashboard/olt-logs', permission: 'view_dashboard' },
  { labelKey: 'nav.reports', icon: <FileText size={20} />, path: '/dashboard/reports', permission: 'view_onus' },
  { labelKey: 'nav.terminal', icon: <TerminalIcon size={20} />, path: '/dashboard/terminal', permission: 'olt_terminal' },
];

function buildVisibleItems(user: { is_super_admin?: boolean; permissions?: string[] } | null): NavItem[] {
  if (!user) return [];
  const userPerms = new Set(user.permissions || []);
  const hasPerm = (perm?: string) => {
    if (!perm) return true;
    if (user.is_super_admin) return true;
    // 'super_admin' is a synthetic permission matching the backend's
    // super_admin_required decorator — only the super admin (or an
    // all_olt role) satisfies it. No regular permission string grants it.
    if (perm === 'super_admin') return userPerms.has('all_olt');
    if (userPerms.has('all_olt')) return true;
    return userPerms.has(perm);
  };

  let items: NavItem[] = navItems.map(item => ({ ...item, children: item.children?.map(c => ({ ...c })) }));

  items = items.filter(item => {
    if (!hasPerm(item.permission)) return false;
    if (item.children) return item.children.some(c => hasPerm(c.permission));
    return true;
  });

  return items;
}

export function Sidebar({ collapsed, mobileOpen, onToggle, onMobileClose }: { collapsed: boolean; mobileOpen: boolean; onToggle: () => void; onMobileClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const brandName = user?.sidebar_name || 'Salfanet NMS';
  const userPerms = new Set(user?.permissions || []);
  const hasPerm = (perm?: string) => {
    if (!perm) return true;
    if (user?.is_super_admin) return true;
    if (perm === 'super_admin') return userPerms.has('all_olt');
    if (userPerms.has('all_olt')) return true;
    return userPerms.has(perm);
  };
  const visibleItems = buildVisibleItems(user);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() => {
    // Auto-expand parent menu that contains current route
    const initial: Record<string, boolean> = {};
    const path = window.location.pathname;
    for (const item of visibleItems) {
      if (item.children?.some(c => path.startsWith(c.path.split('?')[0]))) {
        initial[item.labelKey] = true;
      }
    }
    return initial;
  });

  const toggleMenu = (label: string) => {
    setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  // On mobile, sidebar is always expanded when open
  const isExpanded = mobileOpen || !collapsed;

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onMobileClose} />
      )}

      <aside className={cn(
        'sidebar-panel fixed top-0 left-0 h-full z-50 flex flex-col transition-transform duration-300 ease-in-out',
        'bg-surface/95 backdrop-blur-xl border-r border-brd',
        collapsed ? 'lg:w-[70px]' : 'lg:w-[260px]',
        'w-[260px]',
        mobileOpen ? 'sidebar-open' : 'sidebar-closed',
      )}>
        {/* Logo */}
        <div className={cn('flex items-center h-16 px-4 border-b border-brd', isExpanded ? 'justify-between' : 'justify-center')}>
          {isExpanded ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden',
                user?.logo_url ? 'bg-white p-1' : 'bg-accent',
              )}>
                {user?.logo_url ? <img src={user.logo_url} alt={brandName} className="w-full h-full object-contain" /> : <Zap size={18} className="text-white" />}
              </div>
              <span className="text-lg font-bold tracking-tight truncate">{brandName}</span>
            </div>
          ) : (
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden',
              user?.logo_url ? 'bg-white p-1' : 'bg-accent',
            )}>
              {user?.logo_url ? <img src={user.logo_url} alt={brandName} className="w-full h-full object-contain" /> : <Zap size={18} className="text-white" />}
            </div>
          )}
          {/* Desktop collapse toggle */}
          {isExpanded && (
            <button onClick={onToggle} className="p-1.5 rounded-lg hover:bg-glass transition-colors max-lg:hidden flex-shrink-0">
              <ChevronLeft size={18} />
            </button>
          )}
          {/* Mobile close button */}
          {isExpanded && (
            <button onClick={onMobileClose} className="p-1.5 rounded-lg hover:bg-glass transition-colors lg:hidden flex-shrink-0">
              <X size={18} />
            </button>
          )}
        </div>
        {/* Expand button when collapsed (desktop only) */}
        {!isExpanded && (
          <button onClick={onToggle} className="hidden lg:flex items-center justify-center w-full py-2 text-tx3 hover:text-tx1 hover:bg-glass transition-colors border-b border-brd">
            <ChevronRight size={18} />
          </button>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {visibleItems.map(item => (
            <div key={item.labelKey} className="mb-1">
              {item.path ? (
                <NavLink
                  to={item.path}
                  onClick={onMobileClose}
                  title={!isExpanded ? t(item.labelKey) : undefined}
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                    isActive
                      ? 'bg-accent/15 text-accent border border-accent/20'
                      : 'text-tx2 hover:text-tx1 hover:bg-glass',
                    !isExpanded && 'justify-center px-2',
                  )}
                >
                  {item.icon}
                  {isExpanded && <span>{t(item.labelKey)}</span>}
                </NavLink>
              ) : (
                <>
                  <button
                    onClick={() => {
                      const visibleChildren = item.children?.filter(c => hasPerm(c.permission)) || [];
                      if (!isExpanded && visibleChildren.length) {
                        navigate(visibleChildren[0].path);
                        onMobileClose();
                      } else {
                        toggleMenu(item.labelKey);
                      }
                    }}
                    title={!isExpanded ? t(item.labelKey) : undefined}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                      'text-tx2 hover:text-tx1 hover:bg-glass',
                      !isExpanded && 'justify-center px-2',
                    )}
                  >
                    {item.icon}
                    {isExpanded && (
                      <>
                        <span className="flex-1 text-left">{t(item.labelKey)}</span>
                        {openMenus[item.labelKey] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </>
                    )}
                  </button>
                  {isExpanded && openMenus[item.labelKey] && item.children && (
                    <div className="ml-4 mt-1 space-y-0.5 animate-fade-in">
                      {item.children.filter(c => hasPerm(c.permission)).map(child => (
                        <NavLink
                          key={child.path}
                          to={child.path}
                          onClick={onMobileClose}
                          className={({ isActive }) => cn(
                            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all',
                            isActive
                              ? 'bg-accent/10 text-accent'
                              : 'text-tx3 hover:text-tx2 hover:bg-glass',
                          )}
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
                          <span>{t(child.labelKey)}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </nav>

        {/* Footer */}
        {isExpanded && (
          <div className="px-4 py-3 border-t border-brd space-y-2">
            <a
              href="https://saweria.co/salfanetradius"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs font-medium text-rose-400 hover:text-rose-300 transition-colors"
            >
              <Heart size={13} className="fill-current" />
              <span>Dukung Project — Saweria</span>
            </a>
            <div className="text-xs text-tx3">{brandName} v2.0</div>
          </div>
        )}
      </aside>
    </>
  );
}
