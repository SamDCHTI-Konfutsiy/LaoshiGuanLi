import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/TextAreaField';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  requireReason?: boolean;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  requireReason = false,
  destructive = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setLoading(false);
    }
  }, [open]);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-text-muted">{message}</p>
      <div className="mt-4">
        <TextAreaField
          label={requireReason ? t('common.reasonRequired') : t('common.reasonOptional')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          loading={loading}
          disabled={requireReason && reason.trim() === ''}
          onClick={() => void handleConfirm()}
          className={destructive ? 'bg-coral-500 hover:bg-coral-600' : ''}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
