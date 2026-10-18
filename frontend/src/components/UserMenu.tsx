/**
 * Composant UserMenu
 * Menu utilisateur avec photo de profil et dropdown (style BlaBlaCar)
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { ChevronDown, LayoutDashboard, LogOut, MessageSquare } from 'lucide-react';
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

  const menuItemClass =
    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100';

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bouton avatar (initiales) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center gap-1 rounded-full p-0.5 transition-colors hover:bg-slate-100"
        aria-label="Menu utilisateur"
        aria-expanded={isOpen}
      >
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-white">
          {initials}
          {/* Badge notification total */}
          {totalNotifications > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] font-bold text-white">
              {totalNotifications > 9 ? '9+' : totalNotifications}
            </span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="animate-slideDown absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {/* En-tête avec info utilisateur */}
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-white">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">
                {user.prenom} {user.nom}
              </p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
          </div>

          <div className="p-1.5">
            <button
              type="button"
              onClick={() => handleNavigation(isArtisan ? '/artisan/dashboard' : '/dashboard')}
              className={menuItemClass}
            >
              <LayoutDashboard className="h-4 w-4 text-slate-500" aria-hidden="true" />
              {t('nav.dashboard')}
            </button>
            <button type="button" onClick={handleMessagesNavigation} className={menuItemClass}>
              <MessageSquare className="h-4 w-4 text-slate-500" aria-hidden="true" />
              {t('nav.messages')}
              {unreadMessagesCount > 0 && (
                <span className="ml-auto rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">
                  {unreadMessagesCount}
                </span>
              )}
            </button>
          </div>

          {/* Déconnexion */}
          <div className="border-t border-slate-100 p-1.5">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {t('common.logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
