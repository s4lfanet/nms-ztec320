import { useAuth } from '../stores/auth';

export function useHasPerm() {
  const { user } = useAuth();
  const perms = new Set(user?.permissions || []);
  const hasPerm = (perm: string): boolean => {
    if (user?.is_super_admin) return true;
    if (perms.has('all_olt')) return true;
    return perms.has(perm);
  };
  return hasPerm;
}
