'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
 * Le composant gère lui-même son état ouvert/fermé.
 */
export default function ArtisanSidebar() {
  // ── État ouverture/fermeture ──
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

  /**
   * Retourne les classes CSS pour un lien de navigation.
   * Le lien actif est mis en orange, les autres en bleu terne avec survol orange.
   */
  const navLinkClass = (isActive: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm whitespace-nowrap transition ${
      isActive
        ? 'bg-[#2C3E50] text-white font-semibold'
        : 'text-[#2C3E50] hover:bg-blue-50 hover:text-[#2C3E50]'
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

        {/* Logo espace artisan */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <span className="text-lg font-bold text-[#2C3E50] whitespace-nowrap">
            🏠 Mon espace
          </span>
        </div>

        {/* Navigation principale */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">

          {/* Tableau de bord */}
          <Link href="/artisan/dashboard">
            <div className={navLinkClass(pathname === '/artisan/dashboard')}>
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

          {/* Mon Profil */}
          <Link href="/artisan/profil">
            <div className={navLinkClass(pathname.startsWith('/artisan/profil'))}>
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
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              Mon Profil
            </div>
          </Link>

          {/* Mes Demandes */}
          <button
            className="w-full text-left"
            onClick={async () => {
              // Marquer les notifications de demandes comme lues avant navigation
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
          >
            <div className={navLinkClass(pathname.startsWith('/artisan/demandes'))}>
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
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                />
              </svg>
              Demandes clients
              {/* Badge total demandes : classiques + express + nouvelles publiées */}
              {demandesTotal > 0 && (
                <span className="ml-auto bg-[#2C3E50] text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {demandesTotal}
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
                'devis_accepte', 'devis_refuse', 'devis_revision',
                'devis_annule', 'devis_supprime', 'demande_paye',
                'contrat_signe', 'paiement_libere',
              ]);
              router.push('/artisan/devis');
            }}
          >
            <div className={navLinkClass(pathname.startsWith('/artisan/devis'))}>
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
                <span className="ml-auto bg-[#2C3E50] text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
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

          {/* Agenda */}
          <Link href="/artisan/agenda">
            <div className={navLinkClass(pathname.startsWith('/artisan/agenda'))}>
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
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              Agenda
            </div>
          </Link>

          {/* Mon Wallet */}
          <Link href="/artisan/wallet">
            <div className={navLinkClass(pathname.startsWith('/artisan/wallet'))}>
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
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
              Mon Wallet
            </div>
          </Link>

          {/* Avis */}
          <button
            className="w-full text-left"
            onClick={async () => {
              // Marquer les notifications d'avis comme lues avant navigation
              await markTypeAsRead(['nouvel_avis']);
              router.push('/artisan/avis');
            }}
          >
            <div className={navLinkClass(pathname.startsWith('/artisan/avis'))}>
              <svg
                className="w-5 h-5 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              Avis
              {/* Badge orange : nouvel avis client */}
              {notifAvis > 0 && (
                <span className="ml-auto bg-[#2C3E50] text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {notifAvis}
                </span>
              )}
            </div>
          </button>

          {/* Documents */}
          <Link href="/artisan/documents">
            <div className={navLinkClass(pathname.startsWith('/artisan/documents'))}>
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
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              Documents
            </div>
          </Link>

        </nav>

        {/* Bloc "Besoin d'aide?" — bas de sidebar */}
        <div className="mx-3 mb-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg
                className="w-5 h-5 text-[#2C3E50]"
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
          <Link href="/artisan/contact-support">
            <button className="mt-3 w-full border border-[#2C3E50] text-[#2C3E50] hover:bg-[#2C3E50] hover:text-white text-sm font-medium py-1.5 rounded-lg transition whitespace-nowrap">
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
