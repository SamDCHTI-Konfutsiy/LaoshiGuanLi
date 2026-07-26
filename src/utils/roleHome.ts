import type { Role } from '@/types/enums';

export const HOME_BY_ROLE: Record<Role, string> = {
  admin: '/admin',
  teacher: '/teacher',
  student: '/student',
};
