import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { v4 as uuidv4 } from 'uuid';

async function test() {
  const { initiatePaymentPage, checkDepositStatus, isPawaPayConfigured, PAWAPAY_BASE_URL } = await import(
    '../lib/pawapay'
  );

  console.log('--- Test PawaPay ---');
  console.log('Environnement cible :', PAWAPAY_BASE_URL);

  if (!isPawaPayConfigured()) {
    console.error('❌ PAWAPAY_API_TOKEN non configuré dans l’environnement ou .env.local.');
    process.exit(1);
  }

  const depositId = uuidv4();
  const returnUrl = 'https://example.com/return';
  const amount = process.env.TEST_AMOUNT ? Number(process.env.TEST_AMOUNT) : 100;

  console.log(`\n1. Initiation du paiement (depositId: ${depositId}, montant: ${amount} XOF)...`);

  try {
    const { redirectUrl } = await initiatePaymentPage({
      depositId,
      returnUrl,
      amount,
      currency: 'XOF',
      reason: 'Test paiement pawaPay',
    });
    console.log('✅ Succès ! Redirect URL reçue :');
    console.log(redirectUrl);
  } catch (e: any) {
    console.error('❌ Erreur lors de l’initiation :');
    if (e.status) console.error(`Code HTTP: ${e.status}`);
    if (e.message) console.error(`Message: ${e.message}`);
    if (e.body) console.error('Détails API:', JSON.stringify(e.body, null, 2));
    if (!e.status && !e.body) console.error(e);
  }

  console.log(`\n2. Vérification du statut du dépôt...`);
  try {
    const status = await checkDepositStatus(depositId);
    console.log('Statut du dépôt :', status);
  } catch (e: any) {
    console.error('❌ Erreur lors de la vérification du statut :', e.message || e);
  }
}

test();
