import { useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './stores/auth';
import { AppShell } from './components/layout/AppShell';
import { Login } from './pages/Login';

// Lazy-loaded public pages
const LandingPage = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.default })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then(m => ({ default: m.default })));
const PaymentResultPage = lazy(() => import('./pages/PaymentResultPage').then(m => ({ default: m.default })));
const RenewalPage = lazy(() => import('./pages/RenewalPage').then(m => ({ default: m.default })));

// Lazy-loaded dashboard pages
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const AllOnus = lazy(() => import('./pages/AllOnus').then(m => ({ default: m.AllOnus })));
const ViewOnu = lazy(() => import('./pages/ViewOnu').then(m => ({ default: m.ViewOnu })));
const AddOnu = lazy(() => import('./pages/AddOnu').then(m => ({ default: m.AddOnu })));
const OltSettings = lazy(() => import('./pages/OltSettings').then(m => ({ default: m.OltSettings })));
const UserManagement = lazy(() => import('./pages/UserManagement').then(m => ({ default: m.UserManagement })));
const Customization = lazy(() => import('./pages/Customization').then(m => ({ default: m.Customization })));
const RegisterWizard = lazy(() => import('./pages/RegisterWizard').then(m => ({ default: m.RegisterWizard })));
const ProvisionWizard = lazy(() => import('./pages/ProvisionWizard').then(m => ({ default: m.ProvisionWizard })));
const OltConfiguration = lazy(() => import('./pages/OltConfiguration').then(m => ({ default: m.OltConfiguration })));
const MyProfile = lazy(() => import('./pages/MyProfile').then(m => ({ default: m.MyProfile })));
const AlertSettings = lazy(() => import('./pages/AlertSettings').then(m => ({ default: m.AlertSettings })));
const FtthInfrastructure = lazy(() => import('./pages/FtthInfrastructure').then(m => ({ default: m.FtthInfrastructure })));
const Templates = lazy(() => import('./pages/Templates').then(m => ({ default: m.default })));
const Tr069Profile = lazy(() => import('./pages/Tr069Profile').then(m => ({ default: m.default })));
const ActionLogs = lazy(() => import('./pages/ActionLogs').then(m => ({ default: m.ActionLogs })));
const AlertHistoryPage = lazy(() => import('./pages/AlertHistory').then(m => ({ default: m.AlertHistory })));
const Traffic = lazy(() => import('./pages/Traffic').then(m => ({ default: m.Traffic })));

const routePermissions: Record<string, string> = {
  '/dashboard/onus': 'view_onus',
  '/dashboard/onus/add': 'add_onu',
  '/dashboard/onus/register': 'add_onu',
  '/dashboard/onus/provision': 'add_onu',
  '/dashboard/onus/pre-config': 'add_onu',
  '/dashboard/settings/olts': 'settings_ip_olts',
  '/dashboard/customization': 'customization',
  '/dashboard/users': 'manage_users',
  '/dashboard/templates': 'manage_templates',
  '/dashboard/templates/tr069-profile': 'manage_tr069',
  '/dashboard/logs': 'manage_users',
  '/dashboard/settings/alerts': 'customization',
};

const routePatterns: { pattern: RegExp; perm: string }[] = [];

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-8 w-8 text-accent" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-tx3 text-sm">Loading...</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;

  // Check route-specific permission
  const path = window.location.pathname;
  let requiredPerm = routePermissions[path];
  if (!requiredPerm) {
    for (const rp of routePatterns) {
      if (rp.pattern.test(path)) { requiredPerm = rp.perm; break; }
    }
  }
  if (requiredPerm) {
    const userPerms = new Set(user.permissions || []);
    if (!user.is_super_admin && !userPerms.has('all_olt') && !userPerms.has(requiredPerm)) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
}

