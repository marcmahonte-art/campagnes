import type { Metadata } from 'next';
import { isSupabaseConfigured, SITE_URL } from '@/lib/backend/config';
import { supabasePublic } from '@/lib/supabase/public';
import { ParticipantCampaign } from './participant-campaign';

/**
 * Page publique d'une campagne — `/c/[slug]`.
 *
 * Cette page est un **coquille serveur** : elle n'existe que pour les balises
 * Open Graph. Tout le parcours participant vit dans `ParticipantCampaign`, un
 * composant client — lecture du fichier, composition Fabric, export ne peuvent
 * pas se faire ailleurs.
 *
 * La séparation est nécessaire, pas décorative : un aperçu de partage est lu
 * par le robot de WhatsApp ou de Facebook **avant** qu'aucun JavaScript ne soit
 * exécuté. Un `generateMetadata` dans un composant client ne serait jamais vu.
 *
 * Elle lit en `anon`, sans cookie, et ne consomme aucun quota : ouvrir la page
 * ne coûte rien, seule la réservation au téléchargement décompte une unité.
 */

interface ShareMeta {
  name: string;
  description: string;
  image: string | null;
}

/** Description de repli, quand le créateur n'a rien rédigé. */
function defaultDescription(name: string): string {
  return `Participez à la campagne ${name} : déposez votre photo, placez-la dans le cadre et repartez avec votre visuel. Sans compte, sans application.`;
}

/**
 * Lit le strict nécessaire à un aperçu : un nom, une phrase, une vignette.
 *
 * Ne lève jamais. Une base injoignable, une colonne absente (migration non
 * appliquée), un réseau coupé : dans tous les cas on renvoie `null`, et la page
 * s'affiche normalement avec les métadonnées par défaut du site. Un aperçu raté
 * est un désagrément ; une page blanche serait une panne.
 */
async function readShareMeta(slug: string): Promise<ShareMeta | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const sb = supabasePublic();

    /*
     * `select('*')` et non `select('name, share_text, frame_id')`.
     *
     * Nommer `share_text` ferait échouer la requête entière tant que la
     * migration 0011 n'est pas appliquée — et la page perdrait son aperçu même
     * pour un nom qu'elle pourrait lire. En lisant la ligne entière, une colonne
     * absente reste simplement absente : on retombe sur la description par
     * défaut, et l'aperçu fonctionne dès aujourd'hui.
     */
    const { data } = await sb
      .from('campaigns')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle();

    if (!data) return null;
    const row = data as Record<string, unknown>;

    const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : 'Campagne';

    /*
     * Le texte du créateur sert de description, mais seulement sa première
     * ligne : la suite contient le lien et les hashtags, qui n'ont rien à faire
     * dans un aperçu — Facebook et WhatsApp les afficheraient en texte brut.
     */
    const custom = typeof row.share_text === 'string' ? row.share_text.trim() : '';
    const firstLine = custom
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    const description = firstLine ? firstLine.slice(0, 200) : defaultDescription(name);

    /*
     * La vignette est celle du **cadre**, pas le visuel du participant : ce
     * dernier n'existe que dans son navigateur et n'est jamais téléversé. Il n'y
     * a donc rien d'autre à exposer, et rien de privé à exposer.
     */
    let image: string | null = null;
    const frameId = typeof row.frame_id === 'string' ? row.frame_id : null;

    if (frameId) {
      const { data: frame } = await sb
        .from('frames')
        .select('thumbnail_url')
        .eq('id', frameId)
        .maybeSingle();
      const thumb = (frame as Record<string, unknown> | null)?.thumbnail_url;
      // Seule une adresse absolue est utilisable dans `og:image`. Une data URL
      // (mode démonstration) ou un chemin relatif serait ignoré, voire rejeté
      // par le robot : mieux vaut ne rien annoncer.
      if (typeof thumb === 'string' && /^https?:\/\//.test(thumb)) image = thumb;
    }

    return { name, description, image };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const url = `${SITE_URL}/c/${slug}`;
  const meta = await readShareMeta(slug);

  /*
   * Campagne inconnue, brouillon, ou base non configurée : on ne fabrique aucun
   * aperçu. Annoncer le nom d'un brouillon reviendrait à le publier, et un
   * aperçu générique vaut mieux qu'un aperçu faux.
   */
  if (!meta) {
    return {
      title: 'Campagne',
      alternates: { canonical: url },
      robots: { index: false, follow: false },
    };
  }

  // Le séparateur suit le gabarit du site (`%s · Campagnes`), pour qu'un aperçu
  // et un onglet de navigateur annoncent la même chose.
  const title = `${meta.name} · Campagnes`;
  const images = meta.image
    ? [{ url: meta.image, alt: `Aperçu de la campagne ${meta.name}` }]
    : undefined;

  return {
    title: meta.name,
    description: meta.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title,
      description: meta.description,
      siteName: 'Campagnes',
      locale: 'fr_FR',
      images,
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title,
      description: meta.description,
      images: meta.image ? [meta.image] : undefined,
    },
  };
}

export default async function ParticipantPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ParticipantCampaign slug={slug} />;
}
