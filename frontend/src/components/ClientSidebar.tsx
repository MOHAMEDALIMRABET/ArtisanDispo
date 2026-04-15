'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
 * Le composant gère lui-même son état ouvert/fermé.
 */
export default function ClientSidebar() {
  // ── État ouverture/fermeture ──
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let total = 0;
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        total += data.unreadCount?.[firebaseUser.uid] || 0;
      });
      setUnreadMessagesCount(total);
    });

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

  /**
   * Retourne les classes CSS pour un lien de navigation.
   * Le lien actif est mis en orange, les autres en bleu terne avec survol orange.
   */
  const navLinkClass = (isActive: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm whitespace-nowrap transition ${
      isActive
        ? 'bg-[#FF6B00] text-white font-semibold'
        : 'text-[#2C3E50] hover:bg-orange-50 hover:text-[#FF6B00]'
    }`;

  return (
    <>
      {/* ── SIDEBAR ── */}
      <aside
        className={`relative z-20 flex-shrink-0 bg-white shadow-xl flex flex-col transition-all duration-300 ease-in-out ${
          sidebarOpen ? 'w-64' : 'w-0'
        } overflow-hidden`}
        style={{ minHeight: '100vh' }}
      >
        {/* Bouton fermer (style Outlook) — coin haut droit */}
        <button
          onClick={() => setSidebarOpen(false)}
          title="Réduire la barre latérale"
          className="absolute top-4 right-3 z-10 p-1.5 rounded-md text-gray-400 hover:text-[#2C3E50] hover:bg-gray-100 transition"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Logo espace client */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <span className="text-lg font-bold text-[#2C3E50] whitespace-nowrap">
            🏠 Mon espace
          </span>
        </div>

        {/* Navigation principale */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {/* Tableau de bord */}
          <Link href="/dashboard">
            <div className={navLinkClass(pathname === '/dashboard')}>
              <svg
                className="w-5 h-5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
              Tableau de bord
            </div>
          </Link>

          {/* Rechercher un artisan */}
          <Link href="/choisir-type-travaux">
            <div className={navLinkClass(pathname === '/choisir-type-travaux' || pathname === '/recherche')}>
              <svg
                className="w-5 h-5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              Rechercher un artisan
            </div>
          </Link>

          {/* Mes Demandes */}
          <button
            className="w-full text-left"
            onClick={async () => {
              // Marquer les notifications de demandes comme lues avant navigation
              await markTypeAsRead([
                'demande_refusee', 'demande_annulee',
                'proposition_express_recue', 'proposition_refusee',
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
          >
            <div
              className={navLinkClass(pathname.startsWith('/client/demandes'))}
            >
              <svg
                className="w-5 h-5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Mes Demandes
              {/* Badge notifications demandes */}
              {demandesNouvelles > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {demandesNouvelles}
                </span>
              )}
            </div>
          </button>

          {/* Mes Devis */}
          <button
            className="w-full text-left"
            onClick={async () => {
              // Marquer les notifications de devis comme lues avant navigation
              await markTypeAsRead([
                'devis_recu', 'nouveau_devis', 'contrat_signe',
                'travaux_demarres', 'travaux_termines',
              ]);
              router.push('/client/devis?filter=tous');
            }}
          >
            <div className={navLinkClass(pathname.startsWith('/client/devis'))}>
              <svg
                className="w-5 h-5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Mes Devis
              {/* Badge notifications devis */}
              {devisNouveaux > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {devisNouveaux}
                </span>
              )}
            </div>
          </button>

          {/* Messages */}
          <Link href="/messages">
            <div className={navLinkClass(pathname.startsWith('/messages'))}>
              <svg
                className="w-5 h-5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              Messages
              {/* Badge messages non lus */}
              {unreadMessagesCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {unreadMessagesCount}
                </span>
              )}
            </div>
          </Link>

          {/* Avis */}
          <button
            className="w-full text-left"
            onClick={async () => {
              // Marquer la notification de réponse artisan comme lue avant navigation
              await markTypeAsRead(['reponse_avis']);
              router.push('/client/avis');
            }}
          >
            <div className={navLinkClass(pathname.startsWith('/client/avis'))}>
              <svg
                className="w-5 h-5 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              Avis
              {/* Badge orange : réponse artisan à un avis */}
              {notifAvis > 0 && (
                <span className="ml-auto bg-[#FF6B00] text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {notifAvis}
                </span>
              )}
              {/* Badge jaune : contrats terminés en attente de notation */}
              {avisEnAttente > 0 && notifAvis === 0 && (
                <span className="ml-auto bg-yellow-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {avisEnAttente}
                </span>
              )}
            </div>
          </button>
        </nav>

        {/* Bloc "Besoin d'aide?" — bas de sidebar */}
        <div className="mx-3 mb-4 p-4 bg-orange-50 rounded-xl border border-orange-100">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg
                className="w-5 h-5 text-[#FF6B00]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-[#2C3E50] text-sm whitespace-nowrap">
                Besoin d&apos;aide ?
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Notre équipe est là pour vous accompagner.
              </p>
            </div>
          </div>
          <Link href="/etre-rappele">
            <button className="mt-3 w-full border border-[#FF6B00] text-[#FF6B00] hover:bg-[#FF6B00] hover:text-white text-sm font-medium py-1.5 rounded-lg transition whitespace-nowrap">
              Nous contacter
            </button>
          </Link>
        </div>
      </aside>

      {/* Bouton pour réouvrir la sidebar quand elle est fermée */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          title="Afficher la barre latérale"
          className="fixed left-0 top-1/2 -translate-y-1/2 z-30 bg-white shadow-lg border border-gray-200 rounded-r-xl px-1.5 py-3 text-[#2C3E50] hover:text-[#FF6B00] transition"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}
    </>
  );
}
