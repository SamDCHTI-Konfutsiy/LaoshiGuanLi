import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useCollection } from '@/hooks/useCollection';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { SelectField } from '@/components/ui/SelectField';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  announcementsQuery,
  createAnnouncement,
  deleteAnnouncement,
  isInAudience,
  type AnnouncementInput,
} from '@/features/announcements/service';
import { coursesQuery, teachingCoursesQuery } from '@/features/courses/service';
import { groupsQuery } from '@/features/groups/service';
import { formatDateTime } from '@/utils/date';
import { ROLES, type AnnouncementScope, type Role } from '@/types/enums';
import type { Announcement, WithId } from '@/types/models';

export function AnnouncementsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const { t, i18n } = useTranslation();

  const aQuery = useMemo(() => announcementsQuery(), []);
  const { data: announcements, loading } = useCollection(aQuery);
  const cQuery = useMemo(() => coursesQuery(), []);
  const { data: courses } = useCollection(cQuery);
  const courseGroupIds = useMemo(() => new Map(courses.map((c) => [c.id, c.groupIds])), [courses]);
  const courseName = useMemo(() => new Map(courses.map((c) => [c.id, c.title])), [courses]);

  const visible = useMemo(
    () =>
      profile
        ? [...announcements]
            .filter((a) => isInAudience(a, profile, courseGroupIds))
            .sort((a, b) => b.publishAt.toMillis() - a.publishAt.toMillis())
        : [],
    [announcements, profile, courseGroupIds],
  );

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<WithId<Announcement> | null>(null);

  const canCreate = profile?.role === 'admin' || profile?.role === 'teacher';

  async function handleDelete(reason: string) {
    if (!profile || !deleting) return;
    try {
      await deleteAnnouncement(profile, deleting.id, deleting, reason);
      toast.show(t('announcements.deleted'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold">{t('nav.announcements')}</h1>
        {canCreate && <Button onClick={() => setCreating(true)}>{t('announcements.new')}</Button>}
      </div>

      <div className="mt-6">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : visible.length === 0 ? (
          <EmptyState title={t('announcements.empty')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {visible.map((a) => (
              <li key={a.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-medium">{a.title}</h2>
                      <ScopeBadge announcement={a} courseName={courseName} />
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      {a.createdByName} · {formatDateTime(a.publishAt, i18n.language)}
                    </p>
                  </div>
                  {(profile?.role === 'admin' || profile?.uid === a.createdBy) && (
                    <button
                      type="button"
                      onClick={() => setDeleting(a)}
                      className="text-sm font-medium text-coral-500 hover:underline"
                    >
                      {t('common.delete')}
                    </button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-text-muted">{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && profile && <AnnouncementFormModal role={profile.role} onClose={() => setCreating(false)} />}

      {deleting && (
        <ConfirmDialog
          open
          title={t('announcements.deleteTitle')}
          message={t('announcements.deleteMessage', { title: deleting.title })}
          confirmLabel={t('common.delete')}
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function ScopeBadge({
  announcement,
  courseName,
}: {
  announcement: Announcement;
  courseName: Map<string, string>;
}) {
  const { t } = useTranslation();
  if (announcement.audienceScope === 'all') return <Badge tone="steel">{t('announcements.scope.all')}</Badge>;
  if (announcement.audienceScope === 'role' && announcement.audienceRole)
    return <Badge tone="steel">{t(`auth.roles.${announcement.audienceRole}`)}</Badge>;
  if (announcement.audienceScope === 'course')
    return <Badge tone="steel">{courseName.get(announcement.courseId ?? '') ?? t('announcements.scope.course')}</Badge>;
  return <Badge tone="steel">{t('announcements.scope.group')}</Badge>;
}

function AnnouncementFormModal({ role, onClose }: { role: Role; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const isAdmin = role === 'admin';

  const scopeOptions: AnnouncementScope[] = isAdmin ? ['all', 'role', 'course', 'group'] : ['course', 'group'];
  const [scope, setScope] = useState<AnnouncementScope>(scopeOptions[0]!);
  const [audienceRole, setAudienceRole] = useState<Role>('student');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const tQuery = useMemo(() => (isAdmin ? coursesQuery() : profile ? teachingCoursesQuery(profile.uid) : null), [isAdmin, profile]);
  const { data: courses } = useCollection(tQuery);
  const gQuery = useMemo(() => groupsQuery(), []);
  const { data: allGroups } = useCollection(gQuery);

  const [courseId, setCourseId] = useState('');
  const [groupId, setGroupId] = useState('');

  const availableGroups = useMemo(() => {
    if (!courseId) return allGroups;
    const course = courses.find((c) => c.id === courseId);
    return allGroups.filter((g) => course?.groupIds.includes(g.id));
  }, [allGroups, courses, courseId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const input: AnnouncementInput = {
      title,
      body,
      audienceScope: scope,
      audienceRole: scope === 'role' ? audienceRole : null,
      courseId: scope === 'course' ? courseId || null : null,
      groupId: scope === 'group' ? groupId || null : null,
    };
    try {
      await createAnnouncement(profile, input, reason);
      onClose();
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t('announcements.new')}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <TextField label={t('announcements.title')} required value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextAreaField label={t('announcements.body')} required rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        <SelectField label={t('announcements.audience')} value={scope} onChange={(e) => setScope(e.target.value as AnnouncementScope)}>
          {scopeOptions.map((s) => (
            <option key={s} value={s}>
              {t(`announcements.scope.${s}`)}
            </option>
          ))}
        </SelectField>
        {scope === 'role' && (
          <SelectField label={t('auth.role')} value={audienceRole} onChange={(e) => setAudienceRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`auth.roles.${r}`)}
              </option>
            ))}
          </SelectField>
        )}
        {(scope === 'course' || scope === 'group') && (
          <SelectField label={t('admin.courses.title')} required value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="" disabled>
              {t('announcements.selectCourse')}
            </option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </SelectField>
        )}
        {scope === 'group' && courseId && (
          <SelectField label={t('admin.groups.title')} required value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="" disabled>
              {t('announcements.selectGroup')}
            </option>
            {availableGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </SelectField>
        )}
        <TextAreaField label={t('common.reasonOptional')} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving}>
            {t('announcements.publish')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
