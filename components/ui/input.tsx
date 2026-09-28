import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const FIELD =
  'w-full h-12 rounded-md border border-gray-200 bg-white px-4 text-[15px] text-ink ' +
  'placeholder:text-gray-400 transition-colors duration-150 ease-brand ' +
  'focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/20 ' +
  'disabled:bg-gray-50 disabled:text-gray-500';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD, 'h-auto py-3 leading-relaxed', className)} {...rest} />;
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, error, htmlFor, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-gray-700">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
      {error && <p className="text-xs font-medium text-error">{error}</p>}
    </div>
  );
}

/** Préfixe visuel pour les champs dont la valeur est un segment d'URL. */
export function InputPrefix({
  prefix,
  children,
}: {
  prefix: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-12 items-center rounded-md border border-gray-200 bg-white pl-4 transition-colors focus-within:border-purple focus-within:ring-2 focus-within:ring-purple/20">
      <span className="shrink-0 text-[15px] text-gray-500 select-none">{prefix}</span>
      <div className="flex-1 [&_input]:h-full [&_input]:border-0 [&_input]:pl-1 [&_input]:focus:ring-0 [&_input]:focus:border-0">
        {children}
      </div>
    </div>
  );
}
