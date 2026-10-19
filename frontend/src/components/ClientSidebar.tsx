'use client';

import { useState, useEffect } from 'react';
import { LayoutDashboard, Search, ClipboardList, FileText, MessageSquare, Star } from 'lucide-react';
import { SidebarShell, SidebarLink } from '@/components/SidebarShell';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { useContratsANoter } from '@/hooks/useContratsANoter';
import { getUserById } from '@/lib/firebase/user-service';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

/**
 * Barre latérale de navigation commune à toutes les pages /client/*.
 * Affiche les liens de navigation, les badges de notifications non lus
 * et le bloc "Besoin d'aide?".
 * L'ouverture/fermeture (colonne desktop, tiroir mobile) est gérée par SidebarShell.
 */
export default function ClientSidebar() {
  // ── Compteur messages non lus ──
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  // ── Rôle utilisateur (ne rendre que pour les clients connectés) ──
  const [userRole, setUserRole] = useState<string | null>(null);

  // ── Hooks ──
  const pathname = usePathname();
  const router = useRouter();
  const { user: firebaseUser, loading: authLoading } = useAuth();
  const { notifications, markTypeAsRead } = useNotifications(firebaseUser?.uid);

  // Nombre de contrats terminés sans avis (badge jaune sur Avis)
  const { count: avisEnAttente } = useContratsANoter(
    userRole === 'client' ? firebaseUser?.uid : undefined
  );

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
  // (le hook est toujours appelé, mais ne fait rien si l'utilisateur n'est pas connecté)
  useEffect(() => {
    if (!firebaseUser?.uid || userRole !== 'client') return;

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
        // Ignorer les erreurs de permission lors de la déconnexion
        if (error.code === 'permission-denied') {
          setUnreadMessagesCount(0);
          return;
        }
        console.error('Erreur écoute conversations (ClientSidebar):', error);
      }
    );

    return () => unsubscribe();
  }, [firebaseUser?.uid, userRole]);

  // Ne rien afficher si chargement en cours, non connecté, ou pas client
  // ⚠️ Ce return conditionnel doit être placé APRÈS tous les hooks
  if (authLoading || !firebaseUser || userRole !== 'client') return null;

  // ── Badges notifications ──
  // Comptage des notifications non lues relatives aux devis (reçues par le CLIENT)
  const devisNouveaux = notifications.filter(
    (n) =>
      !n.lue &&
      (n.type === 'devis_recu' ||           // artisan a envoyé un devis
        n.type === 'nouveau_devis' ||        // ancien type (migration progressive)
        n.type === 'contrat_signe' ||        // contrat signé suite au devis
        n.type === 'travaux_demarres' ||     // artisan a démarré les travaux
        n.type === 'travaux_termines')       // artisan a terminé les travaux
  ).length;

  // Comptage des notifications non lues relatives aux demandes (reçues par le CLIENT)
  const demandesNouvelles = notifications.filter(
    (n) =>
      !n.lue &&
      (n.type === 'demande_refusee' ||              // artisan a refusé la demande
        n.type === 'demande_annulee' ||              // demande annulée
        n.type === 'proposition_express_recue' ||    // artisan a envoyé une proposition express
        n.type === 'proposition_acceptee' ||          // artisan a accepté le prix du client (négociation)
        n.type === 'proposition_refusee' ||          // artisan a rompu la négociation express
        n.type === 'intervention_demarree' ||        // artisan a démarré intervention express
        n.type === 'travaux_termines_express' ||     // artisan a terminé travaux express
        n.type === 'paiement_expire' ||              // délai de paiement dépassé
        n.type === 'travaux_demarres_demande' ||     // artisan a démarré sur la demande
        n.type === 'travaux_termines_demande' ||     // artisan a terminé sur la demande
        n.type === 'validation_auto' ||              // auto-validation travaux (7 jours)
        n.type === 'demande_avis_express' ||         // invitation à laisser un avis
        n.type === 'litige_ouvert' ||                // litige ouvert
        n.type === 'litige_commentaire' ||           // nouveau commentaire litige
        n.type === 'litige_pris_en_charge' ||        // admin a pris en charge le litige
        n.type === 'litige_proposition' ||            // proposition de résolution
        n.type === 'litige_acceptation_partielle' || // acceptation partielle
        n.type === 'litige_refus' ||                 // refus résolution
        n.type === 'litige_escalade' ||              // litige escaladé
        n.type === 'litige_resolu' ||                // litige résolu
        n.type === 'litige_abandonne')               // litige abandonné
  ).length;

  // Notifications avis : réponse de l'artisan à un avis client
  const notifAvis = notifications.filter(
    (n) => !n.lue && n.type === 'reponse_avis'
  ).length;


  const iconClass = 'h-5 w-5';

  return (
    <SidebarShell title="Mon espace" helpHref="/etre-rappele">
      <SidebarLink
        href="/dashboard"
        active={pathname === '/dashboard'}
        icon={<LayoutDashboard className={iconClass} />}
        label="Tableau de bord"
      />

      <SidebarLink
        href="/choisir-type-travaux"
        active={pathname === '/choisir-type-travaux' || pathname === '/recherche'}
        icon={<Search className={iconClass} />}
        label="Rechercher un artisan"
      />

      {/* Mes Demandes : marquer les notifications de demandes comme lues avant navigation */}
      <SidebarLink
        onClick={async () => {
          await markTypeAsRead([
            'demande_refusee', 'demande_annulee',
            'proposition_express_recue', 'proposition_acceptee', 'proposition_refusee',
            'intervention_demarree',
            'travaux_termines_express', 'paiement_expire',
            'travaux_demarres_demande', 'travaux_termines_demande',
            'validation_auto', 'demande_avis_express',
            'litige_ouvert', 'litige_commentaire', 'litige_pris_en_charge',
            'litige_proposition', 'litige_acceptation_partielle', 'litige_refus',
            'litige_escalade', 'litige_resolu', 'litige_abandonne',
          ]);
          router.push('/client/demandes-hub');
        }}
        active={pathname.startsWith('/client/demandes')}
        icon={<ClipboardList className={iconClass} />}
        label="Mes Demandes"
        badge={demandesNouvelles}
        badgeTone="danger"
      />

      {/* Mes Devis : marquer les notifications de devis comme lues avant navigation */}
      <SidebarLink
        onClick={async () => {
          await markTypeAsRead([
            'devis_recu', 'nouveau_devis', 'contrat_signe',
            'travaux_demarres', 'travaux_termines',
          ]);
          router.push('/client/devis?filter=tous');
        }}
        active={pathname.startsWith('/client/devis')}
        icon={<FileText className={iconClass} />}
        label="Mes Devis"
        badge={devisNouveaux}
        badgeTone="danger"
      />

      <SidebarLink
        href="/messages"
        active={pathname.startsWith('/messages')}
        icon={<MessageSquare className={iconClass} />}
        label="Messages"
        badge={unreadMessagesCount}
        badgeTone="danger"
      />

      {/* Avis : badge orange = réponse artisan ; badge jaune = contrats en attente de notation */}
      <SidebarLink
        onClick={async () => {
          await markTypeAsRead(['reponse_avis']);
          router.push('/client/avis');
        }}
        active={pathname.startsWith('/client/avis')}
        icon={<Star className={iconClass} />}
        label="Avis"
        badge={notifAvis > 0 ? notifAvis : avisEnAttente}
        badgeTone={notifAvis > 0 ? 'brand' : 'warning'}
      />
    </SidebarShell>
  );
}
