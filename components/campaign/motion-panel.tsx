'use client';

import { useState } from 'react';
import {
  Download,
  Film,
  ImageDown,
  Pause,
  Play,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { InlineError, Spinner } from '@/components/ui/feedback';
import { FeatureGate } from '@/components/plans/feature-gate';
import { cn } from '@/lib/cn';
import { withMotion } from '@/lib/descriptor';
import {
  DEFAULT_MOTION_DURATION,
  MOTION_PRESETS,
  interpretPrompt,
  planFor,
  type MotionPresetId,
} from '@/lib/motion';
import { hasFeature, type PlanId } from '@/lib/plans';
import {
  dataUrlToBlob,
  downloadBlob,
  exportFilename,
  exportPng,
  exportVideo,
} from '@/lib/video-export';
import type { Descriptor } from '@/lib/types';

type Busy = 'none' | 'png' | 'video';

/**
 * Panneau Animation.
 *
 * Règle produit : l'utilisateur ne voit jamais de keyframes, d'easing, de FPS ni
 * de durée technique. Il choisit une intention, ou la décrit en français. Le
 * Motion Engine traduit — et c'est le même moteur qui alimente l'aperçu et
 * l'export, donc les deux ne peuvent pas diverger.
 */
export function MotionPanel({
  descriptor,
  onChange,
  playing,
  onPlayingChange,
  plan,
  campaignName,
}: {
  descriptor: Descriptor;
  onChange: (next: Descriptor) => void;
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  plan: PlanId | string | null;
  campaignName: string;
}) {
  const [prompt, setPrompt] = useState('');
  const [understood, setUnderstood] = useState<string[]>([]);
  const [busy, setBusy] = useState<Busy>('none');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (!hasFeature(plan, 'motion')) {
    return (
      <FeatureGate
        feature="motion"
        plan={plan}
        title="Animation"
        description="Faites vivre votre cadre : apparition, flottement, pulsation — et exportez-le en vidéo pour les stories et les reels."
      />
    );
  }

  const motion = descriptor.motion ?? null;
  const layerCount = descriptor.layers.length;

  function applyPreset(preset: MotionPresetId) {
    setError(null);
    setUnderstood([]);
    onChange(withMotion(descriptor, planFor(preset, layerCount, DEFAULT_MOTION_DURATION)));
  }

  function interpret() {
    const text = prompt.trim();
    if (!text) return;

    setError(null);
    const result = interpretPrompt(text, layerCount, DEFAULT_MOTION_DURATION);
    setUnderstood(result.understood);
    onChange(withMotion(descriptor, result.plan));

    // L'aperçu démarre tout seul : on montre le résultat, on ne le décrit pas.
    onPlayingChange(true);
  }

  function clear() {
    setError(null);
    setUnderstood([]);
    onPlayingChange(false);
    onChange(withMotion(descriptor, null));
  }

  async function savePng() {
    setError(null);
    setBusy('png');
    try {
      const dataUrl = await exportPng({ descriptor, plan });
      downloadBlob(dataUrlToBlob(dataUrl), exportFilename(campaignName, 'png'));
    } catch {
      setError("L'export PNG a échoué. Réessayez dans un instant.");
    } finally {
      setBusy('none');
    }
  }

  async function saveVideo() {
    setError(null);
    setBusy('video');
    setProgress(0);
    onPlayingChange(false);
    try {
      const result = await exportVideo({
        descriptor,
        plan,
        onProgress: (p) => setProgress(p.ratio),
      });
      downloadBlob(result.blob, exportFilename(campaignName, result.extension));
    } catch (err) {
      setError(
        err instanceof Error && err.name === 'AbortError'
          ? 'Export interrompu.'
          : "L'export vidéo a échoué. Votre navigateur ne sait peut-être pas encoder en WebM — essayez l'export PNG.",
      );
    } finally {
      setBusy('none');
      setProgress(0);
    }
  }

  const activePreset = motion?.preset ?? null;

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <Sparkles className="size-4 text-purple" strokeWidth={1.75} aria-hidden />
            Animation
          </h2>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-gray-500">
            Choisissez une intention, ou décrivez-la avec vos mots. Le cadre reste rejouable à
            l’identique : l’animation est enregistrée dans le descripteur.
          </p>
        </div>

        {motion && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Rendre statique
          </Button>
        )}
      </div>

      <InlineError>{error}</InlineError>

      {/* ---------------- Description en français ---------------- */}
      <div className="flex flex-col gap-3 rounded-md border border-gray-200 bg-gray-50 p-4">
        <Field
          label="Décrivez l’animation"
          hint="Par exemple : « le cadre apparaît doucement puis flotte légèrement »."
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  interpret();
                }
              }}
              placeholder="Le cadre apparaît doucement…"
              aria-label="Description de l’animation"
            />
            <Button
              variant="secondary"
              className="shrink-0"
              onClick={interpret}
              disabled={prompt.trim().length === 0}
            >
              <Wand2 className="size-4" strokeWidth={1.75} aria-hidden />
              Interpréter
            </Button>
          </div>
        </Field>

        {understood.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-gray-500">Compris :</span>
            {understood.map((item) => (
              <span
                key={item}
                className="rounded-pill border border-gray-200 bg-white px-2 py-0.5 text-[12px] text-gray-700"
              >
                {item}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ---------------- Presets ---------------- */}
      <div className="flex flex-col gap-3">
        <span className="text-[13px] font-medium text-gray-700">Ou choisissez un mouvement</span>
        <div className="flex flex-wrap gap-2">
          {MOTION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.description}
              onClick={() => applyPreset(preset.id)}
              aria-pressed={activePreset === preset.id}
              className={cn(
                'rounded-pill border px-3.5 py-2 text-[13px] transition-colors duration-150 ease-brand',
                activePreset === preset.id
                  ? 'border-ink bg-ink text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-ink',
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {activePreset && (
          <p className="text-[12px] text-gray-500">
            {MOTION_PRESETS.find((p) => p.id === activePreset)?.description} ·{' '}
            {layerCount} calque{layerCount > 1 ? 's' : ''} animé{layerCount > 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* ---------------- Aperçu ---------------- */}
      <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4">
        <Button
          variant={playing ? 'ghost' : 'secondary'}
          onClick={() => onPlayingChange(!playing)}
          disabled={!motion || layerCount === 0}
        >
          {playing ? (
            <>
              <Pause className="size-4" strokeWidth={1.75} aria-hidden />
              Arrêter l’aperçu
            </>
          ) : (
            <>
              <Play className="size-4" strokeWidth={1.75} aria-hidden />
              Lire l’animation
            </>
          )}
        </Button>
        {!motion && (
          <span className="text-[12px] text-gray-500">
            {layerCount === 0
              ? 'Ajoutez d’abord un élément au cadre.'
              : 'Choisissez un mouvement pour voir l’aperçu.'}
          </span>
        )}
      </div>

      {/* ---------------- Export ---------------- */}
      <div className="flex flex-col gap-3 border-t border-gray-200 pt-4">
        <span className="text-[13px] font-medium text-gray-700">Exporter</span>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => void savePng()} disabled={busy !== 'none'}>
            {busy === 'png' ? (
              <Spinner className="size-4" />
            ) : (
              <ImageDown className="size-4" strokeWidth={1.75} aria-hidden />
            )}
            Image PNG
          </Button>

          <Button
            variant="primary"
            onClick={() => void saveVideo()}
            disabled={busy !== 'none' || layerCount === 0}
          >
            {busy === 'video' ? (
              <Spinner className="size-4 text-white" />
            ) : (
              <Film className="size-4" strokeWidth={1.75} aria-hidden />
            )}
            Vidéo {busy === 'video' ? `— ${Math.round(progress * 100)} %` : ''}
          </Button>

          <span className="flex items-center gap-1.5 text-[12px] text-gray-500">
            <Download className="size-3.5" aria-hidden />
            Rendu à la résolution native, dans le navigateur.
          </span>
        </div>

        {!hasFeature(plan, 'no_watermark') && (
          <p className="text-[12px] leading-relaxed text-gray-500">
            La formule Free appose un badge discret « Créé avec Campagnes » dans le coin des
            exports. Il disparaît avec Creator.
          </p>
        )}
      </div>
    </div>
  );
}
