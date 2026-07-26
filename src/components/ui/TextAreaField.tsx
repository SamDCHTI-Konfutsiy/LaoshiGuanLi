import { useId, type TextareaHTMLAttributes } from 'react';

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

export function TextAreaField({ label, error, id, className = '', ...rest }: TextAreaFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-text">
        {label}
      </label>
      <textarea
        id={fieldId}
        aria-invalid={Boolean(error)}
        rows={3}
        {...rest}
        className={
          'rounded-lg border bg-surface-raised px-3 py-2 text-sm text-text placeholder:text-text-muted ' +
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
          (error
            ? 'border-coral-500 focus-visible:outline-coral-500'
            : 'border-border focus-visible:outline-steel-500') +
          ' ' +
          className
        }
      />
      {error && (
        <p role="alert" className="text-sm text-coral-500">
          {error}
        </p>
      )}
    </div>
  );
}
