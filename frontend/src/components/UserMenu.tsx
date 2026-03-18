/**
 * Composant UserMenu
 * Menu utilisateur avec photo de profil et dropdown (style BlaBlaCar)
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { authService } from '@/lib/auth-service';
import { useNotifications } from '@/hooks/useNotifications';
import { useContratsANoter } from '@/hooks/useContratsANoter';
import { collection, query, where, onSnapshot, or } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getDemandesForArtisan, getDemandesPubliquesForArtisan } from '@/lib/firebase/demande-service';
import { getArtisanByUserId } from '@/lib/firebase/artisan-service';
import type { User } from '@/types/firestore';

interface UserMenuProps {
  user: User;
  isArtisan?: boolean;
}

export default function UserMenu({ user, isArtisan = false }: UserMenuProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Ne charger les notifications que si l'utilisateur existe
  const shouldLoadNotifications = !!user?.uid;
  const { notifications, markTypeAsRead } = useNotifications(shouldLoadNotifications ? user.uid : undefined);

  // Hook pour les contrats à noter (clients uniquement)
  const { count: avisEnAttente } = useContratsANoter(!isArtisan && user?.uid ? user.uid : undefined);

  // État pour les messages non lus
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  // État pour les nouvelles demandes publiées (artisans uniquement)
  const [nouvellesDemandesCount, setNouvellesDemandesCount] = useState(0);

  // Charger le nombre de demandes publiées pour les artisans
  useEffect(() => {
    if (!isArtisan || !user?.uid) return;

    async function loadNouvellesDemandes() {
      try {
        const demandes = await getDemandesForArtisan(user.uid);
        const nouvellesDirectes = demandes.filter(d => d.statut === 'publiee').length;

        let nouvellesPubliques = 0;
        const artisanData = await getArtisanByUserId(user.uid);
        if (artisanData?.zonesIntervention && artisanData.zonesIntervention.length > 0) {
          const zone = artisanData.zonesIntervention[0];
          const demandesPubliques = await getDemandesPubliquesForArtisan({
            metiers: artisanData.metiers,
            location: {
              city: zone.ville,
              coordinates: zone.latitude && zone.longitude
                ? { latitude: zone.latitude, longitude: zone.longitude }
                : undefined,
            },
          });
          const idsDirectes = new Set(demandes.map(d => d.id));
          nouvellesPubliques = demandesPubliques.filter(
            d => d.statut === 'publiee' && !idsDirectes.has(d.id)
          ).length;
        }

        // Exclure les demandes déjà consultées (localStorage)
        let vuesIds = new Set<string>();
        try {
          const stored = localStorage.getItem('artisan_demandes_vues');
          if (stored) vuesIds = new Set<string>(JSON.parse(stored));
        } catch {}

        const totalDirectes = demandes
          .filter(d => d.statut === 'publiee' && !vuesIds.has(d.id)).length;
        const idsDirectes = new Set(demandes.map((d: { id: string }) => d.id));
        const totalPubliques = nouvellesPubliques > 0
          ? (await (async () => {
              const artisanData2 = await getArtisanByUserId(user.uid);
              if (!artisanData2?.zonesIntervention?.length) return 0;
              const zone2 = artisanData2.zonesIntervention[0];
              const dp = await getDemandesPubliquesForArtisan({
                metiers: artisanData2.metiers,
                location: { city: zone2.ville, coordinates: zone2.latitude && zone2.longitude ? { latitude: zone2.latitude, longitude: zone2.longitude } : undefined },
              });
              return dp.filter((d: { id: string; statut: string }) => d.statut === 'publiee' && !idsDirectes.has(d.id) && !vuesIds.has(d.id)).length;
            })())
          : 0;

        setNouvellesDemandesCount(totalDirectes + totalPubliques);
      } catch (error) {
        console.error('Erreur chargement demandes:', error);
      }
    }

    loadNouvellesDemandes();
  }, [isArtisan, user?.uid]);

  // Compter les messages non lus en temps réel
  useEffect(() => {
    if (!user?.uid) return;

    const q = query(
      collection(db, 'conversations'),
      or(where('participants', 'array-contains', user.uid))
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let totalUnread = 0;
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const unreadForUser = data.unreadCount?.[user.uid] || 0;
        totalUnread += unreadForUser;
      });
      setUnreadMessagesCount(totalUnread);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Compter les notifications par catégorie (non lues uniquement)
  const notifDevis = notifications.filter(
    n => !n.lue && (
      n.type === 'devis_accepte' || 
      n.type === 'devis_refuse' || 
      n.type === 'devis_recu' ||        // ✅ Pour les clients
      n.type === 'nouveau_devis' ||     // Ancien type (migration progressive)
      n.type === 'devis_revision' ||    // ✅ Demandes de révision
      n.type === 'travaux_demarres' ||  // ✅ Artisan a démarré les travaux
      n.type === 'travaux_termines'     // ✅ Artisan a terminé les travaux
    )
  ).length;

  const notifDemandes = notifications.filter(
    n => !n.lue && (n.type === 'nouvelle_demande' || n.type === 'demande_refusee')
  ).length;

  const notifExpressDemandes = notifications.filter(
    n => !n.lue && n.type === 'nouvelle_demande_express'
  ).length;

  // Notifications avis : nouvel avis reçu (artisan) ou réponse artisan (client)
  const notifAvis = notifications.filter(
    n => !n.lue && (n.type === 'nouvel_avis' || n.type === 'reponse_avis')
  ).length;

  // Nombre total de notifications non lues (incluant messages et nouvelles demandes)
  const totalNotifications = notifDevis + notifDemandes + notifExpressDemandes + unreadMessagesCount + nouvellesDemandesCount + notifAvis;

  // Fermer le dropdown au clic extérieur
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSignOut = async () => {
    // Fermer le menu immédiatement pour désinscrire les listeners
    setIsOpen(false);
    
    // Attendre un court instant pour que le composant se démonte proprement
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Déconnecter
    await authService.signOut();
    router.push('/');
  };

  const handleNavigation = (path: string) => {
    router.push(path);
    setIsOpen(false);
  };

  const handleNavigationWithMarkRead = async (path: string, notificationTypes: string[]) => {
    // Marquer les notifications du type spécifié comme lues
    await markTypeAsRead(notificationTypes);
    router.push(path);
    setIsOpen(false);
  };

  // Initiales pour l'avatar
  const initials = user.nom && user.prenom
    ? `${user.prenom[0]}${user.nom[0]}`.toUpperCase()
    : user.email[0].toUpperCase();

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bouton avatar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity relative"
        aria-label="Menu utilisateur"
      >
        {/* Avatar avec icône utilisateur */}
        <div className="w-10 h-10 rounded-full bg-[#FF6B00] text-white flex items-center justify-center font-semibold text-sm border-2 border-[#FF6B00] shadow-md relative">
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
          </svg>
          
          {/* Badge notification total */}
          {totalNotifications > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-white">
              {totalNotifications > 9 ? '9+' : totalNotifications}
            </span>
          )}
        </div>

        {/* Flèche */}
        <svg
          className={`w-4 h-4 text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
          {/* En-tête avec info utilisateur */}
          <div className="bg-gradient-to-r from-[#2C3E50] to-[#34495E] text-white px-4 py-3">
            <div className="flex items-center gap-3">
              {/* Avatar avec icône utilisateur */}
              <div className="w-12 h-12 rounded-full bg-[#FF6B00] text-white flex items-center justify-center font-bold text-lg border-2 border-white shadow-md">
                <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437.695z" clipRule="evenodd" />
                </svg>
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">
                  {user.prenom} {user.nom}
                </p>
                <p className="text-xs text-gray-300 truncate">
                  {user.email}
                </p>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-2">
            {/* Tableau de bord */}
            <button
              onClick={() => handleNavigation(isArtisan ? '/artisan/dashboard' : '/dashboard')}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 transition flex items-center gap-3 text-gray-700"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
              <span className="font-medium">{t('common.dashboard')}</span>
            </button>

            {/* Espace Artisan - uniquement pour artisans */}
            {isArtisan && (
              <button
                onClick={() => {
                  // Bloquer l'accès au profil pour les artisans non vérifiés
                  if (user.statut !== 'verifie') {
                    alert('⚠️ Profil non vérifié\n\nVous devez d\'abord compléter la vérification de votre profil (KBIS, CNI, RC Pro) avant d\'accéder à cette section.\n\nVous allez être redirigé vers la page de vérification.');
                    handleNavigation('/artisan/verification');
                  } else {
                    handleNavigation('/artisan/profil');
                  }
                }}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition flex items-center gap-3 text-gray-700"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <span className="font-medium">{t('common.craftspaceSpace')}</span>
                {user.statut !== 'verifie' && (
                  <span className="text-lg">
                    🔒
                  </span>
                )}
              </button>
            )}

            {/* Liens spécifiques client */}
            {!isArtisan && (
              <>
                {/* Mes Devis */}
                <button
                  onClick={() => handleNavigationWithMarkRead('/client/devis', ['devis_accepte', 'devis_refuse', 'devis_recu', 'nouveau_devis', 'devis_revision', 'travaux_demarres', 'travaux_termines'])}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition flex items-center gap-3 text-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="font-medium flex-1">Mes Devis</span>
                  {notifDevis > 0 && (
                    <span className="bg-[#FF6B00] text-white text-xs font-bold px-2 py-1 rounded-full min-w-[20px] text-center">
                      {notifDevis}
                    </span>
                  )}
                </button>

                {/* Mes Demandes */}
                <button
                  onClick={() => handleNavigationWithMarkRead('/client/demandes-hub', ['nouvelle_demande', 'demande_refusee'])}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition flex items-center gap-3 text-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                    />
                  </svg>
                  <span className="font-medium flex-1">{t('common.myRequests')}</span>
                  {notifDemandes > 0 && (
                    <span className="bg-[#FF6B00] text-white text-xs font-bold px-2 py-1 rounded-full min-w-[20px] text-center">
                      {notifDemandes}
                    </span>
                  )}
                </button>

                {/* Messages Client */}
                <button
                  onClick={() => handleNavigation('/messages')}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition flex items-center gap-3 text-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                  <span className="font-medium flex-1">Messages</span>
                  {unreadMessagesCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full min-w-[20px] text-center">
                      {unreadMessagesCount}
                    </span>
                  )}
                </button>

                {/* Avis Artisans */}
                <button
                  onClick={() => handleNavigationWithMarkRead('/client/avis', ['reponse_avis'])}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition flex items-center gap-3 text-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                    />
                  </svg>
                  <span className="font-medium flex-1">Avis</span>
                  {notifAvis > 0 && (
                    <span className="bg-[#FF6B00] text-white text-xs font-bold px-2 py-1 rounded-full min-w-[20px] text-center">
                      {notifAvis}
                    </span>
                  )}
                  {avisEnAttente > 0 && (
                    <span className="bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded-full min-w-[20px] text-center">
                      {avisEnAttente}
                    </span>
                  )}
                </button>
              </>
            )}

            {/* Liens spécifiques artisan */}
            {isArtisan && (
              <>
                {/* Mon Agenda */}
                <button
                  onClick={() => handleNavigation('/artisan/agenda')}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition flex items-center gap-3 text-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="font-medium flex-1">{t('common.myAgenda')}</span>
                </button>

                {/* Mon Wallet */}
                <button
                  onClick={() => handleNavigation('/artisan/wallet')}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition flex items-center gap-3 text-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                  </svg>
                  <span className="font-medium flex-1">{t('common.myWallet')}</span>
                </button>

                {/* Mes Devis */}
                <button
                  onClick={() => handleNavigationWithMarkRead('/artisan/devis', ['devis_accepte', 'devis_refuse', 'devis_recu', 'nouveau_devis', 'devis_revision'])}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition flex items-center gap-3 text-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="font-medium flex-1">Mes Devis</span>
                  {notifDevis > 0 && (
                    <span className="bg-[#FF6B00] text-white text-xs font-bold px-2 py-1 rounded-full min-w-[20px] text-center">
                      {notifDevis}
                    </span>
                  )}
                </button>

                {/* Mes Demandes Clients */}
                <button
                  onClick={() => handleNavigationWithMarkRead('/artisan/demandes', ['nouvelle_demande', 'demande_refusee'])}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition flex items-center gap-3 text-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                    />
                  </svg>
                  <span className="font-medium flex-1">{t('common.clientRequests')}</span>
                  {notifDemandes > 0 && (
                    <span className="bg-[#FF6B00] text-white text-xs font-bold px-2 py-1 rounded-full min-w-[20px] text-center">
                      {notifDemandes}
                    </span>
                  )}
                </button>

                {/* Demandes Express */}
                <button
                  onClick={() => handleNavigationWithMarkRead('/artisan/demandes-express', ['nouvelle_demande_express'])}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition flex items-center gap-3 text-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  <span className="font-medium flex-1">Demandes Express</span>
                  {notifExpressDemandes > 0 && (
                    <span className="bg-[#FF6B00] text-white text-xs font-bold px-2 py-1 rounded-full min-w-[20px] text-center">
                      {notifExpressDemandes}
                    </span>
                  )}
                </button>

                {/* Messages Artisan */}
                <button
                  onClick={() => handleNavigation('/messages')}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition flex items-center gap-3 text-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                  <span className="font-medium flex-1">Messages</span>
                  {unreadMessagesCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full min-w-[20px] text-center">
                      {unreadMessagesCount}
                    </span>
                  )}
                </button>

                {/* Avis Clients */}
                <button
                  onClick={() => handleNavigationWithMarkRead('/artisan/avis', ['nouvel_avis'])}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition flex items-center gap-3 text-gray-700"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                    />
                  </svg>
                  <span className="font-medium flex-1">Avis</span>
                  {notifAvis > 0 && (
                    <span className="bg-[#FF6B00] text-white text-xs font-bold px-2 py-1 rounded-full min-w-[20px] text-center">
                      {notifAvis}
                    </span>
                  )}
                </button>
              </>
            )}

            <hr className="my-2 border-gray-200" />

            {/* Déconnexion */}
            <button
              onClick={handleSignOut}
              className="w-full px-4 py-3 text-left hover:bg-red-50 transition flex items-center gap-3 text-red-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span className="font-medium">{t('common.logout')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
