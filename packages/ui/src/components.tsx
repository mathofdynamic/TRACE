import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export type TraceButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';

export interface TraceButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: TraceButtonVariant;
  children: ReactNode;
}

export function TraceButton({
  variant = 'secondary',
  className = '',
  children,
  ...props
}: TraceButtonProps) {
  return (
    <button className={`trace-button trace-button--${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

export type TraceBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface TraceBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: TraceBadgeTone;
  children: ReactNode;
}

export function TraceBadge({
  tone = 'neutral',
  className = '',
  children,
  ...props
}: TraceBadgeProps) {
  return (
    <span className={`trace-badge trace-badge--${tone} ${className}`.trim()} {...props}>
      {children}
    </span>
  );
}

export function TraceCard({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`trace-card ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export interface TraceFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
}

export function TraceField({ id, label, error, className = '', ...props }: TraceFieldProps) {
  const describedBy = error ? `${id}-error` : undefined;

  return (
    <label className="trace-field" htmlFor={id}>
      <span className="trace-field__label">{label}</span>
      <input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={Boolean(error)}
        className={`trace-input ${className}`.trim()}
        {...props}
      />
      {error ? (
        <span className="trace-field__error" id={describedBy} role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
