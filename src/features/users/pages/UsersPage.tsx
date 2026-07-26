import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
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
import { Tabs } from '@/components/ui/Tabs';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { approveUser, pendingUsersQuery, rejectUser, renameUser, setActiveStatus, usersQuery } from '@/features/users/service';
import { bulkCreateUsers, parseUsersCsv, type BulkCreateResultRow, type CsvImportResult } from '@/features/users/bulkImport';
import { resetPassword } from '@/features/auth/service';
import { groupsQuery } from '@/features/groups/service';
import { formatDate } from '@/utils/date';
import { buildCsv, downloadCsv, readFileAsText } from '@/utils/csv';
import { ROLES, type Role } from '@/types/enums';
import type { UserProfile, WithId } from '@/types/models';

type Tab = 'users' | 'pending';

export function UsersPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('users');
  const pQuery = useMemo(() => pendingUsersQuery(), []);
  const { data: pending } = useCollection(pQuery);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold">{t('admin.users.title')}</h1>
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'users', label: t('admin.users.tabUsers') },
            {
              value: 'pending',
              label: pending.length > 0 ? `${t('admin.users.tabPending')} (${pending.length})` : t('admin.users.tabPending'),
            },
          ]}
        />
      </div>
      <div className="mt-6">{tab === 'users' ? <UsersTab /> : <PendingTab pending={pending} />}</div>
    </div>
  );
}

