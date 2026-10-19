import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary:
    'bg-green-600 text-white hover:bg-green-500 active:bg-green-700 shadow-[0_1px_0_rgba(255,255,255,0.12)_inset] focus-visible:ring-green-500/40',
  secondary:
    'bg-ink-800 text-ink-100 border border-ink-600 hover:bg-ink-700 hover:border-ink-500 focus-visible:ring-ink-500/40',
  ghost: 'bg-transparent text-ink-300 hover:text-ink-100 hover:bg-ink-800 focus-visible:ring-ink-500/40',
  danger:
    'bg-error-600 text-white hover:bg-error-500 focus-visible:ring-error-500/40',
};

const sizeClass: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-150
        focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:pointer-events-none
        ${variantClass[variant]} ${sizeClass[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
