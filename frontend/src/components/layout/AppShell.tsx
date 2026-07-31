import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { cn } from '../../lib/utils';
import { LayoutDashboard, Radio, Server, Sliders } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const bottomNavItems = [
  { label: 'Home', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'ONUs', icon: Radio, path: '/dashboard/onus' },
  { label: 'OLT', icon: Server, path: '/dashboard/settings/olts' },
  { label: 'System', icon: Sliders, path: '/dashboard/customization' },
];

export function AppShell() {
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

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] transition-colors duration-300">
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onToggle={() => setCollapsed(!collapsed)} onMobileClose={() => setMobileOpen(false)} />

      <div className={cn(
        'transition-all duration-300 min-h-screen',
        collapsed ? 'lg:ml-[70px]' : 'lg:ml-[260px]',
      )}>
        <Topbar onMenuClick={() => setMobileOpen(!mobileOpen)} />
        <main className="p-3 pb-20 lg:pb-6 md:p-4 lg:p-6 overflow-x-hidden max-w-[100vw]">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-surface/95 backdrop-blur-xl border-t border-brd lg:hidden mobile-bottom-nav">
        <div className="flex items-center justify-around h-14 px-1">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] font-medium transition-all relative',
                  isActive ? 'text-accent' : 'text-tx3',
                )}
              >
                {({ isActive }) => (
                  <>
                    <div className={cn(
                      'relative flex items-center justify-center w-8 h-8 rounded-lg transition-all',
                      isActive ? 'bg-accent/15 scale-105' : 'scale-100',
                    )}>
                      <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                      {item.path === '/dashboard/onus' && unregCount > 0 && (
                        <div className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-warning text-white text-[9px] font-bold flex items-center justify-center">
                          {unregCount > 9 ? '9+' : unregCount}
                        </div>
                      )}
                    </div>
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
