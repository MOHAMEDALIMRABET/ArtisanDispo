import React from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  children: React.ReactNode;
}

/**
 * Classes du design system pour un bouton.
 * Exportées pour styler un <Link> comme un bouton sans dupliquer le style.
 */
export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className = '') {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-colors duration-150 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-900',
    secondary: 'bg-navy-800 text-white shadow-sm hover:bg-navy-900 active:bg-navy-950',
    outline: 'border border-slate-300 bg-white text-navy-800 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100',
    ghost: 'text-navy-800 hover:bg-slate-100 active:bg-slate-200',
    danger: 'bg-red-700 text-white shadow-sm hover:bg-red-800 active:bg-red-900',
    success: 'bg-green-700 text-white shadow-sm hover:bg-green-800 active:bg-green-900',
  };

  const sizes: Record<ButtonSize, string> = {
    sm: 'min-h-9 px-3 text-sm',
    md: 'min-h-11 px-4 text-[15px]',
    lg: 'min-h-12 px-6 text-base',
  };

  return `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim();
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonClasses(variant, size, className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? (
        <>
          <Spinner size="sm" className="text-current" />
          Chargement...
        </>
      ) : (
        children
      )}
    </button>
  );
}
