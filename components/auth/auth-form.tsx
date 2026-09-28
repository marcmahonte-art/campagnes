'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { InlineError, InlineInfo, Spinner } from '@/components/ui/feedback';
import { backend, isDemoMode, isSupabaseConfigured } from '@/lib/backend';
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemoAccount } from '@/lib/backend/local';
import { useSession } from '@/lib/backend/session';

type Mode = 'login' | 'signup';

/** Formulaire d'authentification créateur — email/mot de passe + Google. */
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { refresh } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState<'form' | 'google' | 'demo' | null>(null);

  const isSignup = mode === 'signup';

  /** Ouvre un compte de démonstration complet (profil, cadres, campagnes). */
  async function handleDemo() {
    setError(null);
    setInfo(null);
    setPending('demo');
    try {
      await seedDemoAccount();
      await refresh();
      router.push('/dashboard');
    } finally {
      setPending(null);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setPending('form');

    try {
      if (isSignup) {
        const outcome = await backend.signUpWithEmail(email, password);
        if (outcome.error) {
          setError(outcome.error);
          return;
        }
        if (outcome.needsEmailConfirmation) {
          setInfo(
            'Compte créé. Confirmez votre adresse via le lien reçu par email, puis connectez-vous.',
          );
          return;
        }
        await refresh();
        router.push('/onboarding');
        return;
      }

      const result = await backend.signInWithEmail(email, password);
      if (result.error) {
        setError(result.error);
        return;
      }
      const user = await backend.getSessionUser();
      await refresh();
      router.push(user?.onboarded_at ? '/dashboard' : '/onboarding');
    } finally {
      setPending(null);
    }
  }

  async function handleGoogle() {
    setError(null);
    setPending('google');
    try {
      const result = await backend.signInWithGoogle();
      if (result.error) setError(result.error);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-7 shadow-sm md:p-8">
      <h1 className="text-[24px] font-semibold leading-snug">
        {isSignup ? 'Créer votre compte créateur' : 'Se connecter'}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">
        {isSignup
          ? 'Un seul compte : celui de votre organisation. Vos participants n’en auront jamais.'
          : 'Accédez à vos campagnes, vos cadres et vos paramètres.'}
      </p>

      {/* Accès direct : en mode démonstration, aucun compte n'existe au départ. */}
      {isDemoMode && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-[13px] font-medium text-ink">Compte de démonstration</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Un clic : profil complet, deux cadres et deux campagnes déjà en place
            (une publiée, un brouillon).
          </p>
          <p className="mt-2 font-mono text-[11px] text-gray-500">
            {DEMO_EMAIL} · {DEMO_PASSWORD}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="mt-3 w-full"
            onClick={handleDemo}
            disabled={pending !== null}
          >
            {pending === 'demo' ? <Spinner /> : 'Entrer dans la démonstration'}
          </Button>
        </div>
      )}

      {isSupabaseConfigured && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="mt-6 w-full"
            onClick={handleGoogle}
            disabled={pending !== null}
          >
            {pending === 'google' ? <Spinner /> : <GoogleMark />}
            Continuer avec Google
          </Button>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">ou</span>
            <span className="h-px flex-1 bg-gray-200" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className={isSupabaseConfigured ? 'space-y-4' : 'mt-6 space-y-4'}>
        <Field label="Adresse email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="vous@organisation.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field
          label="Mot de passe"
          htmlFor="password"
          hint={isSignup ? '8 caractères minimum.' : undefined}
        >
          <Input
            id="password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={isSignup ? 8 : undefined}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <InlineError>{error}</InlineError>
        <InlineInfo>{info}</InlineInfo>

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending !== null}>
          {pending === 'form' ? (
            <Spinner />
          ) : (
            <>
              {isSignup ? 'Créer mon compte' : 'Se connecter'}
              <ArrowRight className="size-4" aria-hidden />
            </>
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-gray-500">
        {isSignup ? (
          <>
            Vous avez déjà un compte ?{' '}
            <Link href="/login" className="font-medium text-ink underline underline-offset-4">
              Se connecter
            </Link>
          </>
        ) : (
          <>
            Pas encore de compte ?{' '}
            <Link href="/signup" className="font-medium text-ink underline underline-offset-4">
              Créer ma campagne
            </Link>
          </>
        )}
      </p>

      {!isSupabaseConfigured && (
        <p className="mt-6 flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
          <Mail className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Mode démonstration : l’inscription est immédiate et les données restent
          dans ce navigateur. Aucune confirmation par email.
        </p>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.2-2.2H12v4.2h6.5c-.1 1.1-.8 2.7-2.3 3.8l-.02.13 3.4 2.6.23.02c2.1-2 3.3-4.9 3.3-8.5Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.1 0 5.6-1 7.5-2.8l-3.6-2.8c-1 .7-2.3 1.2-3.9 1.2a6.8 6.8 0 0 1-6.4-4.7l-.13.01-3.5 2.7-.04.12A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.6 14.9a7.4 7.4 0 0 1 0-5.8l-.01-.13-3.5-2.7-.12.06a12 12 0 0 0 0 11.3l3.63-2.73Z"
      />
      <path
        fill="#EB4335"
        d="M12 4.7c2.2 0 3.7.9 4.6 1.7l3.2-3.1C17.7 1.4 15.1 0 12 0A12 12 0 0 0 2 6.1l3.6 2.9A6.8 6.8 0 0 1 12 4.7Z"
      />
    </svg>
  );
}
