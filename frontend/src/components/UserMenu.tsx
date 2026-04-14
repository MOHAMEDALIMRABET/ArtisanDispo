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
import { collection, query, where, onSnapshot, getDocs, updateDoc, doc } from 'firebase/firestore';
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

    // Requête directe sans or() : Firestore peut prouver la règle de sécurité
    // (request.auth.uid in resource.data.participants) depuis le where() array-contains
    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let totalUnread = 0;
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const unreadForUser = data.unreadCount?.[user.uid] || 0;
          totalUnread += unreadForUser;
        });
        setUnreadMessagesCount(totalUnread);
      },
      (error) => {
        // Ignorer les erreurs de permission lors des changements d'état d'authentification
        if (error.code === 'permission-denied') {
          setUnreadMessagesCount(0);
          return;
        }
        console.error('Erreur écoute conversations (UserMenu):', error);
      }
    );

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
    n => !n.lue && (
      n.type === 'nouvelle_demande' ||
      n.type === 'demande_refusee' ||
      n.type === 'demande_annulee' ||              // ✅ Demande express annulée
      n.type === 'proposition_express_recue' ||
      n.type === 'proposition_refusee' ||          // ✅ Artisan rejette négociation → client
      n.type === 'intervention_demarree' ||        // ✅ Artisan démarre intervention express
      n.type === 'paiement_expire' ||              // ✅ Timeout paiement express
      n.type === 'travaux_demarres_demande' ||     // ✅ Artisan a démarré les travaux (niveau demande)
      n.type === 'travaux_valides' ||
      n.type === 'travaux_termines_demande' ||     // ✅ Artisan a terminé, validation client requise (classique)
      n.type === 'travaux_termines_express'        // ✅ Artisan a terminé intervention express → badge Demandes
    )
  ).length;

  const notifExpressDemandes = notifications.filter(
    n => !n.lue && (
      n.type === 'nouvelle_demande_express' ||     // Nouvelle demande reçue
      n.type === 'proposition_acceptee' ||          // Client a accepté la proposition
      n.type === 'contre_proposition_recue' ||      // Client envoie une contre-proposition
      n.type === 'paiement_recu_express' ||          // Paiement confirmé, intervention possible
      n.type === 'acceptation_expiree' ||           // Timeout paiement : demande expirée
      n.type === 'paiement_libere_express'          // ✅ Paiement libéré après validation travaux express
    )
  ).length;

  // Notifications avis strictes par rôle
  // - Client: uniquement réponse de l'artisan
  // - Artisan: uniquement nouvel avis reçu
  const notifAvis = notifications.filter(
    n => !n.lue && (isArtisan ? n.type === 'nouvel_avis' : n.type === 'reponse_avis')
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

  const handleMessagesNavigation = async () => {
    // Marquer tous les messages comme lus
    try {
      const q = query(collection(db, 'conversations'), where('participants', 'array-contains', user.uid));
      const snapshot = await getDocs(q);
      await Promise.all(
        snapshot.docs
          .filter(d => (d.data().unreadCount?.[user.uid] || 0) > 0)
          .map(d => updateDoc(doc(db, 'conversations', d.id), { [`unreadCount.${user.uid}`]: 0 }))
      );
    } catch (e) {
      // silently ignore
    }
    router.push('/messages');
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
