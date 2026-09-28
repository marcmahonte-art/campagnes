'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { backend } from '@/lib/backend';

/**
 * Sélecteur de logo — volontairement minimal (§11 du design system).
 * Sur mobile, un seul bouton ; le glisser-déposer est un bonus desktop.
 */
export function LogoUploader({
  value,
  onChange,
  label = 'Logo de l’organisation',
  hint = 'PNG ou JPG, carré de préférence. Optionnel.',
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const result = await backend.uploadImage(file, 'logo');
      if (result.error) {
        setError(result.error);
        return;
      }
      onChange(result.data ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-gray-700">{label}</span>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`flex items-center gap-4 rounded-md border border-dashed px-4 py-3 transition-colors ${
          dragging ? 'border-purple bg-purple/5' : 'border-gray-200 bg-white'
        }`}
      >
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="size-full object-cover" />
          ) : busy ? (
            <Loader2 className="size-5 animate-spin text-gray-400" aria-hidden />
          ) : (
            <ImagePlus className="size-5 text-gray-400" strokeWidth={1.75} aria-hidden />
          )}
        </span>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="rounded-pill border border-gray-200 px-3.5 py-1.5 text-[13px] font-medium transition-colors hover:border-ink disabled:opacity-50"
            >
              {value ? 'Remplacer' : 'Choisir un fichier'}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="text-[13px] text-gray-500 transition-colors hover:text-error"
              >
                Retirer
              </button>
            )}
          </div>
          <span className="mt-1 truncate text-xs text-gray-500">{error ?? hint}</span>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
