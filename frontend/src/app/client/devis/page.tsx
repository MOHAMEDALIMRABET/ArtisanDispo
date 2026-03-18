'use client';

/**
 * Page de consultation des devis reçus par le client
 * Affiche tous les devis groupés par demande
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Devis } from '@/types/devis';
import type { Demande } from '@/types/firestore';
import Link from 'next/link';
import { annulerDevisParClient } from '@/lib/firebase/devis-service';
import { getAvisByContratId } from '@/lib/firebase/avis-service';
import { markNotificationsByLienAsRead } from '@/lib/firebase/notification-service';
import { resendVerificationEmail } from '@/lib/auth-service';

// Helper: Devis considérés comme "acceptés" (en attente de paiement)
const isDevisAccepte = (statut: string) => statut === 'en_attente_paiement';

// Helper: Devis considérés comme "payés" (contrats signés)
const isDevisPaye = (statut: string) => 
  ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'].includes(statut);

export default function ClientDevisPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [devis, setDevis] = useState<Devis[]>([]);
  const [demandes, setDemandes] = useState<Map<string, Demande>>(new Map());
  const [loading, setLoading] = useState(true);
  const [emailResent, setEmailResent] = useState(false);
  const [filter, setFilter] = useState<'tous' | 'en_attente' | 'en_revision' | 'acceptes' | 'payes' | 'refuses'>('en_attente');
  const [avisParDevisId, setAvisParDevisId] = useState<Record<string, boolean>>({});
  const [sousFiltrePayes, setSousFiltrePayes] = useState<'tout' | 'paye' | 'en_cours' | 'travaux_termines' | 'valides' | 'litige'>('tout');
  const [devisAvecNotifNonLues, setDevisAvecNotifNonLues] = useState<Set<string>>(new Set());
  // Snapshot capturé au chargement — pour badge 🔔 persistant sur les cartes individuelles
  const [devisNotifsInitialIds, setDevisNotifsInitialIds] = useState<Set<string>>(new Set());

  // Réinitialiser le sous-filtre quand on quitte la section "Payés"
  useEffect(() => {
    if (filter !== 'payes') {
      setSousFiltrePayes('tout');
    }
  }, [filter]);

  // Restaurer le filtre depuis l'URL au retour
  useEffect(() => {
    const returnFilter = searchParams.get('returnFilter');
    if (returnFilter && ['tous', 'en_attente', 'en_revision', 'acceptes', 'payes', 'refuses'].includes(returnFilter)) {
      setFilter(returnFilter as typeof filter);
    }
  }, [searchParams]);

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      router.push('/connexion');
      return;
    }
    
    loadDevis();
  }, [user, authLoading, router]);

  const loadDevis = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // Charger tous les devis du client (SAUF les brouillons)
      const q = query(
        collection(db, 'devis'),
        where('clientId', '==', user.uid)
      );

      const querySnapshot = await getDocs(q);
      const allDevis = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Devis));

      // Filtrer pour exclure les brouillons et les devis remplacés (le client voit les en_revision dans leur section dédiée)
      const devisData = allDevis.filter(d => 
        d.statut !== 'genere' && 
        d.statut !== 'remplace'
      );

      // Trier par date de création décroissante
      devisData.sort((a, b) => {
        const dateA = a.dateCreation?.toMillis() || 0;
        const dateB = b.dateCreation?.toMillis() || 0;
        return dateB - dateA;
      });

      // Auto-expirer les devis dont la deadline de paiement est dépassée
      const now = Date.now();
      const aExpirerIds: string[] = [];
      const devisDataFinal = devisData.map(d => {
        if (
          d.statut === 'en_attente_paiement' &&
          d.dateLimitePaiement &&
          d.dateLimitePaiement.toMillis() < now
        ) {
          aExpirerIds.push(d.id);
          return { ...d, statut: 'expire' as const };
        }
        return d;
      });

      setDevis(devisDataFinal);

      if (aExpirerIds.length > 0) {
        // Persister en Firestore (fire-and-forget)
        Promise.all(
          aExpirerIds.map(id =>
            updateDoc(doc(db, 'devis', id), {
              statut: 'expire',
              dateExpiration: Timestamp.now(),
              motifExpiration: 'Paiement non effectué dans le délai imparti',
            })
          )
        ).catch(e => console.error('Erreur expiration devis:', e));
      }
      const demandesMap = new Map<string, Demande>();
      for (const d of devisData) {
        if (d.demandeId && !demandesMap.has(d.demandeId)) {
          const demandeDoc = await getDoc(doc(db, 'demandes', d.demandeId));
          if (demandeDoc.exists()) {
            demandesMap.set(d.demandeId, {
              id: demandeDoc.id,
              ...demandeDoc.data(),
            } as Demande);
          }
        }
      }
      setDemandes(demandesMap);

      // Charger l'existence d'un avis pour les devis terminés
      const devisTermines = devisData.filter(d =>
        ['termine_valide', 'termine_auto_valide'].includes(d.statut)
      );
      const avisMap: Record<string, boolean> = {};
      await Promise.all(
        devisTermines.map(async (d) => {
          const avis = await getAvisByContratId(d.id);
          avisMap[d.id] = !!avis;
        })
      );
      setAvisParDevisId(avisMap);

      // Charger les notifications non lues liées à un devis spécifique
      const notifsQ = query(
        collection(db, 'notifications'),
        where('userId', '==', user.uid),
        where('lue', '==', false)
      );
      const notifsSnap = await getDocs(notifsQ);
      const nonLuesIds = new Set<string>();
      notifsSnap.docs.forEach(notifDoc => {
        const data = notifDoc.data();
        if (data.lien && typeof data.lien === 'string') {
          const match = data.lien.match(/^\/client\/devis\/([^?/]+)/);
          if (match) nonLuesIds.add(match[1]);
        }
      });
      setDevisAvecNotifNonLues(nonLuesIds);
      // Capturer un snapshot pour les badges persistants
      setDevisNotifsInitialIds(new Set(nonLuesIds));
      // Auto-effacer dans Firestore après 1.5s → vide la cloche ET le badge "Tous"
      if (nonLuesIds.size > 0) {
        const userId = user.uid;
        setTimeout(async () => {
          await Promise.all(
            [...nonLuesIds].map(id =>
              markNotificationsByLienAsRead(userId, `/client/devis/${id}`)
            )
          ).catch(() => {});
          setDevisAvecNotifNonLues(new Set());
        }, 1500);
      }
    } catch (error) {
      console.error('Erreur chargement devis:', error);
    } finally {
      setLoading(false);
    }
  };

  // Navigation vers le détail d'un devis + marquage notifications comme lues
  const naviguerVersDevis = async (devisId: string, queryString?: string) => {
    if (devisAvecNotifNonLues.has(devisId) && user) {
      try {
        await markNotificationsByLienAsRead(user.uid, `/client/devis/${devisId}`);
        setDevisAvecNotifNonLues(prev => {
          const next = new Set(prev);
          next.delete(devisId);
          return next;
        });
      } catch (e) { /* non bloquant */ }
    }
    router.push(`/client/devis/${devisId}${queryString ? `?${queryString}` : ''}`);
  };

  const handleAnnulerDevis = async (devisId: string, numeroDevis: string, montantTTC: number, nomArtisan: string) => {
    if (!user) return;

    // Message d'avertissement CLAIR et professionnel
    const confirmAnnulation = window.confirm(
      `⚠️ ${t('quotes.cancelQuoteWarningTitle')}\n\n` +
      `${t('quotes.quoteNumber')} : ${numeroDevis}\n` +
      `${t('quotes.craftsman')} : ${nomArtisan}\n` +
      `${t('quotes.amount')} : ${montantTTC.toFixed(2)}€ ${t('quotes.ttc')}\n\n` +
      t('quotes.cancelQuoteWarningMessage')
    );

    if (!confirmAnnulation) return;

    try {
      await annulerDevisParClient(devisId, user.uid, 'Client désisté avant paiement');
      alert(
        `✅ ${t('quotes.cancelQuoteSuccessTitle')}\n\n` +
        t('quotes.cancelQuoteSuccessMessage').replace('{{artisanName}}', nomArtisan)
      );
      await loadDevis(); // Recharger la liste
    } catch (error: any) {
      console.error('Erreur annulation devis:', error);
      alert(`❌ ${t('quotes.cancelQuoteError')} : ${error.message || t('common.unknownError')}`);
    }
  };

  const getStatutBadge = (statut: string) => {
    const styles: { [key: string]: string } = {
      genere: 'bg-gray-100 text-gray-800',
      envoye: 'bg-purple-100 text-purple-700',
      en_revision: 'bg-purple-100 text-purple-800',
      accepte: 'bg-yellow-100 text-yellow-800',
      en_attente_paiement: 'bg-yellow-100 text-yellow-800',
      paye: 'bg-green-600 text-white',
      en_cours: 'bg-amber-600 text-white',
      travaux_termines: 'bg-orange-100 text-orange-800',
      termine_valide: 'bg-green-700 text-white',
      termine_auto_valide: 'bg-green-600 text-white',
      litige: 'bg-red-600 text-white',
      refuse: 'bg-red-100 text-red-800',
      expire: 'bg-orange-100 text-orange-800',
      remplace: 'bg-gray-200 text-gray-600',
      annule: 'bg-gray-300 text-gray-700',
    };

    const labels: { [key: string]: string } = {
      genere: `📝 ${t('quotes.draft')}`,
      envoye: `🆕 ${t('quotes.new')}`,
      en_revision: `🔄 ${t('quotes.inRevision')}`,
      accepte: `💳 ${t('quotes.waitingPayment')}`,
      en_attente_paiement: `💳 ${t('quotes.waitingPayment')}`,
      paye: `💰 ${t('quotes.paid')}`,
      en_cours: `🚧 ${t('quotes.inProgress')}`,
      travaux_termines: `✅ ${t('quotes.worksCompleted')}`,
      termine_valide: `✔️ ${t('quotes.validated')}`,
      termine_auto_valide: `✔️ ${t('quotes.autoValidated')}`,
      litige: `⚠️ ${t('quotes.dispute')}`,
      refuse: `❌ ${t('quotes.refused')}`,
      expire: `⏰ ${t('quotes.expired')}`,
      remplace: `🔄 ${t('quotes.replaced')}`,
      annule: `🚫 ${t('quotes.cancelled')}`,
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[statut] || 'bg-gray-100 text-gray-800'}`}>
        {labels[statut] || statut}
      </span>
    );
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00] mx-auto"></div>
          <p className="mt-4 text-[#6C757D]">{t('quotes.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const filteredDevis = devis.filter(d => {
    if (filter === 'tous') return d.statut !== 'en_revision'; // en_revision a sa propre section
    if (filter === 'en_attente') return d.statut === 'envoye';
    if (filter === 'en_revision') return d.statut === 'en_revision';
    if (filter === 'acceptes') return isDevisAccepte(d.statut);
    if (filter === 'payes') {
      if (!isDevisPaye(d.statut)) return false;
      if (sousFiltrePayes === 'tout') return true;
      if (sousFiltrePayes === 'paye') return d.statut === 'paye';
      if (sousFiltrePayes === 'en_cours') return d.statut === 'en_cours';
      if (sousFiltrePayes === 'travaux_termines') return d.statut === 'travaux_termines';
      if (sousFiltrePayes === 'valides') return ['termine_valide', 'termine_auto_valide'].includes(d.statut);
      if (sousFiltrePayes === 'litige') return d.statut === 'litige';
      return true;
    }
    if (filter === 'refuses') return ['refuse', 'expire', 'annule'].includes(d.statut);
    return true;
  });

  const devisEnAttente = devis.filter(d => d.statut === 'envoye');
  const devisEnRevision = devis.filter(d => d.statut === 'en_revision');
  const devisAcceptes = devis.filter(d => isDevisAccepte(d.statut));
  const devisPayes = devis.filter(d => isDevisPaye(d.statut));
  const devisRefuses = devis.filter(d => ['refuse', 'expire', 'annule'].includes(d.statut));
  const totalDevis = devis.filter(d => d.statut !== 'en_revision').length;

  // Compteurs sous-filtres Payés
  const countPayeSigne = devisPayes.filter(d => d.statut === 'paye').length;
  const countEnCours = devisPayes.filter(d => d.statut === 'en_cours').length;
  const countTravauxTermines = devisPayes.filter(d => d.statut === 'travaux_termines').length;
  const countValides = devisPayes.filter(d => ['termine_valide', 'termine_auto_valide'].includes(d.statut)).length;
  const countLitige = devisPayes.filter(d => d.statut === 'litige').length; // Total tous devis visibles (hors brouillons)

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* Header */}
      <div className="bg-[#2C3E50] text-white py-8">
        <div className="container mx-auto px-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-white hover:text-[#FF6B00] mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('quotes.backToDashboard')}
          </button>
          <h1 className="text-3xl font-bold">{t('quotes.myReceivedQuotes')}</h1>
          <p className="text-gray-300 mt-2">{t('quotes.consultManage')}</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Filtres */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
          <button
            onClick={() => setFilter('tous')}
            className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-1 ${
              filter === 'tous'
                ? 'bg-gradient-to-br from-[#FF6B00] to-[#E56100] text-white shadow-xl scale-105'
                : 'bg-white hover:bg-gray-50 shadow-md hover:shadow-lg border border-gray-100'
            }`}
          >
            <div className={`text-3xl font-black mb-1 ${filter === 'tous' ? 'text-white' : 'text-[#FF6B00]'}`}>
              {totalDevis}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${filter === 'tous' ? 'text-white' : 'text-gray-600'}`}>
              📋 {t('quotes.all')}
            </div>
            {devisNotifsInitialIds.size > 0 && (
              <span className={`mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                filter === 'tous' ? 'bg-white text-[#FF6B00]' : 'bg-[#FF6B00] text-white'
              }`}>
                🔔 {devisNotifsInitialIds.size}
              </span>
            )}
          </button>

          <button
            onClick={() => setFilter('en_attente')}
            className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-1 ${
              filter === 'en_attente'
                ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-xl scale-105'
                : 'bg-white hover:bg-gray-50 shadow-md hover:shadow-lg border border-gray-100'
            }`}
          >
            <div className={`text-3xl font-black mb-1 ${filter === 'en_attente' ? 'text-white' : 'text-blue-600'}`}>
              {devisEnAttente.length}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${filter === 'en_attente' ? 'text-white' : 'text-gray-600'}`}>
              🆕 {t('quotes.newPlural')}
            </div>
          </button>

          {/* En révision */}
          <button
            onClick={() => setFilter('en_revision')}
            className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-1 ${
              filter === 'en_revision'
                ? 'bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-xl scale-105'
                : 'bg-white hover:bg-gray-50 shadow-md hover:shadow-lg border border-gray-100'
            }`}
          >
            <div className={`text-3xl font-black mb-1 ${filter === 'en_revision' ? 'text-white' : 'text-purple-600'}`}>
              {devisEnRevision.length}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${filter === 'en_revision' ? 'text-white' : 'text-gray-600'}`}>
              🔄 En révision
            </div>
            {devis.some(d => devisNotifsInitialIds.has(d.id) && d.statut === 'en_revision') && (
              <span className={`mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                filter === 'en_revision' ? 'bg-white text-purple-600' : 'bg-purple-500 text-white'
              }`}>🔔</span>
            )}
          </button>

          <button
            onClick={() => setFilter('acceptes')}
            className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-1 ${
              filter === 'acceptes'
                ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-xl scale-105'
                : 'bg-white hover:bg-gray-50 shadow-md hover:shadow-lg border border-gray-100'
            }`}
          >
            <div className={`text-3xl font-black mb-1 ${filter === 'acceptes' ? 'text-white' : 'text-amber-600'}`}>
              {devisAcceptes.length}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${filter === 'acceptes' ? 'text-white' : 'text-gray-600'}`}>
              ✅ {t('quotes.acceptedPending')}
            </div>
          </button>

          <button
            onClick={() => setFilter('payes')}
            className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-1 ${
              filter === 'payes'
                ? 'bg-gradient-to-br from-green-500 to-green-600 text-white shadow-xl scale-105'
                : 'bg-white hover:bg-gray-50 shadow-md hover:shadow-lg border border-gray-100'
            }`}
          >
            <div className={`text-3xl font-black mb-1 ${filter === 'payes' ? 'text-white' : 'text-green-600'}`}>
              {devisPayes.length}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${filter === 'payes' ? 'text-white' : 'text-gray-600'}`}>
              💰 {t('quotes.paidPlural')}
            </div>
            {devis.some(d => devisNotifsInitialIds.has(d.id) && isDevisPaye(d.statut)) && (
              <span className={`mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                filter === 'payes' ? 'bg-white text-green-600' : 'bg-green-500 text-white'
              }`}>🔔</span>
            )}
          </button>

          <button
            onClick={() => setFilter('refuses')}
            className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-1 ${
              filter === 'refuses'
                ? 'bg-gradient-to-br from-red-500 to-red-600 text-white shadow-xl scale-105'
                : 'bg-white hover:bg-gray-50 shadow-md hover:shadow-lg border border-gray-100'
            }`}
          >
            <div className={`text-3xl font-black mb-1 ${filter === 'refuses' ? 'text-white' : 'text-red-600'}`}>
              {devisRefuses.length}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${filter === 'refuses' ? 'text-white' : 'text-gray-600'}`}>
              ❌ {t('quotes.refusedExpired')}
            </div>
          </button>
        </div>

        {/* Sous-filtres pour la carte 💰 Payés */}
        {filter === 'payes' && devisPayes.length > 0 && (
          <div className="bg-white rounded-xl shadow-md p-4 mb-6 border border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
              Filtrer par statut
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSousFiltrePayes('tout')}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                  sousFiltrePayes === 'tout'
                    ? 'bg-[#2C3E50] text-white shadow-lg transform scale-105'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t('quotes.subFiltersPayes.all')} ({devisPayes.length})
              </button>

              {countPayeSigne > 0 && (
                <button
                  onClick={() => setSousFiltrePayes('paye')}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                    sousFiltrePayes === 'paye'
                      ? 'bg-gradient-to-r from-green-500 to-green-700 text-white shadow-lg transform scale-105'
                      : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                  }`}
                >
                  {t('quotes.subFiltersPayes.signed')} ({countPayeSigne})
                </button>
              )}

              {countEnCours > 0 && (
                <button
                  onClick={() => setSousFiltrePayes('en_cours')}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                    sousFiltrePayes === 'en_cours'
                      ? 'bg-gradient-to-r from-amber-400 to-amber-600 text-white shadow-lg transform scale-105'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                  }`}
                >
                  {t('quotes.subFiltersPayes.inProgress')} ({countEnCours})
                </button>
              )}

              {countTravauxTermines > 0 && (
                <button
                  onClick={() => setSousFiltrePayes('travaux_termines')}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                    sousFiltrePayes === 'travaux_termines'
                      ? 'bg-gradient-to-r from-orange-400 to-orange-600 text-white shadow-lg transform scale-105'
                      : 'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200'
                  }`}
                >
                  {t('quotes.subFiltersPayes.worksCompleted')} ({countTravauxTermines})
                </button>
              )}

              {countValides > 0 && (
                <button
                  onClick={() => setSousFiltrePayes('valides')}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                    sousFiltrePayes === 'valides'
                      ? 'bg-gradient-to-r from-gray-600 to-gray-800 text-white shadow-lg transform scale-105'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
                  }`}
                >
                  {t('quotes.subFiltersPayes.validated')} ({countValides})
                </button>
              )}

              {countLitige > 0 && (
                <button
                  onClick={() => setSousFiltrePayes('litige')}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                    sousFiltrePayes === 'litige'
                      ? 'bg-gradient-to-r from-red-500 to-red-700 text-white shadow-lg transform scale-105'
                      : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                  }`}
                >
                  {t('quotes.subFiltersPayes.dispute')} ({countLitige})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Liste des devis */}
        {filteredDevis.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-gray-600 mb-4">{t('quotes.noQuotesYet')}</p>
            <Link href="/client/demandes">
              <button className="bg-[#FF6B00] text-white px-6 py-2 rounded-lg hover:bg-[#E56100]">
                {t('quotes.viewMyRequests')}
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredDevis.map((d) => {
              const demande = d.demandeId ? demandes.get(d.demandeId) : undefined;
              return (
                <div key={d.id} className="bg-white rounded-lg shadow-md hover:shadow-lg transition p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="text-xl font-bold text-[#2C3E50]">
                          {d.titre}
                        </h3>
                        {getStatutBadge(d.statut)}
                        {['termine_valide', 'termine_auto_valide'].includes(d.statut) && avisParDevisId[d.id] && (
                          <span className="inline-flex items-center gap-1 bg-yellow-50 border border-yellow-300 text-yellow-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                            ⭐ Avis publié
                          </span>
                        )}
                        {devisNotifsInitialIds.has(d.id) && (
                          <span className="inline-flex items-center gap-1 bg-[#FF6B00] text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">
                            🔔
                          </span>
                        )}
                      </div>
                      {demande && (
                        <p className="text-sm text-gray-600 mb-2">
                          📋 {t('quotes.request')} : {demande.titre || demande.categorie}
                        </p>
                      )}
                      <p className="text-sm text-gray-600">
                        👷 {t('quotes.craftsman')} : {d.artisan.prenom} {d.artisan.nom}
                        {d.artisan.raisonSociale && ` - ${d.artisan.raisonSociale}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-[#FF6B00]">
                        {d.totaux.totalTTC.toFixed(2)} €
                      </div>
                      <div className="text-xs text-gray-500">{t('quotes.ttc')}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                    <div>
                      <span className="text-gray-500">{t('quotes.quoteNumber')} :</span>
                      <p className="font-semibold">{d.numeroDevis}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">{t('quotes.date')} :</span>
                      <p className="font-semibold">
                        {d.dateCreation?.toDate().toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">{t('quotes.validUntil')} :</span>
                      <p className="font-semibold">
                        {d.dateValidite?.toDate().toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">{t('quotes.deadline')} :</span>
                      <p className="font-semibold">{d.delaiRealisation || t('quotes.notSpecified')}</p>
                    </div>
                  </div>

                  {/* Boutons d'action */}
                  <div className="pt-4 border-t">
                    {/* Devis envoyé : Voir détail + Accepter + Refuser */}
                    {d.statut === 'envoye' && (
                      <>
                        <div className="flex gap-3">
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              naviguerVersDevis(d.id, `returnFilter=${filter}`);
                            }}
                            className="flex-1 bg-[#2C3E50] text-white px-4 py-2 rounded-lg hover:bg-[#1A3A5C] transition text-center font-medium cursor-pointer"
                          >
                            📄 {t('quotes.viewDetails')}
                          </div>
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!user?.emailVerified) return;
                              naviguerVersDevis(d.id, `action=accepter&returnFilter=${filter}`);
                            }}
                            title={!user?.emailVerified ? 'Validez votre email pour accepter ce devis' : undefined}
                            className={`flex-1 px-4 py-2 rounded-lg transition text-center font-medium ${
                              user?.emailVerified
                                ? 'bg-green-600 text-white hover:bg-green-700 cursor-pointer'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            ✅ {t('quotes.accept')}
                          </div>
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!user?.emailVerified) return;
                              router.push(`/client/devis/${d.id}?action=refuser&returnFilter=${filter}`);
                            }}
                            title={!user?.emailVerified ? 'Validez votre email pour refuser ce devis' : undefined}
                            className={`flex-1 px-4 py-2 rounded-lg transition text-center font-medium ${
                              user?.emailVerified
                                ? 'bg-red-600 text-white hover:bg-red-700 cursor-pointer'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            ❌ {t('quotes.refuse')}
                          </div>

                        </div>
                        {!user?.emailVerified && (
                          <div className="mt-2 flex items-center gap-2 text-xs text-red-600 font-medium">
                            🔒 Email non validé —{' '}
                            {emailResent ? (
                              <span className="text-green-600 font-semibold">✅ Email envoyé ! Vérifiez votre boîte mail.</span>
                            ) : (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await resendVerificationEmail();
                                    setEmailResent(true);
                                    setTimeout(() => setEmailResent(false), 30000);
                                  } catch {
                                    alert('Erreur lors de l\'envoi. Réessayez dans quelques secondes.');
                                  }
                                }}
                                className="underline hover:text-red-800 cursor-pointer font-semibold"
                              >
                                Renvoyer l\'email de validation
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* Devis accepté/en attente paiement : Procéder au paiement + Annuler + Voir le détail */}
                    {d.statut === 'en_attente_paiement' && (
                      <>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            naviguerVersDevis(d.id, `action=payer&returnFilter=${filter}`);
                          }}
                          className="flex-1 bg-[#FF6B00] text-white px-4 py-2 rounded-lg hover:bg-[#E56100] transition font-medium"
                        >
                          💳 {t('quotes.proceedPayment')}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const nomArtisan = d.artisan.raisonSociale || `${d.artisan.prenom} ${d.artisan.nom}`;
                            handleAnnulerDevis(d.id, d.numeroDevis, d.totaux.totalTTC, nomArtisan);
                          }}
                          className="flex-1 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition font-medium"
                        >
                          🚫 {t('quotes.cancel')}
                        </button>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            naviguerVersDevis(d.id, `returnFilter=${filter}`);
                          }}
                          className="flex-1 bg-[#2C3E50] text-white px-4 py-2 rounded-lg hover:bg-[#1A3A5C] transition text-center font-medium cursor-pointer"
                        >
                          📄 {t('quotes.viewDetails')}
                        </div>
                      </>
                    )}

                    {/* Devis payé (en attente démarrage) ou en cours : Signaler + Voir le détail */}
                    {(d.statut === 'paye' || d.statut === 'en_cours') && (
                      <>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            naviguerVersDevis(d.id, `action=contester&returnFilter=${filter}`);
                          }}
                          className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition text-center font-medium cursor-pointer"
                        >
                          ⚠️ Signaler un problème
                        </div>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            naviguerVersDevis(d.id, `returnFilter=${filter}`);
                          }}
                          className="flex-1 bg-[#2C3E50] text-white px-4 py-2 rounded-lg hover:bg-[#1A3A5C] transition text-center font-medium cursor-pointer"
                        >
                          📄 {t('quotes.viewDetails')}
                        </div>
                      </>
                    )}

                    {/* Travaux terminés : Valider + Contester + Voir le détail */}
                    {d.statut === 'travaux_termines' && (
                      <>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            naviguerVersDevis(d.id, `action=valider&returnFilter=${filter}`);
                          }}
                          className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-center font-medium cursor-pointer"
                        >
                          ✅ Valider les travaux
                        </div>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            naviguerVersDevis(d.id, `action=contester&returnFilter=${filter}`);
                          }}
                          className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition text-center font-medium cursor-pointer"
                        >
                          ⚠️ Contester
                        </div>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            naviguerVersDevis(d.id, `returnFilter=${filter}`);
                          }}
                          className="px-4 py-2 border-2 border-[#2C3E50] text-[#2C3E50] rounded-lg hover:bg-[#2C3E50] hover:text-white transition text-center font-medium cursor-pointer"
                        >
                          📄 {t('quotes.viewDetails')}
                        </div>
                      </>
                    )}

                    {/* Travaux validés : bouton avis + Voir le détail */}
                    {['termine_valide', 'termine_auto_valide'].includes(d.statut) && (
                      <>
                        {avisParDevisId[d.id] ? (
                          <div className="flex items-center gap-1.5 bg-yellow-50 border border-yellow-300 text-yellow-700 px-3 py-1.5 rounded-full text-xs font-semibold cursor-default">
                            ⭐ Avis publié
                          </div>
                        ) : (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/client/avis/nouveau/${d.id}`);
                            }}
                            className="flex-1 bg-[#FF6B00] text-white px-4 py-2 rounded-lg hover:bg-[#E56100] transition text-center font-medium cursor-pointer"
                          >
                            ⭐ Donner mon avis
                          </div>
                        )}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            naviguerVersDevis(d.id, `returnFilter=${filter}`);
                          }}
                          className="flex-1 bg-[#2C3E50] text-white px-4 py-2 rounded-lg hover:bg-[#1A3A5C] transition text-center font-medium cursor-pointer"
                        >
                          📄 {t('quotes.viewDetails')}
                        </div>
                      </>
                    )}

                    {/* Devis en révision : info + Voir le détail */}
                    {d.statut === 'en_revision' && (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-purple-50 border border-purple-200 text-purple-700 px-4 py-2 rounded-lg text-sm text-center font-medium">
                          🔄 Révision demandée — en attente de la variante
                        </div>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            naviguerVersDevis(d.id, `returnFilter=${filter}`);
                          }}
                          className="bg-[#2C3E50] text-white px-4 py-2 rounded-lg hover:bg-[#1A3A5C] transition text-center font-medium cursor-pointer whitespace-nowrap"
                        >
                          📄 Voir le détail
                        </div>
                      </div>
                    )}

                    {/* Autres statuts payés (litige) : Voir le détail uniquement */}
                    {isDevisPaye(d.statut) && !['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(d.statut) && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          naviguerVersDevis(d.id, `returnFilter=${filter}`);
                        }}
                        className="flex-1 bg-[#2C3E50] text-white px-4 py-2 rounded-lg hover:bg-[#1A3A5C] transition text-center font-medium cursor-pointer"
                      >
                        📄 {t('quotes.viewDetails')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
