import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { loadGradebook, type GradebookData } from '@/features/gradebook/service';
import { buildCsv, downloadCsv } from '@/utils/csv';

export function GradebookPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { t } = useTranslation();
  const [data, setData] = useState<GradebookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    loadGradebook(courseId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const manualByStudent = useMemo(() => {
    const map = new Map<string, { earned: number; possible: number }>();
    if (!data) return map;
    for (const g of data.manualGrades) {
      const prev = map.get(g.studentId) ?? { earned: 0, possible: 0 };
      map.set(g.studentId, { earned: prev.earned + g.score, possible: prev.possible + g.maxScore });
    }
    return map;
  }, [data]);

  function rowTotal(studentUid: string): { earned: number; possible: number } {
    if (!data) return { earned: 0, possible: 0 };
    let earned = 0;
    let possible = 0;
    for (const hw of data.homework) {
      const score = data.homeworkScores[hw.id]?.[studentUid];
      if (score !== undefined) {
        earned += score;
        possible += hw.maxScore;
      }
    }
    for (const quiz of data.quizzes) {
      const score = data.quizScores[quiz.id]?.[studentUid];
      if (score !== undefined) {
        earned += score;
        possible += quiz.maxScore;
      }
    }
    const manual = manualByStudent.get(studentUid);
    if (manual) {
      earned += manual.earned;
      possible += manual.possible;
    }
    return { earned, possible };
  }

  function handleExportCsv() {
    if (!data) return;
    const headers = [
      t('auth.name'),
      ...data.homework.map((h) => h.title),
      ...data.quizzes.map((q) => q.title),
      t('gradebook.otherGrades'),
      t('gradebook.average'),
    ];
    const rows = data.students.map((s) => {
      const hwCells = data.homework.map((h) => String(data.homeworkScores[h.id]?.[s.uid] ?? ''));
      const quizCells = data.quizzes.map((q) => String(data.quizScores[q.id]?.[s.uid] ?? ''));
      const manual = manualByStudent.get(s.uid);
      const manualCell = manual ? `${manual.earned}/${manual.possible}` : '';
      const total = rowTotal(s.uid);
      const avgCell = total.possible > 0 ? `${Math.round((total.earned / total.possible) * 100)}%` : '';
      return [s.name, ...hwCells, ...quizCells, manualCell, avgCell];
    });
    downloadCsv('gradebook.csv', buildCsv(headers, rows));
  }

  if (loading) return <Spinner label={t('loading')} />;
  if (error || !data) return <EmptyState title={t('gradebook.loadError')} />;

  const noColumns = data.homework.length === 0 && data.quizzes.length === 0 && data.manualGrades.length === 0;

  return (
    <div className="p-6 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="font-display text-xl font-semibold">{t('gradebook.title')}</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleExportCsv} disabled={data.students.length === 0}>
            {t('gradebook.exportCsv')}
          </Button>
          <Button variant="secondary" onClick={() => window.print()}>
            {t('gradebook.printPdf')}
          </Button>
        </div>
      </div>

      <div className="mt-6 print:mt-0">
        {data.students.length === 0 ? (
          <EmptyState title={t('gradebook.noStudents')} />
        ) : noColumns ? (
          <EmptyState title={t('gradebook.noGradedItems')} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('auth.name')}</Th>
                  {data.homework.map((h) => (
                    <Th key={h.id}>
                      {h.title}
                      <span className="block font-normal text-text-muted">/{h.maxScore}</span>
                    </Th>
                  ))}
                  {data.quizzes.map((q) => (
                    <Th key={q.id}>
                      {q.title}
                      <span className="block font-normal text-text-muted">/{q.maxScore}</span>
                    </Th>
                  ))}
                  {data.manualGrades.length > 0 && <Th>{t('gradebook.otherGrades')}</Th>}
                  <Th>{t('gradebook.average')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.students.map((s) => {
                  const manual = manualByStudent.get(s.uid);
                  const total = rowTotal(s.uid);
                  return (
                    <Tr key={s.uid}>
                      <Td className="font-medium">{s.name}</Td>
                      {data.homework.map((h) => (
                        <Td key={h.id}>{data.homeworkScores[h.id]?.[s.uid] ?? '—'}</Td>
                      ))}
                      {data.quizzes.map((q) => (
                        <Td key={q.id}>{data.quizScores[q.id]?.[s.uid] ?? '—'}</Td>
                      ))}
                      {data.manualGrades.length > 0 && (
                        <Td>{manual ? `${manual.earned}/${manual.possible}` : '—'}</Td>
                      )}
                      <Td className="font-medium">
                        {total.possible > 0 ? `${Math.round((total.earned / total.possible) * 100)}%` : '—'}
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
