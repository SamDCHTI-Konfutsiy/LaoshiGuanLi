import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, setLanguage, type SupportedLanguage } from '@/i18n';

export function LangToggle() {
  const { t, i18n } = useTranslation();

  return (
    <label className="inline-flex items-center gap-2 text-sm text-text-muted">
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={i18n.language}
        onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
        className="h-9 rounded-lg border border-border bg-surface-raised px-2 text-text
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-steel-500"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {t(`language.${lang}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
