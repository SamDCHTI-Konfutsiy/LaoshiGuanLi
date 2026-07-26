import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-steel-500 text-white hover:bg-steel-600',
  secondary: 'border border-border bg-surface-raised text-text hover:bg-surface',
  ghost: 'text-text-muted hover:bg-surface-raised hover:text-text',
};

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled ?? loading}
      aria-busy={loading}
      className={
        'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium ' +
        'transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
        'focus-visible:outline-steel-500 disabled:cursor-not-allowed disabled:opacity-60 ' +
        VARIANT_CLASSES[variant] +
        ' ' +
        className
      }
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