function TenantNotFound({ reason }: { reason: string }) {
  const isSuspended = reason === 'suspended';
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4">
      <div className="glass-card max-w-md w-full p-8 md:p-12 text-center rounded-2xl">
        <div className="w-16 h-16 rounded-full bg-danger/15 flex items-center justify-center mx-auto mb-5">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-danger">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-tx1 mb-2">{isSuspended ? 'Tenant Suspended' : 'Tenant Not Found'}</h1>
        <p className="text-sm text-tx3 mb-1">{window.location.hostname}</p>
        <p className="text-sm text-tx3 mb-6">{isSuspended ? 'This tenant account has been suspended. Please contact support.' : 'This subdomain does not exist or has been removed.'}</p>
        <a href="https://nms.salfa.my.id/" className="inline-block px-6 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors">Back to Home</a>
      </div>
    </div>
  );
}

export default function App() {
  const { fetchUser } = useAuth();
  const [tenantValid, setTenantValid] = useState<null | { valid: boolean; reason?: string }>(null);

  // Detect if we're on the main domain (landing page) or a tenant subdomain
  const hostname = window.location.hostname;
  const isMainDomain = hostname === 'nms.salfa.my.id' || hostname === 'localhost' || hostname === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname);

  useEffect(() => {
    const path = window.location.pathname || '/';
    const isPublicRoute = path === '/' || path === '/login' || path === '/secure-portal-x7k2' || path === '/register' || path === '/payment-result' || path.startsWith('/renewal/');
    if (!isPublicRoute) {
      fetchUser();
    } else {
      useAuth.setState({ loading: false });
    }
  }, [fetchUser]);

  useEffect(() => {
    if (isMainDomain) { setTenantValid({ valid: true }); return; }
    fetch('/api/public/tenant-check')
      .then(r => r.json())
      .then(d => setTenantValid(d))
      .catch(() => setTenantValid({ valid: true })); // fail open
  }, [isMainDomain]);

  // Show tenant not found / suspended page
  if (!isMainDomain && tenantValid && !tenantValid.valid) {
    return <TenantNotFound reason={tenantValid.reason || 'not_found'} />;
  }

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin h-8 w-8 text-accent" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-tx3 text-sm">Loading...</p>
        </div>
      </div>
    }>
    <Routes>
      {/* Public routes — only on main domain */}
      {isMainDomain && <Route path="/" element={<LandingPage />} />}
      {isMainDomain && <Route path="/register" element={<RegisterPage />} />}
      {/* Tenant subdomain: / redirects to /login */}
      {!isMainDomain && <Route path="/" element={<Navigate to="/login" replace />} />}

      <Route path="/login" element={<Login />} />
      {isMainDomain && <Route path="/secure-portal-x7k2" element={<Login />} />}
      {!isMainDomain && <Route path="/secure-portal-x7k2" element={<Navigate to="/login" replace />} />}
      <Route path="/payment-result" element={<PaymentResultPage />} />
      <Route path="/renewal/:ref" element={<RenewalPage />} />
      {/* Protected routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="onus" element={<AllOnus />} />
        <Route path="onus/add" element={<AddOnu />} />
        <Route path="onus/register" element={<RegisterWizard />} />
        <Route path="onus/provision" element={<ProvisionWizard />} />
        <Route path="onus/pre-config" element={<ProvisionWizard manualMode />} />
        <Route path="onus/:id" element={<ViewOnu />} />
        <Route path="all-onus/view-c3-r/gpon/:oltId/:frame/:slot/:onuNum" element={<ViewOnu />} />
        <Route path="settings/olts" element={<OltSettings />} />
        <Route path="settings/olts/:oltId/config" element={<OltConfiguration />} />
        <Route path="customization" element={<Customization />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="profile" element={<MyProfile />} />
        <Route path="settings/alerts" element={<AlertSettings />} />
        <Route path="alerts/history" element={<AlertHistoryPage />} />
        <Route path="ftth" element={<FtthInfrastructure />} />
        <Route path="templates" element={<Templates />} />
        <Route path="templates/tr069-profile" element={<Tr069Profile />} />
        <Route path="traffic" element={<Traffic />} />
        <Route path="logs" element={<ActionLogs />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
