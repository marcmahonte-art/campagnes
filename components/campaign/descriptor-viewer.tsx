'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Copy, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { serializeDescriptor, validateDescriptor } from '@/lib/descriptor';
import type { Descriptor } from '@/lib/types';

/**
 * Le descripteur, visible et inspectable — livrable explicite du brief.
 * C'est aussi l'outil de validation : la forme affichée ici est exactement celle
 * qui est écrite dans `frames.descriptor_json`.
 */
export function DescriptorViewer({ descriptor }: { descriptor: Descriptor }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const json = useMemo(() => serializeDescriptor(descriptor), [descriptor]);
  const validation = useMemo(() => validateDescriptor(descriptor), [descriptor]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <span className="flex-1">
          <span className="block text-[13px] font-semibold text-ink">
            Descripteur du cadre
          </span>
          <span className="mt-0.5 block text-xs text-gray-500">
            version {descriptor.version} · ratio {descriptor.ratio} ·{' '}
            {descriptor.layers.length} calque{descriptor.layers.length > 1 ? 's' : ''}
          </span>
        </span>

        <span
          className={cn(
            'flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11px] font-medium',
            validation.ok
              ? 'border-success/25 bg-success/10 text-success'
              : 'border-error/25 bg-error/10 text-error',
          )}
        >
          {validation.ok ? (
            <>
              <Check className="size-3" strokeWidth={3} aria-hidden />
              Valide
            </>
          ) : (
            <>
              <TriangleAlert className="size-3" aria-hidden />
              {validation.errors.length} erreur{validation.errors.length > 1 ? 's' : ''}
            </>
          )}
        </span>

        <ChevronDown
          className={cn('size-4 text-gray-400 transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-gray-200">
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
            <span className="font-mono text-[11px] text-gray-500">frames.descriptor_json</span>
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] text-gray-600 transition-colors hover:text-ink"
            >
              {copied ? (
                <>
                  <Check className="size-3 text-success" aria-hidden /> Copié
                </>
              ) : (
                <>
                  <Copy className="size-3" aria-hidden /> Copier
                </>
              )}
            </button>
          </div>

          <pre className="max-h-80 overflow-auto bg-white p-4 font-mono text-[11px] leading-relaxed text-gray-700">
            {json}
          </pre>

          {validation.warnings.length > 0 && (
            <ul className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-[11px] text-gray-500">
              {validation.warnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
