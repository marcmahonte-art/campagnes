import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalBlock, LegalPageLayout, ToComplete, type LegalSection } from '@/components/legal/legal-page-layout';
import { COMPANY, PRODUCT, TO_COMPLETE } from '@/lib/company';

export const metadata: Metadata = {
  title: 'Politique cookies',
  description:
    'Quels cookies Campagnes utilise réellement, à quoi ils servent et comment les gérer depuis votre navigateur.',
  alternates: { canonical: '/cookies' },
  openGraph: {
    title: 'Politique cookies · Campagnes',
    description:
      'Comprendre comment Campagnes utilise les cookies et technologies similaires.',
    url: '/cookies',
    type: 'article',
  },
};

const SECTIONS: LegalSection[] = [
  { id: 'definition', title: '1. Qu’est-ce qu’un cookie ?' },
  { id: 'necessaires', title: '2. Cookies nécessaires' },
  { id: 'preference', title: '3. Cookies de préférence' },
  { id: 'analytiques', title: '4. Cookies analytiques' },
  { id: 'tiers', title: '5. Cookies liés aux services tiers' },
  { id: 'gestion', title: '6. Gestion des cookies' },
  { id: 'duree', title: '7. Durée de conservation' },
  { id: 'modification', title: '8. Modification de la politique' },
];

export default function CookiesPage() {
  return (
    <LegalPageLayout
      title="Politique cookies"
      subtitle="Comprendre comment Campagnes utilise les cookies et technologies similaires."
      updatedAt={TO_COMPLETE}
      sections={SECTIONS}
    >
      <LegalBlock id="definition" title="1. Qu’est-ce qu’un cookie ?">
        <p>
          Un cookie est un petit fichier qu’un site dépose dans votre navigateur. Il permet
          notamment de vous reconnaître d’une page à l’autre, ou de conserver une préférence.
        </p>
        <p>
          Cette page décrit les cookies que {PRODUCT.name} utilise <em>réellement</em>. Elle a été
          écrite en inspectant le code du site : aucun cookie n’y est déclaré par précaution.
        </p>
      </LegalBlock>

      <LegalBlock id="necessaires" title="2. Cookies nécessaires">
        <p>
          Le site dépose <strong className="font-medium text-ink">un seul</strong> cookie :
          le cookie de session qui maintient un créateur connecté à son compte.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="font-medium text-ink">Nom</strong> — commence par{' '}
            <code className="text-[13px]">sb-</code> et se termine par{' '}
            <code className="text-[13px]">-auth-token</code>. Il est posé par le service
            d’authentification.
          </li>
          <li>
            <strong className="font-medium text-ink">Rôle</strong> — conserver la session du
            créateur pour qu’il n’ait pas à se reconnecter à chaque page.
          </li>
          <li>
            <strong className="font-medium text-ink">Qui le reçoit</strong> — uniquement le
            service. Il n’est pas partagé avec un tiers à des fins publicitaires.
          </li>
          <li>
            <strong className="font-medium text-ink">Sans lui</strong> — la connexion au compte
            devient impossible. C’est pourquoi il est considéré comme strictement nécessaire.
          </li>
        </ul>
        <p>
          Un visiteur qui consulte une campagne <strong className="font-medium text-ink">sans
          compte</strong> ne reçoit aucun cookie de notre part.
        </p>
      </LegalBlock>

      <LegalBlock id="preference" title="3. Cookies de préférence">
        <p>
          <strong className="font-medium text-ink">Aucun.</strong> Le site ne conserve aujourd’hui
          aucune préférence d’affichage — thème, langue ou mise en page — dans un cookie.
        </p>
      </LegalBlock>

      <LegalBlock id="analytiques" title="4. Cookies analytiques">
        <p>
          <strong className="font-medium text-ink">Aucun.</strong> Aucun outil de mesure d’audience
          n’est installé sur le site : ni Google Analytics, ni Matomo, ni Plausible, ni aucun
          équivalent. Aucun cookie de suivi n’est donc déposé.
        </p>
        <p className="text-[14px] text-gray-500">
          À ne pas confondre avec la page « Analytics » de l’espace créateur : celle-ci affiche au
          créateur l’usage de <em>ses propres</em> campagnes, à partir de compteurs internes. Ce
          n’est pas un outil de mesure d’audience, et elle ne suit personne.
        </p>
      </LegalBlock>

      <LegalBlock id="tiers" title="5. Cookies liés aux services tiers">
        <p>
          <strong className="font-medium text-ink">Aucun cookie tiers n’est déposé.</strong>
        </p>
        <p>
          Le site demande bien des fichiers de polices à Google Fonts (
          <code className="text-[13px]">fonts.googleapis.com</code>), ce qui transmet l’adresse IP
          du visiteur à Google. Ce chargement ne dépose toutefois aucun cookie. Le détail figure
          dans la section « Prestataires et services tiers » de la{' '}
          <Link
            href="/confidentialite"
            className="font-medium text-ink underline underline-offset-4"
          >
            politique de confidentialité
          </Link>
          .
        </p>
      </LegalBlock>

      <LegalBlock id="gestion" title="6. Gestion des cookies">
        <p>
          Le seul cookie utilisé étant nécessaire au fonctionnement, le site{' '}
          <strong className="font-medium text-ink">n’affiche pas de bandeau de consentement</strong> :
          il n’y a rien à consentir, et un bandeau qui ne protège rien ne ferait qu’encombrer
          l’écran.
        </p>
        <p>
          Vous gardez la main depuis votre navigateur : tous permettent de consulter les cookies
          enregistrés, de les supprimer, ou de bloquer ceux d’un site donné. Bloquer le cookie de
          session vous déconnectera de {PRODUCT.name} — le reste du site, y compris l’usage d’une
          campagne, continuera de fonctionner.
        </p>
        <p>
          Se déconnecter depuis les réglages supprime également le cookie de session.
        </p>
      </LegalBlock>

      <LegalBlock id="duree" title="7. Durée de conservation">
        <p>
          La durée de vie exacte du cookie de session dépend de la configuration du service
          d’authentification. Elle doit être relevée et confirmée avant publication :{' '}
          <ToComplete />.
        </p>
      </LegalBlock>

      <LegalBlock id="modification" title="8. Modification de la politique">
        <p>
          Si un cookie venait à être ajouté au site, cette page serait mise à jour et la date de
          révision renseignée. Elle est actuellement <ToComplete />.
        </p>
        <p>
          Pour toute question :{' '}
          <a href={`mailto:${COMPANY.email}`} className="font-medium text-ink underline underline-offset-4">
            {COMPANY.email}
          </a>
          .
        </p>
      </LegalBlock>
    </LegalPageLayout>
  );
}
