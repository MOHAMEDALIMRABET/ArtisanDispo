'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';

export default function ChoisirTypeDemanPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Redirection si pas connecté
  if (!authLoading && !user) {
    router.push('/connexion');
    return null;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto mb-4"></div>
          <p className="text-slate-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* En-tête */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-navy-800 mb-4">
            📝 Créer une Demande de Devis
          </h1>
          <p className="text-slate-600 text-lg">
            Choisissez la méthode qui correspond le mieux à votre besoin
          </p>
        </div>

        {/* Cartes de choix */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Demande Directe */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-lg transition-shadow duration-300 cursor-pointer group p-8"
                onClick={() => router.push('/recherche')}>
            <div className="flex flex-col h-full">
              {/* Icône */}
              <div className="mb-6">
                <div className="w-20 h-20 bg-brand-600 rounded-full flex items-center justify-center mx-auto group-hover:scale-105 transition-transform">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>

              {/* Titre */}
              <h2 className="text-2xl font-bold text-navy-800 mb-3 text-center">
                🎯 Demande Directe
              </h2>
              
              {/* Sous-titre */}
              <p className="text-brand-700 font-semibold text-center mb-4">
                "Je connais déjà l'artisan que je veux"
              </p>

              {/* Description */}
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <p className="text-slate-700">
                    <strong>Rapide et simple</strong> - Un seul artisan contacté
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <p className="text-slate-700">
                    <strong>Réponse généralement sous 48h</strong> - Artisan notifié immédiatement
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <p className="text-slate-700">
                    <strong>Vous choisissez l'artisan</strong> avant d'envoyer la demande
                  </p>
                </div>
              </div>

              {/* Workflow */}
              <div className="bg-slate-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-slate-600 font-medium mb-2">📋 Comment ça marche :</p>
                <ol className="text-sm text-slate-700 space-y-1">
                  <li>1. Recherchez des artisans par métier et localisation</li>
                  <li>2. Consultez les profils et avis clients</li>
                  <li>3. Cliquez sur "Demander un devis" sur le profil choisi</li>
                  <li>4. Remplissez le formulaire et envoyez</li>
                </ol>
              </div>

              {/* Bouton */}
              <button
                onClick={() => router.push('/recherche')}
                className="w-full bg-brand-700 hover:bg-brand-800 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 group-hover:scale-105 transform duration-200 mt-auto"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Rechercher un artisan
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          </div>

          {/* Demande Publique */}
          <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 cursor-pointer group border-2 border-navy-800 p-8"
                onClick={() => router.push('/demande/publique/nouvelle')}>
            <div className="flex flex-col h-full">
              {/* Icône */}
              <div className="mb-6">
                <div className="w-20 h-20 bg-navy-800 rounded-full flex items-center justify-center mx-auto group-hover:scale-105 transition-transform">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
              </div>

              {/* Titre */}
              <h2 className="text-2xl font-bold text-navy-800 mb-3 text-center">
                📢 Demande Publique
              </h2>
              
              {/* Sous-titre */}
              <p className="text-navy-800 font-semibold text-center mb-4">
                "Je veux comparer plusieurs devis"
              </p>

              {/* Description */}
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <p className="text-slate-700">
                    <strong>Plusieurs artisans répondent</strong> - Maximisez vos chances
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <p className="text-slate-700">
                    <strong>Comparez prix et délais</strong> - Choisissez la meilleure offre
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <p className="text-slate-700">
                    <strong>Notifications continues</strong> - Même si nouveaux artisans s'inscrivent
                  </p>
                </div>
              </div>

              {/* Workflow */}
              <div className="bg-slate-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-slate-600 font-medium mb-2">📋 Comment ça marche :</p>
                <ol className="text-sm text-slate-700 space-y-1">
                  <li>1. Publiez votre demande avec critères (métier, zone, rayon)</li>
                  <li>2. Artisans correspondants notifiés automatiquement</li>
                  <li>3. Nouveaux artisans qui s'inscrivent reçoivent la notification</li>
                  <li>4. Comparez les devis et choisissez le meilleur</li>
                </ol>
              </div>

              {/* Bouton */}
              <button
                onClick={() => router.push('/demande/publique/nouvelle')}
                className="w-full bg-navy-800 hover:bg-navy-900 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 group-hover:scale-105 transform duration-200 mt-auto"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                Publier une demande
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Retour */}
        <div className="mt-8 text-center">
          <button
            onClick={() => router.back()}
            className="text-slate-600 hover:text-brand-700 flex items-center gap-2 mx-auto"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour
          </button>
        </div>
      </div>
    </div>
  );
}
