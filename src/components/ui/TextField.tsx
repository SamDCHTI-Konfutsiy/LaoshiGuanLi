import { useId, type InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function TextField({ label, error, id, className = '', ...rest }: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-text">
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        {...rest}
        className={
          'h-10 rounded-lg border bg-surface-raised px-3 text-sm text-text placeholder:text-text-muted ' +
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
          (error
            ? 'border-coral-500 focus-visible:outline-coral-500'
            : 'border-border focus-visible:outline-steel-500') +
          ' ' +
          className
        }
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-coral-500">
          {error}
        </p>
      )}
    </div>
  );
}
