'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function MotDePasseRedefiniPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [countdown, setCountdown] = useState(5);

  // Redirection automatique vers connexion après 5 secondes
  useEffect(() => {
    if (countdown <= 0) {
      router.push('/connexion');
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">

        {/* Icône succès */}
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        {/* Titre */}
        <div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">
            Mot de passe réinitialisé !
          </h2>
          <p className="text-slate-600">
            Votre mot de passe a été changé avec succès. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
          </p>
        </div>

        {/* Info countdown */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <p className="text-sm text-slate-700">
            Redirection automatique vers la connexion dans{' '}
            <span className="font-bold text-brand-700">{countdown}</span> seconde{countdown > 1 ? 's' : ''}…
          </p>
        </div>

        {/* Bouton */}
        <Link
          href="/connexion"
          className="w-full inline-flex justify-center items-center bg-brand-700 text-white px-6 py-3 rounded-lg hover:bg-brand-800 transition-colors font-semibold"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14" />
          </svg>
          Se connecter maintenant
        </Link>

        {/* Support */}
        <p className="text-sm text-slate-500">
          Un problème ?{' '}
          <a href="mailto:support@artisansafe.fr" className="text-brand-700 hover:underline">
            Contactez le support
          </a>
        </p>
      </div>
    </div>
  );
}
