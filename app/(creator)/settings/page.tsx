'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, ExternalLink, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, InputPrefix } from '@/components/ui/input';
import { LogoUploader } from '@/components/ui/logo-upload';
import { DismissibleNotice, InlineError, Spinner } from '@/components/ui/feedback';
import { PlanBadge } from '@/components/plans/plan-card';
import { backend } from '@/lib/backend';
import { useSession } from '@/lib/backend/session';
import { isValidUsername, normalizeUsername } from '@/lib/slug';
import { FEATURE_LABELS, PLAN_LIST, planOf } from '@/lib/plans';
import { formatFcfa } from '@/lib/plans';

export default function SettingsPage() {
  const router = useRouter();
  const { user, refresh, signOut } = useSession();

  const [orgName, setOrgName] = useState('');
  const [username, setUsername] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [profileState, setProfileState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [emailState, setEmailState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [passwordState, setPasswordState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [planPending, setPlanPending] = useState<string | null>(null);
  const [planNotice, setPlanNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setOrgName(user.org_name ?? '');
    setUsername(user.username);
    setLogoUrl(user.logo_url);
    setEmail(user.email);
  }, [user]);

  async function changePlan(plan: 'free' | 'creator' | 'organization') {
    if (!user) return;
    setError(null);
    setPlanPending(plan);
    const result = await backend.setPlan(user.id, plan);
    if (result.error) {
      setError(result.error);
      setPlanPending(null);
      return;
    }
    await refresh();
    setPlanPending(null);
    setPlanNotice(
      plan === 'free'
        ? 'Votre compte est repassé en formule Free. Vos campagnes sont intactes.'
        : `Formule ${planOf(plan).name} activée.`,
    );
  }

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-5 text-gray-400" />
      </div>
    );
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setError(null);

    if (!isValidUsername(username)) {
      setError('Le nom d’utilisateur doit contenir 3 à 30 caractères : lettres, chiffres, tirets.');
      return;
    }

    setProfileState('saving');
    const result = await backend.updateProfile(user.id, {
      org_name: orgName.trim() || null,
      username,
      logo_url: logoUrl,
    });

    if (result.error) {
      setError(result.error);
      setProfileState('idle');
      return;
    }
    await refresh();
    setProfileState('saved');
    setTimeout(() => setProfileState('idle'), 2000);
  }

  async function saveEmail(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setEmailState('saving');
    const result = await backend.updateEmail(email);
    if (result.error) {
      setError(result.error);
      setEmailState('idle');
      return;
    }
    await refresh();
    setEmailState('saved');
    setTimeout(() => setEmailState('idle'), 2000);
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPasswordState('saving');
    const result = await backend.updatePassword(password);
    if (result.error) {
      setError(result.error);
      setPasswordState('idle');
      return;
    }
    setPassword('');
    setPasswordState('saved');
    setTimeout(() => setPasswordState('idle'), 2000);
  }

  async function deleteAccount() {
    const result = await backend.deleteAccount();
    if (result.error) {
      setError(result.error);
      return;
    }
    await signOut();
    router.replace('/');
  }

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6">
      <header>
        <h1 className="text-[28px] font-bold leading-tight md:text-[36px]">Paramètres</h1>
        <p className="mt-2 text-sm text-gray-500">
          Votre profil public est consultable sur{' '}
          <Link
            href={`/u/${user.username}`}
            className="font-medium text-ink underline underline-offset-4"
          >
            campagnes.app/@{user.username}
          </Link>
          .
        </p>
      </header>

      <InlineError>{error}</InlineError>

      {/* ---------------- Formule ---------------- */}
      <Card className="scroll-mt-6 p-5 md:p-6" >
        <div id="formule" className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold">Formule</h2>
              <PlanBadge plan={user.plan} />
            </div>
            <Link
              href="/tarifs"
              className="flex items-center gap-1.5 text-[13px] text-gray-500 transition-colors hover:text-ink"
            >
              Comparer les formules
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          </div>

          {planNotice && (
            <DismissibleNotice onDismiss={() => setPlanNotice(null)}>{planNotice}</DismissibleNotice>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            {PLAN_LIST.map((plan) => {
              const current = user.plan === plan.id;
              return (
                <div
                  key={plan.id}
                  className={
                    current
                      ? 'flex flex-col gap-3 rounded-md border border-transparent bg-gray-50 p-4 ring-brand-gradient'
                      : 'flex flex-col gap-3 rounded-md border border-gray-200 p-4'
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold">{plan.name}</span>
                    {current && (
                      <span className="text-[11px] font-medium uppercase tracking-wide text-purple">
                        Active
                      </span>
                    )}
                  </div>

                  <p className="text-[13px] font-medium text-gray-700">
                    {plan.priceFcfa === 0 ? 'Gratuit' : `${formatFcfa(plan.priceFcfa)} / mois`}
                  </p>

                  <p className="flex-1 text-[12px] leading-relaxed text-gray-500">
                    {plan.features.length === 0
                      ? 'Création, galerie, 3 formats, lien de partage.'
                      : plan.features
                          .slice(0, 4)
                          .map((f) => FEATURE_LABELS[f])
                          .join(' · ')}
                    {plan.features.length > 4 && ` · +${plan.features.length - 4}`}
                  </p>

                  <Button
                    variant={current ? 'ghost' : plan.highlight ? 'primary' : 'secondary'}
                    size="sm"
                    disabled={current || planPending !== null}
                    onClick={() => void changePlan(plan.id)}
                  >
                    {current
                      ? 'Formule active'
                      : planPending === plan.id
                        ? 'Activation…'
                        : `Choisir ${plan.name}`}
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
            <p className="text-[13px] text-gray-500">
              La distribution est facturée à l’usage, sur devis, dans toutes les formules.
            </p>
            <Link
              href="/tarifs"
              className="text-[13px] font-medium text-ink underline underline-offset-4"
            >
              Voir la grille
            </Link>
          </div>

          <p className="text-[12px] leading-relaxed text-gray-500">
            Aucun prestataire de paiement n’est branché à ce stade : le changement de formule est
            immédiat, pour la recette. En production, seules les formules gratuites basculeront
            librement ; les autres passeront par le guichet de paiement.
          </p>
        </div>
      </Card>

      {/* ---------------- Profil ---------------- */}
      <Card className="p-5 md:p-6">
        <form onSubmit={saveProfile} className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">Profil créateur</h2>
            <Link
              href={`/u/${user.username}`}
              className="flex items-center gap-1.5 text-[13px] text-gray-500 transition-colors hover:text-ink"
            >
              Voir ma page publique
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          </div>

          <Field label="Nom de l’organisation">
            <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </Field>

          <Field label="Nom d’utilisateur" hint="Compose l’adresse de votre page publique.">
            <InputPrefix prefix="campagnes.app/@">
              <Input
                aria-label="Nom d’utilisateur"
                value={username}
                onChange={(e) => setUsername(normalizeUsername(e.target.value))}
              />
            </InputPrefix>
          </Field>

          <LogoUploader value={logoUrl} onChange={setLogoUrl} />

          <div className="flex items-center justify-end gap-3">
            <SaveState state={profileState} />
            <Button type="submit" variant="primary" disabled={profileState === 'saving'}>
              Enregistrer
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </form>
      </Card>

      {/* ---------------- Email ---------------- */}
      <Card className="p-5 md:p-6">
        <form onSubmit={saveEmail} className="flex flex-col gap-5">
          <h2 className="text-[15px] font-semibold">Adresse email</h2>
          <Field label="Email" hint="Sert à vous connecter et à récupérer votre compte.">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <div className="flex items-center justify-end gap-3">
            <SaveState state={emailState} />
            <Button type="submit" variant="secondary" disabled={emailState === 'saving'}>
              Mettre à jour
            </Button>
          </div>
        </form>
      </Card>

      {/* ---------------- Mot de passe ---------------- */}
      <Card className="p-5 md:p-6">
        <form onSubmit={savePassword} className="flex flex-col gap-5">
          <h2 className="text-[15px] font-semibold">Mot de passe</h2>
          <Field label="Nouveau mot de passe" hint="8 caractères minimum.">
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <div className="flex items-center justify-end gap-3">
            <SaveState state={passwordState} />
            <Button type="submit" variant="secondary" disabled={passwordState === 'saving'}>
              Changer le mot de passe
            </Button>
          </div>
        </form>
      </Card>

      {/* ---------------- Suppression ---------------- */}
      <Card className="p-5 md:p-6">
        <h2 className="text-[15px] font-semibold">Supprimer mon compte</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-gray-500">
          Cette action supprime votre profil, vos cadres et vos campagnes. Elle est irréversible.
        </p>
        <div className="mt-4">
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="destructive" onClick={() => void deleteAccount()}>
                <Trash2 className="size-4" strokeWidth={1.75} aria-hidden />
                Oui, supprimer définitivement
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Annuler
              </Button>
            </div>
          ) : (
            <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" strokeWidth={1.75} aria-hidden />
              Supprimer mon compte
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function SaveState({ state }: { state: 'idle' | 'saving' | 'saved' }) {
  if (state === 'idle') return null;
  if (state === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-[12px] text-gray-500">
        <Spinner className="size-3.5" /> Enregistrement…
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-gray-500">
      <Check className="size-3.5 text-success" aria-hidden /> Enregistré
    </span>
  );
}
