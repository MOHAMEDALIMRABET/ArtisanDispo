'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStripe } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/Button';

export default function PaiementSuccessPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const stripe = useStripe();
  const demandeId = searchParams.get('demandeId');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!stripe) return;

    const clientSecret = new URLSearchParams(window.location.search).get(
      'payment_intent_client_secret'
    );

    if (!clientSecret) {
      setStatus('error');
      setMessage(t('clientPaymentSuccess.error.messageMissing'));
      return;
    }

    stripe.retrievePaymentIntent(clientSecret).then(({ paymentIntent }) => {
      if (!paymentIntent) {
        setStatus('error');
        setMessage(t('clientPaymentSuccess.error.messageNotFound'));
        return;
      }

      switch (paymentIntent.status) {
        case 'succeeded':
          setStatus('success');
          setMessage(t('clientPaymentSuccess.success.messageSuccess'));
          break;
        case 'requires_capture':
          // Paiement autorisé avec capture manuelle (séquestre) — succès pour le client
          setStatus('success');
          setMessage(t('clientPaymentSuccess.success.messageSuccess'));
          break;
        case 'processing':
          setStatus('success');
          setMessage(t('clientPaymentSuccess.success.messageProcessing'));
          break;
        case 'requires_payment_method':
          setStatus('error');
          setMessage(t('clientPaymentSuccess.error.messageFailed'));
          break;
        default:
          setStatus('error');
          setMessage(t('clientPaymentSuccess.error.messageUnknown'));
          break;
      }
    });
  }, [stripe]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#F8F9FA] to-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#FF6B00] mx-auto mb-4"></div>
          <p className="text-lg text-[#6C757D]">{t('clientPaymentSuccess.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F8F9FA] to-white">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto">
          {status === 'success' ? (
            <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-12 text-center">
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

              <h1 className="text-3xl font-bold text-[#2C3E50] mb-4">
                {t('clientPaymentSuccess.success.title')}
              </h1>

              <p className="text-lg text-[#6C757D] mb-8">
                {message}
              </p>

              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 mb-8 text-left">
                <h2 className="font-bold text-[#2C3E50] mb-4">
                  {t('clientPaymentSuccess.success.nextStepsTitle')}
                </h2>
                <ul className="space-y-3 text-[#6C757D]">
                  <li className="flex items-start gap-3">
                    <span className="text-[#FF6B00] font-bold">1.</span>
                    <span>{t('clientPaymentSuccess.success.step1')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[#FF6B00] font-bold">2.</span>
                    <span>{t('clientPaymentSuccess.success.step2')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[#FF6B00] font-bold">3.</span>
                    <span>{t('clientPaymentSuccess.success.step3')}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-[#FF6B00] font-bold">4.</span>
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

              <div className="mt-8 pt-8 border-t border-[#E9ECEF]">
                <p className="text-sm text-[#6C757D] mb-4">
                  <strong>{t('clientPaymentSuccess.success.paymentDetailsTitle')}</strong>
                </p>
                <div className="bg-[#F5F7FA] rounded-lg p-4">
                  <p className="text-xs text-[#6C757D]">
                    {t('clientPaymentSuccess.success.emailConfirmation')}
                  </p>
                </div>
              </div>

              <div className="mt-8 bg-green-50 rounded-lg p-4">
                <p className="text-sm text-[#2C3E50] mb-2">
                  <strong>{t('clientPaymentSuccess.success.guaranteesTitle')}</strong>
                </p>
                <ul className="text-xs text-[#6C757D] space-y-1 text-left">
                  <li>{t('clientPaymentSuccess.success.guarantee1')}</li>
                  <li>{t('clientPaymentSuccess.success.guarantee2')}</li>
                  <li>{t('clientPaymentSuccess.success.guarantee3')}</li>
                  <li>{t('clientPaymentSuccess.success.guarantee4')}</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-12 text-center">
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

              <h1 className="text-3xl font-bold text-[#2C3E50] mb-4">
                {t('clientPaymentSuccess.error.title')}
              </h1>

              <p className="text-lg text-[#6C757D] mb-8">
                {message}
              </p>

              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6 mb-8">
                <h2 className="font-bold text-[#2C3E50] mb-4">
                  {t('clientPaymentSuccess.error.whatToDoTitle')}
                </h2>
                <ul className="space-y-2 text-[#6C757D] text-left">
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

              <p className="text-xs text-center text-[#6C757D] mt-8">
                {t('clientPaymentSuccess.error.needHelp')}{' '}
                <Link href="/contact" className="text-[#FF6B00] hover:underline">
                  {t('clientPaymentSuccess.error.contactSupport')}
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
