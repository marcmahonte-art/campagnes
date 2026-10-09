import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalBlock, LegalPageLayout, ToComplete, type LegalSection } from '@/components/legal/legal-page-layout';
import { COMPANY, PRODUCT, TO_COMPLETE } from '@/lib/company';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description:
    'Découvrez comment Campagnes, propulsé par MPIXEL AGENCY, gère et protège les données utilisées dans son service.',
  alternates: { canonical: '/confidentialite' },
  openGraph: {
    title: 'Politique de confidentialité · Campagnes',
    description:
      'Comment Campagnes collecte, utilise et protège les données de ses utilisateurs.',
    url: '/confidentialite',
    type: 'article',
  },
};

const SECTIONS: LegalSection[] = [
  { id: 'introduction', title: '1. Introduction' },
  { id: 'responsable', title: '2. Responsable du traitement' },
  { id: 'donnees-collectees', title: '3. Données que nous pouvons collecter' },
  { id: 'utilisation', title: '4. Utilisation des données' },
  { id: 'participants', title: '5. Données des participants' },
  { id: 'fichiers', title: '6. Fichiers et médias' },
  { id: 'cookies', title: '7. Cookies et technologies similaires' },
  { id: 'tiers', title: '8. Prestataires et services tiers' },
  { id: 'conservation', title: '9. Conservation des données' },
  { id: 'securite', title: '10. Sécurité' },
  { id: 'droits', title: '11. Droits des utilisateurs' },
  { id: 'contact', title: '12. Contact' },
  { id: 'modification', title: '13. Modification de la politique' },
];

