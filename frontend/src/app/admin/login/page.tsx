'use client';

/**
 * FAUSSE PAGE - Piège pour bots
 * Route: /admin/login (ancienne route, maintenant désactivée)
 * Redirige les bots vers une fausse page pour tracker les tentatives d'intrusion
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { logAdminAccess } from '@/lib/firebase/admin-access-log';

export default function FakeAdminLoginPage() {
  const router = useRouter();

  useEffect(() => {
    // 🚨 Logger la tentative d'accès à l'ancienne URL
    const logAttempt = async () => {
      const ipAddress = 'unknown';
      const userAgent = navigator.userAgent;
      
      await logAdminAccess({
        action: 'unauthorized_access',
        adminEmail: 'unknown',
        ipAddress,
        userAgent,
        details: '⚠️ Tentative accès ancienne URL /admin/login (SUSPECT)',
      });
    };
    
    logAttempt();

    // Rediriger vers page d'accueil après 3 secondes
    const timer = setTimeout(() => {
      router.push('/');
    }, 3000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* Icône 404 */}
        <div className="mb-8">
          <svg
            className="w-24 h-24 mx-auto text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        {/* Message */}
        <h1 className="text-4xl font-bold text-slate-800 mb-4">404</h1>
        <p className="text-xl text-slate-600 mb-2">Page non trouvée</p>
        <p className="text-sm text-slate-500 mb-8">
          La page que vous recherchez n'existe pas ou a été déplacée.
        </p>

        {/* Bouton retour */}
        <button
          onClick={() => router.push('/')}
          className="inline-flex items-center px-6 py-3 bg-brand-700 text-white rounded-lg hover:bg-brand-800 transition"
        >
          ← Retour à l'accueil
        </button>

        {/* Message discret pour vrais admins */}
        <p className="mt-8 text-xs text-slate-400">
          Administrateurs : l'accès a été déplacé pour des raisons de sécurité
        </p>
      </div>
    </div>
  );
}
