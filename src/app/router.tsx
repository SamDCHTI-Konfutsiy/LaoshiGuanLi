import { lazy } from 'react';
import { createHashRouter, type RouteObject } from 'react-router-dom';
import type { ComponentType } from 'react';
import { RootShell } from '@/app/RootShell';
import { RoleRedirect } from '@/app/RoleRedirect';
import { RoleHome } from '@/app/RoleHome';
import { AdminLayout } from '@/app/layouts/AdminLayout';
import { TeacherLayout } from '@/app/layouts/TeacherLayout';
import { StudentLayout } from '@/app/layouts/StudentLayout';
import { ProtectedRoute } from '@/components/guards/ProtectedRoute';
import { RoleGate } from '@/components/guards/RoleGate';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { SignupPage } from '@/features/auth/pages/SignupPage';
import type { Role } from '@/types/enums';

// Route-level code splitting: everything past login/signup/home is only
// fetched once a signed-in user actually navigates there, keeping the
// initial bundle small. RootShell provides the single Suspense boundary
// these all fall under.
const ProfilePage = lazy(() => import('@/features/auth/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const SemestersPage = lazy(() => import('@/features/semesters/pages/SemestersPage').then((m) => ({ default: m.SemestersPage })));
const ClassroomsPage = lazy(() => import('@/features/classrooms/pages/ClassroomsPage').then((m) => ({ default: m.ClassroomsPage })));
const GroupsPage = lazy(() => import('@/features/groups/pages/GroupsPage').then((m) => ({ default: m.GroupsPage })));
const UsersPage = lazy(() => import('@/features/users/pages/UsersPage').then((m) => ({ default: m.UsersPage })));
const CoursesPage = lazy(() => import('@/features/courses/pages/CoursesPage').then((m) => ({ default: m.CoursesPage })));
const CourseDetailPage = lazy(() => import('@/features/courses/pages/CourseDetailPage').then((m) => ({ default: m.CourseDetailPage })));
const MyCoursesPage = lazy(() => import('@/features/courses/pages/MyCoursesPage').then((m) => ({ default: m.MyCoursesPage })));
const SubmissionsPage = lazy(() => import('@/features/homework/pages/SubmissionsPage').then((m) => ({ default: m.SubmissionsPage })));
const QuestionBankPage = lazy(() => import('@/features/questionBank/pages/QuestionBankPage').then((m) => ({ default: m.QuestionBankPage })));
const QuizBuilderPage = lazy(() => import('@/features/quizzes/pages/QuizBuilderPage').then((m) => ({ default: m.QuizBuilderPage })));
const GradebookPage = lazy(() => import('@/features/gradebook/pages/GradebookPage').then((m) => ({ default: m.GradebookPage })));
const QuizGradingPage = lazy(() => import('@/features/quizzes/pages/QuizGradingPage').then((m) => ({ default: m.QuizGradingPage })));
const QuizTakingPage = lazy(() => import('@/features/quizzes/pages/QuizTakingPage').then((m) => ({ default: m.QuizTakingPage })));
const MyGradesPage = lazy(() => import('@/features/grades/pages/MyGradesPage').then((m) => ({ default: m.MyGradesPage })));
const AnnouncementsPage = lazy(() => import('@/features/announcements/pages/AnnouncementsPage').then((m) => ({ default: m.AnnouncementsPage })));
const SchedulePage = lazy(() => import('@/features/schedule/pages/SchedulePage').then((m) => ({ default: m.SchedulePage })));
const NotificationsPage = lazy(() => import('@/features/notifications/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const SearchPage = lazy(() => import('@/features/search/pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const AuditLogPage = lazy(() => import('@/features/audit/pages/AuditLogPage').then((m) => ({ default: m.AuditLogPage })));
const PaymentsPage = lazy(() => import('@/features/payments/pages/PaymentsPage').then((m) => ({ default: m.PaymentsPage })));

/** One role's routed subtree: /{path} (home), /{path}/profile, plus any
 * feature routes — gated to that role only. */
function roleBranch(role: Role, path: string, Layout: ComponentType, extra: RouteObject[] = []): RouteObject {
  return {
    element: <RoleGate allow={[role]} />,
    children: [
      {
        path,
        element: <Layout />,
        children: [
          { index: true, element: <RoleHome /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'announcements', element: <AnnouncementsPage /> },
          { path: 'schedule', element: <SchedulePage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'search', element: <SearchPage /> },
          ...extra,
        ],
      },
    ],
  };
}

const adminRoutes: RouteObject[] = [
  { path: 'users', element: <UsersPage /> },
  { path: 'semesters', element: <SemestersPage /> },
  { path: 'classrooms', element: <ClassroomsPage /> },
  { path: 'groups', element: <GroupsPage /> },
  { path: 'courses', element: <CoursesPage /> },
  { path: 'courses/:courseId', element: <CourseDetailPage /> },
  { path: 'courses/:courseId/homework/:hwId', element: <SubmissionsPage /> },
  { path: 'courses/:courseId/quizzes/:quizId/builder', element: <QuizBuilderPage /> },
  { path: 'courses/:courseId/gradebook', element: <GradebookPage /> },
  { path: 'courses/:courseId/quizzes/:quizId/attempts', element: <QuizGradingPage /> },
  { path: 'audit', element: <AuditLogPage /> },
  { path: 'payments', element: <PaymentsPage /> },
];

const teacherRoutes: RouteObject[] = [
  { path: 'courses', element: <MyCoursesPage /> },
  { path: 'courses/:courseId', element: <CourseDetailPage /> },
  { path: 'courses/:courseId/homework/:hwId', element: <SubmissionsPage /> },
  { path: 'courses/:courseId/quizzes/:quizId/builder', element: <QuizBuilderPage /> },
  { path: 'courses/:courseId/gradebook', element: <GradebookPage /> },
  { path: 'courses/:courseId/quizzes/:quizId/attempts', element: <QuizGradingPage /> },
  { path: 'question-bank', element: <QuestionBankPage /> },
];

const studentRoutes: RouteObject[] = [
  { path: 'courses', element: <MyCoursesPage /> },
  { path: 'courses/:courseId', element: <CourseDetailPage /> },
  { path: 'courses/:courseId/quizzes/:quizId/take/:attemptNumber', element: <QuizTakingPage /> },
  { path: 'grades', element: <MyGradesPage /> },
];

export const router = createHashRouter([
  {
    path: '/',
    element: <RootShell />,
    children: [
      { path: 'login', element: <LoginPage /> },
      { path: 'signup', element: <SignupPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          { index: true, element: <RoleRedirect /> },
          roleBranch('admin', 'admin', AdminLayout, adminRoutes),
          roleBranch('teacher', 'teacher', TeacherLayout, teacherRoutes),
          roleBranch('student', 'student', StudentLayout, studentRoutes),
        ],
      },
    ],
  },
]);
