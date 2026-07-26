import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCollection } from '@/hooks/useCollection';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { auditLogQuery } from '@/features/audit/service';
import { formatDateTime } from '@/utils/date';

export function AuditLogPage() {
  const { t, i18n } = useTranslation();
  const aQuery = useMemo(() => auditLogQuery(), []);
  const { data: entries, loading } = useCollection(aQuery);

  return (
    <div className="p-6">
      <h1 className="font-display text-xl font-semibold">{t('admin.audit.title')}</h1>
      <p className="mt-1 text-sm text-text-muted">{t('admin.audit.subtitle')}</p>

      <div className="mt-6">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : entries.length === 0 ? (
          <EmptyState title={t('admin.audit.empty')} />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>{t('admin.audit.date')}</Th>
                <Th>{t('admin.audit.actor')}</Th>
                <Th>{t('admin.audit.action')}</Th>
                <Th>{t('admin.audit.reason')}</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {entries.map((entry) => (
                <Tr key={entry.id}>
                  <Td className="whitespace-nowrap text-text-muted">{formatDateTime(entry.createdAt, i18n.language)}</Td>
                  <Td className="font-medium">{entry.actorName}</Td>
                  <Td>
                    <code className="font-mono text-xs text-text-muted">{entry.action}</code>
                  </Td>
                  <Td className="max-w-xs truncate text-text-muted">{entry.reason || '—'}</Td>
                  <Td>
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-steel-500">
                        {t('admin.audit.details')}
                      </summary>
                      <pre className="mt-2 max-w-md overflow-x-auto rounded-lg bg-surface p-3 font-mono text-xs">
                        {JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}
                      </pre>
                    </details>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
