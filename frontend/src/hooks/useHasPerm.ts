import { useAuth } from '../stores/auth';

export function useHasPerm() {
  const { user } = useAuth();
  const perms = new Set(user?.permissions || []);
  const hasPerm = (perm: string): boolean => {
    if (user?.is_super_admin) return true;
    // 'super_admin' is a synthetic permission matching the backend's
    // super_admin_required decorator — only the super admin (or an
    // all_olt role) satisfies it.
    if (perm === 'super_admin') return perms.has('all_olt');
    if (perms.has('all_olt')) return true;
    return perms.has(perm);
  };
  return hasPerm;
}
