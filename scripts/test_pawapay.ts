import { v4 as uuidv4 } from 'uuid';
import { initiatePaymentPage, checkDepositStatus, isPawaPayConfigured } from '../lib/pawapay';

async function test() {
  if (!isPawaPayConfigured()) {
    console.error('pawaPay not configured. Check env variables.');
    process.exit(1);
  }
  const depositId = uuidv4();
  const returnUrl = 'https://example.com/return';
  try {
    const { redirectUrl } = await initiatePaymentPage({
      depositId,
      returnUrl,
      amount: 1.00,
      reason: 'Test paiement pawaPay',
    });
    console.log('Redirect URL:', redirectUrl);
  } catch (e) {
    console.error('Error initiating payment page:', e);
  }

  try {
    const status = await checkDepositStatus(depositId);
    console.log('Deposit status:', status);
  } catch (e) {
    console.error('Error checking status:', e);
  }
}

test();
