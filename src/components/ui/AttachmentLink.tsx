import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastContext';
import { getAttachmentUrl } from '@/services/attachments';

export function AttachmentLink({ name, path }: { name: string; path: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function handleOpen() {
    setLoading(true);
    try {
      const url = await getAttachmentUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleOpen()}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-sm text-steel-500 hover:underline disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
      </svg>
      {name}
    </button>
  );
}
