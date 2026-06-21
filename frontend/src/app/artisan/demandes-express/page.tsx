'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { getDemandesExpressByArtisan, getPropositionsByArtisanId } from '@/lib/firebase/demande-express-service';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { getUserById } from '@/lib/firebase/user-service';
import type { DemandeExpress, PropositionExpress, User } from '@/types/firestore';
import { getExpressArtisanWindowMs } from '@/lib/express-work-taxonomy';


function getInterventionDeadline(demande: DemandeExpress): string {
  if (!demande.createdAt) {
    const hours = Math.round(getExpressArtisanWindowMs(demande) / (60 * 60 * 1000));
    return `Dans les ${hours}h`;
  }
  const deadline = new Date(
    demande.createdAt.toDate().getTime() +
    getExpressArtisanWindowMs(demande)
  );
  return deadline.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function DemandesExpressArtisanPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { user: firebaseUser, loading: authLoading } = useAuth();
  const { markTypeAsRead } = useNotifications(firebaseUser?.uid);
  const [userData, setUserData] = useState<User | null>(null);
  const [demandes, setDemandes] = useState<DemandeExpress[]>([]);
  const [clientNoms, setClientNoms] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState<'toutes' | 'nouvelles' | 'discussion' | 'payees' | 'terminees' | 'refusees'>('toutes');
  // Map demandeId → proposition de l'artisan (pour détecter devisJoint)
  const [propositionsMap, setPropositionsMap] = useState<Map<string, PropositionExpress>>(new Map());
  // Modale de consultation du devis joint
  const [devisListModal, setDevisListModal] = useState<PropositionExpress | null>(null);
  // Demande liée à la modale (pour le nom client et la catégorie)
  const [devisListDemande, setDevisListDemande] = useState<DemandeExpress | null>(null);
  // Chargement génération PDF
  const [pdfLoadingList, setPdfLoadingList] = useState(false);

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

      // Charger les propositions de l'artisan pour détecter les devisJoint
      const propositions = await getPropositionsByArtisanId(firebaseUser.uid);
      const propMap = new Map<string, PropositionExpress>();
      propositions.forEach(p => propMap.set(p.demandeId, p));
      setPropositionsMap(propMap);

      // Charger les noms clients
      const nomMap = new Map<string, string>();
      await Promise.all(
        [...new Set(demandesList.map(d => d.clientId).filter(Boolean))].map(async (cid) => {
          try {
            const cd = await getUserById(cid);
            if (cd) nomMap.set(cid, `${cd.prenom || ''} ${cd.nom || ''}`.trim());
          } catch {}
        })
      );
      setClientNoms(nomMap);
    } catch (error) {
      console.error(t('artisanExpressRequests.loadError'), error);
    } finally {
      setLoading(false);
    }
  }

  const getStatutColor = (statut: DemandeExpress['statut']) => {
    const colors: Record<string, string> = {
      en_attente_proposition: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      proposition_recue: 'bg-purple-100 text-purple-800 border-purple-300',
      acceptee: 'bg-green-100 text-green-800 border-green-300',
      payee: 'bg-green-100 text-green-800 border-green-300',
      en_cours: 'bg-purple-100 text-purple-800 border-purple-300',
      travaux_termines: 'bg-amber-100 text-amber-800 border-amber-300',
      terminee: 'bg-gray-100 text-gray-800 border-gray-300',
      annulee: 'bg-red-100 text-red-800 border-red-300',
      expiree: 'bg-gray-100 text-gray-800 border-gray-300',
      refusee_artisan: 'bg-orange-100 text-orange-800 border-orange-300',
    };
    return (colors as Record<string, string>)[statut] || 'bg-gray-100 text-gray-800 border-gray-300';
  };

  const getStatutLabel = (statut: DemandeExpress['statut']) => {
    const labels: Record<string, string> = {
      en_attente_proposition: t('artisanExpressRequests.statuses.en_attente_proposition'),
      proposition_recue: t('artisanExpressRequests.statuses.proposition_recue'),
      acceptee: t('artisanExpressRequests.statuses.acceptee'),
      payee: t('artisanExpressRequests.statuses.payee'),
      en_cours: t('artisanExpressRequests.statuses.en_cours'),
      travaux_termines: '⏳ Travaux terminés',
      terminee: t('artisanExpressRequests.statuses.terminee'),
      annulee: t('artisanExpressRequests.statuses.annulee'),
      expiree: t('artisanExpressRequests.statuses.expiree'),
      refusee_artisan: '❌ Refusée',
    };
    return labels[statut] ?? statut;
  };

  // Statuts "clôturés" exclus de l'onglet "Toutes" (déjà visibles dans "Refusées")
  const STATUTS_CLOS = ['expiree', 'annulee', 'refusee_artisan'];

  // Filtrer les demandes
  const demandesFiltrees = demandes.filter((demande) => {
    // "Toutes" n'affiche que les demandes actives (pas les expirées/annulées/refusées)
    if (filtreStatut === 'toutes') return !STATUTS_CLOS.includes(demande.statut);
    if (filtreStatut === 'nouvelles') return demande.statut === 'en_attente_proposition';
    if (filtreStatut === 'discussion') return demande.statut === 'proposition_recue';
    if (filtreStatut === 'payees') return ['payee', 'en_cours'].includes(demande.statut);
    if (filtreStatut === 'terminees') return ['travaux_termines', 'terminee'].includes(demande.statut);
    if (filtreStatut === 'refusees') return ['refusee_artisan', 'annulee', 'expiree'].includes(demande.statut);
    return true;
  });

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

      {/* Filtres */}
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setFiltreStatut('toutes')}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                filtreStatut === 'toutes'
                  ? 'bg-[#FF6B00] text-white'
                  : 'bg-white text-[#2C3E50] hover:bg-[#F5F7FA]'
              }`}
            >
              {t('artisanExpressRequests.filters.all')} ({demandes.length})
            </button>
            <button
              onClick={() => setFiltreStatut('nouvelles')}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                filtreStatut === 'nouvelles'
                  ? 'bg-[#FF6B00] text-white'
                  : 'bg-white text-[#2C3E50] hover:bg-[#F5F7FA]'
              }`}
            >
              <span className="mr-2">🆕</span>{t('artisanExpressRequests.filters.new')} ({demandes.filter(d => d.statut === 'en_attente_proposition').length})
            </button>
            <button
              onClick={() => setFiltreStatut('discussion')}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                filtreStatut === 'discussion'
                  ? 'bg-[#FF6B00] text-white'
                  : 'bg-white text-[#2C3E50] hover:bg-[#F5F7FA]'
              }`}
            >
              <span className="mr-2">💬</span>{t('artisanExpressRequests.filters.discussion')} ({demandes.filter(d => d.statut === 'proposition_recue').length})
            </button>
            <button
              onClick={() => setFiltreStatut('payees')}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                filtreStatut === 'payees'
                  ? 'bg-[#FF6B00] text-white'
                  : 'bg-white text-[#2C3E50] hover:bg-[#F5F7FA]'
              }`}
            >
              <span className="mr-2">💳</span>{t('artisanExpressRequests.filters.paid')} ({demandes.filter(d => ['payee', 'en_cours'].includes(d.statut)).length})
            </button>
            <button
              onClick={() => setFiltreStatut('terminees')}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                filtreStatut === 'terminees'
                  ? 'bg-[#FF6B00] text-white'
                  : 'bg-white text-[#2C3E50] hover:bg-[#F5F7FA]'
              }`}
            >
              <span className="mr-2">✅</span>{t('artisanExpressRequests.filters.completed')} ({demandes.filter(d => ['travaux_termines', 'terminee'].includes(d.statut)).length})
            </button>
            <button
              onClick={() => setFiltreStatut('refusees')}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                filtreStatut === 'refusees'
                  ? 'bg-[#FF6B00] text-white'
                  : 'bg-white text-[#2C3E50] hover:bg-[#F5F7FA]'
              }`}
            >
              <span className="mr-2">❌</span>{t('artisanExpressRequests.filters.refused')} ({demandes.filter(d => ['refusee_artisan', 'annulee', 'expiree'].includes(d.statut)).length})
            </button>
          </div>
        </div>
      </div>

      {/* Liste */}
      <div className="container mx-auto px-4 pb-8">
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
          ) : demandesFiltrees.length === 0 ? (
            <div className="bg-white rounded-xl shadow-lg p-12 text-center">
              <div className="text-6xl mb-4">🔍</div>
              <h2 className="text-2xl font-bold text-[#2C3E50] mb-2">
                {t('artisanExpressRequests.empty.filteredTitle')}
              </h2>
              <p className="text-[#6C757D]">
                {t('artisanExpressRequests.empty.filteredMessage')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {demandesFiltrees.map((demande) => (
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
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              demande.typeTravauxExpress === 'depannage-urgence'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-orange-100 text-orange-800'
                            }`}>
                              {demande.typeTravauxExpress === 'depannage-urgence' ? '🚨 Urgent (30 min - 1h)' : '⚡ Immédiat (2h)'}
                            </span>
                          )}
                        </div>

                        <h3 className="text-lg font-bold text-[#2C3E50] mb-2">
                          {demande.categorie.charAt(0).toUpperCase() + demande.categorie.slice(1)}
                          {demande.sousCategorie && ` • ${demande.sousCategorie}`}
                        </h3>

                        {clientNoms.has(demande.clientId) && (
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 bg-[#2C3E50] text-white rounded-full flex items-center justify-center font-bold text-xs shrink-0">
                              {clientNoms.get(demande.clientId)!.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-semibold text-[#2C3E50]">{clientNoms.get(demande.clientId)}</span>
                          </div>
                        )}

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
                            <span>{demande.urgence === 'immediat' ? '⚡' : '🚨'}</span>
                            <span>
                              Intervention avant le {getInterventionDeadline(demande)}
                            </span>
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

                      <div className="flex flex-col gap-2 items-end">
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

                        {/* Bouton "Voir le devis" si l'artisan a joint un devis joint (montant > 150€) */}
                        {propositionsMap.get(demande.id)?.devisJoint && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDevisListModal(propositionsMap.get(demande.id)!);
                              setDevisListDemande(demande);
                            }}
                            className="flex items-center gap-1.5 bg-[#2C3E50] text-white px-3 py-2 rounded-lg hover:bg-[#1A3A5C] transition-colors text-xs font-semibold whitespace-nowrap"
                          >
                            📋 Voir le devis
                          </button>
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

    {/* ── Modale consultation devis joint (artisan) ──────────────────── */}
    {devisListModal?.devisJoint && (() => {
      const dj = devisListModal.devisJoint!;
      return (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto"
          onClick={() => setDevisListModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête */}
            <div className="bg-[#2C3E50] text-white rounded-t-2xl px-6 py-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">📋 Devis express</h2>
                <p className="text-white/70 text-sm mt-0.5">
                  {devisListDemande
                    ? `${devisListDemande.categorie.charAt(0).toUpperCase() + devisListDemande.categorie.slice(1)} — ${devisListDemande.ville}`
                    : ''}
                </p>
              </div>
              <button onClick={() => setDevisListModal(null)} className="text-white/70 hover:text-white text-2xl leading-none">×</button>
            </div>

            {/* Parties */}
            <div className="px-6 py-4 grid grid-cols-2 gap-4 bg-[#F8F9FA] border-b border-[#E9ECEF] text-sm">
              <div>
                <p className="text-[#6C757D] font-semibold uppercase tracking-wide text-xs mb-0.5">Artisan</p>
                <p className="font-semibold text-[#2C3E50]">{userData?.prenom} {userData?.nom}</p>
              </div>
              <div>
                <p className="text-[#6C757D] font-semibold uppercase tracking-wide text-xs mb-0.5">Client</p>
                <p className="font-semibold text-[#2C3E50]">
                  {devisListDemande ? (clientNoms.get(devisListDemande.clientId) || 'Client') : 'Client'}
                </p>
              </div>
            </div>

            {/* Lignes de prestation */}
            <div className="px-6 pt-4 pb-2 space-y-2">
              {dj.lignes.map((ligne, i) => (
                <div key={i} className="flex justify-between items-start gap-4 py-2 border-b border-[#E9ECEF] last:border-0">
                  <div className="flex-1">
                    <p className="font-semibold text-[#2C3E50] text-sm">{ligne.description}</p>
                    <p className="text-[#6C757D] text-xs">{ligne.quantite} {ligne.unite} — TVA {ligne.tauxTVA}%</p>
                  </div>
                  <span className="font-semibold text-[#2C3E50] text-sm whitespace-nowrap">{ligne.totalHT.toFixed(2)} € HT</span>
                </div>
              ))}

              {/* Main d'œuvre */}
              {dj.mainOeuvre && dj.mainOeuvre.prixHT > 0 && (
                <div className="flex justify-between items-start gap-4 py-2 border-b border-[#E9ECEF]">
                  <div className="flex-1">
                    <p className="font-semibold text-[#2C3E50] text-sm">Main d&apos;œuvre</p>
                    <span className="text-[#6C757D] text-xs">{dj.mainOeuvre.quantite} {dj.mainOeuvre.unite} — TVA {dj.mainOeuvre.tauxTVA}%</span>
                  </div>
                  <span className="font-semibold text-[#2C3E50] text-sm whitespace-nowrap">{dj.mainOeuvre.prixHT.toFixed(2)} € HT</span>
                </div>
              )}

              {/* Matière première */}
              {dj.matierePremiere && (
                <div className="flex justify-between items-start gap-4 py-2 border-b border-[#E9ECEF]">
                  <div className="flex-1">
                    <p className="font-semibold text-[#2C3E50] text-sm">Matière première</p>
                    <span className="text-[#6C757D] text-xs">{dj.matierePremiere.quantite} {dj.matierePremiere.unite} — TVA {dj.matierePremiere.tauxTVA}%</span>
                  </div>
                  <span className="font-semibold text-[#2C3E50] text-sm whitespace-nowrap">{dj.matierePremiere.prixHT.toFixed(2)} € HT</span>
                </div>
              )}
            </div>

            {/* Totaux */}
            <div className="px-6 pb-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-[#6C757D]">
                <span>Total HT</span><span>{dj.totaux.totalHT.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-[#6C757D]">
                <span>TVA</span><span>{dj.totaux.totalTVAGlobal.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between font-bold text-lg text-[#FF6B00] pt-1 border-t border-[#E9ECEF]">
                <span>Total TTC</span><span>{dj.totaux.totalTTC.toFixed(2)} €</span>
              </div>
            </div>

            {/* Conditions */}
            {(dj.delaiRealisation || dj.dateDebutPrevue || dj.conditions) && (
              <div className="px-6 pb-4 space-y-1.5 text-sm border-t border-[#E9ECEF] pt-3">
                {dj.delaiRealisation && (
                  <div className="flex gap-2"><span className="text-[#6C757D] font-semibold min-w-32">Délai :</span><span>{dj.delaiRealisation}</span></div>
                )}
                {dj.dateDebutPrevue && (
                  <div className="flex gap-2"><span className="text-[#6C757D] font-semibold min-w-32">Début prévu :</span><span>{dj.dateDebutPrevue}</span></div>
                )}
                {dj.conditions && (
                  <div className="flex gap-2"><span className="text-[#6C757D] font-semibold min-w-32">Conditions :</span><span>{dj.conditions}</span></div>
                )}
              </div>
            )}

            {/* Signatures */}
            {(dj.signatureArtisan?.dataURL || dj.signatureClient?.dataURL) && (
              <div className="px-6 pb-4 grid grid-cols-2 gap-4 border-t border-[#E9ECEF] pt-4">
                {dj.signatureArtisan?.dataURL && (
                  <div>
                    <p className="text-xs text-[#6C757D] font-semibold mb-1">Signature artisan</p>
                    <img src={dj.signatureArtisan.dataURL} alt="Signature artisan" className="h-14 border border-[#E9ECEF] rounded-lg bg-white p-1 w-full object-contain" />
                  </div>
                )}
                {dj.signatureClient?.dataURL && (
                  <div>
                    <p className="text-xs text-[#6C757D] font-semibold mb-1">Signature client</p>
                    <img src={dj.signatureClient.dataURL} alt="Signature client" className="h-14 border border-[#E9ECEF] rounded-lg bg-white p-1 w-full object-contain" />
                  </div>
                )}
              </div>
            )}

            {/* Boutons */}
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={async () => {
                  if (!devisListDemande) return;
                  setPdfLoadingList(true);
                  try {
                    // Ouvre la page d'impression dans un nouvel onglet (comme le devis classique)
                    window.open(`/devis-express-print/${devisListModal.id}`, '_blank');
                  } finally {
                    setPdfLoadingList(false);
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 bg-[#2C3E50] text-white px-4 py-3 rounded-lg hover:bg-[#1A3A5C] transition-colors font-semibold"
              >
                🖨️ Imprimer / PDF
              </button>
              <button
                onClick={() => setDevisListModal(null)}
                className="flex-1 bg-[#FF6B00] text-white px-4 py-3 rounded-lg hover:bg-[#E56100] transition-colors font-semibold"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      );
    })()}
    </div>
  );
}
