interface TabItem<T extends string> {
  value: T;
  label: string;
}

interface TabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  items: TabItem<T>[];
}

export function Tabs<T extends string>({ value, onChange, items }: TabsProps<T>) {
  return (
    <div role="tablist" className="inline-flex gap-1 rounded-lg border border-border bg-surface-raised p-1">
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          type="button"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
            (value === item.value ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text')
          }
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
