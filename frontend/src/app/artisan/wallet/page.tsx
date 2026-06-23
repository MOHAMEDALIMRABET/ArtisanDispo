'use client';

/**
 * Page Mon Wallet - Gestion financière artisan
 * 
 * Fonctionnalités :
 * - Visualisation du solde disponible
 * - Historique des transactions
 * - Suivi des paiements en séquestre
 * - Statistiques financières
 * 
 * ⚠️ IMPORTANT : Le wallet est un système de SUIVI uniquement.
 * Les transferts vers le compte bancaire sont gérés AUTOMATIQUEMENT par Stripe Connect.
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { getUserById } from '@/lib/firebase/user-service';
import { getArtisanByUserId } from '@/lib/firebase/artisan-service';
import { getWalletSummary, requestManualVirement, cancelVirementRequest, getVirementRequests, getSequestreTransactions } from '@/lib/firebase/wallet-service';
import type { User, Artisan, WalletTransaction, StripeOnboardingStatus, VirementRequest } from '@/types/firestore';

export default function WalletPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const { user: firebaseUser, loading: authLoading } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [artisan, setArtisan] = useState<Artisan | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletLoading, setWalletLoading] = useState(true);

  // Données du wallet
  const [soldeDisponible, setSoldeDisponible] = useState(0);
  const [soldeEnAttente, setSoldeEnAttente] = useState(0);
  const [totalEncaisse, setTotalEncaisse] = useState(0);
  const [totalRetire, setTotalRetire] = useState(0);
  const [totalCommission, setTotalCommission] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  
  // Stripe Connect
  const [stripeOnboardingStatus, setStripeOnboardingStatus] = useState<StripeOnboardingStatus>('not_started');
  const [ibanLast4, setIbanLast4] = useState<string | undefined>(undefined);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  
  // UI states
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [showConfigProcess, setShowConfigProcess] = useState(false);
  const [showAlreadyConfiguredError, setShowAlreadyConfiguredError] = useState(false);

  // Virement manuel
  const [showVirementModal, setShowVirementModal] = useState(false);
  const [virementAmount, setVirementAmount] = useState('');
  const [virementNote, setVirementNote] = useState('');
  const [virementLoading, setVirementLoading] = useState(false);
  const [virementError, setVirementError] = useState('');
  const [virementSuccess, setVirementSuccess] = useState('');
  const [virementRequests, setVirementRequests] = useState<VirementRequest[]>([]);

  // Filtre transactions (séquestre ou chiffre d'affaires)
  const [activeFilter, setActiveFilter] = useState<'all' | 'sequestre' | 'chiffre_affaires' | 'virement'>('all');
  const [sequestreTransactions, setSequestreTransactions] = useState<WalletTransaction[]>([]);
  const [sequestreSeenCount, setSequestreSeenCount] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return parseInt(localStorage.getItem('wallet_sequestre_seen') || '0', 10);
    }
    return 0;
  });

  // Pagination de l'historique des transactions
  const TX_PER_PAGE = 10;
  const [txPage, setTxPage] = useState(0);

  // Charger les infos artisan
  useEffect(() => {
    if (authLoading) return;

    if (!firebaseUser) {
      router.push('/connexion');
      return;
    }

    const loadUserData = async () => {
      try {
        const userData = await getUserById(firebaseUser.uid);
        if (!userData) {
          router.push('/connexion');
          return;
        }

        if (userData.role !== 'artisan') {
          router.push('/');
          return;
        }

        setUser(userData);

        const artisanData = await getArtisanByUserId(firebaseUser.uid);
        if (!artisanData) {
          console.error('Profil artisan introuvable');
          router.push('/artisan/dashboard');
          return;
        }
        setArtisan(artisanData);
      } catch (error) {
        console.error('Erreur chargement données:', error);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [firebaseUser, authLoading, router]);

  // Vérifier si onboarding vient d'être complété ou si erreur
  useEffect(() => {
    if (searchParams.get('onboarding') === 'success') {
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 5000);
    }
    
    if (searchParams.get('error') === 'already_configured') {
      setShowAlreadyConfiguredError(true);
      setTimeout(() => setShowAlreadyConfiguredError(false), 8000);
    }
  }, [searchParams]);

  // Remettre à la première page quand le filtre actif change
  useEffect(() => {
    setTxPage(0);
  }, [activeFilter]);

  // Charger les données du wallet
  useEffect(() => {
    if (!artisan) return;

    const loadWalletData = async () => {
      try {
        setWalletLoading(true);
        const summary = await getWalletSummary(artisan.userId);

        // Mettre à jour les états
        if (summary.wallet) {
          setSoldeDisponible(summary.wallet.soldeDisponible);
          setSoldeEnAttente(summary.wallet.soldeEnAttente);
          setStripeOnboardingStatus(summary.wallet.stripeOnboardingStatus);
          setIbanLast4(summary.wallet.ibanLast4);
        }
        setTotalEncaisse(summary.stats.totalEncaisse);
        setTotalRetire(summary.stats.totalRetire);
        setTotalCommission(summary.stats.totalCommission);
        setTransactions(summary.recentTransactions);
      } catch (error) {
        console.error('Erreur chargement wallet:', error);
      } finally {
        setWalletLoading(false);
      }
    };

    loadWalletData();
  }, [artisan]);

  // Charger les demandes de virement
  useEffect(() => {
    if (!artisan) return;
    const loadVirements = async () => {
      const requests = await getVirementRequests(artisan.userId, 10);
      setVirementRequests(requests);
      const seq = await getSequestreTransactions(artisan.userId);
      setSequestreTransactions(seq);
    };
    loadVirements();
  }, [artisan]);

  // Soumettre une demande de virement manuel
  const handleRequestVirement = async () => {
    const amount = parseFloat(virementAmount);
    if (isNaN(amount) || amount <= 0) {
      setVirementError('Veuillez saisir un montant valide');
      return;
    }
    setVirementLoading(true);
    setVirementError('');
    setVirementSuccess('');

    const result = await requestManualVirement(artisan!.userId, amount, virementNote || undefined);
    if (result.success) {
      setSoldeDisponible(prev => prev - amount);
      const updatedRequests = await getVirementRequests(artisan!.userId, 10);
      setVirementRequests(updatedRequests);
      setVirementSuccess(`✅ Demande envoyée ! Virement de ${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € en cours de traitement.`);
      setTimeout(() => {
        setShowVirementModal(false);
        setVirementSuccess('');
      }, 2500);
    } else {
      setVirementError(result.error || 'Une erreur est survenue');
    }
    setVirementLoading(false);
  };

  // Annuler une demande de virement
  const handleCancelVirement = async (requestId: string) => {
    const result = await cancelVirementRequest(artisan!.userId, requestId);
    if (result.success) {
      const updatedRequests = await getVirementRequests(artisan!.userId, 10);
      setVirementRequests(updatedRequests);
      const summary = await getWalletSummary(artisan!.userId);
      if (summary.wallet) setSoldeDisponible(summary.wallet.soldeDisponible);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00] mx-auto"></div>
          <p className="mt-4 text-[#6C757D]">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!artisan) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#2C3E50] to-[#34495E] text-white py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => router.back()}
            className="mb-4 text-white hover:text-gray-300 transition flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour au tableau de bord
          </button>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
            Mon Wallet
          </h1>
          <p className="text-gray-300 mt-2">Gérez vos revenus et transactions</p>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Message d'erreur : compte déjà configuré */}
        {showAlreadyConfiguredError && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <h4 className="font-semibold text-orange-900 mb-1">⚠️ Compte bancaire déjà configuré</h4>
                <p className="text-sm text-orange-800">
                  Votre compte Stripe est déjà configuré. Pour des raisons de sécurité, vous ne pouvez pas créer un nouveau compte bancaire.
                </p>
                <p className="text-sm text-orange-700 mt-2">
                  <strong>Pour modifier vos informations bancaires :</strong> Contactez le support à <a href="mailto:support@artisandispo.fr" className="underline hover:text-orange-900">support@artisandispo.fr</a>
                </p>
              </div>
              <button
                onClick={() => setShowAlreadyConfiguredError(false)}
                className="text-orange-600 hover:text-orange-800 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Message de succès onboarding */}
        {showSuccessMessage && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <h4 className="font-semibold text-green-900">{t('artisanWallet.onboarding.successTitle')}</h4>
                <p className="text-sm text-green-800">
                  {t('artisanWallet.onboarding.successMessage')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Solde disponible */}
        <div className="bg-gradient-to-br from-[#FF6B00] to-[#E56100] rounded-xl shadow-lg p-8 text-white mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90 mb-2">{t('artisanWallet.balance.available')}</p>
              {walletLoading ? (
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                  <p className="text-2xl">{t('artisanWallet.loading')}</p>
                </div>
              ) : (
                <>
                  <p className="text-5xl font-bold">
                    {soldeDisponible.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </p>
                  <p className="text-sm opacity-75 mt-2">
                    {transactions.length === 0
                      ? t('artisanWallet.balance.noTransactions')
                      : t('artisanWallet.balance.transactionsCount')
                          .replace('{count}', String(transactions.length))
                          .replace('{plural}', transactions.length > 1 ? t('artisanWallet.balance.transactionPlural') : t('artisanWallet.balance.transactionSingular'))}
                  </p>
                </>
              )}
            </div>
            <div className="text-right">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 px-6 py-3 rounded-lg">
                <p className="text-xs opacity-75 mb-1">{t('artisanWallet.balance.autoTransfer')}</p>
                <p className="text-sm font-semibold">{t('artisanWallet.balance.managedByStripe')}</p>
              </div>
              <p className="text-xs opacity-75 mt-2">{t('artisanWallet.balance.fundsTransferredAuto')}</p>
            </div>
          </div>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Chiffre d'affaires - cliquable pour historique */}
          <div
            onClick={() => setActiveFilter(activeFilter === 'chiffre_affaires' ? 'all' : 'chiffre_affaires')}
            className={`rounded-lg shadow-md p-6 border-l-4 cursor-pointer transition-all ${
              activeFilter === 'chiffre_affaires'
                ? 'bg-green-50 border-[#28A745] ring-2 ring-[#28A745]'
                : 'bg-white border-[#28A745] hover:bg-green-50'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <svg className="w-6 h-6 text-[#28A745]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-[#6C757D] font-medium">Chiffre d&apos;affaires</h3>
            </div>
            {walletLoading ? (
              <div className="animate-pulse h-10 bg-gray-200 rounded w-32"></div>
            ) : (
              <p className="text-3xl font-bold text-[#2C3E50]">
                {totalEncaisse.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </p>
            )}
            <p className="text-sm text-[#6C757D] mt-1">
              {activeFilter === 'chiffre_affaires' ? '👁 Affichage filtré ↓' : "Cliquer pour voir l'historique"}
              {activeFilter !== 'chiffre_affaires' && totalCommission > 0 && (
                <span className="ml-1 text-xs text-[#95A5A6]">
                  (commission : {totalCommission.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €)
                </span>
              )}
            </p>
          </div>
          {/* En séquestre — cliquable */}
          <div
            onClick={() => {
              const next = activeFilter === 'sequestre' ? 'all' : 'sequestre';
              setActiveFilter(next);
              if (next === 'sequestre') {
                const count = sequestreTransactions.length;
                setSequestreSeenCount(count);
                localStorage.setItem('wallet_sequestre_seen', String(count));
              }
            }}
            className={`rounded-lg shadow-md p-6 border-l-4 cursor-pointer transition-all ${
              activeFilter === 'sequestre'
                ? 'bg-yellow-50 border-[#FFC107] ring-2 ring-[#FFC107]'
                : 'bg-white border-[#FFC107] hover:bg-yellow-50'
            }`}
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-[#FFC107]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-[#6C757D] font-medium">En séquestre</h3>
              </div>
              {sequestreTransactions.length > sequestreSeenCount && (
                <span className="bg-[#FFC107] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {sequestreTransactions.length - sequestreSeenCount}
                </span>
              )}
            </div>
            {walletLoading ? (
              <div className="animate-pulse h-10 bg-gray-200 rounded w-32"></div>
            ) : (
              <p className="text-3xl font-bold text-[#2C3E50]">
                {soldeEnAttente.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </p>
            )}
            <p className="text-sm text-[#6C757D] mt-1">
              {activeFilter === 'sequestre' ? '👁 Affichage filtré ↓' : 'Cliquer pour voir les détails'}
            </p>
          </div>

          {/* Bénéfice transféré + boutons — cliquable pour filtrer l'historique */}
          <div
            className={`rounded-lg shadow-md p-6 border-l-4 border-[#17A2B8] transition-all ${
              activeFilter === 'virement'
                ? 'bg-cyan-50 ring-2 ring-[#17A2B8] cursor-pointer'
                : 'bg-white hover:bg-cyan-50 cursor-pointer'
            }`}
            onClick={() => setActiveFilter(activeFilter === 'virement' ? 'all' : 'virement')}
          >
            <div className="flex items-center gap-3 mb-2">
              <svg className="w-6 h-6 text-[#17A2B8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <h3 className="text-[#6C757D] font-medium">Bénéfice transféré</h3>
            </div>
            {walletLoading ? (
              <div className="animate-pulse h-10 bg-gray-200 rounded w-32"></div>
            ) : (
              <p className="text-3xl font-bold text-[#2C3E50]">
                {totalRetire.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </p>
            )}
            <p className="text-sm text-[#6C757D] mt-1">
              {activeFilter === 'virement' ? '👁 Affichage filtré ↓' : 'Vers votre banque · Cliquer pour voir'}
            </p>
            
            {/* Boutons de transfert - Toujours visibles */}
            <div className="mt-3 space-y-1.5">
              {/* Message d'info si conditions non remplies */}
              {(stripeOnboardingStatus !== 'active' || soldeDisponible <= 0) && (
                <div className="space-y-1">
                  <p className="text-[10px] text-yellow-700 bg-yellow-50 px-2 py-1 rounded leading-tight">
                    ⚠️ Compte bancaire requis et Chiffre d&apos;affaires &gt; 0 €
                  </p>
                  {soldeDisponible > 0 && stripeOnboardingStatus !== 'active' && (
                    <p className="text-[9px] text-blue-600 bg-blue-50 px-2 py-1 rounded leading-tight">
                      💡 Configurez votre compte bancaire pour recevoir vos virements
                    </p>
                  )}
                </div>
              )}
              {stripeOnboardingStatus === 'active' && soldeDisponible > 0 && (
                <p className="text-[10px] text-green-700 bg-green-50 px-2 py-1 rounded leading-tight">
                  ⏱️ Virement SEPA : 1-3 jours ouvrés après demande
                </p>
              )}
              
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Empêche de basculer le filtre en cliquant sur le bouton
                  if (stripeOnboardingStatus === 'active' && soldeDisponible > 0) {
                    setVirementAmount(soldeDisponible.toFixed(2));
                    setVirementNote('');
                    setVirementError('');
                    setVirementSuccess('');
                    setShowVirementModal(true);
                  }
                }}
                disabled={stripeOnboardingStatus !== 'active' || soldeDisponible <= 0}
                className={`w-full text-xs font-semibold py-1.5 px-2 rounded transition flex items-center justify-center gap-1 ${
                  stripeOnboardingStatus === 'active' && soldeDisponible > 0
                    ? 'bg-[#17A2B8] text-white hover:bg-[#138496] cursor-pointer'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                }`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Transfert total
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Empêche de basculer le filtre en cliquant sur le bouton
                  if (stripeOnboardingStatus === 'active' && soldeDisponible > 0) {
                    setVirementAmount('');
                    setVirementNote('');
                    setVirementError('');
                    setVirementSuccess('');
                    setShowVirementModal(true);
                  }
                }}
                disabled={stripeOnboardingStatus !== 'active' || soldeDisponible <= 0}
                className={`w-full border text-xs font-semibold py-1.5 px-2 rounded transition flex items-center justify-center gap-1 ${
                  stripeOnboardingStatus === 'active' && soldeDisponible > 0
                    ? 'border-[#17A2B8] text-[#17A2B8] hover:bg-[#17A2B8] hover:text-white cursor-pointer'
                    : 'border-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                }`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Transfert partiel
              </button>
            </div>
          </div>
        </div>

        {/* Demandes de virement */}
        {virementRequests.length > 0 && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden mb-8">
            <div className="bg-gradient-to-r from-[#2C3E50] to-[#34495E] text-white px-6 py-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Virements demandés
              </h2>
            </div>
            <div className="divide-y divide-gray-100">
              {virementRequests.map((virement) => {
                const statusConfig: Record<string, { label: string; color: string }> = {
                  pending:    { label: '⏳ En attente',    color: 'text-yellow-700 bg-yellow-100' },
                  processing: { label: '🔄 En traitement', color: 'text-blue-700 bg-blue-100' },
                  completed:  { label: '✅ Effectué',      color: 'text-green-700 bg-green-100' },
                  cancelled:  { label: '❌ Annulé',        color: 'text-gray-600 bg-gray-100' },
                  rejected:   { label: '🚫 Rejeté',        color: 'text-red-700 bg-red-100' },
                };
                const status = statusConfig[virement.statut] || statusConfig.pending;
                return (
                  <div key={virement.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="bg-[#F8F9FA] rounded-full p-3 flex-shrink-0">
                        <svg className="w-6 h-6 text-[#FF6B00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-semibold text-[#2C3E50]">
                          Virement vers IBAN …{virement.ibanLast4 || '****'}
                        </p>
                        {virement.note && (
                          <p className="text-sm text-[#6C757D] italic">{virement.note}</p>
                        )}
                        <p className="text-xs text-[#95A5A6] mt-1">
                          {new Date(virement.createdAt.toDate()).toLocaleDateString('fr-FR', {
                            day: 'numeric', month: 'long', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${status.color}`}>
                        {status.label}
                      </span>
                      <p className="text-xl font-bold text-[#2C3E50] w-28 text-right">
                        -{virement.montant.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                      </p>
                      {virement.statut === 'pending' && (
                        <button
                          onClick={() => handleCancelVirement(virement.id)}
                          className="text-sm text-red-500 hover:text-red-700 hover:underline transition whitespace-nowrap"
                        >
                          Annuler
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Historique des transactions */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-[#2C3E50] to-[#34495E] text-white px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  {t('artisanWallet.transactions.title')}
                </h2>
                {activeFilter === 'sequestre' && (
                  <p className="text-yellow-300 text-sm mt-1 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                    </svg>
                    Filtre actif : En séquestre —{' '}
                    <button onClick={() => setActiveFilter('all')} className="underline hover:text-white">
                      Tout afficher
                    </button>
                  </p>
                )}
                {activeFilter === 'chiffre_affaires' && (
                  <p className="text-green-300 text-sm mt-1 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                    </svg>
                    Filtre actif : Chiffre d&apos;affaires —{' '}
                    <button onClick={() => setActiveFilter('all')} className="underline hover:text-white">
                      Tout afficher
                    </button>
                  </p>
                )}
              </div>
              
              <button
                onClick={() => setShowHowItWorks(!showHowItWorks)}
                className="flex items-center gap-2 bg-[#FF6B00] hover:bg-[#E56100] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('artisanWallet.bankConfig.howItWorks')}
              </button>
            </div>
          </div>

          {/* Message explicatif (toggle) */}
          {showHowItWorks && (
            <div className="bg-blue-50 border-b border-blue-200 px-6 py-4">
              <div className="flex gap-3 max-w-4xl">
                <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="font-semibold text-blue-900 mb-2">💡 Comment ça marche ?</h4>
                  <ul className="text-sm text-blue-800 space-y-1.5">
                    <li>• Recevez des paiements sécurisés de vos clients via Stripe</li>
                    <li>• Les fonds restent en séquestre jusqu&apos;à validation des travaux</li>
                    <li>• À la libération, une <strong>commission plateforme de 8%</strong> est prélevée sur le montant TTC</li>
                    <li>• Le montant net (92%) est transféré dans votre <strong>Chiffre d&apos;affaires</strong> (immédiatement)</li>
                    <li>• Vous pouvez demander un virement vers votre compte bancaire quand vous le souhaitez</li>
                    <li>• <strong>⏱️ Délai virement bancaire : 1 à 3 jours ouvrés</strong> (SEPA standard)</li>
                    <li>• Suivez l&apos;historique complet de vos transactions ici</li>
                  </ul>
                  <p className="text-xs text-blue-700 mt-3 bg-blue-100 rounded px-3 py-2 inline-block">
                    ⚠️ <strong>Fonctionnalité en développement</strong> - L&apos;intégration Stripe sera disponible prochainement
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="p-8">
            {walletLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00] mx-auto"></div>
                <p className="mt-4 text-[#6C757D]">Chargement des transactions...</p>
              </div>
            ) : (() => {
              // Fusion complète dédupliquée (transactions + séquestre), triée par date
              const mergedAll = [...transactions, ...sequestreTransactions.filter(s => !transactions.find(t => t.id === s.id))]
                .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

              // Sélection selon le filtre actif
              const allTransactions = activeFilter === 'sequestre'
                // Séquestre : uniquement les paiements en attente bloqués (🔒 En séquestre)
                // → statut 'pending' + metadata.phase === 'sequestre'
                ? mergedAll.filter(t =>
                    t.statut === 'pending' &&
                    t.metadata?.phase === 'sequestre'
                  )
                // Virement : sommes envoyées vers le compte bancaire (type debit completed)
                : activeFilter === 'virement'
                  ? mergedAll.filter(t =>
                      t.type === 'debit' &&
                      t.statut === 'completed'
                    )
                // Chiffre d'affaires : toutes les transactions complétées liées aux encaissements
                // → credit completed (séquestre libéré, paiement reçu)
                // → commission completed (commission plateforme 10% ou 8%)
                // → debit completed (virements effectués vers la banque)
                // → bonus completed
                // Exclus : remboursement (litiges)
                : activeFilter === 'chiffre_affaires'
                  ? mergedAll.filter(t =>
                      t.statut === 'completed' &&
                      t.type !== 'remboursement'
                    )
                  : mergedAll;
              // Calcul de la pagination côté client
              const totalPages = Math.ceil(allTransactions.length / TX_PER_PAGE);
              const displayedTransactions = allTransactions.slice(
                txPage * TX_PER_PAGE,
                (txPage + 1) * TX_PER_PAGE
              );
              if (allTransactions.length === 0) {
                return (
                  <div className="text-center">
                    <div className="inline-block bg-[#F8F9FA] rounded-full p-6 mb-4">
                      <svg className="w-16 h-16 text-[#95A5A6] mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-[#2C3E50] mb-2">
                      {activeFilter === 'sequestre'
                        ? 'Aucun montant en séquestre'
                        : activeFilter === 'chiffre_affaires'
                          ? 'Aucun encaissement validé'
                          : t('artisanWallet.transactions.empty')}
                    </h3>
                    <p className="text-[#6C757D] max-w-md mx-auto">
                      {activeFilter === 'sequestre'
                        ? 'Aucun devis payé en attente de validation. Les montants apparaissent ici dès qu\'un client signe et paie un devis.'
                        : activeFilter === 'chiffre_affaires'
                          ? 'Aucun encaissement validé pour le moment. Les paiements libérés par vos clients apparaîtront ici.'
                          : t('artisanWallet.transactions.emptyMessage')}
                    </p>
                    {activeFilter === 'all' && (
                      <p className="text-sm text-[#95A5A6] mt-4">
                        💡 Cliquez sur <span className="font-semibold text-[#FF6B00]">&quot;Comment ça marche ?&quot;</span> pour en savoir plus
                      </p>
                    )}
                  </div>
                );
              }
              return (
                <>
                <div className="divide-y divide-gray-200">
                  {displayedTransactions.map((transaction) => {
                    const isCredit = transaction.type === 'credit' || transaction.type === 'bonus';
                    const isDebit = transaction.type === 'debit' || transaction.type === 'commission';
                    const isRefund = transaction.type === 'remboursement';
                    const isSequestre = transaction.metadata?.phase === 'sequestre' && transaction.statut === 'pending';

                    let bgColor = 'bg-gray-50';
                    let amountColor = 'text-[#2C3E50]';
                    let icon = '💰';

                    if (isSequestre) {
                      bgColor = 'bg-yellow-50';
                      amountColor = 'text-yellow-700';
                      icon = '🔒';
                    } else if (transaction.type === 'commission') {
                      bgColor = 'bg-gray-50';
                      amountColor = 'text-[#6C757D]';
                      icon = '🏦';
                    } else if (isCredit) {
                      bgColor = 'bg-green-50';
                      amountColor = 'text-green-600';
                      icon = '💰';
                    } else if (isDebit) {
                      bgColor = 'bg-orange-50';
                      amountColor = 'text-orange-600';
                      icon = '📤';
                    } else if (isRefund) {
                      bgColor = 'bg-red-50';
                      amountColor = 'text-red-600';
                      icon = '↩️';
                    }

                    const statusLabel = {
                      pending: t('artisanWallet.transactions.statuses.pending'),
                      completed: t('artisanWallet.transactions.statuses.completed'),
                      failed: t('artisanWallet.transactions.statuses.failed'),
                      cancelled: t('artisanWallet.transactions.statuses.cancelled'),
                    }[transaction.statut];

                    const statusColor = {
                      pending: 'text-yellow-600 bg-yellow-100',
                      completed: 'text-green-600 bg-green-100',
                      failed: 'text-red-600 bg-red-100',
                      cancelled: 'text-gray-600 bg-gray-100',
                    }[transaction.statut];

                    const clientNom = transaction.metadata?.clientNom as string | undefined;
                    const devisNumero = transaction.metadata?.devisNumero as string | undefined;

                    return (
                      <div key={transaction.id} className={`p-4 hover:bg-gray-50 transition`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1">
                            <div className={`${bgColor} rounded-full p-3 flex-shrink-0`}>
                              <span className="text-2xl">{icon}</span>
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold text-[#2C3E50] mb-1">
                                {isSequestre && (clientNom || devisNumero)
                                  ? `${transaction.description.split(' — ')[0]}${clientNom ? ` - ${clientNom}` : ''}`
                                  : transaction.description}
                              </h4>
                              {/* Infos séquestre enrichies */}
                              {isSequestre && (clientNom || devisNumero) && (
                                <div className="flex flex-wrap gap-2 mb-1">
                                  {clientNom && (
                                    <span className="inline-flex items-center gap-1 bg-white border border-[#E9ECEF] px-2 py-0.5 rounded-full text-xs text-[#2C3E50]">
                                      <svg className="w-3 h-3 text-[#6C757D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                      </svg>
                                      {clientNom}
                                    </span>
                                  )}
                                  {devisNumero && (
                                    <span className="inline-flex items-center gap-1 bg-white border border-[#E9ECEF] px-2 py-0.5 rounded-full text-xs text-[#6C757D]">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                      Devis {devisNumero}
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center gap-3 text-sm text-[#6C757D]">
                                <span>
                                  {new Date(transaction.createdAt.toDate()).toLocaleDateString('fr-FR', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColor}`}>
                                  {isSequestre ? '🔒 En séquestre' : statusLabel}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-2xl font-bold ${amountColor}`}>
                              {isDebit || isRefund ? '-' : '+'}
                              {transaction.montant.toLocaleString('fr-FR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{' '}
                              €
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Contrôles de pagination — affichés uniquement si plus d'une page */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-4 border-t border-gray-100 bg-[#F8F9FA]">
                    <p className="text-sm text-[#6C757D]">
                      {allTransactions.length} transaction{allTransactions.length > 1 ? 's' : ''} — Page {txPage + 1} / {totalPages}
                    </p>
                    <div className="flex items-center gap-2">
                      {/* Bouton page précédente */}
                      <button
                        onClick={() => setTxPage(p => Math.max(0, p - 1))}
                        disabled={txPage === 0}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold text-[#2C3E50] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                      >
                        ← Précédent
                      </button>
                      {/* Bouton page suivante */}
                      <button
                        onClick={() => setTxPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={txPage >= totalPages - 1}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold text-[#2C3E50] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                      >
                        Suivant →
                      </button>
                    </div>
                  </div>
                )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Section Configuration compte bancaire */}
        <div className="mt-8 bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-[#2C3E50] to-[#34495E] text-white px-6 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                {t('artisanWallet.bankConfig.title')}
              </h3>
              
              <button
                onClick={() => setShowConfigProcess(!showConfigProcess)}
                className="flex items-center gap-2 bg-[#FF6B00] hover:bg-[#E56100] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('artisanWallet.bankConfig.configProcessButton')}
              </button>
            </div>
          </div>

          {/* Message explicatif (toggle) */}
          {showConfigProcess && (
            <div className="bg-blue-50 border-b border-blue-200 px-6 py-4">
              <div className="flex gap-3 max-w-4xl">
                <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="font-semibold text-blue-900 mb-2">{t('artisanWallet.bankConfig.processTitle')}</h4>
                  <ul className="text-sm text-blue-800 space-y-1.5">
                    <li>{t('artisanWallet.bankConfig.processStep1')}</li>
                    <li>{t('artisanWallet.bankConfig.processStep2')}</li>
                    <li>{t('artisanWallet.bankConfig.processStep3')}</li>
                    <li>{t('artisanWallet.bankConfig.processStep4')}</li>
                  </ul>
                  <p className="text-xs text-blue-700 mt-3 bg-blue-100 rounded px-3 py-2 inline-block">
                    {t('artisanWallet.bankConfig.securityNote')}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="p-6">
            {walletLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00] mx-auto"></div>
                <p className="mt-4 text-[#6C757D]">{t('artisanWallet.loading')}</p>
              </div>
            ) : stripeOnboardingStatus === 'not_started' || stripeOnboardingStatus === 'pending' ? (
              /* Compte pas encore configuré */
              <div className="text-center py-8">
                <div className="inline-block bg-[#F8F9FA] rounded-full p-6 mb-4">
                  <svg className="w-16 h-16 text-[#FF6B00] mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>

                <h3 className="text-xl font-semibold text-[#2C3E50] mb-2">
                  {t('artisanWallet.bankConfig.notConfigured.title')}
                </h3>
                <p className="text-[#6C757D] mb-4 max-w-md mx-auto">
                  {t('artisanWallet.bankConfig.notConfigured.description')}
                </p>
                <p className="text-sm text-[#95A5A6] mb-6">
                  {t('artisanWallet.bankConfig.notConfigured.hint')}
                </p>

                <button
                  onClick={() => router.push('/artisan/stripe-onboarding')}
                  className="bg-[#FF6B00] text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-[#E56100] transition shadow-lg inline-flex items-center gap-2"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  {t('artisanWallet.bankConfig.notConfigured.button')}
                </button>
              </div>
            ) : stripeOnboardingStatus === 'documents_required' || stripeOnboardingStatus === 'under_review' ? (
              /* Documents en attente ou en cours de vérification */
              <div className="text-center py-8">
                <div className="inline-block bg-yellow-50 rounded-full p-6 mb-4">
                  <svg className="w-16 h-16 text-yellow-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>

                <h3 className="text-xl font-semibold text-[#2C3E50] mb-2">
                  {t('artisanWallet.bankConfig.pending.title')}
                </h3>
                <p className="text-[#6C757D] mb-6 max-w-md mx-auto">
                  {t('artisanWallet.bankConfig.pending.description')}
                </p>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-md mx-auto">
                  <p className="text-yellow-800 text-sm">
                    {t('artisanWallet.bankConfig.pending.emailNotice')}
                  </p>
                </div>
              </div>
            ) : stripeOnboardingStatus === 'active' ? (
              /* Compte activé */
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="bg-green-100 rounded-full p-4">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-green-900 mb-2">
                      {t('artisanWallet.bankConfig.active.title')}
                    </h3>
                    <p className="text-green-800 mb-4">
                      {t('artisanWallet.bankConfig.active.description')}
                    </p>

                    {ibanLast4 && (
                      <div className="bg-white rounded-lg p-4 border border-green-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-[#6C757D] mb-1">{t('artisanWallet.bankConfig.active.ibanLabel')}</p>
                            <p className="font-mono text-[#2C3E50] font-semibold">
                              FR** **** **** **** **** **** {ibanLast4}
                            </p>
                          </div>
                          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-800">
                        {t('artisanWallet.bankConfig.active.autoTransferInfo')}
                      </p>
                    </div>
                    
                    <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <p className="text-sm text-[#6C757D] mb-2">
                        {t('artisanWallet.bankConfig.active.modifyIban')}
                      </p>
                      <button
                        onClick={() => router.push('/artisan/contact-support?sujet=modification_iban')}
                        className="text-[#FF6B00] hover:underline font-semibold text-sm flex items-center gap-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        {t('artisanWallet.bankConfig.active.contactSupport')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : stripeOnboardingStatus === 'rejected' ? (
              /* Compte rejeté */
              <div className="text-center py-8">`
                <div className="inline-block bg-red-50 rounded-full p-6 mb-4">
                  <svg className="w-16 h-16 text-red-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>

                <h3 className="text-xl font-semibold text-[#2C3E50] mb-2">
                  {t('artisanWallet.bankConfig.rejected.title')}
                </h3>
                <p className="text-[#6C757D] mb-6 max-w-md mx-auto">
                  {t('artisanWallet.bankConfig.rejected.description')}
                </p>

                <button
                  onClick={() => router.push('/artisan/stripe-onboarding')}
                  className="bg-[#FF6B00] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#E56100] transition inline-flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {t('artisanWallet.bankConfig.rejected.button')}
                </button>
                
                <p className="text-xs text-[#95A5A6] mt-4">
                  {t('artisanWallet.bankConfig.rejected.note')}
                </p>
              </div>
            ) : stripeOnboardingStatus === 'restricted' ? (
              /* Compte restreint */
              <div className="text-center py-8">
                <div className="inline-block bg-orange-50 rounded-full p-6 mb-4">
                  <svg className="w-16 h-16 text-orange-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>

                <h3 className="text-xl font-semibold text-[#2C3E50] mb-2">
                  {t('artisanWallet.bankConfig.restricted.title')}
                </h3>
                <p className="text-[#6C757D] mb-6 max-w-md mx-auto">
                  {t('artisanWallet.bankConfig.restricted.description')}
                </p>

                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 max-w-md mx-auto">
                  <p className="text-orange-800 text-sm">
                    {t('artisanWallet.bankConfig.restricted.contactMessage')}
                  </p>
                </div>
              </div>
            ) : (
              /* Compte restreint */
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-orange-900 mb-2">
                      {t('artisanWallet.bankConfig.limited.title')}
                    </h3>
                    <p className="text-orange-800">
                      {t('artisanWallet.bankConfig.limited.description')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Virement Manuel */}
      {showVirementModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#2C3E50] to-[#34495E] text-white px-6 py-4 rounded-t-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  Demander un virement
                </h3>
                <button
                  onClick={() => setShowVirementModal(false)}
                  className="text-white/70 hover:text-white transition"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              {/* Solde disponible */}
              <div className="bg-[#F8F9FA] rounded-lg p-4 mb-6">
                <p className="text-sm text-[#6C757D] mb-1">Solde disponible</p>
                <p className="text-3xl font-bold text-[#FF6B00]">
                  {soldeDisponible.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </p>
              </div>

              {/* IBAN cible */}
              {ibanLast4 && (
                <div className="flex items-center gap-2 mb-6 text-sm text-[#6C757D]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  <span>Vers IBAN se terminant par <strong className="text-[#2C3E50]">{ibanLast4}</strong></span>
                </div>
              )}

              {/* Montant */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                  Montant à virer (€){' '}
                  <span className="text-[#6C757D] font-normal">min. 10 €</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="10"
                    max={soldeDisponible}
                    step="0.01"
                    value={virementAmount}
                    onChange={(e) => { setVirementAmount(e.target.value); setVirementError(''); }}
                    placeholder="Ex : 150.00"
                    className="w-full border-2 border-[#E9ECEF] focus:border-[#FF6B00] rounded-lg px-4 py-3 text-[#2C3E50] text-lg font-semibold outline-none transition pr-12"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6C757D] font-semibold">€</span>
                </div>
                <button
                  type="button"
                  onClick={() => setVirementAmount(soldeDisponible.toFixed(2))}
                  className="mt-2 text-sm text-[#FF6B00] hover:underline font-medium"
                >
                  Virer la totalité ({soldeDisponible.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €)
                </button>
              </div>

              {/* Note optionnelle */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                  Note <span className="text-[#6C757D] font-normal">(optionnel)</span>
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={virementNote}
                  onChange={(e) => setVirementNote(e.target.value)}
                  placeholder="Ex : Paiement travaux cuisine Dupont"
                  className="w-full border-2 border-[#E9ECEF] focus:border-[#FF6B00] rounded-lg px-4 py-3 text-[#2C3E50] outline-none transition"
                />
              </div>

              {/* Erreur */}
              {virementError && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 mb-4 text-sm">
                  {virementError}
                </div>
              )}

              {/* Succès */}
              {virementSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 mb-4 text-sm font-medium">
                  {virementSuccess}
                </div>
              )}

              {/* Info délai */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6 text-sm text-blue-800">
                ℹ️ La demande sera traitée dans les <strong>1 à 3 jours ouvrés</strong>. Les fonds sont réservés immédiatement.
              </div>

              {/* Boutons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowVirementModal(false)}
                  disabled={virementLoading}
                  className="flex-1 border-2 border-[#E9ECEF] text-[#6C757D] hover:border-[#2C3E50] hover:text-[#2C3E50] px-4 py-3 rounded-lg font-semibold transition"
                >
                  Annuler
                </button>
                <button
                  onClick={handleRequestVirement}
                  disabled={virementLoading || !virementAmount || Number(virementAmount) <= 0}
                  className="flex-1 bg-[#FF6B00] text-white hover:bg-[#E56100] disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2"
                >
                  {virementLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Traitement...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Confirmer le virement
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
