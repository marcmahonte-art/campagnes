import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/backend/config';

/**
 * Plan du site.
 *
 * Seules les pages réellement publiques y figurent : les espaces créateur
 * (`/dashboard`, `/settings`, `/campaigns/…`) et les pages de campagne (`/c/…`,
 * `/d/…`) en sont exclus — les premières demandent un compte, les secondes
 * dépendent d'un lien et n'ont pas à être listées.
 *
 * `lastModified` n'est volontairement pas daté arbitrairement à « maintenant » :
 * une date qui change à chaque génération apprend aux moteurs à ne plus s'y
 * fier. Les pages légales sont datées par leur révision, à compléter.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' }[] = [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/galerie', priority: 0.9, changeFrequency: 'weekly' },
    /*
     * `/premium` est indexable : elle est ouverte au public, sans compte, et
     * c'est par les moteurs et les aperçus de partage que beaucoup de visiteurs
     * la trouveront. Priorité haute mais sous la galerie : elle est
     * événementielle, donc temporaire.
     */
    { path: '/premium', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/tarifs', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/aide', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/confidentialite', priority: 0.4, changeFrequency: 'monthly' },
    { path: '/conditions', priority: 0.4, changeFrequency: 'monthly' },
    { path: '/cookies', priority: 0.3, changeFrequency: 'monthly' },
    { path: '/signalement', priority: 0.3, changeFrequency: 'monthly' },
  ];

  return pages.map((page) => ({
    url: `${SITE_URL}${page.path}`,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
