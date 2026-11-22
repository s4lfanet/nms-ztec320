import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { cn } from '../../lib/utils';
import { LayoutDashboard, Radio, Server, AlertTriangle, Menu } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DashboardWsProvider } from '../../hooks/useDashboardWs';
import { OfflineBanner } from '../OfflineBanner';
import { ForcePasswordChange } from '../ForcePasswordChange';
import { PushPrompt } from '../PushPrompt';
import { UpdatePrompt } from '../UpdatePrompt';
import { SwUpdateNotice } from '../SwUpdateNotice';

// Navigasi bawah HP (redesign Fase 1): Gangguan langsung terjangkau dari
// lapangan, "Lainnya" membuka menu samping (semua halaman lain, termasuk
// Customization yang dulu ada di sini).
const PROBLEMS_PATH = '/dashboard/onus?filter=problem';
const bottomNavItems = [
  { labelKey: 'nav.home', icon: LayoutDashboard, path: '/dashboard', end: true },
  { labelKey: 'nav.allOnus', icon: Radio, path: '/dashboard/onus', end: true },
  { labelKey: 'nav.problems', icon: AlertTriangle, path: PROBLEMS_PATH, end: true },
  { labelKey: 'nav.olt', icon: Server, path: '/dashboard/settings/olts', end: false },
];

export function AppShell() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1024);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const navItems = bottomNavItems;

  const { data: unregData } = useQuery({
    queryKey: ['unregistered-count'],
    queryFn: async () => {
      const r = await fetch('/api/unregistered-count', { credentials: 'include' });
      if (!r.ok) return { unregistered: 0, offline_dyinggasp: 0, breakdown: [] };
      return r.json();
    },
    refetchInterval: 60000,
  });

  const unregCount = unregData?.unregistered || 0;
  const problemCount = (unregData?.offline_count || 0) + (unregData?.dyinggasp_count || 0) + (unregData?.los_count || 0);
  const onProblems = location.pathname === '/dashboard/onus' && new URLSearchParams(location.search).get('filter') === 'problem';

  return (
    <DashboardWsProvider>
      <div className="min-h-screen bg-[var(--bg-primary)] transition-colors duration-300">
        <OfflineBanner />
        <ForcePasswordChange />
        <PushPrompt />
        <UpdatePrompt />
        <SwUpdateNotice />
        <div className="app-mesh-bg" aria-hidden="true" />

        <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onToggle={() => setCollapsed(!collapsed)} onMobileClose={() => setMobileOpen(false)} />

        <div className={cn(
          'relative z-10 transition-all duration-300 min-h-screen',
          collapsed ? 'lg:ml-[70px]' : 'lg:ml-[260px]',
        )}>
          <Topbar onMenuClick={() => setMobileOpen(!mobileOpen)} />
          <main className="p-3 pb-20 lg:pb-6 md:p-4 lg:p-6 overflow-x-hidden max-w-[100vw]">
            <div key={location.pathname} className="page-enter">
              <Outlet />
            </div>
          </main>
        </div>

        {/* Mobile Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-brd lg:hidden mobile-bottom-nav">
          <div className="flex items-center justify-around h-14 px-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isProblems = item.path === PROBLEMS_PATH;
              const badge = isProblems ? problemCount : item.path === '/dashboard/onus' ? unregCount : 0;
              const badgeCls = isProblems ? 'bg-danger' : 'bg-warning';
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) => {
                    // "Semua ONU" dan "Gangguan" berbagi path; bedakan dari ?filter=problem
                    const active = isProblems ? onProblems : (item.path === '/dashboard/onus' ? isActive && !onProblems : isActive);
                    return cn(
                      'flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-all relative',
                      active ? 'text-accent' : 'text-tx3',
                    );
                  }}
                >
                  {({ isActive }) => {
                    const active = isProblems ? onProblems : (item.path === '/dashboard/onus' ? isActive && !onProblems : isActive);
                    return (
                      <>
                        <div className={cn(
                          'relative flex items-center justify-center w-8 h-8 rounded-lg transition-all',
                          active ? 'bg-accent/15 scale-105' : 'scale-100',
                        )}>
                          <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                          {badge > 0 && (
                            <div className={cn('absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center', badgeCls)}>
                              {badge > 99 ? '99+' : badge}
                            </div>
                          )}
                        </div>
                        <span>{t(item.labelKey)}</span>
                      </>
                    );
                  }}
                </NavLink>
              );
            })}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-expanded={mobileOpen}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-all',
                mobileOpen ? 'text-accent' : 'text-tx3',
              )}
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg">
                <Menu size={20} strokeWidth={1.8} />
              </div>
              <span>{t('nav.more')}</span>
            </button>
          </div>
        </nav>
      </div>
    </DashboardWsProvider>
  );
}
