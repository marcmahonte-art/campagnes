'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, InputPrefix } from '@/components/ui/input';
import { RatioPicker } from '@/components/ui/ratio-picker';
import { KindPicker } from '@/components/ui/kind-picker';
import { InlineError, Spinner } from '@/components/ui/feedback';
import { backend } from '@/lib/backend';
import { useSession } from '@/lib/backend/session';
import { isValidSlug, slugFromName, uniqueSlug } from '@/lib/slug';
import { defaultRatioFor, kindSpec } from '@/lib/campaign-kinds';
import type { CampaignKind, Ratio } from '@/lib/types';

/**
 * Création de campagne — une seule action principale par écran (§25, règle 1).
 *
 * L'ordre suit les deux questions que se pose vraiment un créateur : qu'est-ce
 * que ma communauté va y déposer (le type), puis comment c'est nommé et
 * formaté. Le slug est généré automatiquement mais reste modifiable.
 */
export default function NewCampaignPage() {
  const router = useRouter();
  const { user } = useSession();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [kind, setKind] = useState<CampaignKind>('photo_frame');
  const [ratio, setRatio] = useState<Ratio>('1:1');
  const [ratioTouched, setRatioTouched] = useState(false);
  const [existingSlugs, setExistingSlugs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void backend.listSlugs().then(setExistingSlugs);
  }, []);

  // Slug automatique tant que l'utilisateur ne l'a pas modifié lui-même.
  useEffect(() => {
    if (slugTouched) return;
    setSlug(name.trim() ? slugFromName(name) : '');
  }, [name, slugTouched]);

  // Le type suggère un format, jamais l'inverse : tant que le créateur n'a pas
  // choisi de format lui-même, le changement de type réaligne le format.
  useEffect(() => {
    if (ratioTouched) return;
    setRatio(defaultRatioFor(kind));
  }, [kind, ratioTouched]);

  const slugValid = useMemo(() => isValidSlug(slug), [slug]);
  const slugTaken = useMemo(() => existingSlugs.includes(slug), [existingSlugs, slug]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setError(null);

    if (!name.trim()) {
      setError('Donnez un nom à votre campagne.');
      return;
    }
    if (!slugValid) {
      setError('L’adresse doit contenir 3 à 60 caractères : lettres minuscules, chiffres, tirets.');
      return;
    }
    if (slugTaken) {
      setError('Cette adresse est déjà utilisée. Choisissez-en une autre.');
      return;
    }

    setPending(true);
    try {
      const finalSlug = uniqueSlug(slug, existingSlugs);
      const result = await backend.createCampaign({
        ownerId: user.id,
        name: name.trim(),
        slug: finalSlug,
        ratio,
        kind,
      });
      if (result.error || !result.data) {
        setError(result.error ?? 'La création a échoué.');
        return;
      }
      router.push(`/campaigns/${result.data.id}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-[640px]">
      <header className="mb-8">
        <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-gray-500">
          Nouvelle campagne
        </span>
        <h1 className="mt-3 text-[28px] font-bold leading-tight md:text-[36px]">
          Que vont-yls déposer vos participants ?
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          Une photo, une vidéo, ou une photo sur votre décor. Ce choix détermine le parcours
          qui les attend — tout reste modifiable ensuite.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4 p-5 md:p-6">
          <div>
            <h2 className="text-[15px] font-semibold">Type de campagne</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
              {kindSpec(kind).detail}
            </p>
          </div>
          <KindPicker value={kind} onChange={setKind} />
        </Card>

        <Card className="flex flex-col gap-6 p-5 md:p-6">
          <Field label="Nom de la campagne" htmlFor="name">
            <Input
              id="name"
              required
              placeholder="Rentrée 2026 — UFHB"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field
            label="Adresse de la campagne"
            hint="Générée automatiquement. Modifiable."
            error={
              slug && !slugValid
                ? 'Format invalide.'
                : slugTaken
                  ? 'Cette adresse est déjà utilisée.'
                  : undefined
            }
          >
            <InputPrefix prefix="campagnes.app/c/">
              <Input
                aria-label="Adresse de la campagne"
                required
                placeholder="rentree-2026-ufhb"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, '-')
                      .replace(/-{2,}/g, '-'),
                  );
                }}
              />
            </InputPrefix>
            {slug && !slugTouched && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <Wand2 className="size-3" aria-hidden />
                Généré depuis le nom de la campagne.
              </span>
            )}
          </Field>
        </Card>

        <Card className="flex flex-col gap-4 p-5 md:p-6">
          <div>
            <h2 className="text-[15px] font-semibold">Format</h2>
            <p className="mt-1 text-[13px] text-gray-500">
              Aucune résolution à choisir — Campagnes s’occupe de la technique.
            </p>
          </div>
          <RatioPicker
            value={ratio}
            onChange={(next) => {
              setRatioTouched(true);
              setRatio(next);
            }}
          />
        </Card>

        <InlineError>{error}</InlineError>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
            Annuler
          </Button>
          <Button type="submit" variant="primary" size="lg" disabled={pending}>
            {pending ? (
              <Spinner />
            ) : (
              <>
                Créer et dessiner le cadre
                <ArrowRight className="size-4" aria-hidden />
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
