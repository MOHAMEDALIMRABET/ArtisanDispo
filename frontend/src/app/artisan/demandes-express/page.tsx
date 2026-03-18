'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { getDemandesExpressByArtisan } from '@/lib/firebase/demande-express-service';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { getUserById } from '@/lib/firebase/user-service';
import type { DemandeExpress, User } from '@/types/firestore';

export default function DemandesExpressArtisanPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { user: firebaseUser, loading: authLoading } = useAuth();
  const { markTypeAsRead } = useNotifications(firebaseUser?.uid);
  const [userData, setUserData] = useState<User | null>(null);
  const [demandes, setDemandes] = useState<DemandeExpress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.push('/connexion');
      return;
    }
    loadData();
    markTypeAsRead(['nouvelle_demande_express']);
  }, [firebaseUser, authLoading]);

  async function loadData() {
    if (!firebaseUser) return;

    try {
      const user = await getUserById(firebaseUser.uid);
      setUserData(user);

      if (user?.role !== 'artisan') {
        alert(t('artisanExpressRequests.accessDenied'));
        router.push('/');
        return;
      }

      const demandesList = await getDemandesExpressByArtisan(firebaseUser.uid);
      setDemandes(demandesList);
    } catch (error) {
      console.error(t('artisanExpressRequests.loadError'), error);
    } finally {
      setLoading(false);
    }
  }

  const getStatutColor = (statut: DemandeExpress['statut']) => {
    const colors = {
      en_attente_proposition: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      proposition_recue: 'bg-purple-100 text-purple-800 border-purple-300',
      acceptee: 'bg-green-100 text-green-800 border-green-300',
      payee: 'bg-green-100 text-green-800 border-green-300',
      en_cours: 'bg-purple-100 text-purple-800 border-purple-300',
      terminee: 'bg-gray-100 text-gray-800 border-gray-300',
      annulee: 'bg-red-100 text-red-800 border-red-300',
      expiree: 'bg-gray-100 text-gray-800 border-gray-300',
    };
    return colors[statut] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const getStatutLabel = (statut: DemandeExpress['statut']) => {
    const labels = {
      en_attente_proposition: t('artisanExpressRequests.statuses.en_attente_proposition'),
      proposition_recue: t('artisanExpressRequests.statuses.proposition_recue'),
      acceptee: t('artisanExpressRequests.statuses.acceptee'),
      payee: t('artisanExpressRequests.statuses.payee'),
      en_cours: t('artisanExpressRequests.statuses.en_cours'),
      terminee: t('artisanExpressRequests.statuses.terminee'),
      annulee: t('artisanExpressRequests.statuses.annulee'),
      expiree: t('artisanExpressRequests.statuses.expiree'),
    };
    return labels[statut];
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00] mx-auto mb-4"></div>
          <p className="text-[#6C757D]">{t('artisanExpressRequests.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-[#E9ECEF]">
        <div className="container mx-auto px-4 py-6">
          <nav className="flex items-center gap-2 text-sm mb-4">
            <Link href="/artisan/dashboard" className="text-[#2C3E50] hover:text-[#FF6B00]">
              {t('artisanExpressRequests.breadcrumbDashboard')}
            </Link>
            <span className="text-[#6C757D]">&gt;</span>
            <span className="text-[#2C3E50] font-semibold">{t('artisanExpressRequests.breadcrumbExpressRequests')}</span>
          </nav>

          <h1 className="text-2xl md:text-3xl font-bold text-[#2C3E50]">
            {t('artisanExpressRequests.pageTitle')}
          </h1>
          <p className="text-[#6C757D] mt-2">
            {t('artisanExpressRequests.requestsCount')
              .replace('{count}', String(demandes.length))
              .replace('{plural}', demandes.length > 1 ? t('artisanExpressRequests.requestPlural') : t('artisanExpressRequests.requestSingular'))
              .replace('{plural}', demandes.length > 1 ? t('artisanExpressRequests.receivedPlural') : t('artisanExpressRequests.receivedSingular'))}
          </p>
        </div>
      </div>

      {/* Liste */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          {demandes.length === 0 ? (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center">
              <div className="text-6xl mb-4">📭</div>
              <h2 className="text-2xl font-bold text-[#2C3E50] mb-2">
                {t('artisanExpressRequests.empty.title')}
              </h2>
              <p className="text-[#6C757D]">
                {t('artisanExpressRequests.empty.message')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {demandes.map((demande) => (
                <Link
                  key={demande.id}
                  href={`/artisan/demandes-express/${demande.id}`}
                  className="block"
                >
                  <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow p-6 border-2 border-transparent hover:border-[#FF6B00]">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold border-2 ${getStatutColor(demande.statut)}`}>
                            {getStatutLabel(demande.statut)}
                          </span>
                          {demande.urgence === 'urgent' && (
                            <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-semibold">
                              🚨 Urgent (24h)
                            </span>
                          )}
                          {demande.urgence === 'immediat' && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs font-semibold">
                              ⚡ Immédiat (2h)
                            </span>
                          )}
                        </div>

                        <h3 className="text-lg font-bold text-[#2C3E50] mb-2">
                          {demande.categorie.charAt(0).toUpperCase() + demande.categorie.slice(1)}
                          {demande.sousCategorie && ` • ${demande.sousCategorie}`}
                        </h3>

                        <p className="text-[#6C757D] mb-3 line-clamp-2">
                          {demande.description}
                        </p>

                        <div className="flex flex-wrap gap-4 text-sm text-[#6C757D]">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                            <span>{demande.ville} ({demande.codePostal})</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                            </svg>
                            <span>{new Date(demande.date).toLocaleDateString('fr-FR')}</span>
                          </div>

                          {demande.budgetPropose && (
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                              </svg>
                              <span className="font-semibold text-[#FF6B00]">{demande.budgetPropose}€</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        {demande.statut === 'en_attente_proposition' && (
                          <span className="px-4 py-2 bg-[#FF6B00] text-white rounded-lg font-semibold text-center whitespace-nowrap">
                            {t('artisanExpressRequests.actions.makeProposal')}
                          </span>
                        )}
                        {demande.statut === 'payee' && (
                          <span className="px-4 py-2 bg-green-500 text-white rounded-lg font-semibold text-center whitespace-nowrap">
                            {t('artisanExpressRequests.actions.viewDetails')}
                          </span>
                        )}
                        {demande.statut !== 'en_attente_proposition' && demande.statut !== 'payee' && (
                          <span className="px-4 py-2 border-2 border-[#E9ECEF] text-[#2C3E50] rounded-lg font-semibold text-center whitespace-nowrap">
                            {t('artisanExpressRequests.actions.viewDetails')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
