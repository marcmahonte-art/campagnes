'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, InputPrefix } from '@/components/ui/input';
import { LogoUploader } from '@/components/ui/logo-upload';
import { InlineError, Spinner } from '@/components/ui/feedback';
import { backend } from '@/lib/backend';
import { useSession } from '@/lib/backend/session';
import { isValidUsername, normalizeUsername } from '@/lib/slug';

/**
 * Onboarding minimal : un seul écran, trois champs.
 * Le @pseudo devient l'URL publique du créateur (campagnes.app/@pseudo).
 */
export function OnboardingForm() {
  const router = useRouter();
  const { user, loading, refresh } = useSession();

  const [orgName, setOrgName] = useState('');
  const [username, setUsername] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [nextPath, setNextPath] = useState<string | null>(null);

  // Garde d'accès : pas de session → connexion ; déjà onboardé → dashboard.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('next');
    if (raw && raw.startsWith('/') && !raw.startsWith('//')) setNextPath(raw);
  }, []);

  useEffect(() => {
    if (loading) return;
    const raw = new URLSearchParams(window.location.search).get('next');
    const safeNext = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
    if (!user) router.replace(safeNext ? `/login?next=${encodeURIComponent(safeNext)}` : '/login');
    else if (user.onboarded_at) router.replace(nextPath ?? safeNext ?? '/dashboard');
    else if (!orgName && user.org_name) setOrgName(user.org_name);
  }, [loading, user, router, orgName, nextPath]);

  const usernameValid = useMemo(() => isValidUsername(username), [username]);

  // Vérification de disponibilité, différée pour ne pas marteler la base.
  useEffect(() => {
    if (!usernameValid) {
      setAvailable(null);
      return;
    }
    let alive = true;
    setChecking(true);
    const timer = setTimeout(async () => {
      const free = await backend.isUsernameAvailable(username);
      if (alive) {
        setAvailable(free);
        setChecking(false);
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
      setChecking(false);
    };
  }, [username, usernameValid]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setError(null);

    if (!orgName.trim()) {
      setError('Indiquez le nom de votre organisation.');
      return;
    }
    if (!usernameValid) {
      setError('Le nom d’utilisateur doit contenir 3 à 30 caractères : lettres, chiffres, tirets.');
      return;
    }
    if (available === false) {
      setError('Ce nom d’utilisateur est déjà pris.');
      return;
    }

    setPending(true);
    try {
      const result = await backend.updateProfile(user.id, {
        org_name: orgName.trim(),
        username,
        logo_url: logoUrl,
        onboarded_at: new Date().toISOString(),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      await refresh();
      router.push(nextPath ?? '/dashboard');
    } finally {
      setPending(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="size-5 text-gray-400" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-7 shadow-sm md:p-8">
      <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-gray-500">
        Dernière étape
      </span>
      <h1 className="mt-3 text-[24px] font-semibold leading-snug">Votre profil créateur</h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">
        C’est ce que verront vos participants lorsqu’ils ouvriront une de vos campagnes.
      </p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-5">
        <Field label="Nom de l’organisation" htmlFor="org">
          <Input
            id="org"
            required
            placeholder="Amicale des étudiants d’Abidjan"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
          />
        </Field>

        <Field
          label="Nom d’utilisateur"
          hint="Il compose l’adresse publique de votre page."
          error={
            usernameValid && available === false
              ? 'Ce nom d’utilisateur est déjà pris.'
              : undefined
          }
        >
          <InputPrefix prefix="campagnes.app/@">
            <Input
              aria-label="Nom d’utilisateur"
              required
              placeholder="amicale-abidjan"
              value={username}
              onChange={(e) => setUsername(normalizeUsername(e.target.value))}
            />
          </InputPrefix>
          {usernameValid && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              {checking ? (
                <>
                  <Spinner className="size-3" /> Vérification…
                </>
              ) : available ? (
                <>
                  <Check className="size-3.5 text-success" aria-hidden /> Disponible
                </>
              ) : (
                <>
                  <X className="size-3.5 text-error" aria-hidden /> Déjà utilisé
                </>
              )}
            </span>
          )}
        </Field>

        <LogoUploader value={logoUrl} onChange={setLogoUrl} />

        <InlineError>{error}</InlineError>

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
          {pending ? (
            <Spinner />
          ) : (
            <>
              Accéder à mon dashboard
              <ArrowRight className="size-4" aria-hidden />
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
