'use client';

import { useState } from 'react';
import { Film, ImageDown, Loader2, Pause, Play, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { FeatureGate } from '@/components/plans/feature-gate';
import { PanelHeading } from '@/components/editor/controls';
import { cn } from '@/lib/cn';
import { withMotion } from '@/lib/descriptor';
import {
  DEFAULT_MOTION_DURATION,
  MOTION_PRESETS,
  SIMPLE_MOTIONS,
  planFor,
  type MotionPresetId,
} from '@/lib/motion';
import {
  MOTION_PROMPT_SUGGESTIONS,
  generateAnimation,
} from '@/lib/motion-ai';
import { hasFeature, type PlanId } from '@/lib/plans';
import {
  dataUrlToBlob,
  downloadBlob,
  exportFilename,
  exportPng,
  exportVideo,
} from '@/lib/video-export';
import type { Descriptor } from '@/lib/types';

type Busy = 'none' | 'ai' | 'png' | 'video';

/**
 * Panneau Animation de l'éditeur.
 *
 * Trois niveaux, jamais affichés en même temps :
 *   1. cinq mouvements simples — un clic, c'est fait ;
 *   2. « ✦ Animer avec l'IA » — on décrit, le moteur traduit et **dit ce qu'il a
 *      compris** (aucune promesse de modèle distant : voir `lib/motion-ai.ts`) ;
 *   3. l'export, en bas, parce qu'il n'est utile qu'une fois le cadre réglé.
 *
 * Aucune timeline, aucun keyframe, aucun FPS : le créateur ne règle pas une
 * animation, il choisit une intention.
 */
export function AnimationPanel({
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
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>('none');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (!hasFeature(plan, 'motion')) {
    return (
      <FeatureGate
        feature="motion"
        plan={plan}
        title="Animation"
        description="Faites vivre votre cadre : apparition, zoom, glissement — et exportez-le en vidéo pour les stories et les reels."
      />
    );
  }

  const motion = descriptor.motion ?? null;
  const layerCount = descriptor.layers.length;

  function applyPreset(preset: MotionPresetId) {
    setError(null);
    setUnderstood([]);
    setNote(null);
    onChange(withMotion(descriptor, planFor(preset, layerCount, DEFAULT_MOTION_DURATION)));
  }

  async function animate() {
    const text = prompt.trim();
    if (!text || busy !== 'none') return;

    setError(null);
    setBusy('ai');
    setUnderstood([]);
    setNote(null);
    try {
      const result = await generateAnimation({ prompt: text, layerCount });
      setUnderstood(result.understood);
      setNote(result.note);
      onChange(withMotion(descriptor, result.plan));
      // L'aperçu démarre tout seul : on montre le résultat, on ne le décrit pas.
      onPlayingChange(true);
    } catch {
      setError("L'animation n'a pas pu être générée. Réessayez dans un instant.");
    } finally {
      setBusy('none');
    }
  }

  function clear() {
    setError(null);
    setUnderstood([]);
    setNote(null);
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
      const result = await exportVideo({ descriptor, plan, onProgress: (p) => setProgress(p.ratio) });
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
  const activeLabel =
    activePreset === 'auto'
      ? 'Sur mesure'
      : MOTION_PRESETS.find((p) => p.id === activePreset)?.label ?? null;

  return (
    <div className="flex flex-col gap-5">
      <PanelHeading
        title="Animation"
        hint="Choisissez un mouvement, ou décrivez-le avec vos mots. Aucun réglage technique."
      >
        {motion && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Statique
          </Button>
        )}
      </PanelHeading>

      {error && <p className="text-[12px] text-error">{error}</p>}

      {/* ---------------- Cinq mouvements simples ---------------- */}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Mouvement du cadre">
        {SIMPLE_MOTIONS.map((motion_) => (
          <button
            key={motion_.id}
            type="button"
            role="radio"
            aria-checked={activePreset === motion_.id}
            disabled={layerCount === 0}
            onClick={() => applyPreset(motion_.id)}
            className={cn(
              'rounded-pill border px-3.5 py-2 text-[13px] transition-colors duration-150 ease-brand',
              'disabled:opacity-40 disabled:pointer-events-none',
              activePreset === motion_.id
                ? 'border-ink bg-ink text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:border-ink',
            )}
          >
            {motion_.label}
          </button>
        ))}
      </div>

      {layerCount === 0 && (
        <p className="text-[12px] leading-relaxed text-gray-500">
          Ajoutez d’abord un élément au cadre pour pouvoir l’animer.
        </p>
      )}

      {activeLabel && (
        <p className="text-[12px] leading-relaxed text-gray-500">
          {motion?.preset === 'auto'
            ? 'Animation sur mesure, enregistrée dans le cadre.'
            : `${activeLabel} · ${layerCount} élément${layerCount > 1 ? 's' : ''} animé${layerCount > 1 ? 's' : ''}.`}
        </p>
      )}

      {/* ---------------- Animer avec l'IA ---------------- */}
      <div className="flex flex-col gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
        <Field
          label="✦ Animer avec l’IA"
          hint="Décrivez le mouvement avec vos mots. Le moteur traduit — et vous dit ce qu’il a compris."
        >
          <div className="flex flex-col gap-2">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void animate();
                }
              }}
              placeholder="Le cadre apparaît doucement…"
              aria-label="Description de l’animation"
            />
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => void animate()}
              disabled={prompt.trim().length === 0 || busy !== 'none' || layerCount === 0}
            >
              {busy === 'ai' ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Wand2 className="size-4" strokeWidth={1.75} aria-hidden />
              )}
              {busy === 'ai' ? 'Je compose…' : 'Animer'}
            </Button>
          </div>
        </Field>

        <div className="flex flex-wrap gap-1.5">
          {MOTION_PROMPT_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => setPrompt(suggestion)}
              className="rounded-pill border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-500 transition-colors hover:border-ink hover:text-ink"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {understood.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] text-gray-500">Compris :</span>
            <div className="flex flex-wrap gap-1.5">
              {understood.map((item) => (
                <span
                  key={item}
                  className="rounded-pill border border-gray-200 bg-white px-2 py-0.5 text-[12px] text-gray-700"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {note && <p className="text-[11px] leading-relaxed text-gray-400">{note}</p>}
      </div>

      {/* ---------------- Aperçu ---------------- */}
      <div className="border-t border-gray-200 pt-4">
        <Button
          variant={playing ? 'ghost' : 'secondary'}
          className="w-full"
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
      </div>

      {/* ---------------- Export ---------------- */}
      <div className="flex flex-col gap-2.5 border-t border-gray-200 pt-4">
        <span className="text-[12px] font-medium text-gray-700">Exporter</span>
        <div className="flex flex-col gap-2">
          <Button variant="ghost" onClick={() => void savePng()} disabled={busy !== 'none'}>
            {busy === 'png' ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
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
              <Loader2 className="size-4 animate-spin text-white" aria-hidden />
            ) : (
              <Film className="size-4" strokeWidth={1.75} aria-hidden />
            )}
            Vidéo {busy === 'video' ? `— ${Math.round(progress * 100)} %` : ''}
          </Button>
        </div>

        {!hasFeature(plan, 'no_watermark') && (
          <p className="text-[11px] leading-relaxed text-gray-500">
            La formule Free appose un badge discret « Créé avec Campagnes » dans le coin des
            exports. Il disparaît avec Creator.
          </p>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-gray-400">
        <Sparkles className="size-3" aria-hidden />
        Rendu à la résolution native, dans le navigateur.
      </p>
    </div>
  );
}
