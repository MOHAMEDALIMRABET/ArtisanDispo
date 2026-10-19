'use client';

import { useState, useEffect } from 'react';
import { LayoutDashboard, UserRound, ClipboardList, FileText, MessageSquare, CalendarDays, Wallet, Star, FolderOpen } from 'lucide-react';
import { SidebarShell, SidebarLink } from '@/components/SidebarShell';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { getUserById } from '@/lib/firebase/user-service';
import { getArtisanByUserId } from '@/lib/firebase/artisan-service';
import { getDemandesForArtisan, getDemandesPubliquesForArtisan } from '@/lib/firebase/demande-service';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

/**
 * Barre latérale de navigation commune à toutes les pages /artisan/*.
 * Affiche les liens de navigation, les badges de notifications non lus
 * et le bloc "Besoin d'aide?".
 * L'ouverture/fermeture (colonne desktop, tiroir mobile) est gérée par SidebarShell.
 */
export default function ArtisanSidebar() {
  // ── Compteur messages non lus ──
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  // ── Rôle utilisateur (ne rendre que pour les artisans connectés) ──
  const [userRole, setUserRole] = useState<string | null>(null);

  // ── Nouvelles demandes publiées non consultées ──
  const [nouvellesDemandesCount, setNouvellesDemandesCount] = useState(0);

  // ── Hooks ──
  const pathname = usePathname();
  const router = useRouter();
  const { user: firebaseUser, loading: authLoading } = useAuth();
  const { notifications, markTypeAsRead } = useNotifications(firebaseUser?.uid);

  // Charger le rôle de l'utilisateur connecté
  useEffect(() => {
    if (!firebaseUser?.uid) {
      setUserRole(null);
      return;
    }
    getUserById(firebaseUser.uid).then((u) => {
      setUserRole(u?.role ?? null);
    }).catch(() => setUserRole(null));
  }, [firebaseUser?.uid]);

  // Écouter en temps réel les messages non lus dans les conversations
  useEffect(() => {
    if (!firebaseUser?.uid || userRole !== 'artisan') return;

    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', firebaseUser.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let total = 0;
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          total += data.unreadCount?.[firebaseUser.uid] || 0;
        });
        setUnreadMessagesCount(total);
      },
      (error) => {
        // Ignorer les erreurs de permission lors des changements d'état d'authentification
        if (error.code === 'permission-denied') {
          setUnreadMessagesCount(0);
          return;
        }
        console.error('Erreur écoute conversations (ArtisanSidebar):', error);
      }
    );

    return () => unsubscribe();
  }, [firebaseUser?.uid, userRole]);

  // Charger le nombre de nouvelles demandes publiées (non consultées par l'artisan)
  useEffect(() => {
    if (!firebaseUser?.uid || userRole !== 'artisan') return;

    async function loadNouvellesDemandes() {
      try {
        const uid = firebaseUser!.uid;

        // Demandes directement assignées à cet artisan
        const demandes = await getDemandesForArtisan(uid);
        const idsDirectes = new Set(demandes.map((d) => d.id));

        // Demandes publiques compatibles avec les métiers/zone de l'artisan
        const artisanData = await getArtisanByUserId(uid);
        let demandesPubliques: { id: string; statut: string }[] = [];
        if (artisanData?.zonesIntervention && artisanData.zonesIntervention.length > 0) {
          const zone = artisanData.zonesIntervention[0];
          demandesPubliques = await getDemandesPubliquesForArtisan({
            metiers: artisanData.metiers,
            location: {
              city: zone.ville,
              coordinates:
                zone.latitude && zone.longitude
                  ? { latitude: zone.latitude, longitude: zone.longitude }
                  : undefined,
            },
          });
        }

        // Exclure les demandes déjà consultées (stockées dans localStorage)
        let vuesIds = new Set<string>();
        try {
          const stored = localStorage.getItem('artisan_demandes_vues');
          if (stored) vuesIds = new Set<string>(JSON.parse(stored));
        } catch {}

        // Compter les nouvelles demandes directes non vues
        const totalDirectes = demandes.filter(
          (d) => d.statut === 'publiee' && !vuesIds.has(d.id)
        ).length;

        // Compter les nouvelles demandes publiques non vues (hors directes)
        const totalPubliques = demandesPubliques.filter(
          (d) => d.statut === 'publiee' && !idsDirectes.has(d.id) && !vuesIds.has(d.id)
        ).length;

        setNouvellesDemandesCount(totalDirectes + totalPubliques);
      } catch {
        // Ignorer silencieusement les erreurs de chargement
      }
    }

    loadNouvellesDemandes();
  }, [firebaseUser?.uid, userRole]);

  // Ne rien afficher si chargement en cours, non connecté, ou pas artisan
  // ⚠️ Ce return conditionnel doit être placé APRÈS tous les hooks
  if (authLoading || !firebaseUser || userRole !== 'artisan') return null;

  // ── Badges notifications ──

  // Devis : réponses CLIENT aux devis envoyés par l'artisan
  const devisNouveaux = notifications.filter(
    (n) =>
      !n.lue &&
      (n.type === 'devis_accepte' ||       // client a accepté le devis
        n.type === 'devis_refuse' ||        // client a refusé le devis
        n.type === 'devis_revision' ||      // client demande révision
        n.type === 'devis_annule' ||        // client a annulé le devis
        n.type === 'devis_supprime' ||      // devis auto-supprimé (expiration)
        n.type === 'demande_paye' ||        // client a payé le devis (niveau demande)
        n.type === 'contrat_signe' ||       // contrat signé suite au devis
        n.type === 'paiement_libere')       // paiement libéré pour l'artisan
  ).length;

  // Demandes classiques : notifications reçues par l'ARTISAN
  const notifDemandes = notifications.filter(
    (n) =>
      !n.lue &&
      (n.type === 'nouvelle_demande' ||           // demande directe d'un client
        n.type === 'nouvelle_demande_publique' ||  // demande publique compatible
        n.type === 'demande_annulee' ||            // client a annulé sa demande
        n.type === 'travaux_valides' ||            // client a validé les travaux
        n.type === 'validation_auto' ||            // auto-validation travaux (7 jours)
        n.type === 'litige_ouvert' ||              // litige ouvert sur un chantier
        n.type === 'litige_commentaire' ||         // nouveau commentaire litige
        n.type === 'litige_pris_en_charge' ||      // admin a pris en charge le litige
        n.type === 'litige_proposition' ||          // proposition de résolution
        n.type === 'litige_acceptation_partielle' || // acceptation partielle résolution
        n.type === 'litige_refus' ||               // refus de résolution
        n.type === 'litige_escalade' ||            // litige escaladé
        n.type === 'litige_resolu' ||              // litige résolu
        n.type === 'litige_abandonne')             // litige abandonné
  ).length;

  // Demandes express : notifications reçues par l'ARTISAN
  const notifExpressDemandes = notifications.filter(
    (n) =>
      !n.lue &&
      (n.type === 'nouvelle_demande_express' ||    // nouvelle demande express
        n.type === 'proposition_acceptee' ||        // client a accepté la proposition
        n.type === 'proposition_refusee' ||         // client a refusé la proposition
        n.type === 'contre_proposition_recue' ||    // client a envoyé contre-proposition
        n.type === 'paiement_recu_express' ||       // paiement express reçu
        n.type === 'acceptation_expiree' ||         // acceptation expirée (délai dépassé)
        n.type === 'paiement_libere_express')       // paiement express libéré
  ).length;

  // Badge total pour les demandes
  const demandesTotal = notifDemandes + notifExpressDemandes + nouvellesDemandesCount;

  // Avis : nouveau avis client laissé à l'artisan
  const notifAvis = notifications.filter(
    (n) => !n.lue && n.type === 'nouvel_avis'
  ).length;

  const iconClass = 'h-5 w-5';

  return (
    <SidebarShell title="Espace artisan" helpHref="/artisan/contact-support">
      <SidebarLink
        href="/artisan/dashboard"
        active={pathname === '/artisan/dashboard'}
        icon={<LayoutDashboard className={iconClass} />}
        label="Tableau de bord"
      />

      <SidebarLink
        href="/artisan/profil"
        active={pathname.startsWith('/artisan/profil')}
        icon={<UserRound className={iconClass} />}
        label="Mon Profil"
      />

      {/* Demandes : marquer les notifications de demandes comme lues avant navigation */}
      <SidebarLink
        onClick={async () => {
          await markTypeAsRead([
            // Demandes classiques
            'nouvelle_demande', 'nouvelle_demande_publique', 'demande_annulee',
            'travaux_valides', 'validation_auto',
            // Demandes express
            'nouvelle_demande_express', 'proposition_acceptee', 'proposition_refusee',
            'contre_proposition_recue', 'paiement_recu_express', 'acceptation_expiree',
            'paiement_libere_express',
            // Litiges
            'litige_ouvert', 'litige_commentaire', 'litige_pris_en_charge',
            'litige_proposition', 'litige_acceptation_partielle', 'litige_refus',
            'litige_escalade', 'litige_resolu', 'litige_abandonne',
          ]);
          router.push('/artisan/demandes');
        }}
        active={pathname.startsWith('/artisan/demandes')}
        icon={<ClipboardList className={iconClass} />}
        label="Demandes clients"
        badge={demandesTotal}
      />

      {/* Devis : marquer les notifications de devis comme lues avant navigation */}
      <SidebarLink
        onClick={async () => {
          await markTypeAsRead([
            'devis_accepte', 'devis_refuse', 'devis_revision',
            'devis_annule', 'devis_supprime', 'demande_paye',
            'contrat_signe', 'paiement_libere',
          ]);
          router.push('/artisan/devis');
        }}
        active={pathname.startsWith('/artisan/devis')}
        icon={<FileText className={iconClass} />}
        label="Mes Devis"
        badge={devisNouveaux}
      />

      <SidebarLink
        href="/messages"
        active={pathname.startsWith('/messages')}
        icon={<MessageSquare className={iconClass} />}
        label="Messages"
        badge={unreadMessagesCount}
        badgeTone="danger"
      />

      <SidebarLink
        href="/artisan/agenda"
        active={pathname.startsWith('/artisan/agenda')}
        icon={<CalendarDays className={iconClass} />}
        label="Agenda"
      />

      <SidebarLink
        href="/artisan/wallet"
        active={pathname.startsWith('/artisan/wallet')}
        icon={<Wallet className={iconClass} />}
        label="Mon Wallet"
      />

      {/* Avis : marquer la notification nouvel avis comme lue avant navigation */}
      <SidebarLink
        onClick={async () => {
          await markTypeAsRead(['nouvel_avis']);
          router.push('/artisan/avis');
        }}
        active={pathname.startsWith('/artisan/avis')}
        icon={<Star className={iconClass} />}
        label="Avis"
        badge={notifAvis}
      />

      <SidebarLink
        href="/artisan/documents"
        active={pathname.startsWith('/artisan/documents')}
        icon={<FolderOpen className={iconClass} />}
        label="Documents"
      />
    </SidebarShell>
  );
}
