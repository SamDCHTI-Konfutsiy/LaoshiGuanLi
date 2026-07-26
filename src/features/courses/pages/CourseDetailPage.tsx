import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useDoc } from '@/hooks/useDoc';
import { useCollection } from '@/hooks/useCollection';
import { collectionRef } from '@/services/repository';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs } from '@/components/ui/Tabs';
import { LessonsTab } from '@/features/courses/pages/LessonsTab';
import { HomeworkTab } from '@/features/homework/pages/HomeworkTab';
import { QuizTab } from '@/features/quizzes/pages/QuizTab';
import { AttendanceTab } from '@/features/attendance/pages/AttendanceTab';
import { ManualGradesTab } from '@/features/grades/pages/ManualGradesTab';
import { lessonsQuery } from '@/features/courses/lessons-service';
import { classroomsQuery } from '@/features/classrooms/service';
import { groupsQuery } from '@/features/groups/service';
import type { Course } from '@/types/models';
import type { Role } from '@/types/enums';

const coursesCol = collectionRef<Course>('courses');

type Tab = 'lessons' | 'homework' | 'quizzes' | 'attendance' | 'grades';

const BASE_PATH_BY_ROLE: Record<Role, string> = {
  admin: '/admin/courses',
  teacher: '/teacher/courses',
  student: '/student/courses',
};

export function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('lessons');

  const courseRef = useMemo(() => (courseId ? doc(coursesCol, courseId) : null), [courseId]);
  const { data: course, loading: courseLoading } = useDoc(courseRef);
  const cQuery = useMemo(() => classroomsQuery(), []);
  const { data: classrooms } = useCollection(cQuery);
  const lQuery = useMemo(() => (courseId ? lessonsQuery(courseId) : null), [courseId]);
  const { data: lessons } = useCollection(lQuery);
  const gQuery = useMemo(() => groupsQuery(), []);
  const { data: allGroups } = useCollection(gQuery);

  if (courseLoading) return <Spinner label={t('loading')} />;
  if (!course || !courseId || !profile) return <EmptyState title={t('admin.courses.notFound')} />;

  const canManage = profile.role === 'admin' || profile.uid === course.teacherId;
  const basePath = `${BASE_PATH_BY_ROLE[profile.role]}/${courseId}`;
  const courseGroups = allGroups.filter((g) => course.groupIds.includes(g.id));
  const lessonOptions = lessons.map((l) => ({ id: l.id, title: l.title }));

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold">{course.title}</h1>
          {course.description && <p className="mt-1 text-sm text-text-muted">{course.description}</p>}
        </div>
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'lessons', label: t('nav.lessons') },
            { value: 'homework', label: t('nav.homework') },
            { value: 'quizzes', label: t('nav.quizzes') },
            { value: 'attendance', label: t('nav.attendance') },
            ...(canManage ? [{ value: 'grades' as const, label: t('nav.grades') }] : []),
          ]}
        />
      </div>

      <div className="mt-6">
        {tab === 'lessons' && <LessonsTab courseId={courseId} canManage={canManage} classrooms={classrooms} />}
        {tab === 'homework' && (
          <HomeworkTab
            courseId={courseId}
            basePath={basePath}
            canManage={canManage}
            isAdmin={profile.role === 'admin'}
            courseGroupIds={course.groupIds}
            lessons={lessonOptions}
          />
        )}
        {tab === 'quizzes' && (
          <QuizTab courseId={courseId} basePath={basePath} canManage={canManage} isAdmin={profile.role === 'admin'} courseGroupIds={course.groupIds} />
        )}
        {tab === 'attendance' && (
          <AttendanceTab courseId={courseId} canManage={canManage} groups={courseGroups} lessons={lessonOptions} />
        )}
        {tab === 'grades' && canManage && (
          <div>
            <div className="flex justify-end">
              <Link to={`${basePath}/gradebook`} className="text-sm font-medium text-steel-500 hover:underline">
                {t('gradebook.viewFull')}
              </Link>
            </div>
            <ManualGradesTab courseId={courseId} />
          </div>
        )}
      </div>
    </div>
  );
}
