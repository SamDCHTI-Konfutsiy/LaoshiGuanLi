import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import type { HanziAssignmentStatus, HanziItemVerdict, HanziSubmissionStatus } from '@/types/enums';

const SUBMISSION_TONE = {
  not_started: 'neutral',
  draft: 'neutral',
  submitted: 'steel',
  in_review: 'amber',
  needs_revision: 'coral',
  reviewed: 'teal',
} as const;

export function SubmissionStatusBadge({ status }: { status: HanziSubmissionStatus | 'not_started' }) {
  const { t } = useTranslation();
  return <Badge tone={SUBMISSION_TONE[status]}>{t(`hanzi.status.${status}`)}</Badge>;
}

const ASSIGNMENT_TONE = { draft: 'neutral', published: 'teal', closed: 'amber' } as const;

export function AssignmentStatusBadge({ status }: { status: HanziAssignmentStatus }) {
  const { t } = useTranslation();
  return <Badge tone={ASSIGNMENT_TONE[status]}>{t(`hanzi.assignmentStatus.${status}`)}</Badge>;
}

const VERDICT_TONE = { correct: 'teal', incorrect: 'coral', unanswered: 'neutral' } as const;

export function VerdictBadge({ verdict }: { verdict: HanziItemVerdict }) {
  const { t } = useTranslation();
  return <Badge tone={VERDICT_TONE[verdict]}>{t(`hanzi.verdict.${verdict}`)}</Badge>;
}
