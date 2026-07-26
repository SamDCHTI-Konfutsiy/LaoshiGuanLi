import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useDoc } from '@/hooks/useDoc';
import { useCollection } from '@/hooks/useCollection';
import { collectionRef } from '@/services/repository';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { AttachmentLink } from '@/components/ui/AttachmentLink';
import { gradeSubmission, submissionsQuery } from '@/features/homework/submissions-service';
import { usersQuery } from '@/features/users/service';
import { formatDateTime } from '@/utils/date';
import type { Homework } from '@/types/models';

const homeworkCol = collectionRef<Homework>('homework');

export function SubmissionsPage() {
  const { hwId } = useParams<{ hwId: string }>();
  const { t, i18n } = useTranslation();

  const hwRef = useMemo(() => (hwId ? doc(homeworkCol, hwId) : null), [hwId]);
  const { data: hw, loading: hwLoading } = useDoc(hwRef);
  const sQuery = useMemo(() => (hwId ? submissionsQuery(hwId) : null), [hwId]);
  const { data: submissions, loading: subsLoading } = useCollection(sQuery);
  const stQuery = useMemo(() => usersQuery('student'), []);
  const { data: students } = useCollection(stQuery);

  const studentName = useMemo(() => new Map(students.map((s) => [s.uid, s.name])), [students]);
  const sorted = useMemo(
    () => [...submissions].sort((a, b) => (studentName.get(a.id) ?? '').localeCompare(studentName.get(b.id) ?? '')),
    [submissions, studentName],
  );

  if (hwLoading) return <Spinner label={t('loading')} />;
  if (!hw || !hwId) return <EmptyState title={t('admin.courses.notFound')} />;

  return (
    <div className="p-6">
      <h1 className="font-display text-xl font-semibold">{hw.title}</h1>
      <p className="mt-1 text-sm text-text-muted">
        {t('homework.due', { date: formatDateTime(hw.dueAt, i18n.language) })} · {t('homework.maxScore')}: {hw.maxScore}
      </p>

      <div className="mt-6">
        {subsLoading ? (
          <Spinner label={t('loading')} />
        ) : sorted.length === 0 ? (
          <EmptyState title={t('homework.noSubmissions')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {sorted.map((sub) => (
              <li key={sub.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-medium">{studentName.get(sub.id) ?? sub.id}</h2>
                      {sub.isLate && <Badge tone="amber">{t('homework.submittedLate')}</Badge>}
                    </div>
                    {sub.submittedAt && (
                      <p className="mt-1 text-xs text-text-muted">
                        {formatDateTime(sub.submittedAt, i18n.language)}
                      </p>
                    )}
                    {sub.text && <p className="mt-2 whitespace-pre-wrap text-sm">{sub.text}</p>}
                    {sub.files.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {sub.files.map((f) => (
                          <li key={f.path}>
                            <AttachmentLink name={f.name} path={f.path} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <GradeForm
                  hwId={hwId}
                  studentId={sub.id}
                  maxScore={hw.maxScore}
                  score={sub.score}
                  feedback={sub.feedback}
                  homeworkTitle={hw.title}
                  courseId={hw.courseId}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function GradeForm({
  hwId,
  studentId,
  maxScore,
  score,
  feedback,
  homeworkTitle,
  courseId,
}: {
  hwId: string;
  studentId: string;
  maxScore: number;
  score: number | null;
  feedback: string;
  homeworkTitle: string;
  courseId: string;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const [scoreInput, setScoreInput] = useState(score ?? '');
  const [feedbackInput, setFeedbackInput] = useState(feedback);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!profile || scoreInput === '') return;
    setSaving(true);
    try {
      await gradeSubmission(profile, hwId, studentId, Number(scoreInput), feedbackInput, homeworkTitle, courseId);
      toast.show(t('homework.gradeSaved'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 grid grid-cols-[120px_1fr_auto] items-end gap-3 border-t border-border pt-4">
      <TextField
        label={`${t('homework.score')} / ${maxScore}`}
        type="number"
        min={0}
        max={maxScore}
        value={scoreInput}
        onChange={(e) => setScoreInput(e.target.value === '' ? '' : Number(e.target.value))}
      />
      <TextAreaField
        label={t('homework.feedback')}
        value={feedbackInput}
        onChange={(e) => setFeedbackInput(e.target.value)}
        rows={1}
      />
      <Button loading={saving} disabled={scoreInput === ''} onClick={() => void handleSave()}>
        {t('common.save')}
      </Button>
    </div>
  );
}