export default function ConfidentialitePage() {
  return (
    <LegalPageLayout
      title="Politique de confidentialité"
      subtitle="Comment Campagnes collecte, utilise et protège vos données."
      updatedAt={TO_COMPLETE}
      sections={SECTIONS}
    >
      <LegalBlock id="introduction" title="1. Introduction">
        <p>
          {PRODUCT.name} est un service qui permet de créer un cadre visuel, de le publier et de
          partager un lien que n’importe qui peut utiliser pour composer son propre visuel — sans
          compte et sans installation.
        </p>
        <p>
          Cette page décrit les données que le service traite réellement, et pour quoi. Elle est
          écrite à partir du fonctionnement effectif de {PRODUCT.name}. Si une information
          obligatoire n’est pas encore arrêtée, elle apparaît comme{' '}
          <ToComplete /> plutôt que d’être comblée par une valeur approximative.
        </p>
      </LegalBlock>

      <LegalBlock id="responsable" title="2. Responsable du traitement">
        <p>Le service {PRODUCT.name} est édité et exploité par :</p>
        <dl className="rounded-lg border border-gray-200 bg-gray-50 p-5 text-[14px]">
          <dt className="text-[13px] font-semibold text-ink">Raison sociale</dt>
          <dd className="mt-1 text-gray-700">{COMPANY.legalName}</dd>
          <dt className="mt-4 text-[13px] font-semibold text-ink">Forme juridique</dt>
          <dd className="mt-1 text-gray-700">{COMPANY.legalForm}</dd>
          <dt className="mt-4 text-[13px] font-semibold text-ink">Capital social</dt>
          <dd className="mt-1 text-gray-700">{COMPANY.shareCapital}</dd>
          <dt className="mt-4 text-[13px] font-semibold text-ink">Siège social</dt>
          <dd className="mt-1 text-gray-700">{COMPANY.address}</dd>
          <dt className="mt-4 text-[13px] font-semibold text-ink">RCCM</dt>
          <dd className="mt-1 text-gray-700">{COMPANY.rccm}</dd>
          <dt className="mt-4 text-[13px] font-semibold text-ink">Contact</dt>
          <dd className="mt-1 text-gray-700">{COMPANY.email}</dd>
        </dl>
        <p>
          Les coordonnées d’un délégué à la protection des données, lorsqu’une telle désignation
          est requise, restent à préciser : <ToComplete />.
        </p>
      </LegalBlock>

      <LegalBlock id="donnees-collectees" title="3. Données que nous pouvons collecter">
        <p>Cette liste correspond à ce que l’application enregistre aujourd’hui, et rien de plus.</p>

        <p className="font-medium text-ink">Compte créateur</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>adresse email, utilisée pour la connexion et les messages liés au compte ;</li>
          <li>nom d’utilisateur, qui forme l’adresse publique du profil ;</li>
          <li>
            nom d’organisation et logo, tous deux facultatifs, que le créateur renseigne s’il le
            souhaite ;
          </li>
          <li>formule du compte, date d’inscription et état d’achèvement de l’accueil.</li>
        </ul>

        <p className="font-medium text-ink">Contenus créés</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>les cadres : leur description technique (position, taille et style des éléments) ;</li>
          <li>
            les campagnes : nom, adresse publique, format, type, statut de publication et cadre
            associé ;
          </li>
          <li>les images importées par le créateur pour construire un cadre ou son logo.</li>
        </ul>

        <p className="font-medium text-ink">Compteurs d’usage</p>
        <p>
          Chaque campagne tient un compteur des téléchargements effectués et des téléchargements
          autorisés. Ce compteur ne contient aucune information sur les personnes qui
          téléchargent : il s’agit d’un nombre, pas d’une liste.
        </p>

        <p className="font-medium text-ink">Données techniques</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            un cookie de session, déposé à la connexion pour maintenir le créateur connecté ;
          </li>
          <li>
            si un participant achète un pass « Sans filigrane », un cookie{' '}
            <code className="text-[13px]">cn_bid</code> contenant un identifiant aléatoire, qui
            relie le pass au navigateur acheteur. Il ne contient ni email, ni numéro Mobile Money,
            ni identifiant de transaction ;
          </li>
          <li>
            les journaux techniques de l’hébergeur, qui peuvent inclure l’adresse IP, nécessaires
            au fonctionnement et à la sécurité du site ;
          </li>
          <li>
            lors d’un signalement envoyé depuis la page dédiée, l’adresse IP sert de façon
            transitoire à limiter les envois répétés. Elle n’est pas rattachée au signalement
            lui-même, et les compteurs anciens sont supprimés.
          </li>
        </ul>

        <p className="font-medium text-ink">Paiements Mobile Money</p>
        <p>
          Lorsqu’un paiement est lancé, Campagnes enregistre une intention de paiement : montant,
          devise, formule ou pack acheté, état de confirmation et identifiant technique de
          transaction. Le règlement est traité par un prestataire Mobile Money ; Campagnes ne
          demande ni numéro de carte bancaire, ni IBAN, ni information de portefeuille
          international.
        </p>

        <p className="rounded-lg border border-dashed border-gray-300 p-4 text-[14px] text-gray-600">
          <strong className="font-medium text-ink">Ce que le service ne collecte pas.</strong>{' '}
          Aucune donnée de carte bancaire, aucune adresse postale d’utilisateur et aucune pièce
          d’identité ne sont collectées par Campagnes. Aucun outil de mesure d’audience ni de
          publicité n’est installé sur le site.
        </p>
      </LegalBlock>

      <LegalBlock id="utilisation" title="4. Utilisation des données">
        <p>Les données décrites ci-dessus servent uniquement à :</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>faire fonctionner le service et afficher les campagnes publiées ;</li>
          <li>créer et gérer le compte du créateur, et l’authentifier ;</li>
          <li>enregistrer les cadres et les campagnes que le créateur construit ;</li>
          <li>
            produire les visuels exportés, opération qui se déroule dans le navigateur du
            participant ;
          </li>
          <li>décompter les téléchargements et appliquer la limite de chaque campagne ;</li>
          <li>initier et réconcilier les paiements Mobile Money demandés par le créateur ;</li>
          <li>assurer la sécurité du service et prévenir les usages abusifs ;</li>
          <li>répondre aux demandes envoyées par email.</li>
        </ul>
        <p>
          Les données ne sont ni vendues, ni louées, ni utilisées pour de la publicité ciblée. Le
          service n’établit aucun profil publicitaire.
        </p>
      </LegalBlock>

      <LegalBlock id="participants" title="5. Données des participants">
        <p>
          Une personne qui utilise une campagne n’a <strong className="font-medium text-ink">pas</strong>{' '}
          de compte et n’a rien à installer.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            la photo choisie est ouverte et manipulée <strong className="font-medium text-ink">dans
            le navigateur</strong> de la personne ; elle n’est pas téléversée sur nos serveurs ;
          </li>
          <li>
            le visuel final est composé et enregistré localement, sur l’appareil de la personne ;
          </li>
          <li>
            <strong className="font-medium text-ink">exception — le pass « Sans filigrane ».</strong>{' '}
            Lorsqu’une personne achète ce pass, l’image sans filigrane est produite par nos
            serveurs : sa photo, son placement et son style sont transmis le temps du rendu, puis
            renvoyés sous forme d’image. Rien n’en est conservé après la réponse.
          </li>
          <li>
            au moment d’un téléchargement, le service enregistre uniquement l’incrément d’un
            compteur, afin d’appliquer la limite fixée par le créateur. Aucune image, aucune
            adresse email et aucune identité ne sont associées à ce décompte.
          </li>
        </ul>
      </LegalBlock>

      <LegalBlock id="fichiers" title="6. Fichiers et médias">
        <p>
          Les images importées par un <strong className="font-medium text-ink">créateur</strong>{' '}
          — pour construire un cadre ou définir son logo — sont conservées dans l’espace de
          stockage du service, afin que le cadre reste rejouable à l’identique à chaque visite.
        </p>
        <p>
          Les photos des <strong className="font-medium text-ink">participants</strong> suivent un
          chemin différent : elles ne sont pas conservées par le service. Le créateur ne voit donc
          jamais les photos de son audience, et nous non plus. Une seule exception : lorsqu’un
          participant achète un pass « Sans filigrane », sa photo est transmise le temps du rendu
          côté serveur, sans être conservée après la réponse.
        </p>
      </LegalBlock>

      <LegalBlock id="cookies" title="7. Cookies et technologies similaires">
        <p>
          Le site dépose un cookie de session, nécessaire pour maintenir un créateur connecté. Il
          dépose également, et uniquement lorsqu’un participant achète un pass « Sans filigrane »,
          un cookie <code className="text-[13px]">cn_bid</code> : un identifiant aléatoire qui relie
          le pass au navigateur acheteur, sans aucune donnée personnelle. Il n’existe à ce jour
          aucun cookie de mesure d’audience, de publicité ou de suivi.
        </p>
        <p>
          Le détail figure sur la page{' '}
          <Link href="/cookies" className="font-medium text-ink underline underline-offset-4">
            Politique cookies
          </Link>
          .
        </p>
      </LegalBlock>

      <LegalBlock id="tiers" title="8. Prestataires et services tiers">
        <p>
          Le service s’appuie sur les prestataires suivants, qui traitent des données pour son
          compte :
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-medium text-ink">Supabase</strong> — authentification, base de
            données et stockage des fichiers. C’est là que sont hébergés les comptes, les cadres,
            les campagnes et les images importées par les créateurs.
          </li>
          <li>
            <strong className="font-medium text-ink">Vercel</strong> — hébergement et diffusion du
            site.
          </li>
          <li>
            <strong className="font-medium text-ink">Prestataire Mobile Money</strong> — page de
            paiement hébergée, confirmation du paiement et notification serveur. Campagnes ne
            valide une formule ou un pack qu’après confirmation serveur.
          </li>
          <li>
            <strong className="font-medium text-ink">Google Fonts</strong> — la feuille de style du
            site demande des fichiers de polices à <code className="text-[13px]">fonts.googleapis.com</code>.
            Cette requête transmet l’adresse IP du visiteur à Google. Aucun cookie n’est déposé par
            ce chargement.
          </li>
        </ul>
        <p>
          Les lieux d’hébergement et les garanties encadrant ces transferts restent à préciser et à
          valider : <ToComplete />.
        </p>
        <p>
          Aucun autre prestataire n’est utilisé. En particulier, le site n’intègre ni régie
          publicitaire, ni outil de mesure d’audience, ni bouton de réseau social.
        </p>
      </LegalBlock>

      <LegalBlock id="conservation" title="9. Conservation des données">
        <p>
          Les durées de conservation n’ont pas encore été arrêtées. Cette section doit être
          complétée et validée par l’équipe juridique ou administrative avant publication :{' '}
          <ToComplete />.
        </p>
        <p>
          Tant qu’aucune durée n’est fixée, nous ne pouvons pas affirmer de délai. La suppression
          du compte, disponible depuis les réglages, reste le moyen le plus direct de faire
          disparaître ses données.
        </p>
      </LegalBlock>

      <LegalBlock id="securite" title="10. Sécurité">
        <p>Mesures réellement en place aujourd’hui :</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            l’accès aux données est cloisonné par des règles appliquées directement dans la base :
            chaque créateur ne peut lire et modifier que ses propres cadres et campagnes ;
          </li>
          <li>
            une campagne non publiée est inaccessible à un visiteur, même si son adresse est
            connue ;
          </li>
          <li>les échanges avec le site sont chiffrés (HTTPS) ;</li>
          <li>
            le profil public d’un créateur expose un sous-ensemble restreint de champs : ni email,
            ni formule ;
          </li>
          <li>
            la photo d’un participant ne quitte pas son appareil, sauf lors d’un rendu « Sans
            filigrane » ponctuel après achat d’un pass, et n’est jamais conservée côté serveur.
          </li>
        </ul>
        <p>
          Aucune mesure de sécurité ne garantit un risque nul. Si vous identifiez une faille, vous
          pouvez nous l’écrire à {COMPANY.email}.
        </p>
      </LegalBlock>

      <LegalBlock id="droits" title="11. Droits des utilisateurs">
        <p>
          Conformément à la réglementation applicable, et dans la mesure où elle prévoit ces
          droits, vous pouvez demander à accéder aux données qui vous concernent, à les faire
          corriger, à en demander la suppression, ou à vous opposer à leur traitement.
        </p>
        <p>
          Pour exercer ces droits, écrivez à {COMPANY.email}. La procédure précise — pièces à
          fournir, délais de réponse et autorité de recours compétente — doit être validée
          juridiquement et reste à compléter : <ToComplete />.
        </p>
      </LegalBlock>

      <LegalBlock id="contact" title="12. Contact">
        <p>
          Pour toute question relative à cette politique ou au traitement de vos données :{' '}
          <a href={`mailto:${COMPANY.email}`} className="font-medium text-ink underline underline-offset-4">
            {COMPANY.email}
          </a>
          .
        </p>
      </LegalBlock>

      <LegalBlock id="modification" title="13. Modification de la politique">
        <p>
          Cette politique peut évoluer avec le service. La date de dernière mise à jour sera
          renseignée à chaque révision ; elle est actuellement <ToComplete />.
        </p>
      </LegalBlock>
    </LegalPageLayout>
  );
}
