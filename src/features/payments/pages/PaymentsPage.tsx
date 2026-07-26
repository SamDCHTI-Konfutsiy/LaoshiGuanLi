import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useCollection } from '@/hooks/useCollection';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { TextAreaField } from '@/components/ui/TextAreaField';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import {
  currentYearMonth,
  formatYearMonth,
  getMonthlyFeeAmount,
  paymentsForMonthQuery,
  sendPaymentReminder,
  setMonthlyFeeAmount,
  setPayment,
  type PaymentInput,
} from '@/features/payments/service';
import { parsePaymentsCsv, paymentsToCsv, type CsvImportResult } from '@/features/payments/csv';
import { usersQuery } from '@/features/users/service';
import { downloadCsv, readFileAsText } from '@/utils/csv';
import type { Payment } from '@/types/models';

function shiftMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y!, (m ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function PaymentsPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const stQuery = useMemo(() => usersQuery('student'), []);
  const { data: students, loading: studentsLoading } = useCollection(stQuery);
  const activeStudents = useMemo(() => students.filter((s) => s.status === 'active'), [students]);
  const sortedStudents = useMemo(() => [...activeStudents].sort((a, b) => a.name.localeCompare(b.name)), [activeStudents]);

  const pQuery = useMemo(() => paymentsForMonthQuery(yearMonth), [yearMonth]);
  const { data: payments, loading: paymentsLoading } = useCollection(pQuery);
  const paymentByStudent = useMemo(() => new Map(payments.map((p) => [p.studentId, p])), [payments]);
  const studentUidByEmail = useMemo(() => new Map(students.map((s) => [s.email.toLowerCase(), s.uid])), [students]);

  const visibleStudents = useMemo(
    () => (showUnpaidOnly ? sortedStudents.filter((s) => !paymentByStudent.get(s.uid)?.paid) : sortedStudents),
    [sortedStudents, paymentByStudent, showUnpaidOnly],
  );
  const unpaidStudents = useMemo(() => sortedStudents.filter((s) => !paymentByStudent.get(s.uid)?.paid), [sortedStudents, paymentByStudent]);

  const [editing, setEditing] = useState<{ uid: string; name: string } | null>(null);
  const [importPreview, setImportPreview] = useState<CsvImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [savingFee, setSavingFee] = useState(false);
  const [sendingReminderFor, setSendingReminderFor] = useState<string | null>(null);
  const [sendingBulk, setSendingBulk] = useState(false);

  useEffect(() => {
    void getMonthlyFeeAmount().then(setFeeAmount);
  }, []);

  const paidCount = sortedStudents.filter((s) => paymentByStudent.get(s.uid)?.paid).length;

  function handleExport() {
    downloadCsv(`payments-${yearMonth}.csv`, paymentsToCsv(sortedStudents, paymentByStudent));
  }

  function handleDownloadTemplate() {
    downloadCsv('payments-template.csv', paymentsToCsv(sortedStudents.slice(0, 2), new Map()));
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await readFileAsText(file);
    setImportPreview(parsePaymentsCsv(text, yearMonth, studentUidByEmail));
  }

  async function handleConfirmImport() {
    if (!profile || !importPreview) return;
    setImporting(true);
    try {
      for (const row of importPreview.valid) {
        await setPayment(profile, row, t('payments.importedReason'));
      }
      toast.show(t('payments.importDone', { count: importPreview.valid.length }), 'success');
      setImportPreview(null);
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setImporting(false);
    }
  }

  async function handleSaveFee() {
    if (feeAmount === null) return;
    setSavingFee(true);
    try {
      await setMonthlyFeeAmount(feeAmount);
      toast.show(t('payments.feeSaved'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSavingFee(false);
    }
  }

  async function handleSendReminder(uid: string, name: string) {
    if (feeAmount === null) return;
    setSendingReminderFor(uid);
    try {
      await sendPaymentReminder(uid, name, yearMonth, feeAmount);
      toast.show(t('payments.reminderSent'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSendingReminderFor(null);
    }
  }

  async function handleSendBulkReminders() {
    if (feeAmount === null || unpaidStudents.length === 0) return;
    setSendingBulk(true);
    try {
      for (const s of unpaidStudents) {
        await sendPaymentReminder(s.uid, s.name, yearMonth, feeAmount);
      }
      toast.show(t('payments.bulkReminderSent', { count: unpaidStudents.length }), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSendingBulk(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold">{t('nav.payments')}</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setYearMonth((m) => shiftMonth(m, -1))}>
            ←
          </Button>
          <span className="min-w-40 text-center font-medium">{formatYearMonth(yearMonth, i18n.language)}</span>
          <Button variant="secondary" onClick={() => setYearMonth((m) => shiftMonth(m, 1))}>
            →
          </Button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-text-muted">{t('payments.summary', { paid: paidCount, total: sortedStudents.length })}</span>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showUnpaidOnly} onChange={(e) => setShowUnpaidOnly(e.target.checked)} className="h-4 w-4 rounded border-border" />
          {t('payments.showUnpaidOnly')}
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border p-4">
        <TextField
          label={t('payments.monthlyFee')}
          type="number"
          min={0}
          value={feeAmount ?? ''}
          onChange={(e) => setFeeAmount(e.target.value === '' ? 0 : Number(e.target.value))}
          className="max-w-40"
        />
        <Button variant="secondary" loading={savingFee} onClick={() => void handleSaveFee()}>
          {t('common.save')}
        </Button>
        <div className="flex-1" />
        <Button loading={sendingBulk} disabled={unpaidStudents.length === 0 || feeAmount === null} onClick={() => void handleSendBulkReminders()}>
          {t('payments.sendBulkReminder', { count: unpaidStudents.length })}
        </Button>
      </div>

      <div className="mt-4 flex flex-col items-end gap-1">
        <div className="flex gap-2">
          <input ref={importInputRef} type="file" accept=".csv,text/csv" onChange={(e) => void handleImportFile(e)} className="hidden" />
          <Button variant="secondary" onClick={() => importInputRef.current?.click()}>
            {t('payments.importCsv')}
          </Button>
          <Button variant="secondary" onClick={handleExport} disabled={sortedStudents.length === 0}>
            {t('payments.exportCsv')}
          </Button>
        </div>
        <button type="button" onClick={handleDownloadTemplate} className="text-xs text-steel-500 hover:underline">
          {t('payments.downloadTemplate')}
        </button>
      </div>

      <div className="mt-4">
        {studentsLoading || paymentsLoading ? (
          <Spinner label={t('loading')} />
        ) : visibleStudents.length === 0 ? (
          <EmptyState title={t('payments.noStudents')} />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>{t('auth.name')}</Th>
                <Th>{t('auth.email')}</Th>
                <Th>{t('payments.status')}</Th>
                <Th>{t('payments.amount')}</Th>
                <Th>{t('homework.feedback')}</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {visibleStudents.map((s) => {
                const p = paymentByStudent.get(s.uid);
                return (
                  <Tr key={s.uid}>
                    <Td className="font-medium">{s.name}</Td>
                    <Td className="text-text-muted">{s.email}</Td>
                    <Td>
                      {p?.paid ? (
                        <Badge tone="teal">{t('payments.paid')}</Badge>
                      ) : (
                        <Badge tone="coral">{t('payments.unpaid')}</Badge>
                      )}
                    </Td>
                    <Td>{p?.amount ?? '—'}</Td>
                    <Td className="max-w-xs truncate text-text-muted">{p?.note || '—'}</Td>
                    <Td className="text-right">
                      {!p?.paid && (
                        <button
                          type="button"
                          disabled={sendingReminderFor === s.uid || feeAmount === null}
                          onClick={() => void handleSendReminder(s.uid, s.name)}
                          className="text-sm font-medium text-amber-600 hover:underline disabled:opacity-50 dark:text-amber-400"
                        >
                          {t('payments.sendReminder')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditing({ uid: s.uid, name: s.name })}
                        className="ml-3 text-sm font-medium text-steel-500 hover:underline"
                      >
                        {t('common.edit')}
                      </button>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </div>

      {editing && (
        <PaymentFormModal
          studentUid={editing.uid}
          studentName={editing.name}
          yearMonth={yearMonth}
          initial={paymentByStudent.get(editing.uid) ?? null}
          onClose={() => setEditing(null)}
        />
      )}

      {importPreview && (
        <Modal open onClose={() => setImportPreview(null)} title={t('payments.importPreviewTitle')}>
          <p className="text-sm text-text">{t('payments.importValidCount', { count: importPreview.valid.length })}</p>
          {importPreview.errors.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-surface p-3">
              <p className="text-sm font-medium text-coral-500">
                {t('payments.importErrorCount', { count: importPreview.errors.length })}
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
              {t('payments.confirmImport', { count: importPreview.valid.length })}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PaymentFormModal({
  studentUid,
  studentName,
  yearMonth,
  initial,
  onClose,
}: {
  studentUid: string;
  studentName: string;
  yearMonth: string;
  initial: Payment | null;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const [paid, setPaid] = useState(initial?.paid ?? false);
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const input: PaymentInput = {
      studentId: studentUid,
      yearMonth,
      paid,
      amount: amount === '' ? null : Number(amount),
      note,
    };
    try {
      await setPayment(profile, input, reason);
      toast.show(t('payments.saved'), 'success');
      onClose();
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t('payments.editTitle', { name: studentName })}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4 rounded border-border" />
          {t('payments.markPaid')}
        </label>
        <TextField
          label={t('payments.amount')}
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
        />
        <TextAreaField label={t('homework.feedback')} value={note} onChange={(e) => setNote(e.target.value)} />
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
