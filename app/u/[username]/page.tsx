'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/feedback';
import { CampaignCard } from '@/components/dashboard/campaign-card';
import { backend } from '@/lib/backend';
import type { CampaignWithFrame, CreatorProfile } from '@/lib/types';

/**
 * Page publique du créateur — campagnes.app/@pseudo (réécrite vers /u/pseudo).
 * Elle ne lit que la vue `creator_profiles` : jamais l'email ni le plan.
 */
export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const username = typeof params?.username === 'string' ? params.username : '';

  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignWithFrame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!username) return;
    let alive = true;

    void (async () => {
      const found = await backend.getCreatorProfile(username);
      if (!alive) return;
      setProfile(found);

      if (found) {
        const published = await backend.listPublishedCampaigns(found.id);
        if (alive) setCampaigns(published);
      }
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [username]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-5 text-gray-400" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4 text-center">
        <span className="font-script text-[40px] leading-none">Campagnes</span>
        <p className="text-sm text-gray-500">
          Aucun créateur ne porte le nom <span className="font-medium text-ink">@{username}</span>.
        </p>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-[13px] text-gray-500 transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Retour à l’accueil
        </Link>
      </div>
    );
  }

  const displayName = profile.org_name || `@${profile.username}`;
  const initials = displayName.replace('@', '').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-dvh bg-white">
      <header className="border-b border-gray-200">
        <div className="container-shell flex h-16 items-center justify-between">
          <Logo size="sm" />
          <Link
            href="/signup"
            className="rounded-pill border border-gray-200 px-4 py-2 text-[13px] font-medium transition-colors hover:border-ink"
          >
            Créer ma campagne
          </Link>
        </div>
      </header>

      <main className="container-shell py-12 md:py-16">
        {/* ---------------- Identité ---------------- */}
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink text-lg font-semibold text-white">
            {profile.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.logo_url} alt="" className="size-full object-cover" />
            ) : (
              initials
            )}
          </span>

          <div className="min-w-0">
            <h1 className="text-[28px] font-bold leading-tight md:text-[36px]">{displayName}</h1>
            <p className="mt-1 text-sm text-gray-500">@{profile.username}</p>
          </div>
        </div>

        {/* ---------------- Campagnes publiées ---------------- */}
        <section className="mt-12">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[20px] font-semibold">Campagnes</h2>
            <span className="text-[13px] text-gray-500">
              {campaigns.length} publiée{campaigns.length > 1 ? 's' : ''}
            </span>
          </div>

          {campaigns.length === 0 ? (
            <Card className="mt-6 px-6 py-14 text-center">
              <p className="text-sm text-gray-500">
                Aucune campagne publiée pour le moment.
              </p>
            </Card>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {campaigns.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-gray-200">
        <div className="container-shell flex flex-col items-start justify-between gap-3 py-8 md:flex-row md:items-center">
          <span className="font-script text-[22px] leading-none">Campagnes</span>
          <p className="text-[13px] text-gray-500">Créez. Animez. Partagez.</p>
        </div>
      </footer>
    </div>
  );
}
