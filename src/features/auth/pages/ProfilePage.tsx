import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { updateOwnProfile } from '@/features/auth/service';
import { generateTelegramLinkCode, unlinkTelegram } from '@/features/telegram/service';
import { setLanguage, type SupportedLanguage } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SUPPORTED_LOCALES } from '@/types/enums';

export function ProfilePage() {
  const { profile, signOutUser } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const canEditName = profile?.role !== 'student';

  const [name, setName] = useState(profile?.name ?? '');
  const [saving, setSaving] = useState(false);

  if (!profile) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateOwnProfile(profile!.uid, canEditName ? { name } : {});
      toast.show(t('auth.profileSaved'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleLocaleChange(locale: SupportedLanguage) {
    setLanguage(locale);
    void updateOwnProfile(profile!.uid, { locale });
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="font-display text-xl font-semibold">{t('auth.profileTitle')}</h1>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <TextField
          label={t('auth.name')}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canEditName}
        />
        {!canEditName && <p className="-mt-2 text-xs text-text-muted">{t('auth.nameManagedByAdmin')}</p>}
        <TextField label={t('auth.email')} value={profile.email} disabled />
        <TextField label={t('auth.role')} value={t(`auth.roles.${profile.role}`)} disabled />

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">{t('language.label')}</span>
          <div className="flex gap-2">
            {SUPPORTED_LOCALES.map((locale) => (
              <button
                key={locale}
                type="button"
                onClick={() => handleLocaleChange(locale)}
                aria-pressed={profile.locale === locale}
                className={
                  'h-10 flex-1 rounded-lg border text-sm font-medium transition-colors ' +
                  (profile.locale === locale
                    ? 'border-steel-500 bg-steel-50 text-steel-600 dark:bg-surface-raised dark:text-steel-300'
                    : 'border-border bg-surface-raised text-text-muted hover:text-text')
                }
              >
                {t(`language.${locale}`)}
              </button>
            ))}
          </div>
        </div>

        {canEditName && (
          <Button type="submit" loading={saving} className="mt-2">
            {t('save')}
          </Button>
        )}
      </form>

      <TelegramLinkSection profile={profile} />

      <Button variant="secondary" onClick={() => void signOutUser()} className="mt-6 w-full">
        {t('auth.signOut')}
      </Button>
    </div>
  );
}

function TelegramLinkSection({ profile }: { profile: NonNullable<ReturnType<typeof useAuth>['profile']> }) {
  const toast = useToast();
  const { t } = useTranslation();
  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;

  async function handleGenerate() {
    setGenerating(true);
    try {
      const newCode = await generateTelegramLinkCode(profile.uid);
      setCode(newCode);
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function handleUnlink() {
    setUnlinking(true);
    try {
      await unlinkTelegram(profile.uid);
      setCode(null);
      toast.show(t('telegram.unlinked'), 'success');
    } catch {
      toast.show(t('auth.errors.generic'), 'error');
    } finally {
      setUnlinking(false);
    }
  }

  const isLinked = Boolean(profile.telegramChatId);

  return (
    <div className="mt-6 rounded-xl border border-border p-4">
      <h2 className="font-medium">{t('telegram.title')}</h2>
      {isLinked ? (
        <>
          <p className="mt-2 text-sm text-teal-600 dark:text-teal-400">{t('telegram.linked')}</p>
          <Button variant="secondary" loading={unlinking} onClick={() => void handleUnlink()} className="mt-3">
            {t('telegram.unlink')}
          </Button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-text-muted">{t('telegram.description')}</p>
          {!code ? (
            <Button variant="secondary" loading={generating} onClick={() => void handleGenerate()} className="mt-3">
              {t('telegram.generateCode')}
            </Button>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-sm">
                {t('telegram.step1')} <span className="font-mono font-semibold">/start {code}</span>
              </p>
              {botUsername ? (
                <a
                  href={`https://t.me/${botUsername}?start=${code}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-steel-500 px-4 text-sm font-medium text-white transition-colors hover:bg-steel-600"
                >
                  {t('telegram.openBot')}
                </a>
              ) : (
                <p className="text-xs text-text-muted">{t('telegram.noBotConfigured')}</p>
              )}
              <Button variant="secondary" loading={generating} onClick={() => void handleGenerate()}>
                {t('telegram.regenerateCode')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
