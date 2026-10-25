import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Target of the QR code / share link: #/hanzi/a/{assignmentId}.
 * Lives under ProtectedRoute, so a signed-out visitor is sent to /login
 * first and brought back here afterwards (ProtectedRoute passes the path
 * as `state.from`). Then each role lands on its own view of the assignment.
 */
export function HanziDeepLink() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const { profile } = useAuth();
  if (!profile || !assignmentId) return null;
  const to = profile.role === 'student' ? `/student/hanzi/${assignmentId}` : `/${profile.role}/hanzi/assignments/${assignmentId}`;
  return <Navigate to={to} replace />;
}
