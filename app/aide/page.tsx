import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalBlock, LegalPageLayout } from '@/components/legal/legal-page-layout';
import { COMPANY, TO_COMPLETE } from '@/lib/company';
import { PAYMENT_METHOD_LABELS } from '@/lib/pricing/config';
import { FREE_DOWNLOADS } from '@/lib/quota';

/**
 * Page d'aide — `/aide`.
 *
 * Elle est **publique** : quelqu'un qui ne connaît pas encore Campagnes doit
 * pouvoir lire avant de créer un compte, et quelqu'un dont la campagne vient de
 * se bloquer ne doit pas avoir à s'inscrire pour comprendre pourquoi.
 *
 * Elle réutilise `LegalPageLayout` : en-tête, fil d'Ariane, sommaire et footer
 * sont exactement ceux des pages institutionnelles, et il n'y a aucune raison
 * d'entretenir une seconde coque pour le même type d'écran. Seuls le titre, les
 * sections et le texte changent.
 *
 * Règle de contenu : **rien d'inventé**. Chaque lien renvoie vers un écran qui
 * existe, chaque chiffre cité vient d'un module du produit (`FREE_DOWNLOADS`),
 * et ce qui n'a pas été validé reste marqué « À COMPLÉTER ».
 */

export const metadata: Metadata = {
  title: 'Aide',
  description:
    'Comment créer une campagne, choisir un cadre, partager un lien et suivre les téléchargements sur Campagnes.',
  alternates: { canonical: '/aide' },
};

const SECTIONS = [
  { id: 'demarrer', title: 'Premiers pas' },
  { id: 'cadres', title: 'Choisir un cadre' },
  { id: 'participants', title: 'Partager aux participants' },
  { id: 'limites', title: 'Limite de téléchargements' },
  { id: 'formule', title: 'Formule et filigrane' },
  { id: 'contact', title: "Besoin d'aide" },
];

/** Lien interne posé dans le texte, sans repetitive à écrire le style à chaque fois. */
function Internal({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-ink underline underline-offset-4">
      {children}
    </Link>
  );
}

export default function AidePage() {
  return (
    <LegalPageLayout
      title="Aide"
      subtitle="L'essentiel pour publier une campagne et la partager à vos participants."
      updatedAt={TO_COMPLETE}
      sections={SECTIONS}
    >
      <LegalBlock id="demarrer" title="Premiers pas">
        <p>
          Une campagne se résume à trois gestes : créer un cadre, publier la campagne, partager son
          lien. Tout le reste est facultatif.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <Internal href="/campaigns/new">Créez une campagne</Internal> — vous lui donnez un nom,
            une adresse et un format.
          </li>
          <li>
            Composez son cadre dans l’éditeur : ajoutez vos images et vos textes, puis choisissez le
            mode d’accueil de la photo du participant.
          </li>
          <li>Passez la campagne en « publiée » : son lien public devient actif.</li>
        </ol>
        <p>
          Vos campagnes restent listées dans <Internal href="/dashboard">Mes campagnes</Internal>.
        </p>
      </LegalBlock>

      <LegalBlock id="cadres" title="Choisir un cadre">
        <p>
          Le mode choisi à la création décide de ce que le participant déposera, et il est modifiable
          tant que la campagne n’est pas publiée.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-medium text-ink">Cadre photo</strong> — la photo remplit tout le
            cadre et n’apparaît qu’à travers les zones vides du visuel.
          </li>
          <li>
            <strong className="font-medium text-ink">Cadre vidéo</strong> — un cadre animé
            s’applique à la vidéo du participant, image par image.
          </li>
          <li>
            <strong className="font-medium text-ink">Photo sur fond</strong> — la photo est posée
            dans une zone du décor, qui reste visible tout autour.
          </li>
        </ul>
        <p>
          Pour partir d’un modèle existant plutôt que d’une page blanche, la{' '}
          <Internal href="/galerie">galerie publique</Internal> permet de prévisualiser un cadre et
          de le copier dans une nouvelle campagne.
        </p>
      </LegalBlock>

      <LegalBlock id="participants" title="Partager aux participants">
        <p>
          Chaque campagne publiée a une adresse publique de la forme <code>/c/son-identifiant</code>.
          C’est le seul lien à diffuser : il ouvre le parcours participant, et le participant n’a
          besoin ni de compte, ni d’application, ni de formulaire.
        </p>
        <p>
          Pour une diffusion ou un événement donné, la page{' '}
          <Internal href="/qr-codes">QR Codes</Internal> produit un lien privé à quota distinct, qui
          expire si vous le décidez. Ce lien ne doit jamais être partagé sur les réseaux sociaux :
          il n’est pas public.
        </p>
        <p>
          Ce que le participant fait de son visuel ne vous est pas transmis. Sa photo est lue dans
          son navigateur et n’est pas envoyée : seul son téléchargement est compté.
        </p>
        <p>
          Une exception, à connaître : si le participant achète le retrait du filigrane, ce rendu
          passe par nos serveurs et transmet alors son visuel. Le détourage, lui, ne quitte jamais
          l’appareil.
        </p>
      </LegalBlock>

      <LegalBlock id="limites" title="Limite de téléchargements">
        <p>
          Une campagne ouvre avec <strong className="font-medium text-ink">{FREE_DOWNLOADS}</strong>{' '}
          téléchargements offerts. Au-delà, le lien participant reste consultable mais le
          téléchargement repasse avec le filigrane Campagnes — le visiteur compose son visuel et
          n’est pas bloqué par une erreur technique.
        </p>
        <p>
          Le créateur peut acheter des crédits de distribution depuis l’écran de campagne.
          {` ${PAYMENT_METHOD_LABELS.reassurance}`} Les paliers et leurs prix sont affichés sur la
          page des <Internal href="/tarifs">formules</Internal>.
        </p>
      </LegalBlock>

      <LegalBlock id="formule" title="Formule et filigrane">
        <p>
          Le badge « Créé avec Campagnes » apposé dans le coin du visuel téléchargé dépend de votre
          formule et de votre quota : il est présent en formule gratuite, absent en formule payante
          tant que le quota disponible n’est pas épuisé. Quand le quota est consommé, le participant
          peut continuer avec le filigrane, sans créer de compte.
        </p>
        <p>
          Analytics, QR Codes, Motion et Branding sont des modules réservés aux formules payantes.
          Ils restent visibles dans votre espace, marqués <span className="font-medium">PRO</span> : un
          module verrouillé montre ce qui existe et ce qui le débloque, il ne disparaît pas.
        </p>
      </LegalBlock>

      <LegalBlock id="contact" title="Besoin d’aide">
        <p>
          Une question qui n’est pas traitée ici, un bug à signaler, une demande de prolongation : un
          message suffit.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <a href={`mailto:${COMPANY.email}`} className="font-medium text-ink underline underline-offset-4">
              {COMPANY.email}
            </a>
          </li>
          <li>
            Pour signaler un contenu, l’écran dédié est <Internal href="/signalement">Signalement</Internal>.
          </li>
        </ul>
        <p>
          {COMPANY.legalName} · {COMPANY.city}, {COMPANY.country}
        </p>
      </LegalBlock>
    </LegalPageLayout>
  );
}
