import type { Metadata } from 'next';
import { OnboardingForm } from '@/components/auth/onboarding-form';

export const metadata: Metadata = { title: 'Votre profil créateur' };

export default function OnboardingPage() {
  return <OnboardingForm />;
}
