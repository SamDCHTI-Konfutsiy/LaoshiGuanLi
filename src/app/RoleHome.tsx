import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import {
  loadAdminStats,
  loadStudentStats,
  loadTeacherStats,
  type AdminStats,
  type StudentStats,
  type TeacherStats,
} from '@/features/dashboard/service';
import type { UserProfile } from '@/types/models';

function StatCard({ label, value, to }: { label: string; value: number; to?: string }) {
  const content = (
    <div className="rounded-xl border border-border p-4 transition-colors hover:bg-surface-raised">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-text-muted">{label}</p>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

function StatusCard({ label, value, positive, to }: { label: string; value: string; positive: boolean; to?: string }) {
  const content = (
    <div className="rounded-xl border border-border p-4 transition-colors hover:bg-surface-raised">
      <p className={'text-2xl font-semibold ' + (positive ? 'text-teal-500' : 'text-coral-500')}>{value}</p>
      <p className="mt-1 text-sm text-text-muted">{label}</p>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

function AdminHome({ basePath }: { basePath: string }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    void loadAdminStats().then(setStats);
  }, []);

  if (!stats) return <Spinner label={t('loading')} />;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatCard label={t('dashboard.activeStudents')} value={stats.activeStudents} to={`${basePath}/users`} />
      <StatCard label={t('dashboard.activeTeachers')} value={stats.activeTeachers} to={`${basePath}/users`} />
      <StatCard label={t('dashboard.pendingApprovals')} value={stats.pendingApprovals} to={`${basePath}/users`} />
      <StatCard label={t('dashboard.courses')} value={stats.courses} to={`${basePath}/courses`} />
      <StatCard label={t('dashboard.groups')} value={stats.groups} to={`${basePath}/groups`} />
      <StatCard label={t('dashboard.unpaidThisMonth')} value={stats.unpaidThisMonth} to={`${basePath}/payments`} />
    </div>
  );
}

function TeacherHome({ basePath, profile }: { basePath: string; profile: UserProfile }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<TeacherStats | null>(null);

  useEffect(() => {
    void loadTeacherStats(profile).then(setStats);
  }, [profile]);

  if (!stats) return <Spinner label={t('loading')} />;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatCard label={t('dashboard.myCourses')} value={stats.courses} to={`${basePath}/courses`} />
      <StatCard label={t('dashboard.myStudents')} value={stats.students} />
    </div>
  );
}

function StudentHome({ basePath }: { basePath: string }) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [stats, setStats] = useState<StudentStats | null>(null);

  useEffect(() => {
    if (profile) void loadStudentStats(profile).then(setStats);
  }, [profile]);

  if (!stats) return <Spinner label={t('loading')} />;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatCard label={t('dashboard.myCourses')} value={stats.courses} to={`${basePath}/courses`} />
      <StatusCard
        label={t('dashboard.paymentStatus')}
        value={stats.paidThisMonth ? t('payments.paid') : t('payments.unpaid')}
        positive={stats.paidThisMonth}
      />
    </div>
  );
}

export function RoleHome() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  if (!profile) return null;

  const basePath = `/${profile.role}`;

  return (
    <div className="p-6">
      <h1 className="font-display text-xl font-semibold">{t('nav.welcome', { name: profile.name })}</h1>
      <div className="mt-6">
        {profile.role === 'admin' && <AdminHome basePath={basePath} />}
        {profile.role === 'teacher' && <TeacherHome basePath={basePath} profile={profile} />}
        {profile.role === 'student' && <StudentHome basePath={basePath} />}
      </div>
    </div>
  );
}
