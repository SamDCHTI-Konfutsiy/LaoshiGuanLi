import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { HOME_BY_ROLE } from '@/utils/roleHome';

export function RoleRedirect() {
  const { profile } = useAuth();
  if (!profile) return null;
  return <Navigate to={HOME_BY_ROLE[profile.role]} replace />;
}
