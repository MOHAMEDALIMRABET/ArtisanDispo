'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authService } from '@/lib/auth-service';
import { getUserById } from '@/lib/firebase/user-service';

export default function ClientDemandesHubPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        router.push('/connexion');
        return;
      }
      const userData = await getUserById(currentUser.uid);
      if (!userData || userData.role !== 'client') {
        router.push('/connexion');
        return;
      }
      setIsLoading(false);
    }
    checkAuth();
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* En-tête */}
      <div className="bg-[#2C3E50] text-white py-6 px-4">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-2xl font-bold">📋 Mes Demandes</h1>
          <p className="text-gray-300 text-sm mt-1">Gérez vos demandes de travaux</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">

        {/* Fil d'Ariane */}
        <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
          <button onClick={() => router.push('/dashboard')} className="hover:text-[#FF6B00] transition flex items-center gap-1">
            ← Retour au tableau de bord
          </button>
        </div>

        {/* Hub : 2 cartes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ── CARTE Demandes Classiques ── */}
          <button
            onClick={() => router.push('/client/demandes')}
            className="group text-left bg-[#2C3E50] rounded-2xl shadow-md hover:shadow-xl transition-all duration-200 overflow-hidden flex flex-col"
          >
            {/* Bandeau */}
            <div className="bg-[#2C3E50] px-6 py-4 flex items-center gap-3">
              <span className="text-3xl">🏗️</span>
              <div>
                <div className="text-white font-bold text-xl">Demandes Classiques</div>
                <div className="text-gray-300 text-sm">Devis personnalisés</div>
              </div>
            </div>
            {/* Corps */}
            <div className="bg-white px-6 py-5 space-y-4 flex-1">
              <div className="flex items-center gap-4 p-3 rounded-xl bg-orange-50 border border-orange-200">
                <span className="text-2xl">📋</span>
                <div className="flex-1">
                  <div className="font-semibold text-[#2C3E50] text-sm">Mes demandes de devis</div>
                  <div className="text-xs text-gray-500 mt-0.5">Suivre vos demandes et devis reçus</div>
                </div>
              </div>
              <div className="flex items-center gap-4 p-3 rounded-xl bg-purple-50 border border-purple-200">
                <span className="text-2xl">🔔</span>
                <div className="flex-1">
                  <div className="font-semibold text-[#2C3E50] text-sm">Artisans qualifiés</div>
                  <div className="text-xs text-gray-500 mt-0.5">Recevez des devis d'artisans certifiés</div>
                </div>
              </div>
              <div className="flex items-center justify-end pt-1">
                <span className="text-sm font-semibold text-[#FF6B00] group-hover:underline">Accéder →</span>
              </div>
            </div>
          </button>

          {/* ── CARTE Demandes Express ── */}
          <button
            onClick={() => router.push('/client/demandes-express')}
            className="group text-left bg-[#FF6B00] rounded-2xl shadow-md hover:shadow-xl transition-all duration-200 overflow-hidden flex flex-col"
          >
            {/* Bandeau */}
            <div className="bg-[#FF6B00] px-6 py-4 flex items-center gap-3">
              <span className="text-3xl">⚡</span>
              <div>
                <div className="text-white font-bold text-xl">Demandes Express</div>
                <div className="text-orange-100 text-sm">Petits travaux rapides</div>
              </div>
            </div>
            {/* Corps */}
            <div className="bg-white px-6 py-5 space-y-4 flex-1">
              <div className="flex items-center gap-4 p-3 rounded-xl bg-orange-50 border border-orange-200">
                <span className="text-2xl">⚡</span>
                <div className="flex-1">
                  <div className="font-semibold text-[#2C3E50] text-sm">Demandes express</div>
                  <div className="text-xs text-gray-500 mt-0.5">Petits travaux &lt; 150€</div>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                <div className="text-xs text-gray-500 leading-relaxed">Interventions rapides à prix fixe, artisans disponibles immédiatement.</div>
              </div>
              <div className="flex items-center justify-end pt-1">
                <span className="text-sm font-semibold text-[#FF6B00] group-hover:underline">Accéder →</span>
              </div>
            </div>
          </button>

        </div>
      </div>
    </div>
  );
}
