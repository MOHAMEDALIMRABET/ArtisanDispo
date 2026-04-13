'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService, resendVerificationEmail } from '@/lib/auth-service';
import { getUserById } from '@/lib/firebase/user-service';
import { getArtisanByUserId } from '@/lib/firebase/artisan-service';
import { getAvisByClientId, getContratsTerminesSansAvis } from '@/lib/firebase/avis-service';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { useLanguage } from '@/contexts/LanguageContext';
import { collection, query, where, onSnapshot, or, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { User, Avis } from '@/types/firestore';

export default function DashboardPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { user: firebaseUser } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(true);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [canResend, setCanResend] = useState(true);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [avisClient, setAvisClient] = useState<Avis[]>([]);
  const [contratsANoter, setContratsANoter] = useState<any[]>([]);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { notifications, markTypeAsRead } = useNotifications(firebaseUser?.uid);

  // Marquer tous les messages comme lus
  const markAllConversationsAsRead = async (uid: string) => {
    try {
      const q = query(collection(db, 'conversations'), where('participants', 'array-contains', uid));
      const snapshot = await getDocs(q);
      await Promise.all(
        snapshot.docs
          .filter(d => (d.data().unreadCount?.[uid] || 0) > 0)
          .map(d => updateDoc(doc(db, 'conversations', d.id), { [`unreadCount.${uid}`]: 0 }))
      );
    } catch (e) {
      // silently ignore
    }
  };
  const devisNouveaux = notifications.filter(n => !n.lue && (
    n.type === 'devis_recu' ||
    n.type === 'devis_accepte' ||
    n.type === 'devis_refuse' ||
    n.type === 'devis_revision' ||
    n.type === 'travaux_demarres' ||
    n.type === 'travaux_termines'
  )).length;
  const demandesNouvelles = notifications.filter(n => !n.lue && (
    n.type === 'nouvelle_demande' ||
    n.type === 'demande_refusee' ||
    n.type === 'proposition_express_recue' ||
    n.type === 'travaux_demarres_demande' || // ✅ Artisan a démarré les travaux (niveau demande)
    n.type === 'travaux_termines_demande'  // ✅ Artisan a terminé, validation client requise
  )).length;
  const reponseAvisNouveaux = notifications.filter(n => !n.lue && n.type === 'reponse_avis').length;

  useEffect(() => {
    loadUserData();
  }, []);

  // Compter les messages non lus en temps réel
  useEffect(() => {
    if (!firebaseUser?.uid) return;

    const q = query(
      collection(db, 'conversations'),
      or(where('participants', 'array-contains', firebaseUser.uid))
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let totalUnread = 0;
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const unreadForUser = data.unreadCount?.[firebaseUser.uid] || 0;
        totalUnread += unreadForUser;
      });
      setUnreadMessagesCount(totalUnread);
    });

    return () => unsubscribe();
  }, [firebaseUser?.uid]);

  async function loadUserData() {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        router.push('/connexion');
        return;
      }

      // Vérifier le statut de l'email
      setEmailVerified(currentUser.emailVerified);

      const userData = await getUserById(currentUser.uid);
      if (!userData) {
        await authService.signOut();
        router.push('/connexion');
        return;
      }

      // Si artisan, rediriger vers le dashboard artisan
      if (userData.role === 'artisan') {
        router.push('/artisan/dashboard');
        return;
      }

      setUser(userData);      
      // Charger tous les avis donnés par le client (pour afficher le vrai total)
      const avis = await getAvisByClientId(currentUser.uid);
      setAvisClient(avis);

      // Charger les contrats terminés sans avis
      const contratsData = await getContratsTerminesSansAvis(currentUser.uid);
      setContratsANoter(contratsData);
      setIsLoading(false);
    } catch (error) {
      console.error('Erreur chargement utilisateur:', error);
      setIsLoading(false);
    }
  }

  async function handleResendEmail() {
    if (!canResend) {
      setResendMessage(`⏳ Veuillez attendre ${cooldownSeconds}s avant de renvoyer un email.`);
      return;
    }

    setResendingEmail(true);
    setResendMessage('');
    
    try {
      await resendVerificationEmail();
      setResendMessage('✅ Email renvoyé ! Consultez votre boîte mail.');
      
      // Activer le cooldown de 60 secondes
      setCanResend(false);
      setCooldownSeconds(60);
      
      const interval = setInterval(() => {
        setCooldownSeconds(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
    } catch (error: any) {
      console.error('Erreur renvoi email:', error);
      
      // Messages d'erreur conviviaux
      if (error.code === 'auth/too-many-requests') {
        setResendMessage('⚠️ Trop de tentatives. Veuillez attendre 15 minutes avant de réessayer.');
        setCanResend(false);
        setCooldownSeconds(900); // 15 minutes
      } else if (error.message?.includes('déjà vérifié')) {
        setResendMessage('✅ Votre email est déjà vérifié ! Rafraîchissez la page.');
      } else {
        setResendMessage('❌ Erreur : Veuillez réessayer dans quelques instants.');
      }
    } finally {
      setResendingEmail(false);
    }
  }

  async function handleSignOut() {
    await authService.signOut();
    router.push('/');
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00] mx-auto mb-4"></div>
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] relative overflow-hidden flex">

      {/* ── SIDEBAR GAUCHE ── */}
      <aside
        className={`relative z-20 flex-shrink-0 bg-white shadow-xl flex flex-col transition-all duration-300 ease-in-out ${
          sidebarOpen ? 'w-64' : 'w-0'
        } overflow-hidden`}
        style={{ minHeight: '100vh' }}
      >
        {/* Bouton détacher (type Outlook) — coin haut droit de la sidebar */}
        <button
          onClick={() => setSidebarOpen(false)}
          title="Réduire la barre latérale"
          className="absolute top-4 right-3 z-10 p-1.5 rounded-md text-gray-400 hover:text-[#2C3E50] hover:bg-gray-100 transition"
        >
          {/* Icône « épingle barrée » style Outlook */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Logo */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <span className="text-lg font-bold text-[#2C3E50] whitespace-nowrap">🏠 Mon espace</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <Link href="/dashboard">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#FF6B00] text-white font-semibold text-sm whitespace-nowrap">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
              Tableau de bord
            </div>
          </Link>
          {/* Lien vers la page intermédiaire de choix du type de travaux */}
          <Link href="/choisir-type-travaux">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[#2C3E50] hover:bg-orange-50 hover:text-[#FF6B00] transition text-sm whitespace-nowrap">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              Rechercher un artisan
            </div>
          </Link>
          <Link href="/client/demandes-hub">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[#2C3E50] hover:bg-orange-50 hover:text-[#FF6B00] transition text-sm whitespace-nowrap">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Mes Demandes
            </div>
          </Link>
          <Link href="/client/devis">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[#2C3E50] hover:bg-orange-50 hover:text-[#FF6B00] transition text-sm whitespace-nowrap">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Mes Devis
            </div>
          </Link>
          <Link href="/messages">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[#2C3E50] hover:bg-orange-50 hover:text-[#FF6B00] transition text-sm whitespace-nowrap">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              Messages
              {unreadMessagesCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{unreadMessagesCount}</span>
              )}
            </div>
          </Link>
          <Link href="/client/avis">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[#2C3E50] hover:bg-orange-50 hover:text-[#FF6B00] transition text-sm whitespace-nowrap">
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
              Avis
            </div>
          </Link>
        </nav>

        {/* Besoin d'aide — bas de sidebar */}
        <div className="mx-3 mb-4 p-4 bg-orange-50 rounded-xl border border-orange-100">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#FF6B00]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            </div>
            <div>
              <p className="font-semibold text-[#2C3E50] text-sm whitespace-nowrap">Besoin d&apos;aide ?</p>
              <p className="text-xs text-gray-500 mt-0.5">Notre équipe est là pour vous accompagner.</p>
            </div>
          </div>
          <Link href="/etre-rappele">
            <button className="mt-3 w-full border border-[#FF6B00] text-[#FF6B00] hover:bg-[#FF6B00] hover:text-white text-sm font-medium py-1.5 rounded-lg transition whitespace-nowrap">
              Nous contacter
            </button>
          </Link>
        </div>
      </aside>

      {/* Bouton pour rouvrir la sidebar quand elle est fermée */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          title="Afficher la barre latérale"
          className="fixed left-0 top-1/2 -translate-y-1/2 z-30 bg-white shadow-lg border border-gray-200 rounded-r-xl px-1.5 py-3 text-[#2C3E50] hover:text-[#FF6B00] transition"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}

      {/* ── CONTENU PRINCIPAL ── */}
      <div className="flex-1 relative">

      {/* Vagues SVG décoratives — bas de page */}
      <svg
        className="absolute bottom-0 left-0 w-full pointer-events-none z-0"
        viewBox="0 0 1440 180"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M0,120 C200,160 400,60 600,100 C800,140 1000,80 1200,110 C1320,130 1400,100 1440,90 L1440,180 L0,180 Z"
          fill="#2C3E50"
          fillOpacity="0.08"
        />
      </svg>
      <svg
        className="absolute bottom-0 left-0 w-full pointer-events-none z-0"
        viewBox="0 0 1440 140"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M0,80 C180,40 360,120 600,80 C840,40 1100,110 1300,70 C1380,50 1420,65 1440,60 L1440,140 L0,140 Z"
          fill="#2C3E50"
          fillOpacity="0.13"
        />
      </svg>

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-4xl">
        {/* Bannière email non vérifié (Client) */}
        {!emailVerified && (
          <div className="mb-6 bg-orange-50 border-l-4 border-[#FF6B00] p-4 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-[#FF6B00] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h3 className="font-bold text-[#2C3E50] mb-1">
                  📧 {t('dashboard.verifyEmailTitle')}
                </h3>
                <p className="text-gray-700 text-sm mb-3">
                  {t('dashboard.verifyEmailMessage')}
                </p>
                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    onClick={handleResendEmail}
                    disabled={resendingEmail || !canResend}
                    className="bg-[#FF6B00] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#E56100] disabled:bg-orange-300 disabled:cursor-not-allowed transition"
                  >
                    {resendingEmail ? t('dashboard.sending') : !canResend && cooldownSeconds > 0 ? `${t('common.wait')} ${cooldownSeconds}s` : t('dashboard.resendEmail')}
                  </button>
                  {resendMessage && (
                    <span className="text-sm font-medium">{resendMessage}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* En-tête */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-3xl font-bold text-[#2C3E50] mb-3">
            {t('dashboard.clientTitle')}
          </h1>
          <div className="flex items-center gap-2 text-lg">
            <span className="text-2xl">👋</span>
            <p className="text-gray-700">
              {t('dashboard.welcome')} <span className="font-semibold text-[#FF6B00]">{user?.prenom} {user?.nom}</span>
            </p>
          </div>
        </div>

        {/* Dashboard Artisan */}
        {user?.role === 'artisan' && (
          <div className="grid md:grid-cols-2 gap-6">
            <Link href="/artisan/profil">
              <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer border-2 border-transparent hover:border-[#FF6B00]">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-[#FF6B00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">{t('common.profile')}</h2>
                    <p className="text-sm text-gray-600">{t('profile.siretTrades')}</p>
                  </div>
                </div>
              </div>
            </Link>

            <div className="bg-gray-100 rounded-lg shadow-md p-6 opacity-50">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800">{t('common.schedule')}</h2>
                  <p className="text-sm text-gray-600">{t('dashboard.comingSoon')}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-100 rounded-lg shadow-md p-6 opacity-50">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800">{t('common.requests')}</h2>
                  <p className="text-sm text-gray-600">{t('dashboard.comingSoon')}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-100 rounded-lg shadow-md p-6 opacity-50">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800">{t('common.quotes')}</h2>
                  <p className="text-sm text-gray-600">{t('dashboard.comingSoon')}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard Client */}
        {user?.role === 'client' && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Carte : redirige vers la page intermédiaire de choix du type de travaux */}
            <Link href="/choisir-type-travaux">
              <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer border-2 border-transparent hover:border-[#FF6B00]">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-[#FF6B00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">{t('dashboard.searchCraftsman')}</h2>
                    <p className="text-sm text-gray-600">{t('dashboard.findProfessional')}</p>
                  </div>
                </div>
              </div>
            </Link>

            <Link href="/client/demandes-hub">
              <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer border-2 border-transparent hover:border-[#FF6B00]">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center relative">
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {demandesNouvelles > 0 && (
                      <span className="absolute -top-1 -right-1 bg-[#FF6B00] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {demandesNouvelles}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-gray-800">{t('common.myRequests')}</h2>
                      {demandesNouvelles > 0 && (
                        <span className="bg-[#FF6B00] text-white text-xs px-2 py-1 rounded-full font-semibold">
                          {demandesNouvelles} nouveau{demandesNouvelles > 1 ? 'x' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{t('dashboard.trackRequests')}</p>
                  </div>
                </div>
              </div>
            </Link>

            <Link href="/client/devis">
              <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer border-2 border-transparent hover:border-[#FF6B00]">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center relative">
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {devisNouveaux > 0 && (
                      <span className="absolute -top-1 -right-1 bg-[#FF6B00] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {devisNouveaux}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-gray-800">{t('common.myQuotes')}</h2>
                      {devisNouveaux > 0 && (
                        <span className="bg-[#FF6B00] text-white text-xs px-2 py-1 rounded-full font-semibold">
                          {devisNouveaux} nouveau{devisNouveaux > 1 ? 'x' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{t('dashboard.viewQuotes')}</p>
                  </div>
                </div>
              </div>
            </Link>

            <Link href="/client/avis" onClick={() => markTypeAsRead && markTypeAsRead(['reponse_avis'])}>
              <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer border-2 border-transparent hover:border-[#FF6B00]">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center relative">
                    <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    {reponseAvisNouveaux > 0 && (
                      <span className="absolute -top-1 -right-1 bg-[#FF6B00] text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                        {reponseAvisNouveaux}
                      </span>
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">{t('common.reviews')}</h2>
                    <p className="text-sm text-gray-600">
                      {avisClient.length > 0 ? (
                        <>{avisClient.length} {avisClient.length > 1 ? t('reviews.reviewsPlural') : t('reviews.reviewSingular')} {t('reviews.given')}</>
                      ) : (
                        t('reviews.giveReview')
                      )}
                      {contratsANoter.length > 0 && (
                        <span className="ml-1 text-[#FF6B00] font-semibold">
                          • {contratsANoter.length} {t('reviews.toRate')}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </Link>

            <Link href="/messages" onClick={() => firebaseUser?.uid && markAllConversationsAsRead(firebaseUser.uid)}>
              <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer border-2 border-transparent hover:border-[#FF6B00]">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center relative">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    {unreadMessagesCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                        {unreadMessagesCount}
                      </span>
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">{t('common.messages')}</h2>
                    <p className="text-sm text-gray-600">
                      {unreadMessagesCount > 0 ? (
                        <span className="text-red-600 font-medium">
                          💬 {unreadMessagesCount} {unreadMessagesCount > 1 ? t('messages.unreadPlural') : t('messages.unreadSingular')}
                        </span>
                      ) : (
                        t('messages.artisanConversations')
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        )}

        {/* Section Contrats à noter */}
        {user?.role === 'client' && contratsANoter.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-bold text-[#2C3E50] mb-4">
              {t('dashboard.completedWorks')}
            </h2>
            <div className="flex flex-col gap-3">
              {contratsANoter.map((contrat) => (
                <div
                  key={contrat.id}
                  className="bg-white rounded-lg shadow-sm p-4 border border-[#FFC107] flex items-center justify-between gap-4"
                >
                  {/* Infos à gauche */}
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                      {t('reviews.toRate')}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-[#2C3E50] text-sm truncate">
                        🏢 {contrat.artisan?.raisonSociale || 'Artisan'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        📋 {contrat.titre || 'Travaux réalisés'}
                        {contrat.numeroDevis && <span className="ml-2 text-gray-400">{contrat.numeroDevis}</span>}
                      </p>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 ml-auto">
                      <span className="text-sm font-semibold text-[#FF6B00] whitespace-nowrap">
                        {contrat.totaux?.totalTTC?.toFixed(2) ?? contrat.montantTTC?.toFixed(2) ?? '—'} €
                      </span>
                      {contrat.travaux?.dateValidationClient && (
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          ✅ {new Date(contrat.travaux.dateValidationClient.toDate()).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Bouton à droite */}
                  <Link href={`/client/avis/nouveau/${contrat.id}`} className="shrink-0">
                    <button className="bg-[#FF6B00] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#E56100] transition-colors whitespace-nowrap">
                      ⭐ {t('reviews.giveReview')}
                    </button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>{/* fin z-10 container */}
      </div>{/* fin contenu principal */}
    </div>
  );
}
