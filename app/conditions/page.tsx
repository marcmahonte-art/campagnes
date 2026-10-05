import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalBlock, LegalPageLayout, ToComplete, type LegalSection } from '@/components/legal/legal-page-layout';
import { COMPANY, PRODUCT, TO_COMPLETE } from '@/lib/company';
import { PARTICIPANT_PAYMENT, PAYMENT_METHOD_LABELS, PREPAYMENT_REASSURANCE } from '@/lib/pricing/config';

export const metadata: Metadata = {
  title: "Conditions d'utilisation",
  description:
    "Les règles d'utilisation de Campagnes : compte, campagnes, contenus, exports, formules et responsabilités.",
  alternates: { canonical: '/conditions' },
  openGraph: {
    title: "Conditions d'utilisation · Campagnes",
    description: "Les règles d'utilisation de Campagnes.",
    url: '/conditions',
    type: 'article',
  },
};

const SECTIONS: LegalSection[] = [
  { id: 'objet', title: '1. Objet' },
  { id: 'presentation', title: '2. Présentation de Campagnes' },
  { id: 'acces', title: '3. Accès au service' },
  { id: 'compte', title: '4. Création de compte' },
  { id: 'utilisation', title: '5. Utilisation de la plateforme' },
  { id: 'campagnes', title: '6. Création de campagnes' },
  { id: 'contenus', title: '7. Contenu envoyé par les utilisateurs' },
  { id: 'responsabilite-contenus', title: '8. Responsabilité concernant les contenus' },
  { id: 'templates', title: '9. Utilisation des templates et ressources' },
  { id: 'exports', title: '10. Téléchargements et exports' },
  { id: 'formules', title: '11. Fonctionnalités gratuites et payantes' },
  { id: 'paiements', title: '12. Paiements' },
  { id: 'abonnements', title: '13. Abonnements ou achats' },
  { id: 'distribution', title: '14. Liens de distribution' },
  { id: 'abus', title: '15. Utilisation abusive du service' },
  { id: 'propriete', title: '16. Propriété intellectuelle' },
  { id: 'disponibilite', title: '17. Disponibilité du service' },
  { id: 'suspension', title: '18. Suspension ou suppression d’un compte' },
  { id: 'limitation', title: '19. Limitation de responsabilité' },
  { id: 'modification', title: '20. Modification des conditions' },
  { id: 'contact', title: '21. Contact' },
];

