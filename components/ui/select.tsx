import type { ChangeEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Même habillage que `Input` (voir `components/ui/input.tsx`) : un formulaire
 * qui mélange deux hauteurs de champ se lit mal.
 *
 * `id` est transmis au `<select>` pour que le `<label htmlFor>` du composant
 * `Field` pointe réellement sur le champ — sans lui, cliquer sur le label
 * n'ouvre pas la liste.
 */
const FIELD =
  'w-full h-12 rounded-md border border-gray-200 bg-white px-4 text-[15px] text-ink ' +
  'transition-colors duration-150 ease-brand ' +
  'focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/20 ' +
  'disabled:bg-gray-50 disabled:text-gray-500';

export function Select({
  id,
  value,
  onChange,
  className,
  children,
}: {
  id?: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <select id={id} value={value} onChange={onChange} className={cn(FIELD, className)}>
      {children}
    </select>
  );
}
