'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Briques d'interface de l'éditeur.
 *
 * Rien ici n'est un « composant de design system » : ce sont les formes déjà
 * utilisées par le reste du produit, rassemblées pour que les panneaux
 * contextuels restent lisibles. Aucune nouvelle couleur, aucun nouveau dégradé.
 */

/* ------------------------------------------------------------------ */
/* Titre de panneau                                                    */
/* ------------------------------------------------------------------ */

export function PanelHeading({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold leading-tight">{title}</h3>
        {hint && <p className="mt-1 text-[12px] leading-relaxed text-gray-500">{hint}</p>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bouton d'outil — rail latéral et barre du bas                       */
/* ------------------------------------------------------------------ */

export function ToolButton({
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
  compact = false,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** Rail étroit : l'icône seule, le libellé reste accessible aux lecteurs d'écran. */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={label}
      className={cn(
        'flex items-center gap-3 rounded-md transition-colors duration-150 ease-brand',
        'disabled:opacity-40 disabled:pointer-events-none',
        compact
          ? 'h-11 w-11 justify-center'
          : 'w-full px-3 py-2.5 text-left text-[13px]',
        active ? 'bg-gray-100 text-ink' : 'text-gray-500 hover:bg-gray-50 hover:text-ink',
      )}
    >
      <span className={cn('shrink-0', active && 'text-purple')} aria-hidden>
        {icon}
      </span>
      {!compact && <span className="truncate font-medium">{label}</span>}
      {/* Le libellé reste dans l'arbre d'accessibilité même en mode compact. */}
      {compact && <span className="sr-only">{label}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Choix parmi quelques valeurs                                        */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-gray-700">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-sm border py-1.5 text-[12px] transition-colors duration-150',
              value === option.value
                ? 'border-ink bg-ink text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:border-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Réglage continu — jamais de valeur technique brute                  */
/* ------------------------------------------------------------------ */

export function RangeRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Ce qu'on lit à la place du nombre (« Moins », « 80 % »…). */
  display: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[12px] font-medium text-gray-700">
          {label}
        </label>
        <span className="text-[12px] tabular-nums text-gray-500">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-purple disabled:opacity-40"
      />
    </div>
  );
}

/**
 * Réglage pas à pas — « − valeur + ».
 *
 * Choisi pour la taille du texte : le geste est plus sûr qu'un curseur quand on
 * veut ajuster finement, et il ne demande jamais de taper un chiffre.
 */
export function StepperRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  display: string;
  disabled?: boolean;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const button =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-[16px] leading-none text-gray-600 transition-colors hover:border-ink hover:text-ink disabled:opacity-35 disabled:pointer-events-none';

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={button}
          disabled={disabled || value <= min}
          aria-label={`Diminuer : ${label}`}
          onClick={() => onChange(clamp(value - step))}
        >
          −
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-[13px] font-medium tabular-nums text-ink">
          {display}
        </span>
        <button
          type="button"
          className={button}
          disabled={disabled || value >= max}
          aria-label={`Augmenter : ${label}`}
          onClick={() => onChange(clamp(value + step))}
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * Saisie numérique exacte — réservée au niveau avancé.
 *
 * Le niveau simple parle en mots (« Moyen ») ; c'est ici, derrière « Plus de
 * réglages », qu'on retrouve la valeur technique quand on en a vraiment besoin.
 */
export function NumberRow({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-medium text-gray-700">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
          }}
          className="h-9 w-24 rounded-md border border-gray-200 bg-white px-3 text-[13px] tabular-nums text-ink transition-colors focus:border-purple focus:outline-none focus:ring-2 focus:ring-purple/20"
        />
        {suffix && <span className="text-[12px] text-gray-500">{suffix}</span>}
      </div>
    </div>
  );
}

export function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-medium text-gray-700">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-12 cursor-pointer rounded-sm border border-gray-200 bg-white"
        />
        <span className="font-mono text-[12px] text-gray-500">{value}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Option secondaire — la seule façon d'exposer un réglage de trop     */
/* ------------------------------------------------------------------ */

/**
 * Le `•••` du produit.
 *
 * Règle absolue : un panneau de configuration complexe n'est jamais exposé.
 * Tout ce qui n'est pas nécessaire au geste en cours passe derrière ce bouton.
 */
export function Disclosure({ label = 'Plus', children }: { label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center justify-between rounded-sm px-1 py-1.5 text-[12px] text-gray-500 transition-colors hover:text-ink"
      >
        <span>{label}</span>
        <ChevronDown
          className={cn('size-3.5 transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div id={id} className="flex flex-col gap-4 rounded-md border border-gray-200 bg-gray-50 p-3">
          {children}
        </div>
      )}
    </div>
  );
}