export default function ConditionsPage() {
  return (
    <LegalPageLayout
      title="Conditions d'utilisation"
      subtitle="Les règles d'utilisation de Campagnes."
      updatedAt={TO_COMPLETE}
      sections={SECTIONS}
    >
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-[14px] leading-relaxed text-gray-600">
        <strong className="font-medium text-ink">Document à valider.</strong> Ce texte décrit le
        fonctionnement réel du service, mais il n’a pas été rédigé ni relu par un juriste. Il doit
        être validé avant d’être considéré comme contractuel.
      </div>

      <LegalBlock id="objet" title="1. Objet">
        <p>
          Les présentes conditions encadrent l’utilisation de {PRODUCT.name}, service édité par{' '}
          {COMPANY.legalName}. En créant un compte ou en utilisant une campagne, vous acceptez ces
          règles.
        </p>
      </LegalBlock>

      <LegalBlock id="presentation" title="2. Présentation de Campagnes">
        <p>
          {PRODUCT.name} permet à un créateur de composer un cadre visuel, de le publier et de
          partager un lien. Toute personne disposant de ce lien peut y placer sa propre photo et
          repartir avec son visuel.
        </p>
        <p>
          Le parcours du participant ne demande <strong className="font-medium text-ink">ni compte
          ni installation</strong>.
        </p>
      </LegalBlock>

      <LegalBlock id="acces" title="3. Accès au service">
        <p>
          Le service est accessible en ligne. Un accès à internet est nécessaire ; les frais de
          connexion restent à la charge de l’utilisateur.
        </p>
        <p>
          La consultation des pages publiques ne demande aucun compte. La création de cadres et de
          campagnes, elle, suppose un compte.
        </p>
      </LegalBlock>

      <LegalBlock id="compte" title="4. Création de compte">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>un compte se crée avec une adresse email valide et un mot de passe ;</li>
          <li>
            les informations fournies doivent être exactes, et le mot de passe doit rester
            confidentiel ;
          </li>
          <li>
            le compte est personnel. Toute activité effectuée depuis un compte engage la personne
            qui le détient ;
          </li>
          <li>
            la suppression du compte est disponible à tout moment depuis les réglages.
          </li>
        </ul>
      </LegalBlock>

      <LegalBlock id="utilisation" title="5. Utilisation de la plateforme">
        <p>Vous vous engagez à ne pas :</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>publier un contenu illégal, haineux, violent, trompeur ou diffamatoire ;</li>
          <li>porter atteinte aux droits d’autrui, notamment au droit d’auteur ou à la vie privée ;</li>
          <li>usurper l’identité d’une personne ou d’une organisation ;</li>
          <li>tenter de contourner les limites techniques du service ou d’en perturber le fonctionnement ;</li>
          <li>extraire massivement des données ou solliciter le service de façon automatisée et abusive.</li>
        </ul>
      </LegalBlock>

      <LegalBlock id="campagnes" title="6. Création de campagnes">
        <p>
          Le créateur choisit le nom, le format et le cadre de sa campagne. Il peut enregistrer son
          travail à l’état de brouillon : une campagne non publiée n’est accessible à personne,
          même en connaissant son adresse.
        </p>
        <p>
          La publication suppose qu’un cadre soit enregistré et qu’il contienne au moins un
          élément.
        </p>
      </LegalBlock>

      <LegalBlock id="contenus" title="7. Contenu envoyé par les utilisateurs">
        <p>
          Le créateur reste responsable des éléments qu’il importe ou compose dans son cadre —
          textes, images, logo. Il garantit qu’il dispose des droits nécessaires sur ce qu’il met
          en ligne.
        </p>
        <p>
          Les photos des participants ne sont pas transmises au service : elles sont traitées dans
          leur navigateur et ne nous parviennent jamais.
        </p>
      </LegalBlock>

      <LegalBlock id="responsabilite-contenus" title="8. Responsabilité concernant les contenus">
        <p>
          {COMPANY.legalName} n’exerce pas de contrôle préalable sur les campagnes publiées. Une
          campagne publiée le reste sous la responsabilité de son créateur.
        </p>
        <p>
          Un contenu manifestement contraire à ces conditions peut être signalé depuis la page{' '}
          <Link href="/signalement" className="font-medium text-ink underline underline-offset-4">
            Signaler un contenu
          </Link>
          , et retiré après examen.
        </p>
      </LegalBlock>

      <LegalBlock id="templates" title="9. Utilisation des templates et ressources">
        <p>
          L’éditeur propose des modèles prêts à l’emploi ainsi que des polices de caractères et des
          formes géométriques.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            les modèles sont fournis pour construire vos campagnes ; ils peuvent être adaptés
            librement ;
          </li>
          <li>
            les polices proposées dans l’éditeur sont des polices libres de droits ; leur licence
            propre continue de s’appliquer ;
          </li>
          <li>
            un modèle ne confère aucun droit sur une marque, un logo ou une identité qui y
            apparaîtrait.
          </li>
        </ul>
      </LegalBlock>

      <LegalBlock id="exports" title="10. Téléchargements et exports">
        <p>
          Le participant enregistre son visuel au format image, et au format vidéo lorsque le
          cadre est animé. La composition et l’enregistrement se déroulent dans son navigateur.
        </p>
        <p>
          Chaque campagne dispose d’un nombre de téléchargements autorisés. Une fois ce nombre
          atteint, la campagne continue avec le filigrane Campagnes. Le créateur peut acheter des
          crédits de distribution pour rétablir les exports sans filigrane.
        </p>
        <p>
          Le retrait ponctuel du filigrane côté participant peut être proposé à{' '}
          {PARTICIPANT_PAYMENT.label}, sans création de compte.
        </p>
      </LegalBlock>

      <LegalBlock id="formules" title="11. Fonctionnalités gratuites et payantes">
        <p>
          {PRODUCT.name} propose une formule gratuite et des formules payantes, qui ouvrent des
          fonctionnalités supplémentaires. Le détail figure sur la page{' '}
          <Link href="/tarifs" className="font-medium text-ink underline underline-offset-4">
            Tarifs
          </Link>
          .
        </p>
        <p>
          Les limites attachées à une formule s’appliquent aux nouveaux éléments. Un contenu déjà
          créé n’est jamais supprimé du fait d’un changement de formule.
        </p>
      </LegalBlock>

      <LegalBlock id="paiements" title="12. Paiements">
        <p>
          Les formules payantes et les crédits de distribution se règlent en prépaiement par{' '}
          <strong className="font-medium text-ink">Mobile Money</strong>. L’interface ne propose
          pas de paiement par carte bancaire, d’IBAN ou de portefeuille international.
        </p>
        <p>
          {PAYMENT_METHOD_LABELS.reassurance} Le paiement n’est considéré comme validé qu’après
          confirmation serveur.
        </p>
      </LegalBlock>

      <LegalBlock id="abonnements" title="13. Abonnements ou achats">
        <p>
          <strong className="font-medium text-ink">{PREPAYMENT_REASSURANCE.lead}</strong> Aucun
          montant n’est prélevé automatiquement.
        </p>
        <p>
          {PREPAYMENT_REASSURANCE.body} {PREPAYMENT_REASSURANCE.renewal}
        </p>
      </LegalBlock>

      <LegalBlock id="distribution" title="14. Liens de distribution">
        <p>
          Publier une campagne génère une adresse publique qui peut être partagée librement. Le
          partage du lien est gratuit ; seuls les exports réellement réalisés consomment un quota
          ou des crédits.
        </p>
        <p>
          Des liens privés de distribution peuvent être créés avec leur propre quota et, si besoin,
          un logo client. Un lien privé doit rester confidentiel : toute personne qui le reçoit peut
          l’utiliser tant qu’il est actif.
        </p>
      </LegalBlock>

      <LegalBlock id="abus" title="15. Utilisation abusive du service">
        <p>
          Les usages manifestement abusifs — publication en masse de contenus contraires à ces
          conditions, tentative d’épuisement des ressources, contournement des quotas — peuvent
          entraîner la suspension de la campagne ou du compte concerné.
        </p>
      </LegalBlock>

      <LegalBlock id="propriete" title="16. Propriété intellectuelle">
        <p>
          Les éléments créés par un utilisateur — cadres, campagnes, textes et images qu’il
          importe — lui appartiennent. Il en conserve la responsabilité et les droits.
        </p>
        <p>
          La marque {PRODUCT.name}, l’interface, le code et les éléments graphiques du service
          appartiennent à {COMPANY.legalName}. Ils ne peuvent pas être réutilisés sans autorisation.
        </p>
      </LegalBlock>

      <LegalBlock id="disponibilite" title="17. Disponibilité du service">
        <p>
          Le service est fourni en l’état. Il peut être interrompu pour maintenance, mise à jour ou
          en raison d’une panne d’un prestataire technique.
        </p>
        <p>
          Aucun engagement de disponibilité chiffré n’est pris à ce jour : un éventuel niveau de
          service devrait être défini et validé avant d’être annoncé : <ToComplete />.
        </p>
      </LegalBlock>

      <LegalBlock id="suspension" title="18. Suspension ou suppression d’un compte">
        <p>
          Un compte peut être suspendu en cas de manquement grave ou répété à ces conditions. Sauf
          urgence, la mesure est précédée d’une information.
        </p>
        <p>
          Le créateur peut supprimer son compte lui-même depuis les réglages. Les conséquences
          précises de cette suppression — ce qui est effacé, ce qui est conservé et pour combien
          de temps — restent à arrêter : <ToComplete />.
        </p>
      </LegalBlock>

      <LegalBlock id="limitation" title="19. Limitation de responsabilité">
        <p>
          {COMPANY.legalName} ne peut être tenue responsable des contenus publiés par les
          utilisateurs, ni de l’usage qui est fait des visuels exportés.
        </p>
        <p>
          Les plafonds et exclusions applicables doivent être rédigés et validés juridiquement :{' '}
          <ToComplete />.
        </p>
      </LegalBlock>

      <LegalBlock id="modification" title="20. Modification des conditions">
        <p>
          Ces conditions peuvent évoluer avec le service. La date de dernière mise à jour sera
          renseignée à chaque révision ; elle est actuellement <ToComplete />.
        </p>
      </LegalBlock>

      <LegalBlock id="contact" title="21. Contact">
        <dl className="rounded-lg border border-gray-200 bg-gray-50 p-5 text-[14px]">
          <dt className="text-[13px] font-semibold text-ink">Éditeur</dt>
          <dd className="mt-1 text-gray-700">{COMPANY.legalName}</dd>
          <dt className="mt-4 text-[13px] font-semibold text-ink">Siège social</dt>
          <dd className="mt-1 text-gray-700">{COMPANY.address}</dd>
          <dt className="mt-4 text-[13px] font-semibold text-ink">RCCM</dt>
          <dd className="mt-1 text-gray-700">{COMPANY.rccm}</dd>
          <dt className="mt-4 text-[13px] font-semibold text-ink">Contact</dt>
          <dd className="mt-1 text-gray-700">
            <a href={`mailto:${COMPANY.email}`} className="font-medium text-ink underline underline-offset-4">
              {COMPANY.email}
            </a>
          </dd>
        </dl>
      </LegalBlock>
    </LegalPageLayout>
  );
}
