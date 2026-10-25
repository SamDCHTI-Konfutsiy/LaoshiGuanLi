import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { qrToDataUrl } from '@/features/hanzi/lib/qr';

interface QrPanelProps {
  url: string;
  /** Used for the downloaded file name. */
  fileName: string;
  title: string;
}

export function QrPanel({ url, fileName, title }: QrPanelProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    qrToDataUrl(url)
      .then((d) => !cancelled && setDataUrl(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [url]);

  function download() {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${fileName.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60) || 'hanzi'}-qr.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.show(t('hanzi.qr.copied'), 'success');
    } catch {
      // Clipboard API needs a secure context + permission; fall back to a prompt-free selection hint.
      toast.show(url, 'info');
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-start">
      <div className="flex h-44 w-44 shrink-0 items-center justify-center rounded-lg bg-white p-1">
        {dataUrl ? (
          <img src={dataUrl} alt={t('hanzi.qr.alt', { title })} className="h-full w-full" />
        ) : (
          <span className="text-xs text-text-muted">{failed ? t('auth.errors.generic') : t('loading')}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="font-medium">{t('hanzi.qr.title')}</h3>
        <p className="text-sm text-text-muted">{t('hanzi.qr.help')}</p>
        <code className="block break-all rounded-md bg-surface px-2 py-1.5 font-mono text-xs">{url}</code>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={download} disabled={!dataUrl}>
            {t('hanzi.qr.downloadPng')}
          </Button>
          <Button variant="secondary" onClick={() => void copy()}>
            {t('hanzi.qr.copyLink')}
          </Button>
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center px-2 text-sm font-medium text-steel-500 hover:underline">
            {t('hanzi.qr.open')}
          </a>
        </div>
      </div>
    </div>
  );
}
