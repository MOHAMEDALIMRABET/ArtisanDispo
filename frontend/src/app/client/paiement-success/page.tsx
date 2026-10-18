'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, useStripe } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/Button';

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

/**
 * StripeStatusChecker — Composant sans rendu visuel (retourne null).
 * Interroge Stripe pour connaître le statut du PaymentIntent via clientSecret
 * et remonte success/error au parent via le callback onResult().
 * DOIT être enveloppé dans un <Elements> provider (requis par useStripe).
 */
function StripeStatusChecker({
  clientSecret,
  onResult,
}: {
  clientSecret: string;
  onResult: (status: 'success' | 'error', message: string) => void;
}) {
  const stripe = useStripe();
  const { t } = useLanguage();

  // ── Déclenché dès que le SDK Stripe est initialisé ───────────────────────────
  useEffect(() => {
    if (!stripe) return;

    // Interroge Stripe pour récupérer le statut du PaymentIntent
    stripe.retrievePaymentIntent(clientSecret).then(({ paymentIntent }) => {
      if (!paymentIntent) {
        onResult('error', t('clientPaymentSuccess.error.messageNotFound'));
        return;
      }
      // Traduit le statut technique Stripe en résultat compréhensible par l'interface
      switch (paymentIntent.status) {
        case 'succeeded':
        case 'requires_capture':          // Paiement autorisé (capture différée pour le séquestre)
          onResult('success', t('clientPaymentSuccess.success.messageSuccess'));
          break;
        case 'processing':               // Virement en attente (ex: SEPA)
          onResult('success', t('clientPaymentSuccess.success.messageProcessing'));
          break;
        case 'requires_payment_method':  // Échec (carte refusée, fonds insuffisants…)
          onResult('error', t('clientPaymentSuccess.error.messageFailed'));
          break;
        default:
          onResult('error', t('clientPaymentSuccess.error.messageUnknown'));
          break;
      }
    });
  }, [stripe]);

  return null; // Composant purement logique, aucun rendu visuel
}

export default function PaiementSuccessPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const demandeId = searchParams.get('demandeId');
  const clientSecret = searchParams.get('payment_intent_client_secret');

  // En mode simulation, pas de clientSecret → succès direct
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    clientSecret ? 'loading' : 'success'
  );
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Mode simulation : pas de clientSecret, paiement déjà confirmé côté serveur
    if (!clientSecret) {
      setMessage(t('clientPaymentSuccess.success.messageSuccess'));
    }
  }, [clientSecret]);

  return (
    <>
      {/* Vérification Stripe uniquement si paiement réel (clientSecret présent) */}
      {clientSecret && stripePromise && (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <StripeStatusChecker
            clientSecret={clientSecret}
            onResult={(s, m) => { setStatus(s); setMessage(m); }}
          />
        </Elements>
      )}

      {status === 'loading' ? (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-brand-500 mx-auto mb-4"></div>
            <p className="text-lg text-slate-500">{t('clientPaymentSuccess.loading')}</p>
          </div>
        </div>
      ) : (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto">
          {status === 'success' ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12 text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg
                  className="w-12 h-12 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>

              <h1 className="text-3xl font-bold text-navy-800 mb-4">
                {t('clientPaymentSuccess.success.title')}
              </h1>

              <p className="text-lg text-slate-500 mb-8">
                {message}
              </p>

              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 mb-8 text-left">
                <h2 className="font-bold text-navy-800 mb-4">
                  {t('clientPaymentSuccess.success.nextStepsTitle')}
                </h2>
                <ul className="space-y-3 text-slate-500">
                  <li className="flex items-start gap-3">
                    <span className="text-brand-700 font-bold">1.</span>
                    <span>{t('clientPaymentSuccess.success.step1')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-brand-700 font-bold">2.</span>
                    <span>{t('clientPaymentSuccess.success.step2')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-brand-700 font-bold">3.</span>
                    <span>{t('clientPaymentSuccess.success.step3')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-brand-700 font-bold">4.</span>
                    <span>{t('clientPaymentSuccess.success.step4')}</span>
                  </li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  onClick={() => router.push('/client/dashboard')}
                  variant="secondary"
                  className="flex-1"
                >
                  {t('clientPaymentSuccess.success.dashboardButton')}
                </Button>
                {demandeId && (
                  <Button
                    onClick={() => router.push(`/client/demandes-express/${demandeId}`)}
                    className="flex-1"
                  >
                    {t('clientPaymentSuccess.success.viewRequestButton')}
                  </Button>
                )}
              </div>

              <div className="mt-8 pt-8 border-t border-slate-200">
                <p className="text-sm text-slate-500 mb-4">
                  <strong>{t('clientPaymentSuccess.success.paymentDetailsTitle')}</strong>
                </p>
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-xs text-slate-500">
                    {t('clientPaymentSuccess.success.emailConfirmation')}
                  </p>
                </div>
              </div>

              <div className="mt-8 bg-green-50 rounded-lg p-4">
                <p className="text-sm text-navy-800 mb-2">
                  <strong>{t('clientPaymentSuccess.success.guaranteesTitle')}</strong>
                </p>
                <ul className="text-xs text-slate-500 space-y-1 text-left">
                  <li>{t('clientPaymentSuccess.success.guarantee1')}</li>
                  <li>{t('clientPaymentSuccess.success.guarantee2')}</li>
                  <li>{t('clientPaymentSuccess.success.guarantee3')}</li>
                  <li>{t('clientPaymentSuccess.success.guarantee4')}</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 md:p-12 text-center">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg
                  className="w-12 h-12 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>

              <h1 className="text-3xl font-bold text-navy-800 mb-4">
                {t('clientPaymentSuccess.error.title')}
              </h1>

              <p className="text-lg text-slate-500 mb-8">
                {message}
              </p>

              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6 mb-8">
                <h2 className="font-bold text-navy-800 mb-4">
                  {t('clientPaymentSuccess.error.whatToDoTitle')}
                </h2>
                <ul className="space-y-2 text-slate-500 text-left">
                  <li>{t('clientPaymentSuccess.error.tip1')}</li>
                  <li>{t('clientPaymentSuccess.error.tip2')}</li>
                  <li>{t('clientPaymentSuccess.error.tip3')}</li>
                  <li>{t('clientPaymentSuccess.error.tip4')}</li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  onClick={() => router.push('/client/dashboard')}
                  variant="secondary"
                  className="flex-1"
                >
                  {t('clientPaymentSuccess.error.dashboardButton')}
                </Button>
                {demandeId && (
                  <Button
                    onClick={() => router.push(`/client/demandes-express/${demandeId}`)}
                    className="flex-1"
                  >
                    {t('clientPaymentSuccess.error.retryButton')}
                  </Button>
                )}
              </div>

              <p className="text-xs text-center text-slate-500 mt-8">
                {t('clientPaymentSuccess.error.needHelp')}{' '}
                <Link href="/contact" className="text-brand-700 hover:underline">
                  {t('clientPaymentSuccess.error.contactSupport')}
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
      )}
    </>
  );
}
