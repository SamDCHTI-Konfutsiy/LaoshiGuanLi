import { useId, type SelectHTMLAttributes } from 'react';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
}

export function SelectField({ label, error, id, className = '', children, ...rest }: SelectFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-text">
        {label}
      </label>
      <select
        id={fieldId}
        aria-invalid={Boolean(error)}
        {...rest}
        className={
          'h-10 rounded-lg border bg-surface-raised px-3 text-sm text-text ' +
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
          (error
            ? 'border-coral-500 focus-visible:outline-coral-500'
            : 'border-border focus-visible:outline-steel-500') +
          ' ' +
          className
        }
      >
        {children}
      </select>
      {error && (
        <p role="alert" className="text-sm text-coral-500">
          {error}
        </p>
      )}
    </div>
  );
}
