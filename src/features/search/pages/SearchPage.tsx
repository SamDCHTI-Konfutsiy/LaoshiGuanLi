import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { globalSearch, type SearchResult } from '@/features/search/service';

export function SearchPage() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!term.trim()) return;
    setLoading(true);
    try {
      const found = await globalSearch(term, profile?.role === 'admin');
      setResults(found);
    } finally {
      setLoading(false);
    }
  }

  function handleOpen(result: SearchResult) {
    navigate(`/${profile?.role}/${result.link}`);
  }

  return (
    <div className="p-6">
      <h1 className="font-display text-xl font-semibold">{t('nav.search')}</h1>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 flex items-end gap-2">
        <TextField
          label={t('search.label')}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t('search.placeholder')}
          className="flex-1"
        />
        <Button type="submit" loading={loading}>
          {t('search.button')}
        </Button>
      </form>

      <div className="mt-6">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : results === null ? (
          <p className="text-sm text-text-muted">{t('search.hint')}</p>
        ) : results.length === 0 ? (
          <EmptyState title={t('search.empty')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => handleOpen(r)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border p-4 text-left hover:bg-surface-raised"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.title}</span>
                      <Badge tone="steel">{t(`search.type.${r.type}`)}</Badge>
                    </div>
                    {r.subtitle && <p className="mt-1 text-sm text-text-muted">{r.subtitle}</p>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
