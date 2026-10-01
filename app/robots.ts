import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/backend/config';

/**
 * Directives d'exploration.
 *
 * Les pages institutionnelles sont volontairement **ouvertes** : elles existent
 * pour être lues, et les fermer irait contre leur raison d'être.
 *
 * Les pages de campagne publiques `/c/` le sont aussi, et ce n'est pas un
 * oubli : un aperçu de partage se construit en **explorant la page**. Facebook
 * respecte `robots.txt` ; l'interdire ici revenait à garantir qu'aucun lien
 * partagé n'affiche jamais d'aperçu, quel que soit le soin mis dans les balises
 * Open Graph. Une campagne publiée est publique par nature — elle a sa place
 * dans la galerie, donc dans un moteur de recherche.
 *
 * Restent fermés les espaces qui n'ont aucun sens hors session — l'espace
 * créateur et les routes d'authentification — ainsi que `/d/`, dont chaque
 * adresse est un **secret** : un jeton exploré puis indexé ne serait plus privé.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard',
          '/settings',
          '/analytics',
          '/qr-codes',
          '/onboarding',
          '/campaigns',
          '/d/',
          '/auth/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