function UsersTab() {
  const { profile } = useAuth();
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const uQuery = useMemo(() => usersQuery(roleFilter === 'all' ? undefined : roleFilter), [roleFilter]);
  const { data: users, loading } = useCollection(uQuery);
  const [target, setTarget] = useState<WithId<UserProfile> | null>(null);
  const [renaming, setRenaming] = useState<WithId<UserProfile> | null>(null);
  const [sendingResetFor, setSendingResetFor] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<CsvImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<BulkCreateResultRow[] | null>(null);

  const sorted = useMemo(
    () => [...users].filter((u) => u.status !== 'pending').sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

  async function handleToggle(reason: string) {
    if (!profile || !target) return;
    const next = target.status === 'disabled' ? 'active' : 'disabled';
    try {
      await setActiveStatus(profile, target, next, reason);
      toast.show(next === 'active' ? t('admin.users.enabled') : t('admin.users.disabled'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setTarget(null);
    }
  }

  async function handleSendReset(email: string) {
    setSendingResetFor(email);
    try {
      await resetPassword(email);
      toast.show(t('admin.users.resetSent', { email }), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSendingResetFor(null);
    }
  }

  function handleExport() {
    const rows = sorted.map((u) => [
      u.name,
      u.email,
      t(`auth.roles.${u.role}`),
      u.status,
      u.createdAt ? u.createdAt.toDate().toISOString().slice(0, 10) : '',
    ]);
    downloadCsv('users.csv', buildCsv([t('auth.name'), t('auth.email'), t('auth.role'), t('admin.users.status'), t('admin.users.joined')], rows));
  }

  function handleDownloadUserTemplate() {
    downloadCsv(
      'users-template.csv',
      buildCsv(
        ['name', 'email', 'password', 'role'],
        [
          ['Aziza Karimova', 'aziza.karimova@example.com', 'ChangeMe123', 'student'],
          ['Bekzod Yusupov', 'bekzod.yusupov@example.com', 'ChangeMe123', 'teacher'],
        ],
      ),
    );
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await readFileAsText(file);
    setImportPreview(parseUsersCsv(text));
  }

  async function handleConfirmImport() {
    if (!importPreview || importPreview.valid.length === 0) return;
    setImporting(true);
    try {
      const results = await bulkCreateUsers(importPreview.valid);
      setImportResults(results);
      setImportPreview(null);
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {(['all', ...ROLES] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleFilter(r)}
              aria-pressed={roleFilter === r}
              className={
                'rounded-full border px-3 py-1 text-sm font-medium transition-colors ' +
                (roleFilter === r
                  ? 'border-steel-500 bg-steel-50 text-steel-600 dark:bg-surface-raised dark:text-steel-300'
                  : 'border-border text-text-muted hover:text-text')
              }
            >
              {r === 'all' ? t('admin.users.allRoles') : t(`auth.roles.${r}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            <input ref={importInputRef} type="file" accept=".csv,text/csv" onChange={(e) => void handleImportFile(e)} className="hidden" />
            <Button variant="secondary" onClick={() => importInputRef.current?.click()}>
              {t('admin.users.importCsv')}
            </Button>
            <Button variant="secondary" onClick={handleExport} disabled={sorted.length === 0}>
              {t('admin.users.exportCsv')}
            </Button>
          </div>
          <button type="button" onClick={handleDownloadUserTemplate} className="text-xs text-steel-500 hover:underline">
            {t('admin.users.downloadTemplate')}
          </button>
        </div>
      </div>

      {loading ? (
        <Spinner label={t('loading')} />
      ) : sorted.length === 0 ? (
        <EmptyState title={t('admin.users.empty')} />
      ) : (
        <Table>
          <Thead>
            <Tr>
              <Th>{t('auth.name')}</Th>
              <Th>{t('auth.email')}</Th>
              <Th>{t('auth.role')}</Th>
              <Th>{t('admin.users.joined')}</Th>
              <Th>{t('admin.users.status')}</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {sorted.map((u) => (
              <Tr key={u.uid}>
                <Td className="font-medium">{u.name}</Td>
                <Td className="text-text-muted">{u.email}</Td>
                <Td>
                  <Badge tone="steel">{t(`auth.roles.${u.role}`)}</Badge>
                </Td>
                <Td>{formatDate(u.createdAt, i18n.language)}</Td>
                <Td>
                  {u.status === 'disabled' ? (
                    <Badge tone="coral">{t('admin.users.disabledBadge')}</Badge>
                  ) : (
                    <Badge tone="teal">{t('admin.users.activeBadge')}</Badge>
                  )}
                </Td>
                <Td className="text-right">
                  <button
                    type="button"
                    onClick={() => setRenaming(u)}
                    className="text-sm font-medium text-steel-500 hover:underline"
                  >
                    {t('admin.users.rename')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSendReset(u.email)}
                    disabled={sendingResetFor === u.email}
                    className="ml-3 text-sm font-medium text-steel-500 hover:underline disabled:opacity-50"
                  >
                    {t('admin.users.sendReset')}
                  </button>
                  {u.uid !== profile?.uid && (
                    <button
                      type="button"
                      onClick={() => setTarget(u)}
                      className={
                        'ml-3 text-sm font-medium hover:underline ' +
                        (u.status === 'disabled' ? 'text-teal-500' : 'text-coral-500')
                      }
                    >
                      {u.status === 'disabled' ? t('admin.users.enable') : t('admin.users.disable')}
                    </button>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {target && (
        <ConfirmDialog
          open
          title={target.status === 'disabled' ? t('admin.users.enableTitle') : t('admin.users.disableTitle')}
          message={t('admin.users.disableMessage', { name: target.name })}
          confirmLabel={target.status === 'disabled' ? t('admin.users.enable') : t('admin.users.disable')}
          requireReason={target.status !== 'disabled'}
          destructive={target.status !== 'disabled'}
          onCancel={() => setTarget(null)}
          onConfirm={handleToggle}
        />
      )}

      {renaming && <RenameModal target={renaming} onClose={() => setRenaming(null)} />}

      {importPreview && (
        <Modal open onClose={() => setImportPreview(null)} title={t('admin.users.importPreviewTitle')}>
          <p className="text-sm text-text">{t('admin.users.importValidCount', { count: importPreview.valid.length })}</p>
          {importPreview.errors.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-surface p-3">
              <p className="text-sm font-medium text-coral-500">
                {t('admin.users.importErrorCount', { count: importPreview.errors.length })}
              </p>
              <ul className="mt-1 flex flex-col gap-0.5 text-xs text-text-muted">
                {importPreview.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setImportPreview(null)}>
              {t('common.cancel')}
            </Button>
            <Button loading={importing} disabled={importPreview.valid.length === 0} onClick={() => void handleConfirmImport()}>
              {t('admin.users.confirmImport', { count: importPreview.valid.length })}
            </Button>
          </div>
        </Modal>
      )}

      {importResults && (
        <Modal open onClose={() => setImportResults(null)} title={t('admin.users.importResultsTitle')}>
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto text-sm">
            {importResults.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span>{r.email}</span>
                {r.success ? (
                  <Badge tone="teal">{t('admin.users.importOk')}</Badge>
                ) : (
                  <span className="text-xs text-coral-500">{r.error}</span>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => setImportResults(null)}>{t('common.cancel')}</Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function RenameModal({ target, onClose }: { target: WithId<UserProfile>; onClose: () => void }) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const [name, setName] = useState(target.name);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      await renameUser(profile, target, name, reason);
      toast.show(t('admin.users.renamed'), 'success');
      onClose();
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t('admin.users.renameTitle')}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <TextField label={t('auth.name')} required value={name} onChange={(e) => setName(e.target.value)} />
        <TextAreaField label={t('common.reasonOptional')} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PendingTab({ pending }: { pending: WithId<UserProfile>[] }) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const gQuery = useMemo(() => groupsQuery(), []);
  const { data: groups } = useCollection(gQuery);

  const sorted = useMemo(
    () => [...pending].sort((a, b) => a.name.localeCompare(b.name)),
    [pending],
  );

  const [approving, setApproving] = useState<WithId<UserProfile> | null>(null);
  const [rejecting, setRejecting] = useState<WithId<UserProfile> | null>(null);

  async function handleReject(reason: string) {
    if (!profile || !rejecting) return;
    try {
      await rejectUser(profile, rejecting, reason);
      toast.show(t('admin.users.rejected'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setRejecting(null);
    }
  }

  if (sorted.length === 0) {
    return <EmptyState title={t('admin.users.noPending')} />;
  }

  return (
    <>
      <Table>
        <Thead>
          <Tr>
            <Th>{t('auth.name')}</Th>
            <Th>{t('auth.email')}</Th>
            <Th>{t('admin.users.requestedRole')}</Th>
            <Th>{t('admin.users.requestedOn')}</Th>
            <Th />
          </Tr>
        </Thead>
        <Tbody>
          {sorted.map((u) => (
            <Tr key={u.uid}>
              <Td className="font-medium">{u.name}</Td>
              <Td className="text-text-muted">{u.email}</Td>
              <Td>
                <Badge tone="amber">{t(`auth.roles.${u.role}`)}</Badge>
              </Td>
              <Td>{formatDate(u.createdAt, i18n.language)}</Td>
              <Td className="text-right">
                <button
                  type="button"
                  onClick={() => setApproving(u)}
                  className="text-sm font-medium text-teal-500 hover:underline"
                >
                  {t('admin.users.approve')}
                </button>
                <button
                  type="button"
                  onClick={() => setRejecting(u)}
                  className="ml-3 text-sm font-medium text-coral-500 hover:underline"
                >
                  {t('admin.users.reject')}
                </button>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      {approving && (
        <ApproveModal target={approving} groups={groups} onClose={() => setApproving(null)} />
      )}

      {rejecting && (
        <ConfirmDialog
          open
          title={t('admin.users.rejectTitle')}
          message={t('admin.users.rejectMessage', { name: rejecting.name })}
          confirmLabel={t('admin.users.reject')}
          requireReason
          destructive
          onCancel={() => setRejecting(null)}
          onConfirm={handleReject}
        />
      )}
    </>
  );
}

function ApproveModal({
  target,
  groups,
  onClose,
}: {
  target: WithId<UserProfile>;
  groups: { id: string; name: string }[];
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const [role, setRole] = useState<Role>(target.role);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      await approveUser(profile, target, role, groupIds, reason);
      toast.show(t('admin.users.approved'), 'success');
      onClose();
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t('admin.users.approveTitle', { name: target.name })}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <SelectField label={t('auth.role')} value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`auth.roles.${r}`)}
            </option>
          ))}
        </SelectField>
        {groups.length > 0 && (
          <SelectField
            label={t('admin.users.assignGroups')}
            multiple
            value={groupIds}
            onChange={(e) => setGroupIds(Array.from(e.target.selectedOptions, (o) => o.value))}
            className="h-auto py-1"
          >
            {groups.map((g) => (
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
            {t('admin.users.approve')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
