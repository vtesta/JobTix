import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface FieldProps {
  label?: string;
  error?: string | null;
  hint?: string;
}

function FieldWrap({ label, error, hint, children }: FieldProps & { children: React.ReactNode }) {
  return (
    <div>
      {label && <label className="field-label">{label}</label>}
      {children}
      {error ? (
        <p className="mt-1 text-2xs text-error-400">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-2xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldProps {}

export function Input({ label, error, hint, className = '', ...rest }: InputProps) {
  return (
    <FieldWrap label={label} error={error} hint={hint}>
      <input
        className={`field-input ${error ? 'field-error' : ''} ${className}`}
        {...rest}
      />
    </FieldWrap>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldProps {}

export function Select({ label, error, hint, className = '', children, ...rest }: SelectProps) {
  return (
    <FieldWrap label={label} error={error} hint={hint}>
      <select
        className={`field-input ${error ? 'field-error' : ''} ${className}`}
        {...rest}
      >
        {children}
      </select>
    </FieldWrap>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {}

export function Textarea({ label, error, hint, className = '', ...rest }: TextareaProps) {
  return (
    <FieldWrap label={label} error={error} hint={hint}>
      <textarea
        className={`field-input min-h-[90px] resize-y ${error ? 'field-error' : ''} ${className}`}
        {...rest}
      />
    </FieldWrap>
  );
}
