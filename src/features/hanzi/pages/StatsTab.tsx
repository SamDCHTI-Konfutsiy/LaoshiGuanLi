import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField } from '@/components/ui/SelectField';
import { Button } from '@/components/ui/Button';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { useGroups, useManagedAssignments, useManagedCourses, useManagedSubmissions, useStudents } from '@/features/hanzi/hooks';
import { buildCsv, downloadCsv } from '@/utils/csv';
import type { HanziAssignment, HanziSubmission, WithId } from '@/types/models';

/** Best available score as a 0–100 percentage: the teacher's final score, else the automatic one. */
function percentOf(sub: HanziSubmission, a: HanziAssignment): number | null {
  const score = sub.teacherScore ?? sub.autoResult?.score ?? null;
  if (score === null || a.maxScore <= 0) return null;
  return (score / a.maxScore) * 100;
}

function avg(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((s, x) => s + x, 0) / xs.length;
}

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x)}%`);

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: 'amber' }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className={'text-2xl font-semibold ' + (tone === 'amber' ? 'text-amber-500' : '')}>{value}</p>
      <p className="mt-1 text-sm text-text-muted">{label}</p>
    </div>
  );
}

export function StatsTab() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const { data: assignmentsAll, loading } = useManagedAssignments(profile);
  const { data: submissionsAll } = useManagedSubmissions(profile);
  const { data: courses } = useManagedCourses(profile);
  const { data: groups } = useGroups();
  const { byId: students } = useStudents();
  const [courseId, setCourseId] = useState('all');
  const [groupId, setGroupId] = useState('all');

  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  const stats = useMemo(() => {
    const assignments = assignmentsAll
      .filter((a) => a.status !== 'draft')
      .filter((a) => courseId === 'all' || a.courseId === courseId)
      .filter((a) => groupId === 'all' || a.groupIds.includes(groupId));
    const aById = new Map(assignments.map((a) => [a.id, a]));
    const inGroup = (studentId: string, a: HanziAssignment) => {
      if (groupId === 'all') return true;
      return (students.get(studentId)?.groupIds ?? []).includes(groupId) && a.groupIds.includes(groupId);
    };
    const subs = submissionsAll.filter((s) => {
      const a = aById.get(s.assignmentId);
      return a ? inGroup(s.studentId, a) : false;
    });
    const subKey = new Map(subs.map((s) => [`${s.assignmentId}_${s.studentId}`, s]));

    // Every (assignment, targeted student) pair is one expected piece of work.
    const pairs: { a: WithId<HanziAssignment>; studentId: string; sub: HanziSubmission | undefined }[] = [];
    for (const a of assignments) {
      for (const sid of a.targetStudentIds) {
        if (!inGroup(sid, a)) continue;
        pairs.push({ a, studentId: sid, sub: subKey.get(`${a.id}_${sid}`) });
      }
    }
    const sent = pairs.filter((p) => p.sub && p.sub.status !== 'draft');
    const unreviewed = sent.filter((p) => p.sub!.status === 'submitted' || p.sub!.status === 'in_review').length;
    const percents = sent.map((p) => percentOf(p.sub!, p.a)).filter((x): x is number => x !== null);

    const perAssignment = assignments
      .map((a) => {
        const ps = pairs.filter((p) => p.a.id === a.id);
        const done = ps.filter((p) => p.sub && p.sub.status !== 'draft');
        return {
          id: a.id,
          title: a.title,
          targets: ps.length,
          sent: done.length,
          reviewed: done.filter((p) => p.sub!.status === 'reviewed').length,
          avg: avg(done.map((p) => percentOf(p.sub!, a)).filter((x): x is number => x !== null)),
        };
      })
      .sort((x, y) => x.title.localeCompare(y.title));

    const groupIds = groupId === 'all' ? [...new Set(assignments.flatMap((a) => a.groupIds))] : [groupId];
    const perGroup = groupIds.map((gid) => {
      const ps = pairs.filter((p) => p.a.groupIds.includes(gid) && (students.get(p.studentId)?.groupIds ?? []).includes(gid));
      const done = ps.filter((p) => p.sub && p.sub.status !== 'draft');
      return {
        id: gid,
        name: groupName.get(gid) ?? gid,
        students: new Set(ps.map((p) => p.studentId)).size,
        expected: ps.length,
        sent: done.length,
        avg: avg(done.map((p) => percentOf(p.sub!, p.a)).filter((x): x is number => x !== null)),
      };
    });

    const studentIds = [...new Set(pairs.map((p) => p.studentId))];
    const perStudent = studentIds
      .map((sid) => {
        const ps = pairs.filter((p) => p.studentId === sid);
        const done = ps.filter((p) => p.sub && p.sub.status !== 'draft');
        const st = students.get(sid);
        return {
          id: sid,
          name: st?.name ?? sid,
          group: (st?.groupIds ?? []).map((g) => groupName.get(g)).filter(Boolean).join(', '),
          assigned: ps.length,
          sent: done.length,
          reviewed: done.filter((p) => p.sub!.status === 'reviewed').length,
          avg: avg(done.map((p) => percentOf(p.sub!, p.a)).filter((x): x is number => x !== null)),
        };
      })
      .sort((x, y) => (y.avg ?? -1) - (x.avg ?? -1));

    const missed = new Map<string, number>();
    for (const p of sent) {
      const words = p.sub!.status === 'reviewed' ? p.sub!.finalWrongWords : (p.sub!.autoResult?.wrongWords ?? []);
      for (const w of words) missed.set(w, (missed.get(w) ?? 0) + 1);
    }
    const topMissed = [...missed.entries()].sort((x, y) => y[1] - x[1]).slice(0, 15);

    return {
      assignments: assignments.length,
      expected: pairs.length,
      sent: sent.length,
      unreviewed,
      avg: avg(percents),
      perAssignment,
      perGroup,
      perStudent,
      topMissed,
    };
  }, [assignmentsAll, submissionsAll, courseId, groupId, students, groupName]);

  if (loading) return <Spinner label={t('loading')} />;

  const courseGroups = groups.filter((g) => courseId === 'all' || courses.find((c) => c.id === courseId)?.groupIds.includes(g.id));
  const maxMissed = stats.topMissed[0]?.[1] ?? 1;

  function exportStudents() {
    downloadCsv(
      'hanzi-results.csv',
      buildCsv(
        [t('hanzi.csv.student'), t('hanzi.csv.group'), t('hanzi.stats.assigned'), t('hanzi.stats.sent'), t('hanzi.stats.reviewed'), t('hanzi.stats.avg')],
        stats.perStudent.map((s) => [s.name, s.group, String(s.assigned), String(s.sent), String(s.reviewed), s.avg === null ? '' : String(Math.round(s.avg))]),
      ),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-64">
          <SelectField label={t('hanzi.builder.course')} value={courseId} onChange={(e) => { setCourseId(e.target.value); setGroupId('all'); }}>
            <option value="all">{t('hanzi.stats.allCourses')}</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="sm:w-64">
          <SelectField label={t('hanzi.csv.group')} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="all">{t('hanzi.stats.allGroups')}</option>
            {courseGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </SelectField>
        </div>
        <Button variant="secondary" onClick={exportStudents} disabled={stats.perStudent.length === 0}>
          {t('gradebook.exportCsv')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label={t('hanzi.stats.assignments')} value={stats.assignments} />
        <Kpi label={t('hanzi.stats.completion')} value={stats.expected === 0 ? '—' : `${Math.round((stats.sent / stats.expected) * 100)}%`} />
        <Kpi label={t('hanzi.stats.sentOfExpected')} value={`${stats.sent}/${stats.expected}`} />
        <Kpi label={t('hanzi.stats.unreviewed')} value={stats.unreviewed} {...(stats.unreviewed > 0 ? { tone: 'amber' as const } : {})} />
        <Kpi label={t('hanzi.stats.avg')} value={pct(stats.avg)} />
      </div>
      <p className="-mt-3 text-xs text-text-muted">{t('hanzi.stats.avgNote')}</p>

      {stats.expected === 0 ? (
        <EmptyState title={t('hanzi.stats.empty')} />
      ) : (
        <>
          <section className="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="font-display font-semibold">{t('hanzi.stats.mostMissed')}</h2>
              {stats.topMissed.length === 0 ? (
                <p className="mt-2 text-sm text-text-muted">{t('hanzi.stats.noMistakes')}</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {stats.topMissed.map(([word, n]) => (
                    <li key={word} className="flex items-center gap-3 text-sm">
                      <span lang="zh" className="font-kai w-16 shrink-0 text-xl">{word}</span>
                      <span className="h-3 rounded-sm bg-coral-500/70" style={{ width: `${Math.max(4, (n / maxMissed) * 70)}%` }} />
                      <span className="text-text-muted">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h2 className="font-display font-semibold">{t('hanzi.stats.byGroup')}</h2>
              <div className="mt-3">
                <Table>
                  <Thead>
                    <Tr>
                      <Th>{t('hanzi.csv.group')}</Th>
                      <Th>{t('hanzi.stats.students')}</Th>
                      <Th>{t('hanzi.stats.sent')}</Th>
                      <Th>{t('hanzi.stats.avg')}</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {stats.perGroup.map((g) => (
                      <Tr key={g.id}>
                        <Td className="font-medium">{g.name}</Td>
                        <Td>{g.students}</Td>
                        <Td>
                          {g.sent}/{g.expected}
                        </Td>
                        <Td>{pct(g.avg)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-display font-semibold">{t('hanzi.stats.byAssignment')}</h2>
            <div className="mt-3">
              <Table>
                <Thead>
                  <Tr>
                    <Th>{t('hanzi.builder.titleField')}</Th>
                    <Th>{t('hanzi.stats.sent')}</Th>
                    <Th>{t('hanzi.stats.reviewed')}</Th>
                    <Th>{t('hanzi.stats.avg')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {stats.perAssignment.map((a) => (
                    <Tr key={a.id}>
                      <Td className="font-medium">{a.title}</Td>
                      <Td>
                        {a.sent}/{a.targets}
                      </Td>
                      <Td>{a.reviewed}</Td>
                      <Td>{pct(a.avg)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          </section>

          <section>
            <h2 className="font-display font-semibold">{t('hanzi.stats.byStudent')}</h2>
            <div className="mt-3">
              <Table>
                <Thead>
                  <Tr>
                    <Th>{t('hanzi.csv.student')}</Th>
                    <Th className="hidden sm:table-cell">{t('hanzi.csv.group')}</Th>
                    <Th>{t('hanzi.stats.sent')}</Th>
                    <Th className="hidden sm:table-cell">{t('hanzi.stats.reviewed')}</Th>
                    <Th>{t('hanzi.stats.avg')}</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {stats.perStudent.map((s) => (
                    <Tr key={s.id}>
                      <Td className="font-medium">{s.name}</Td>
                      <Td className="hidden text-text-muted sm:table-cell">{s.group || '—'}</Td>
                      <Td>
                        {s.sent}/{s.assigned}
                      </Td>
                      <Td className="hidden sm:table-cell">{s.reviewed}</Td>
                      <Td>{pct(s.avg)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
