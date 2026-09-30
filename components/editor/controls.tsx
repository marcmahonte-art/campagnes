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

const COLOR_SWATCHES = [
  { value: '#000000', label: 'Noir' },
  { value: '#FFFFFF', label: 'Blanc' },
  { value: '#7B61FF', label: 'Violet' },
  { value: '#FF6B6B', label: 'Corail' },
  { value: '#FFD93D', label: 'Jaune' },
  { value: '#22C55E', label: 'Vert' },
  { value: '#EF4444', label: 'Rouge' },
];

/** Un hex complet, tel que Fabric l'attend. */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Une valeur est-elle une couleur exploitable ?
 *
 * `transparent` et `brand-gradient` sont des couleurs comme les autres pour
 * Fabric : les traiter à part créerait trois chemins de rendu au lieu d'un.
 */
function isPaint(value: string): boolean {
  return value === 'transparent' || value === 'brand-gradient' || HEX.test(value);
}

/**
 * Un champ de couleur.
 *
 * Deux usages, une même ligne : choisir une teinte (texte, forme) ou la retire
 * complètement (forme évidée, contour absent). D'où les options `transparent`
 * et `brand-gradient` — ce sont des valeurs de couleur comme les autres pour
 * Fabric, et les traiter à part ferait trois chemins de rendu au lieu d'un.
 */
export function ColorRow({
  label,
  value,
  onChange,
  allowGradient = true,
  allowTransparent = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowGradient?: boolean;
  /** Forme évidée : sans remplissage. */
  allowTransparent?: boolean;
}) {
  const id = useId();
  const isGradient = value === 'brand-gradient';
  const isTransparent = value === 'transparent';
  // Un `type="color"` n'accepte qu'un hex : une valeur rarer doit lui donner
  // autre chose, sinon le navigateur tombe sur `#000000` et la nuance montre un
  // noir que personne n'a choisi.
  const hexValue = HEX.test(value) ? value : '#7B61FF';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[12px] font-medium text-gray-700">
          {label}
        </label>
        <span className="font-mono text-[11px] uppercase text-gray-500">
          {isGradient ? 'Dégradé signature' : isTransparent ? 'évidé' : value}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {COLOR_SWATCHES.map((swatch) => (
          <button
            key={swatch.value}
            type="button"
            title={swatch.label}
            aria-label={swatch.label}
            aria-pressed={value.toLowerCase() === swatch.value.toLowerCase()}
            onClick={() => onChange(swatch.value)}
            className={cn(
              'size-6 rounded-full border transition-transform hover:scale-110 focus:outline-none',
              value.toLowerCase() === swatch.value.toLowerCase()
                ? 'scale-105 border-gray-400 ring-2 ring-purple ring-offset-1'
                : 'border-gray-300',
            )}
            style={{ backgroundColor: swatch.value }}
          />
        ))}

        {allowGradient && (
          <button
            type="button"
            title="Dégradé signature Campagnes"
            aria-label="Dégradé signature Campagnes"
            aria-pressed={isGradient}
            onClick={() => onChange('brand-gradient')}
            className={cn(
              'h-6 rounded-full px-2 text-[10px] font-semibold text-white transition-transform hover:scale-105',
              isGradient ? 'scale-105 ring-2 ring-purple ring-offset-1' : 'opacity-90',
            )}
            style={{ background: 'linear-gradient(135deg, #7B61FF 0%, #FF6B6B 50%, #FFD93D 100%)' }}
          >
            Dégradé
          </button>
        )}

        {allowTransparent && (
          <button
            type="button"
            title="Aucun remplissage : la forme n'est qu'un contour"
            aria-label="Aucun remplissage"
            aria-pressed={isTransparent}
            onClick={() => onChange('transparent')}
            /*
             * Quadrillé plutôt que blanc : « blanc » se confondrait avec la
             * nuance Blanche juste à côté, et l'utilisateur ne verrait pas ce
             * qu'il vient de choisir.
             */
            className={cn(
              'size-6 rounded-full border bg-white transition-transform hover:scale-110 focus:outline-none',
              isTransparent
                ? 'scale-105 border-gray-400 ring-2 ring-purple ring-offset-1'
                : 'border-gray-300',
            )}
            style={{
              backgroundImage:
                'linear-gradient(45deg, #d1d5db 25%, transparent 25%), linear-gradient(-45deg, #d1d5db 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d1d5db 75%), linear-gradient(-45deg, transparent 75%, #d1d5db 75%)',
              backgroundSize: '8px 8px',
              backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0',
            }}
          />
        )}
      </div>

      {!isGradient && !isTransparent && (
        <div className="flex items-center gap-2 pt-0.5">
          <input
            id={id}
            type="color"
            value={hexValue}
            onChange={(e) => onChange(e.target.value)}
            className="size-7 cursor-pointer rounded border border-gray-200 bg-white p-0.5"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => {
              const typed = e.target.value.trim();
              /*
               * Le descripteur ne reçoit que ce qui est une couleur entière, ou
               * une frappe en cours — vide, ou un hex partiel pendant la
               * saisie. Le reste est ignoré : effacer le `#` d'un `#FF0000`
               * peindrait sinon le calque en noir, et l'utilisateur ne
               * pourrait plus revenir en arrière d'un simple Ctrl+Z, la faute
               * étant au champ lui-même.
               */
              if (typed === '' || typed.startsWith('#') || isPaint(typed)) onChange(typed);
            }}
            placeholder="#FFFFFF"
            spellCheck={false}
            className="h-7 w-24 rounded border border-gray-200 px-2 font-mono text-[11px] uppercase text-gray-700 transition-colors focus:border-purple focus:outline-none"
          />
        </div>
      )}
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
