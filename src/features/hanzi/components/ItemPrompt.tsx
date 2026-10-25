import { useTranslation } from 'react-i18next';
import type { HanziItem } from '@/types/models';

/** What the student is shown for one item (never the answer). Shared by the student work page and the teacher review page. */
export function ItemPrompt({ item, index }: { item: HanziItem; index: number }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-sm text-text-muted">{index + 1}.</span>
      {item.showHanzi && (
        <span lang="zh" className="font-kai text-3xl leading-none">
          {item.showHanzi}
        </span>
      )}
      {item.showPinyin && <span className="text-lg">{item.showPinyin}</span>}
      {item.showTranslation && <span className="text-text-muted">«{item.showTranslation}»</span>}
      {item.type === 'dictation' && <span className="text-text-muted">{t('hanzi.work.dictationPrompt')}</span>}
    </div>
  );
}
