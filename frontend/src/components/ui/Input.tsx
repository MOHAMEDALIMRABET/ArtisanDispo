import React from 'react';

export const fieldClasses =
  'w-full min-h-11 rounded-lg border bg-white px-3.5 py-2.5 text-[15px] text-slate-900 shadow-sm transition-colors ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 ' +
  'disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed';

interface FieldWrapperProps {
  id?: string;
  label?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  children: React.ReactNode;
}

export function FieldWrapper({ id, label, required, error, helperText, children }: FieldWrapperProps) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-600">*</span>}
        </label>
      )}
      {children}
      {error && <p className="mt-1.5 text-sm text-red-700">{error}</p>}
      {helperText && !error && <p className="mt-1.5 text-sm text-slate-500">{helperText}</p>}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  className = '',
  id,
  ...props
}, ref) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <FieldWrapper id={inputId} label={label} required={props.required} error={error} helperText={helperText}>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={`${fieldClasses} ${error ? 'border-red-500 focus:ring-red-500/30 focus:border-red-500' : 'border-slate-300'} ${className}`}
        {...props}
      />
    </FieldWrapper>
  );
});

Input.displayName = 'Input';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  error,
  helperText,
  className = '',
  id,
  children,
  ...props
}, ref) => {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <FieldWrapper id={selectId} label={label} required={props.required} error={error} helperText={helperText}>
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        className={`${fieldClasses} ${error ? 'border-red-500' : 'border-slate-300'} ${className}`}
        {...props}
      >
        {children}
      </select>
    </FieldWrapper>
  );
});

Select.displayName = 'Select';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  error,
  helperText,
  className = '',
  id,
  ...props
}, ref) => {
  const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <FieldWrapper id={textareaId} label={label} required={props.required} error={error} helperText={helperText}>
      <textarea
        ref={ref}
        id={textareaId}
        aria-invalid={error ? true : undefined}
        className={`${fieldClasses} ${error ? 'border-red-500' : 'border-slate-300'} ${className}`}
        {...props}
      />
    </FieldWrapper>
  );
});

Textarea.displayName = 'Textarea';
