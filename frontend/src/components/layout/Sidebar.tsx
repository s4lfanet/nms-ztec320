import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Server, Radio,
  Sliders, ChevronDown, ChevronRight, ChevronLeft, X, Zap, FileText, ScrollText, Activity, BookOpen
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../stores/auth';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path?: string;
  permission?: string;
  children?: { label: string; path: string; permission?: string }[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/dashboard', permission: 'view_dashboard' },
  {
    label: 'ONU', icon: <Radio size={20} />, permission: 'view_dashboard',
    children: [
      { label: 'All ONUs', path: '/dashboard/onus' },
      { label: 'Unconfigured', path: '/dashboard/onus/unconfigured', permission: 'add_onu' },
      { label: 'Provision ONU', path: '/dashboard/onus/provision', permission: 'add_onu' },
      { label: 'Pre-config ONT', path: '/dashboard/onus/pre-config', permission: 'add_onu' },
      { label: 'Register Wizard', path: '/dashboard/onus/register', permission: 'add_onu' },
    ],
  },
  {
    label: 'Templates', icon: <FileText size={20} />, permission: 'manage_templates',
    children: [
      { label: 'Templates', path: '/dashboard/templates', permission: 'manage_templates' },
      { label: 'TR069 Profile', path: '/dashboard/templates/tr069-profile', permission: 'manage_tr069' },
    ],
  },
  { label: 'Traffic', icon: <Activity size={20} />, path: '/dashboard/traffic', permission: 'view_dashboard' },
  {
    label: 'Infrastructure', icon: <Server size={20} />, permission: 'view_dashboard',
    children: [
      { label: 'OLT Settings', path: '/dashboard/settings/olts', permission: 'settings_ip_olts' },
      { label: 'FTTH Overview', path: '/dashboard/ftth', permission: 'view_dashboard' },
      { label: 'PON Ports', path: '/dashboard/ftth?tab=pon', permission: 'view_dashboard' },
      { label: 'OTB/ODF', path: '/dashboard/ftth?tab=otb', permission: 'view_dashboard' },
      { label: 'ODC', path: '/dashboard/ftth?tab=odc', permission: 'view_dashboard' },
      { label: 'ODP', path: '/dashboard/ftth?tab=odp', permission: 'view_dashboard' },
      { label: 'FTTH Map', path: '/dashboard/ftth?tab=map', permission: 'view_dashboard' },
    ],
  },
  {
    label: 'System', icon: <Sliders size={20} />, permission: undefined,
    children: [
      { label: 'Customization', path: '/dashboard/customization', permission: 'customization' },
      { label: 'User Management', path: '/dashboard/users', permission: 'manage_users' },
      { label: 'Alert Settings', path: '/dashboard/settings/alerts', permission: 'customization' },
      { label: 'Cloudflare Tunnel', path: '/dashboard/settings/cloudflare', permission: 'customization' },
      { label: 'Alert History', path: '/dashboard/alerts/history' },
    ],
  },
  { label: 'Panduan', icon: <BookOpen size={20} />, path: '/dashboard/guide' },
  { label: 'Activity Log', icon: <ScrollText size={20} />, path: '/dashboard/logs', permission: 'manage_users' },
];

function buildVisibleItems(user: { is_super_admin?: boolean; permissions?: string[] } | null): NavItem[] {
  if (!user) return [];
  const userPerms = new Set(user.permissions || []);
  const hasPerm = (perm?: string) => {
    if (!perm) return true;
    if (user.is_super_admin) return true;
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const brandName = user?.sidebar_name || 'Salfanet NMS';
  const userPerms = new Set(user?.permissions || []);
  const hasPerm = (perm?: string) => {
    if (!perm) return true;
    if (user?.is_super_admin) return true;
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
        initial[item.label] = true;
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
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                <Zap size={18} className="text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight truncate">{brandName}</span>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
              <Zap size={18} className="text-white" />
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
            <div key={item.label} className="mb-1">
              {item.path ? (
                <NavLink
                  to={item.path}
                  onClick={onMobileClose}
                  title={!isExpanded ? item.label : undefined}
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                    isActive
                      ? 'bg-accent/15 text-accent border border-accent/20'
                      : 'text-tx2 hover:text-tx1 hover:bg-glass',
                    !isExpanded && 'justify-center px-2',
                  )}
                >
                  {item.icon}
                  {isExpanded && <span>{item.label}</span>}
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
                        toggleMenu(item.label);
                      }
                    }}
                    title={!isExpanded ? item.label : undefined}
                    className={cn(
                      'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                      'text-tx2 hover:text-tx1 hover:bg-glass',
                      !isExpanded && 'justify-center px-2',
                    )}
                  >
                    {item.icon}
                    {isExpanded && (
                      <>
                        <span className="flex-1 text-left">{item.label}</span>
                        {openMenus[item.label] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </>
                    )}
                  </button>
                  {isExpanded && openMenus[item.label] && item.children && (
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
                          <span>{child.label}</span>
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
          <div className="px-4 py-3 border-t border-brd">
            <div className="text-xs text-tx3">{brandName} v2.0</div>
          </div>
        )}
      </aside>
    </>
  );
}
