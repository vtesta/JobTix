import { useAuth } from '@/hooks/AuthContext';
import type { Role } from '@/config/types';
import type { ReactNode } from 'react';

interface ProtectedProps {
  children: ReactNode;
  /** Minimum clearance required. 'admin' allows owner + admin; 'owner' only owner. */
  minRole?: 'admin' | 'owner';
  /** Allow-list of exact roles, takes precedence over minRole. */
  roles?: Role[];
  /** Shown in place of children when access is denied. */
  fallback?: ReactNode;
}

export function Protected({ children, minRole, roles, fallback = null }: ProtectedProps) {
  const { isAdmin, isOwner, currentMembership } = useAuth();

  if (!currentMembership) return <>{fallback}</>;

  let allowed = true;
  if (roles) {
    allowed = roles.includes(currentMembership.role);
  } else if (minRole === 'owner') {
    allowed = isOwner;
  } else if (minRole === 'admin') {
    allowed = isAdmin;
  }

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
