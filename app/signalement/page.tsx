import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalBlock, LegalPageLayout, ToComplete, type LegalSection } from '@/components/legal/legal-page-layout';
import { COMPANY, TO_COMPLETE } from '@/lib/company';
import { REPORT_REASONS } from '@/lib/reports';
import { ReportForm } from './report-form';

export const metadata: Metadata = {
  title: 'Signaler un contenu',
  description:
    'Signaler une campagne publiée sur Campagnes qui semble contraire aux règles du service : contenu illégal, atteinte au droit d’auteur, vie privée, usurpation.',
  alternates: { canonical: '/signalement' },
  openGraph: {
    title: 'Signaler un contenu · Campagnes',
    description:
      'Vous pouvez nous signaler un contenu qui semble contrevenir aux règles de Campagnes.',
    url: '/signalement',
    type: 'article',
  },
};

const SECTIONS: LegalSection[] = [
  { id: 'motifs', title: '1. Ce que vous pouvez signaler' },
  { id: 'formulaire', title: '2. Formulaire de signalement' },
  { id: 'traitement', title: '3. Traitement du signalement' },
  { id: 'contact', title: '4. Nous écrire directement' },
];

export default function SignalementPage() {
  return (
    <LegalPageLayout
      title="Signaler un contenu"
      subtitle="Vous pouvez nous signaler un contenu qui semble contrevenir aux règles de Campagnes."
      updatedAt={TO_COMPLETE}
      sections={SECTIONS}
    >
      <LegalBlock id="motifs" title="1. Ce que vous pouvez signaler">
        <p>
          Une campagne publiée sur Campagnes est créée par un utilisateur, qui en reste
          responsable. Si l’une d’elles vous paraît problématique, vous pouvez nous la signaler —
          un compte n’est pas nécessaire.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          {REPORT_REASONS.map((reason) => (
            <li key={reason.value}>{reason.label}</li>
          ))}
        </ul>
        <p className="text-[14px] text-gray-500">
          Vous n’êtes pas certain du motif exact ? Choisissez « Autre » et décrivez la situation :
          un signalement imprécis reste plus utile qu’un signalement que vous ne faites pas.
        </p>
      </LegalBlock>

      <LegalBlock id="formulaire" title="2. Formulaire de signalement">
        <ReportForm />
      </LegalBlock>

      <LegalBlock id="traitement" title="3. Traitement du signalement">
        <p>
          Chaque signalement est examiné par notre équipe. Si le contenu contrevient aux{' '}
          <Link href="/conditions" className="font-medium text-ink underline underline-offset-4">
            conditions d’utilisation
          </Link>
          , il peut être retiré, et le compte concerné suspendu.
        </p>
        <p>
          Les délais de traitement et les voies de recours ouvertes à la personne dont le contenu
          est retiré doivent être formalisés : <ToComplete />.
        </p>
        <p className="text-[14px] text-gray-500">
          Un signalement abusif ou répété — notamment pour faire retirer un contenu légitime — peut
          lui-même être considéré comme un usage abusif du service.
        </p>
      </LegalBlock>

      <LegalBlock id="contact" title="4. Nous écrire directement">
        <p>
          Pour une question qui ne relève pas d’un signalement, ou pour transmettre des pièces
          complémentaires :{' '}
          <a
            href={`mailto:${COMPANY.email}`}
            className="font-medium text-ink underline underline-offset-4"
          >
            {COMPANY.email}
          </a>
          .
        </p>
        <p className="text-[14px] text-gray-500">
          {COMPANY.legalName} — {COMPANY.address}
        </p>
      </LegalBlock>
    </LegalPageLayout>
  );
}
