import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { HOME_BY_ROLE } from '@/utils/roleHome';
import type { Role } from '@/types/enums';

/** Must be rendered under ProtectedRoute — assumes `profile` is present. */
export function RoleGate({ allow }: { allow: Role[] }) {
  const { profile } = useAuth();
  if (!profile) return null;

  if (!allow.includes(profile.role)) {
    return <Navigate to={HOME_BY_ROLE[profile.role]} replace />;
  }

  return <Outlet />;
}
