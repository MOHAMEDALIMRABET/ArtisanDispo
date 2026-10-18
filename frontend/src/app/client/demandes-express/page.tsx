'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNotifications } from '@/hooks/useNotifications';
import {
  getDemandesExpressByClient,
  getPropositionsByDemande,
  getPaiementExpressByDemande,
  acceptPropositionExpress,
  refusePropositionExpress,
  updateDemandeExpressStatut,
  deleteDemandeExpress,
  markTravauxValides,
  signalerProblemeExpress,
} from '@/lib/firebase/demande-express-service';
import { getUserById } from '@/lib/firebase/user-service';
import { getArtisanByUserId } from '@/lib/firebase/artisan-service';
import { createAvis, getAvisByContratId } from '@/lib/firebase/avis-service';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { DemandeExpress, PropositionExpress, User, DemandeExpressStatut } from '@/types/firestore';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { getExpressArtisanWindowLabel } from '@/lib/express-work-taxonomy';
import { useAntiBypassField } from '@/hooks/useAntiBypassField';


/**
 * Convertit un timestamp Firestore (Timestamp, {seconds,nanoseconds} brut, ou Date)
 * en objet Date JavaScript. Évite l'erreur "toDate is not a function".
 */
function tsToDate(ts: unknown): Date {
  if (!ts) return new Date(0);
  if (ts instanceof Date) return ts;
  if (typeof (ts as { toDate?: unknown }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate();
  }
  if (typeof (ts as { seconds?: unknown }).seconds === 'number') {
    return new Date((ts as { seconds: number }).seconds * 1000);
  }
  return new Date(ts as string | number);
}

/* Listes de tags pour le popup d'avis (identiques aux demandes classiques) */
const AVIS_POINTS_FORTS = [
  'Ponctuel', 'Soigneux', 'Professionnel', 'Rapide',
  'Bon rapport qualité/prix', 'À l\'écoute', 'Travail de qualité',
];
const AVIS_POINTS_AMELIORATION = [
  'Délais trop longs', 'Communication insuffisante', 'Propreté du chantier',
  'Prix élevé', 'Manque de professionnalisme',
];

export default function MesDemandesExpressPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: firebaseUser, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [userData, setUserData] = useState<User | null>(null);
  const [demandes, setDemandes] = useState<DemandeExpress[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState<'toutes' | DemandeExpressStatut>('toutes');
  // Sous-filtre pour le menu "En traitement" (payee / en_cours / travaux_termines / refusee)
  const [filtreEnTraitement, setFiltreEnTraitement] = useState<'toutes' | 'payee' | 'en_cours' | 'travaux_termines' | 'refusee'>('toutes');
  const [sourceFilter, setSourceFilter] = useState<'toutes' | 'directes' | 'publiees'>('toutes');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  // Montants payés (depuis paiements_express) pour badge statuts finaux
  const [montantsPaiementMap, setMontantsPaiementMap] = useState<Map<string, number>>(new Map());

  // Avis existants : Map<demandeId, boolean> — true si l'avis a déjà été soumis
  const [avisExistantsMap, setAvisExistantsMap] = useState<Map<string, boolean>>(new Map());

  // Propositions chargées à la volée à l'ouverture d'une carte
  const [propositionsMap, setPropositionsMap] = useState<Map<string, PropositionExpress | null>>(new Map());
  const [propositionsCountMap, setPropositionsCountMap] = useState<Map<string, number>>(new Map());
  const [loadingPropsIds, setLoadingPropsIds] = useState<Set<string>>(new Set());

  // Modale inline refus
  const [refusModal, setRefusModal] = useState<{ id: string; propId: string } | null>(null);
  /* Champ libre protégé anti-bypass (téléphone/email/adresse interdits avant paiement) */
  const motifRefusField = useAntiBypassField();
  const [submitting, setSubmitting] = useState(false);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [artisanNomMap, setArtisanNomMap] = useState<Map<string, string>>(new Map());

  // Popup avis post-validation (demandes express)
  const [showAvisPopup, setShowAvisPopup] = useState(false);
  const [avisDemandeId, setAvisDemandeId] = useState<string | null>(null);
  const [avisArtisanId, setAvisArtisanId] = useState<string | null>(null);
  const [avisNote, setAvisNote] = useState(0);
  const [avisNoteHover, setAvisNoteHover] = useState(0);
  const [avisCommentaire, setAvisCommentaire] = useState('');
  const [avisPointsForts, setAvisPointsForts] = useState<string[]>([]);
  const [avisPointsAmelioration, setAvisPointsAmelioration] = useState<string[]>([]);
  const [avisSubmitting, setAvisSubmitting] = useState(false);

  // Modale contestation
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeDemandeId, setDisputeDemandeId] = useState<string | null>(null);
  const [motifLitige, setMotifLitige] = useState('');

  // Modale signature devis (propositions > 150€ avec devisJoint)
  const [signatureDevisModal, setSignatureDevisModal] = useState<{
    propositionId: string;
    demandeId: string;
    prop: PropositionExpress;
  } | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const [signatureIsDrawing, setSignatureIsDrawing] = useState(false);
  const [signatureHasDrawn, setSignatureHasDrawn] = useState(false);
  const [signatureDataURL, setSignatureDataURL] = useState<string | null>(null);

  // Modale consultation devis joint (propositions > 150€ acceptées/payées)
  const [devisConsultModal, setDevisConsultModal] = useState<PropositionExpress | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Cloches temporaires (nouvelles propositions non lues)
  const { notifications, markAsRead } = useNotifications(firebaseUser?.uid);
  const [bellDemandeIds, setBellDemandeIds] = useState<Set<string>>(new Set());
  const [showToutsBell, setShowToutsBell] = useState(false);
  // Cloches pour les demandes dont les travaux sont terminés (action requise : valider)
  const [bellTravauxIds, setBellTravauxIds] = useState<Set<string>>(new Set());
  // IDs des demandes dont la proposition vient d'être refusée (pour message spécifique)
  const [refusedDemandeIds, setRefusedDemandeIds] = useState<Set<string>>(new Set());
  // Référence pour détecter si c'est le tout premier rendu des notifications (après chargement)
  const isInitialNotifLoad = useRef(true);

  // Mettre à jour les cloches ET le statut local en temps réel à chaque changement de notifications
  // Quand une notification 'proposition_express_recue' arrive, on met à jour localement le statut
  // de la demande concernée en 'proposition_recue' pour qu'elle bascule immédiatement dans
  // l'onglet "Propositions reçues" sans attendre un rechargement de page.
  // De même, 'travaux_termines_express' navigue vers "🔧 En traitement" → "⏳ Terminée" car le
  // client doit valider les travaux pour libérer le paiement.
  useEffect(() => {
    if (loading) return;

    // Notifications "proposition reçue" → bell + onglet "Propositions reçues"
    const propositionNotifs = notifications.filter(
      n => !n.lue && n.type === 'proposition_express_recue' && n.lien
    );

    // Notifications "travaux terminés" → action client requise (valider) → onglet "🔧 En traitement" → sous-menu "⏳ Terminée"
    const travauxTerminesNotifs = notifications.filter(
      n => !n.lue && n.type === 'travaux_termines_express' && n.lien
    );

    // Notifications "intervention démarrée" → info seulement (artisan est en route)
    const interventionNotifs = notifications.filter(
      n => !n.lue && n.type === 'intervention_demarree' && n.lien
    );

    // Notifications "négo rompue" ou "demande refusée" → bell informatif (demande repart en attente)
    // proposition_refusee : artisan a refusé la contre-offre du client
    // demande_refusee     : artisan a refusé la demande directement
    const negoRompueNotifs = notifications.filter(
      n => !n.lue && (n.type === 'proposition_refusee' || n.type === 'demande_refusee') &&
        n.lien?.startsWith('/client/demandes-express/')
    );

    // Aucune notification → réinitialiser tous les bells
    if (propositionNotifs.length === 0 && travauxTerminesNotifs.length === 0 &&
        interventionNotifs.length === 0 && negoRompueNotifs.length === 0) {
      setBellDemandeIds(prev => (prev.size === 0 ? prev : new Set<string>()));
      setBellTravauxIds(prev => (prev.size === 0 ? prev : new Set<string>()));
      setShowToutsBell(false);
      isInitialNotifLoad.current = true; // réinitialiser si plus de notifs
      return;
    }

    // Mettre à jour les bells "proposition reçue"
    if (propositionNotifs.length > 0) {
      const ids = new Set<string>(
        propositionNotifs.map(n => n.lien!.split('/').pop() ?? '').filter(Boolean)
      );
      setBellDemandeIds(ids);
      setShowToutsBell(true);
      // Basculer le statut local vers 'proposition_recue' pour les demandes concernées
      setDemandes(prev => prev.map(d =>
        ids.has(d.id) && d.statut === 'en_attente_proposition'
          ? { ...d, statut: 'proposition_recue' as DemandeExpressStatut }
          : d
      ));
    } else {
      setBellDemandeIds(prev => (prev.size === 0 ? prev : new Set<string>()));
      setShowToutsBell(false);
    }

    // Mettre à jour les bells "négo rompue" + "demande refusée" → fusionner dans bellDemandeIds
    // pour afficher le même signal visuel 🔔 sur la carte concernée
    if (negoRompueNotifs.length > 0) {
      const negoIds = new Set<string>(
        negoRompueNotifs.map(n => n.lien!.split('/').pop() ?? '').filter(Boolean)
      );
      setBellDemandeIds(prev => {
        const merged = new Set([...prev, ...negoIds]);
        return merged.size === prev.size && [...negoIds].every(id => prev.has(id)) ? prev : merged;
      });
      setShowToutsBell(true);
    }

    // Mettre à jour les bells "travaux terminés" + "intervention démarrée"
    const travauxIds = new Set<string>([
      ...travauxTerminesNotifs.map(n => n.lien!.split('/').pop() ?? '').filter(Boolean),
      ...interventionNotifs.map(n => n.lien!.split('/').pop() ?? '').filter(Boolean),
    ]);
    if (travauxIds.size > 0) {
      setBellTravauxIds(travauxIds);
    } else {
      setBellTravauxIds((prev: Set<string>) => prev.size === 0 ? prev : new Set<string>());
    }

    // Navigation automatique UNIQUEMENT au premier chargement.
    // Priorité : travaux_terminés (action requise) > proposition_recue (choix à faire)
    if (isInitialNotifLoad.current) {
      if (travauxTerminesNotifs.length > 0) {
        // Les travaux sont terminés → naviguer vers "🔧 En traitement" → "⏳ Terminée" pour valider
        setFiltreStatut('en_cours');
        setFiltreEnTraitement('travaux_termines');
      } else if (propositionNotifs.length > 0) {
        setFiltreStatut('proposition_recue');
        // Préserver le filtre source issu de l'URL (?source=directes ou ?source=publiees).
        const urlSource = searchParams.get('source');
        if (urlSource === 'directes' || urlSource === 'publiees') {
          // Filtre URL prioritaire — ne pas écraser
        } else {
          // Déduire le bon filtre source à partir des demandes concernées par les notifications.
          // Une demande est « publique » tant qu'elle n'a pas d'artisanId assigné.
          const notifIds = propositionNotifs
            .map(n => n.lien!.split('/').pop() ?? '')
            .filter(Boolean);
          const notifDemandes = notifIds
            .map(id => demandes.find(d => d.id === id))
            .filter(Boolean) as DemandeExpress[];
          const hasPublished = notifDemandes.some(d => !d.artisanId);
          const hasDirect = notifDemandes.some(d => !!d.artisanId);
          // Régler le filtre source : publiées si toutes publiques, directes si toutes directes, sinon toutes
          if (hasPublished && !hasDirect) setSourceFilter('publiees');
          else if (hasDirect && !hasPublished) setSourceFilter('directes');
          else setSourceFilter('toutes');
        }
      }
      isInitialNotifLoad.current = false;
    }
  }, [loading, notifications, searchParams]);

  const toggleExpand = async (id: string, statut: DemandeExpressStatut) => {
    const next = new Set(expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      // Effacer la cloche pour cette demande et marquer la notif comme lue
      if (bellDemandeIds.has(id)) {
        setBellDemandeIds(prev => { const s = new Set(prev); s.delete(id); return s; });
        const notif = notifications.find(n => !n.lue && n.type === 'proposition_express_recue' && n.lien?.endsWith(`/${id}`));
        if (notif) markAsRead(notif.id);
      }
      // Charger la proposition si statut pertinent et pas encore chargée
      if (
        ['proposition_recue', 'acceptee', 'payee', 'en_cours', 'travaux_termines', 'terminee'].includes(statut) &&
        !propositionsMap.has(id) &&
        !loadingPropsIds.has(id)
      ) {
        setLoadingPropsIds(prev => new Set(prev).add(id));
        try {
          const props = await getPropositionsByDemande(id);
          setPropositionsCountMap(prev => new Map(prev).set(id, props.length));
          const active = props.find(p => p.statut === 'en_attente_acceptation') || props[0] || null;
          setPropositionsMap(prev => new Map(prev).set(id, active));
          // Charger le nom de l'artisan depuis la proposition
          if (active?.artisanId) {
            loadArtisanNom(id, active.artisanId);
          }
        } catch {
          setPropositionsMap(prev => new Map(prev).set(id, null));
        } finally {
          setLoadingPropsIds(prev => { const s = new Set(prev); s.delete(id); return s; });
        }
      }
    }
    setExpandedIds(next);
  };

  async function handleAccepterInline(demandeId: string, propositionId: string, prop?: PropositionExpress) {
    // Si la proposition a un devis joint (> 150€), ouvrir la modale de signature
    if (prop?.devisJoint) {
      setSignatureHasDrawn(false);
      setSignatureDataURL(null);
      setSignatureDevisModal({ propositionId, demandeId, prop });
      return;
    }
    if (!confirm('Confirmer l\'acceptation de cette proposition ?')) return;
    setSubmitting(true);
    try {
      await acceptPropositionExpress(propositionId);
      router.push(`/client/paiement-express/${propositionId}`);
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l\'acceptation');
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Acceptation d'une proposition avec devisJoint :
   * le client a signé le canvas, on envoie le DataURL a` acceptPropositionExpress.
   */
  async function handleAccepterAvecSignature() {
    if (!signatureDevisModal || !signatureDataURL) return;
    setSubmitting(true);
    try {
      await acceptPropositionExpress(signatureDevisModal.propositionId, signatureDataURL);
      setSignatureDevisModal(null);
      router.push(`/client/paiement-express/${signatureDevisModal.propositionId}`);
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l\'acceptation');
    } finally {
      setSubmitting(false);
    }
  }

  /** Canvas signature du client — helpers */
  const getSignaturePos = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const signatureStartDraw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = signatureCanvasRef.current!.getContext('2d')!;
    const pos = getSignaturePos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setSignatureIsDrawing(true);
    setSignatureHasDrawn(true);
  }, [getSignaturePos]);

  const signatureDraw = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!signatureIsDrawing) return;
    e.preventDefault();
    const ctx = signatureCanvasRef.current!.getContext('2d')!;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const pos = getSignaturePos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, [signatureIsDrawing, getSignaturePos]);

  const signatureStopDraw = useCallback(() => {
    if (!signatureIsDrawing) return;
    setSignatureIsDrawing(false);
    setSignatureDataURL(signatureCanvasRef.current!.toDataURL('image/png'));
  }, [signatureIsDrawing]);

  const effacerSignatureClient = () => {
    const ctx = signatureCanvasRef.current!.getContext('2d')!;
    ctx.clearRect(0, 0, signatureCanvasRef.current!.width, signatureCanvasRef.current!.height);
    setSignatureDataURL(null);
    setSignatureHasDrawn(false);
  };

  async function handleRefuserInline() {
    if (!refusModal || !motifRefusField.value.trim()) { alert('Veuillez indiquer le motif'); return; }
    // Validation anti-bypass : bloquer si coordonnées personnelles détectées
    if (!motifRefusField.validate()) return;
    setSubmitting(true);
    try {
      await refusePropositionExpress(refusModal.propId, motifRefusField.value.trim());
      // Mettre à jour la demande localement + mémoriser l'ID pour afficher le bon message
      const refusedId = refusModal.id;
      setDemandes(prev => prev.map(d => d.id === refusedId ? { ...d, statut: 'en_attente_proposition' as DemandeExpressStatut } : d));
      setPropositionsMap(prev => { const m = new Map(prev); m.delete(refusedId); return m; });
      setRefusedDemandeIds(prev => new Set(prev).add(refusedId));
      setRefusModal(null); motifRefusField.reset();
    } catch (err: any) {
      alert(err.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  async function loadArtisanNom(demandeId: string, artisanUserId: string) {
    try {
      const artisan = await getArtisanByUserId(artisanUserId);
      if (artisan) {
        const nom = (artisan as any).businessName || (artisan as any).raisonSociale || 'Artisan';
        setArtisanNomMap(prev => {
          if (prev.has(demandeId)) return prev;
          return new Map(prev).set(demandeId, nom);
        });
      }
    } catch {}
  }

  async function handleValiderTravaux(demandeId: string) {
    if (!confirm("Confirmez-vous la bonne exécution des travaux ? Cela libèrera le paiement à l'artisan.")) return;
    setValidatingId(demandeId);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/stripe-express/capture-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demandeId }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erreur lors de la libération du paiement');
      }
      await markTravauxValides(demandeId);
      // Mettre à jour le statut localement
      setDemandes(prev => prev.map(d => d.id === demandeId ? { ...d, statut: 'terminee' as DemandeExpressStatut } : d));
      // Récupérer l'artisanId depuis la demande pour l'avis
      const demande = demandes.find(d => d.id === demandeId);
      const artisanId = demande?.artisanId ?? null;
      // Ouvrir le popup d'avis
      setAvisDemandeId(demandeId);
      setAvisArtisanId(artisanId);
      setAvisNote(0);
      setAvisNoteHover(0);
      setAvisCommentaire('');
      setAvisPointsForts([]);
      setAvisPointsAmelioration([]);
      setShowAvisPopup(true);
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la validation des travaux');
    } finally {
      setValidatingId(null);
    }
  }

  /**
   * Soumettre l'avis client pour une demande express validée
   */
  async function handleSubmitAvisExpress() {
    if (!firebaseUser || !avisDemandeId || !avisArtisanId) return;
    if (avisNote === 0) { alert('Veuillez sélectionner une note.'); return; }
    if (avisCommentaire.trim().length < 10) { alert('Le commentaire doit contenir au moins 10 caractères.'); return; }

    try {
      setAvisSubmitting(true);
      // contratId = demandeId (identifiant unique de l'intervention express)
      await createAvis({
        contratId: avisDemandeId,
        artisanId: avisArtisanId,
        clientId: firebaseUser.uid,
        note: avisNote,
        commentaire: avisCommentaire.trim(),
        points_forts: avisPointsForts,
        points_amelioration: avisPointsAmelioration,
      });
      // Marquer cet avis comme existant dans la map locale
      if (avisDemandeId) {
        setAvisExistantsMap(prev => new Map(prev).set(avisDemandeId, true));
      }
      setShowAvisPopup(false);
      alert('⭐ Merci pour votre avis ! Il a été publié avec succès.');
    } catch (error: any) {
      alert(error.message || 'Erreur lors de la publication de l\'avis.');
    } finally {
      setAvisSubmitting(false);
    }
  }

  async function handleSignalerProbleme(demandeId: string) {
    setDisputeDemandeId(demandeId);
    setMotifLitige('');
    setShowDisputeModal(true);
  }

  async function submitSignalerProbleme() {
    if (!disputeDemandeId || !firebaseUser) return;
    
    if (!motifLitige.trim() || motifLitige.trim().length < 10) {
      alert(t('clientExpressRequests.dispute.validationRequired'));
      return;
    }

    setSubmitting(true);
    try {
      await signalerProblemeExpress(disputeDemandeId, firebaseUser.uid, motifLitige.trim());
      
      // Mettre à jour localement
      setDemandes(prev => prev.map(d => 
        d.id === disputeDemandeId ? { ...d, statut: 'litige' as DemandeExpressStatut } : d
      ));
      
      setShowDisputeModal(false);
      setDisputeDemandeId(null);
      setMotifLitige('');
      
      alert(t('clientExpressRequests.dispute.successAlert'));
    } catch (err: any) {
      alert(err.message || 'Erreur lors du signalement du problème');
    } finally {
      setSubmitting(false);
    }
  }
  useEffect(() => {
    if (authLoading) return;

    if (!firebaseUser) {
      router.push('/connexion');
      return;
    }

    loadDemandes();
  }, [firebaseUser, authLoading, router]);

  useEffect(() => {
    const source = searchParams.get('source');
    if (source === 'directes' || source === 'publiees') {
      setSourceFilter(source);
      return;
    }
    setSourceFilter('toutes');
  }, [searchParams]);

  async function loadDemandes() {
    if (!firebaseUser) return;

    try {
      const user = await getUserById(firebaseUser.uid);
      setUserData(user);

      if (user?.role !== 'client') {
        alert(t('alerts.express.clientOnly'));
        router.push('/');
        return;
      }

      const demandesList = await getDemandesExpressByClient(firebaseUser.uid);

      const nowMs = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      // Demandes expirées ou refusées depuis > 24h → suppression définitive
      const toDelete = demandesList.filter((d) => {
        if (d.statut === 'expiree' && d.expiresAt && tsToDate(d.expiresAt).getTime() < nowMs - oneDayMs) return true;
        if (d.statut === 'refusee_artisan' && d.updatedAt && tsToDate(d.updatedAt).getTime() < nowMs - oneDayMs) return true;
        return false;
      });
      await Promise.all(toDelete.map((d) => deleteDemandeExpress(d.id)));

      // Demandes expirées : en attente sans réponse OU proposition reçue sans réponse client
      const toExpire = demandesList.filter(
        (d) =>
          (d.statut === 'en_attente_proposition' || d.statut === 'proposition_recue') &&
          d.expiresAt &&
          tsToDate(d.expiresAt).getTime() < nowMs
      );
      await Promise.all(toExpire.map((d) => updateDemandeExpressStatut(d.id, 'expiree')));

      // Auto-libération : travaux_termines > 24h → libérer le paiement automatiquement
      // SAUF si statut = 'litige' (paiement bloqué pour médiation)
      const toAutoRelease = demandesList.filter(
        (d) =>
          d.statut === 'travaux_termines' &&
          d.travauxTerminesAt &&
          tsToDate(d.travauxTerminesAt).getTime() < nowMs - oneDayMs
      );
      const autoReleasedIds = new Set<string>();
      for (const d of toAutoRelease) {
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL;
          if (apiUrl) {
            const resp = await fetch(`${apiUrl}/stripe-express/capture-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ demandeId: d.id }),
            });
            if (resp.ok) {
              await markTravauxValides(d.id);
              autoReleasedIds.add(d.id);
            }
          }
        } catch (e) {
          console.error('Auto-libération échouée pour', d.id, e);
        }
      }

      const updatedList = demandesList
        .filter((d) => !toDelete.some((td) => td.id === d.id))
        .map((d) => {
          if (toExpire.some((te) => te.id === d.id)) return { ...d, statut: 'expiree' as DemandeExpressStatut };
          if (autoReleasedIds.has(d.id)) return { ...d, statut: 'terminee' as DemandeExpressStatut };
          return d;
        });

      setDemandes(updatedList);

      // Pré-charger le montant exact payé (depuis paiements_express)
      const statutsAvecMontant: DemandeExpressStatut[] = ['payee', 'en_cours', 'travaux_termines', 'terminee'];
      const demandesAvecMontant = updatedList.filter(d => statutsAvecMontant.includes(d.statut));
      if (demandesAvecMontant.length > 0) {
        const paiementEntries = await Promise.all(
          demandesAvecMontant.map(async (d) => {
            try {
              const p = await getPaiementExpressByDemande(d.id);
              return [d.id, p?.montant ?? null] as [string, number | null];
            } catch {
              return [d.id, null] as [string, number | null];
            }
          })
        );
        setMontantsPaiementMap(prev => {
          const next = new Map(prev);
          paiementEntries.forEach(([id, montant]) => { if (montant != null) next.set(id as string, montant as number); });
          return next;
        });
      }

      // Charger le statut d'avis pour les demandes terminées
      const demandesTerminees = updatedList.filter(d => d.statut === 'terminee');
      if (demandesTerminees.length > 0) {
        const avisEntries = await Promise.all(
          demandesTerminees.map(async (d) => {
            try {
              const avis = await getAvisByContratId(d.id);
              return [d.id, avis !== null] as [string, boolean];
            } catch {
              return [d.id, false] as [string, boolean];
            }
          })
        );
        setAvisExistantsMap(prev => {
          const next = new Map(prev);
          avisEntries.forEach(([id, hasAvis]) => next.set(id as string, hasAvis as boolean));
          return next;
        });
      }

      // Charger les noms des artisans pour les demandes qui en ont
      const demandesAvecArtisan = updatedList.filter(d => d.artisanId);
      if (demandesAvecArtisan.length > 0) {
        const nomMap = new Map<string, string>();
        await Promise.all(
          demandesAvecArtisan.map(async (d) => {
            try {
              const artisan = await getArtisanByUserId(d.artisanId!);
              if (artisan) {
                const nom = (artisan as any).businessName || (artisan as any).raisonSociale || 'Artisan';
                nomMap.set(d.id, nom);
              }
            } catch {}
          })
        );
        setArtisanNomMap(nomMap);
      }
    } catch (error) {
      console.error('Erreur chargement demandes:', error);
    } finally {
      setLoading(false);
    }
  }

  // Demande expirée (délai dépassé)
  const isExpiree = (statut: DemandeExpressStatut) => statut === 'expiree';
  // Demande refusée par l'artisan ou annulée par le client
  const isRefuseeOuAnnulee = (statut: DemandeExpressStatut) => statut === 'refusee_artisan' || statut === 'annulee';
  // Demandes à exclure du fil actif (expirées OU refusées/annulées)
  const isExclueDesActives = (statut: DemandeExpressStatut) => isExpiree(statut) || isRefuseeOuAnnulee(statut);

  // Gardé pour compatibilité (non utilisé directement)
  const isExpireeOuRefusee = isExclueDesActives;
  const demandesExpirees = demandes.filter((d) => isExpiree(d.statut));
  const demandesActives = demandes.filter((d) => !isExclueDesActives(d.statut));

  const demandesFiltrees = demandes.filter((d) => {
    const isPublished = !d.artisanId;
    if (sourceFilter === 'directes' && isPublished) return false;
    if (sourceFilter === 'publiees' && !isPublished) return false;

    // Onglet "Toutes" : exclut les expirées ET les refusées/annulées
    if (filtreStatut === 'toutes') return !isExclueDesActives(d.statut);
    // Onglet "Expirées" : uniquement les expirées
    if (filtreStatut === 'expiree') return isExpiree(d.statut);
    if (filtreStatut === 'en_cours') {
      // Application du sous-filtre "En traitement"
      // 'acceptee' = proposition acceptée par le client, paiement en attente
      if (filtreEnTraitement === 'payee') return d.statut === 'acceptee' || d.statut === 'payee';
      if (filtreEnTraitement === 'en_cours') return d.statut === 'en_cours';
      if (filtreEnTraitement === 'travaux_termines') return d.statut === 'travaux_termines';
      // Sous-filtre "Refusée" : refus artisan + annulation client
      if (filtreEnTraitement === 'refusee') return isRefuseeOuAnnulee(d.statut);
      // Tous les sous-statuts "En traitement" (acceptée + payée + en cours + terminée + refusées)
      return ['acceptee', 'payee', 'en_cours', 'travaux_termines'].includes(d.statut) || isRefuseeOuAnnulee(d.statut);
    }
    return d.statut === filtreStatut;
  });

  // Compteurs des filtres source (excluent expirées ET refusées/annulées)
  const demandesDirectesCount = demandes.filter((d) => d.artisanId && !isExclueDesActives(d.statut)).length;
  const demandesPublieesCount = demandes.filter((d) => !d.artisanId && !isExclueDesActives(d.statut)).length;

  // Nombre de cloches actives filtrées selon le filtre source courant.
  // Evite d'afficher une alerte de proposition publiée quand l'utilisateur
  // navigue depuis le hub en mode "directes" (et vice-versa).
  const activeBellCount = sourceFilter === 'toutes'
    ? bellDemandeIds.size
    : [...bellDemandeIds].filter(id => {
        const d = demandes.find(dem => dem.id === id);
        if (!d) return false;
        const isPublished = !d.artisanId;
        return sourceFilter === 'directes' ? !isPublished : isPublished;
      }).length;

  const getStatutBadge = (statut: DemandeExpressStatut) => {
    const classes: Record<DemandeExpressStatut, string> = {
      en_attente_proposition: 'bg-yellow-100 text-yellow-800',
      proposition_recue: 'bg-blue-100 text-blue-800',
      acceptee: 'bg-green-100 text-green-800',
      payee: 'bg-purple-100 text-purple-800',
      en_cours: 'bg-indigo-100 text-indigo-800',
      travaux_termines: 'bg-amber-100 text-amber-800',
      litige: 'bg-red-600 text-white',
      terminee: 'bg-green-200 text-green-900',
      annulee: 'bg-red-100 text-red-800',
      expiree: 'bg-slate-200 text-slate-700',
      refusee_artisan: 'bg-orange-100 text-orange-800',
    };
    const className = classes[statut] || 'bg-slate-100 text-slate-800';
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${className}`}>
        {t(`clientExpressRequests.statuses.${statut}`)}
      </span>
    );
  };

  const getUrgenceBadge = (urgence: 'immediat' | 'urgent', typeTravauxExpress?: string) => {
    // Dépannage urgence → Immédiat 30 min - 1h (orange vif)
    if (typeTravauxExpress === 'depannage-urgence') {
      return <span className="px-2 py-1 rounded text-xs font-semibold bg-orange-100 text-orange-700">⚡ Immédiat (30 min - 1h)</span>;
    }
    // Petits travaux / legacy → En urgence 2h (rouge)
    return <span className="px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-700">🚨 En urgence (2h)</span>;
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-brand-500 mx-auto mb-4"></div>
          <p className="text-lg text-slate-500">{t('clientExpressRequests.loading')}</p>
        </div>
      </div>
    );
  }

  return (<>
    {/* ═══ MODALE CONSULTATION DEVIS JOINT ═══ */}
    {devisConsultModal?.devisJoint && (
      <div
        className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
        onClick={() => setDevisConsultModal(null)}
      >
        <div
          className="bg-white rounded-2xl shadow-lg w-full max-w-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* En-tête */}
          <div className="bg-navy-800 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
            <h2 className="text-lg font-bold">📋 Devis signé</h2>
            <button onClick={() => setDevisConsultModal(null)} className="text-white/70 hover:text-white text-2xl leading-none">×</button>
          </div>

          <div className="p-6 space-y-6">
            {/* Lignes de prestation */}
            <div>
              <h3 className="font-bold text-navy-800 mb-3 text-sm uppercase tracking-wide">Prestations</h3>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-slate-500 font-semibold">Description</th>
                      <th className="text-right px-4 py-2 text-slate-500 font-semibold">Qté</th>
                      <th className="text-right px-4 py-2 text-slate-500 font-semibold">PU HT</th>
                      <th className="text-right px-4 py-2 text-slate-500 font-semibold">Total HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devisConsultModal.devisJoint.lignes.map((ligne, i) => (
                      <tr key={i} className="border-t border-slate-200">
                        <td className="px-4 py-2 text-navy-800">{ligne.description || '—'}</td>
                        <td className="px-4 py-2 text-right text-slate-500">{ligne.quantite} {ligne.unite}</td>
                        <td className="px-4 py-2 text-right text-slate-500">{ligne.prixUnitaireHT.toFixed(2)} €</td>
                        <td className="px-4 py-2 text-right font-semibold text-navy-800">{ligne.totalHT.toFixed(2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Main d'œuvre */}
            {devisConsultModal.devisJoint.mainOeuvre && devisConsultModal.devisJoint.mainOeuvre.prixHT > 0 && (
              <div>
                <h3 className="font-bold text-navy-800 mb-2 text-sm uppercase tracking-wide">Main d'œuvre</h3>
                <div className="bg-slate-50 rounded-lg px-4 py-3 flex justify-between text-sm">
                  <span className="text-slate-500">{devisConsultModal.devisJoint.mainOeuvre.quantite} {devisConsultModal.devisJoint.mainOeuvre.unite} — TVA {devisConsultModal.devisJoint.mainOeuvre.tauxTVA}%</span>
                  <span className="font-semibold text-navy-800">{devisConsultModal.devisJoint.mainOeuvre.prixHT.toFixed(2)} € HT</span>
                </div>
              </div>
            )}

            {/* Matières premières */}
            {devisConsultModal.devisJoint.matierePremiere && (
              <div>
                <h3 className="font-bold text-navy-800 mb-2 text-sm uppercase tracking-wide">Matières premières</h3>
                <div className="bg-slate-50 rounded-lg px-4 py-3 flex justify-between text-sm">
                  <span className="text-slate-500">{devisConsultModal.devisJoint.matierePremiere.quantite} {devisConsultModal.devisJoint.matierePremiere.unite} — TVA {devisConsultModal.devisJoint.matierePremiere.tauxTVA}%</span>
                  <span className="font-semibold text-navy-800">{devisConsultModal.devisJoint.matierePremiere.prixHT.toFixed(2)} € HT</span>
                </div>
              </div>
            )}

            {/* Totaux */}
            <div className="bg-brand-700/5 border border-brand-500/20 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm text-slate-500">
                <span>Total HT</span><span>{devisConsultModal.devisJoint.totaux.totalHT.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-sm text-slate-500">
                <span>TVA</span><span>{devisConsultModal.devisJoint.totaux.totalTVAGlobal.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-brand-700 border-t border-brand-500/20 pt-2">
                <span>Total TTC</span><span>{devisConsultModal.devisJoint.totaux.totalTTC.toFixed(2)} €</span>
              </div>
            </div>

            {/* Conditions */}
            {(devisConsultModal.devisJoint.delaiRealisation || devisConsultModal.devisJoint.dateDebutPrevue || devisConsultModal.devisJoint.conditions) && (
              <div className="space-y-2 text-sm border-t border-slate-200 pt-4">
                {devisConsultModal.devisJoint.delaiRealisation && (
                  <div className="flex gap-2"><span className="text-slate-500 font-semibold min-w-32">Délai :</span><span>{devisConsultModal.devisJoint.delaiRealisation}</span></div>
                )}
                {devisConsultModal.devisJoint.dateDebutPrevue && (
                  <div className="flex gap-2"><span className="text-slate-500 font-semibold min-w-32">Début prévu :</span><span>{devisConsultModal.devisJoint.dateDebutPrevue}</span></div>
                )}
                {devisConsultModal.devisJoint.conditions && (
                  <div className="flex gap-2"><span className="text-slate-500 font-semibold min-w-32">Conditions :</span><span>{devisConsultModal.devisJoint.conditions}</span></div>
                )}
              </div>
            )}

            {/* Signatures */}
            <div className="border-t border-slate-200 pt-4 grid grid-cols-2 gap-4">
              {devisConsultModal.devisJoint.signatureArtisan?.dataURL && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">✍️ Signature artisan</p>
                  <img src={devisConsultModal.devisJoint.signatureArtisan.dataURL} alt="Signature artisan" className="h-14 border border-slate-200 rounded-lg bg-white p-1 w-full object-contain" />
                </div>
              )}
              {devisConsultModal.devisJoint.signatureClient?.dataURL && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">✍️ Votre signature</p>
                  <img src={devisConsultModal.devisJoint.signatureClient.dataURL} alt="Signature client" className="h-14 border border-slate-200 rounded-lg bg-white p-1 w-full object-contain" />
                </div>
              )}
            </div>
          </div>

          <div className="px-6 pb-6 flex gap-3">
            {/* Bouton télécharger le PDF */}
            <button
              onClick={async () => {
                if (!devisConsultModal?.id) return;
                // Ouvre la page d'impression dans un nouvel onglet (comme le devis classique)
                window.open(`/devis-express-print/${devisConsultModal.id}`, '_blank');
              }}
              className="flex-1 flex items-center justify-center gap-2 bg-navy-800 text-white px-4 py-3 rounded-lg hover:bg-navy-900 transition-colors font-semibold"
            >
              🖨️ Imprimer / PDF
            </button>
            <button
              onClick={() => setDevisConsultModal(null)}
              className="flex-1 bg-brand-700 text-white px-4 py-3 rounded-lg hover:bg-brand-800 transition-colors font-semibold"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    )}

    <div className="min-h-screen bg-slate-50">

      {/* Bande bleue — identique à /client/demandes-hub */}
      <div className="bg-navy-800 text-white py-8 px-4">
        <div className="container mx-auto">
          <button
            onClick={() => router.push('/client/demandes-hub')}
            className="flex items-center gap-2 text-white hover:text-brand-300 mb-4 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour à Mes Demandes
          </button>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">
                {t('clientExpressRequests.pageTitle')}
              </h1>
              <p className="text-slate-300 text-sm mt-1">
                {t('clientExpressRequests.pageSubtitle')}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowHowItWorks(v => !v)}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm font-semibold whitespace-nowrap border border-white/20"
              >
                <span>ℹ️</span> Comment ça marche ?
              </button>
              <Button
                onClick={() => router.push('/petits-travaux-express/recherche')}
                className="whitespace-nowrap"
              >
                {t('clientExpressRequests.newRequest')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">

        {/* Panneau comment ça marche */}
        {showHowItWorks && (
          <div className="mb-6 bg-blue-50 border-2 border-blue-200 rounded-xl p-5 text-sm text-slate-500">
            <ul className="space-y-2">
              <li><strong>1.</strong> {t('clientExpressRequests.howItWorks.step1')}</li>
              <li><strong>2.</strong> {t('clientExpressRequests.howItWorks.step2')}</li>
              <li><strong>3.</strong> {t('clientExpressRequests.howItWorks.step3')}</li>
              <li><strong>4.</strong> {t('clientExpressRequests.howItWorks.step4')}</li>
              <li><strong>5.</strong> {t('clientExpressRequests.howItWorks.step5')}</li>
            </ul>
          </div>
        )}

        {/* Filtres — style cartes moderne (identique à /client/demandes) */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">

          {/* Toutes */}
          <button
            onClick={() => { setFiltreStatut('toutes'); setFiltreEnTraitement('toutes'); setSourceFilter('toutes'); }}
            className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-0.5 ${
              filtreStatut === 'toutes' && sourceFilter === 'toutes'
                ? ' bg-brand-600 text-white shadow-md scale-105'
                : 'bg-white hover:bg-slate-50 shadow-md hover:shadow-lg border border-slate-100'
            }`}
          >
            <div className={`text-3xl font-black mb-1 ${filtreStatut === 'toutes' && sourceFilter === 'toutes' ? 'text-white' : 'text-brand-700'}`}>
              {demandesActives.length}
              {showToutsBell && <span className="ml-1 animate-bounce text-lg">🔔</span>}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${filtreStatut === 'toutes' && sourceFilter === 'toutes' ? 'text-white' : 'text-slate-600'}`}>
              Toutes
            </div>
          </button>

          {/* Envoyées */}
          <button
            onClick={() => { setFiltreStatut('en_attente_proposition'); setFiltreEnTraitement('toutes'); setSourceFilter('toutes'); }}
            className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-0.5 ${
              filtreStatut === 'en_attente_proposition'
                ? ' bg-orange-500 text-white shadow-md scale-105'
                : 'bg-white hover:bg-slate-50 shadow-md hover:shadow-lg border border-slate-100'
            }`}
          >
            <div className={`text-3xl font-black mb-1 ${filtreStatut === 'en_attente_proposition' ? 'text-white' : 'text-orange-500'}`}>
              {demandes.filter(d => d.statut === 'en_attente_proposition').length}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${filtreStatut === 'en_attente_proposition' ? 'text-white' : 'text-slate-600'}`}>
              ⏳ Envoyées
            </div>
          </button>

          {/* Publiées */}
          <button
            onClick={() => { setSourceFilter(sourceFilter === 'publiees' ? 'toutes' : 'publiees'); setFiltreStatut('toutes'); setFiltreEnTraitement('toutes'); }}
            className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-0.5 ${
              sourceFilter === 'publiees'
                ? ' bg-purple-500 text-white shadow-md scale-105'
                : 'bg-white hover:bg-slate-50 shadow-md hover:shadow-lg border border-slate-100'
            }`}
          >
            <div className={`text-3xl font-black mb-1 ${sourceFilter === 'publiees' ? 'text-white' : 'text-purple-600'}`}>
              {demandesPublieesCount}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${sourceFilter === 'publiees' ? 'text-white' : 'text-slate-600'}`}>
              📢 Publiées
            </div>
          </button>

          {/* Propositions reçues */}
          <button
            onClick={() => { setFiltreStatut('proposition_recue'); setFiltreEnTraitement('toutes'); setSourceFilter('toutes'); }}
            className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-0.5 ${
              filtreStatut === 'proposition_recue'
                ? ' bg-blue-500 text-white shadow-md scale-105'
                : activeBellCount > 0
                  ? 'bg-blue-50 hover:bg-blue-100 shadow-lg border-2 border-blue-400 ring-2 ring-blue-300 ring-opacity-50'
                  : 'bg-white hover:bg-slate-50 shadow-md hover:shadow-lg border border-slate-100'
            }`}
          >
            <div className={`text-3xl font-black mb-1 ${filtreStatut === 'proposition_recue' ? 'text-white' : 'text-blue-600'}`}>
              {demandes.filter(d => d.statut === 'proposition_recue').length}
              {/* Badge 🔔 sur le tab quand des propositions non lues arrivent */}
              {activeBellCount > 0 && filtreStatut !== 'proposition_recue' && (
                <span className="ml-1 animate-bounce text-lg" title={`${activeBellCount} nouvelle(s) proposition(s)`}>🔔</span>
              )}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${
              filtreStatut === 'proposition_recue' ? 'text-white'
              : activeBellCount > 0 ? 'text-blue-700'
              : 'text-slate-600'
            }`}>
              📋 Propositions reçues
            </div>
          </button>

          {/* En traitement */}
          <button
            onClick={() => { setFiltreStatut('en_cours'); setFiltreEnTraitement('toutes'); setSourceFilter('toutes'); }}
            className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-0.5 ${
              filtreStatut === 'en_cours'
                ? ' bg-indigo-500 text-white shadow-md scale-105'
                : bellTravauxIds.size > 0
                  ? 'bg-amber-50 hover:bg-amber-100 shadow-lg border-2 border-amber-400 ring-2 ring-amber-300 ring-opacity-50'
                  : 'bg-white hover:bg-slate-50 shadow-md hover:shadow-lg border border-slate-100'
            }`}
          >
            <div className={`text-3xl font-black mb-1 ${filtreStatut === 'en_cours' ? 'text-white' : 'text-indigo-600'}`}>
              {demandes.filter(d => ['acceptee', 'payee', 'en_cours', 'travaux_termines', 'refusee_artisan', 'annulee'].includes(d.statut)).length}
              {/* Badge 🔔 quand les travaux sont terminés (action requise : valider) */}
              {bellTravauxIds.size > 0 && filtreStatut !== 'en_cours' && (
                <span className="ml-1 animate-bounce text-lg" title="Travaux terminés — action requise">🔔</span>
              )}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${
              filtreStatut === 'en_cours' ? 'text-white'
              : bellTravauxIds.size > 0 ? 'text-amber-700'
              : 'text-slate-600'
            }`}>
              🔧 En traitement
            </div>
          </button>

          {/* Validées */}
          <button
            onClick={() => { setFiltreStatut('terminee'); setFiltreEnTraitement('toutes'); setSourceFilter('toutes'); }}
            className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-0.5 ${
              filtreStatut === 'terminee'
                ? ' bg-green-500 text-white shadow-md scale-105'
                : 'bg-white hover:bg-slate-50 shadow-md hover:shadow-lg border border-slate-100'
            }`}
          >
            <div className={`text-3xl font-black mb-1 ${filtreStatut === 'terminee' ? 'text-white' : 'text-green-600'}`}>
              {demandes.filter(d => d.statut === 'terminee').length}
            </div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${filtreStatut === 'terminee' ? 'text-white' : 'text-slate-600'}`}>
              ✅ Validées
            </div>
          </button>

        </div>

        {/* Sous-menu "En traitement" : affiché uniquement quand ce filtre est actif */}
        {filtreStatut === 'en_cours' && (
          <div className="mb-6 flex flex-wrap gap-2 pl-4 border-l-4 border-brand-500">
            <span className="text-sm font-semibold text-slate-500 self-center mr-1">Sous-filtre :</span>
            <button
              onClick={() => setFiltreEnTraitement('toutes')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                filtreEnTraitement === 'toutes'
                  ? 'bg-brand-700 text-white'
                  : 'bg-white text-navy-800 border border-slate-200 hover:bg-brand-50'
              }`}
            >
              Tous ({demandes.filter(d => ['acceptee', 'payee', 'en_cours', 'travaux_termines', 'refusee_artisan', 'annulee'].includes(d.statut)).length})
            </button>
            <button
              onClick={() => setFiltreEnTraitement('payee')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                filtreEnTraitement === 'payee'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-purple-700 border border-purple-200 hover:bg-purple-50'
              }`}
            >
              ✅ Acceptée / Payée — Attente travaux ({demandes.filter(d => d.statut === 'acceptee' || d.statut === 'payee').length})
            </button>
            <button
              onClick={() => setFiltreEnTraitement('en_cours')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                filtreEnTraitement === 'en_cours'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50'
              }`}
            >
              🔧 En cours ({demandes.filter(d => d.statut === 'en_cours').length})
            </button>
            <button
              onClick={() => setFiltreEnTraitement('travaux_termines')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                filtreEnTraitement === 'travaux_termines'
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
              }`}
            >
              ⏳ Terminée - Attente Validation ({demandes.filter(d => d.statut === 'travaux_termines').length})
            </button>
            {/* Sous-filtre : demandes refusées par l'artisan ou annulées par le client */}
            <button
              onClick={() => setFiltreEnTraitement('refusee')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                filtreEnTraitement === 'refusee'
                  ? 'bg-red-600 text-white'
                  : 'bg-white text-red-700 border border-red-200 hover:bg-red-50'
              }`}
            >
              ❌ Refusée ({demandes.filter(d => d.statut === 'refusee_artisan' || d.statut === 'annulee').length})
            </button>
          </div>
        )}

        {/* Liste des demandes */}
        {demandesFiltrees.length === 0 ? (
          filtreStatut === 'toutes' && sourceFilter === 'toutes' ? (
            <Card className="text-center py-12">
              <p className="text-xl text-slate-500">
                {t('clientExpressRequests.empty.all')}
              </p>
            </Card>
          ) : (
            <Card className="text-center py-16">
              <div className="text-5xl mb-4">🔍</div>
              <p className="text-xl font-semibold text-navy-800 mb-2">
                Aucune demande dans cette catégorie
              </p>
              <p className="text-sm text-slate-500">
                Essayez une autre catégorie
              </p>
            </Card>
          )
        ) : (
          <div className="grid gap-6">
            {demandesFiltrees.map((demande) => {
              const isExpanded = expandedIds.has(demande.id);
              const canExpand = true;
              return (
              <div
                key={demande.id}
                className={`bg-white rounded-2xl shadow-md transition-all duration-300 relative border-2 overflow-hidden ${
                  canExpand && isExpanded
                    ? 'border-brand-500 ring-1 ring-brand-500 ring-opacity-30'
                    : demande.statut === 'proposition_recue' && !isExpanded
                      ? 'border-blue-400 ring-2 ring-blue-300 ring-opacity-50 shadow-lg'
                      : 'border-transparent hover:border-slate-200 hover:shadow-md'
                }`}
              >
                {/* Bandeau "Nouvelle proposition" — visible uniquement sur les cartes non déployées */}
                {demande.statut === 'proposition_recue' && !isExpanded && (
                  <div className="bg-blue-500 text-white text-xs font-bold px-4 py-1.5 flex items-center gap-2">
                    <span className="animate-bounce">🔔</span>
                    <span>Nouvelle proposition reçue — dépliez pour consulter et répondre</span>
                  </div>
                )}

                {/* Barre latérale orange */}
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-brand-600 " />

                {/* Cloche nouvelle proposition */}
                {bellDemandeIds.has(demande.id) && (
                  <div className="absolute top-4 left-5 z-10">
                    <span className="animate-bounce text-xl" title="Nouvelle proposition !">🔔</span>
                  </div>
                )}
                {/* Cloche travaux terminés ou intervention démarrée (action ou info) */}
                {!bellDemandeIds.has(demande.id) && bellTravauxIds.has(demande.id) && (
                  <div className="absolute top-4 left-5 z-10">
                    <span className="animate-bounce text-xl" title={demande.statut === 'travaux_termines' ? 'Travaux terminés — validation requise' : 'Artisan en route'}>
                      {demande.statut === 'travaux_termines' ? '⏳' : '🔧'}
                    </span>
                  </div>
                )}

                {/* Bouton expand/collapse avec libellé explicite */}
                {canExpand && (
                <button
                  onClick={() => toggleExpand(demande.id, demande.statut)}
                  className={`absolute top-4 right-4 flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all duration-200 group border ${
                    isExpanded ? 'bg-orange-50 border-brand-500' : 'bg-white border-slate-200 hover:border-brand-500 hover:bg-orange-50'
                  }`}
                >
                  <span className={`text-xs font-semibold transition-colors ${
                    isExpanded ? 'text-brand-700' : 'text-slate-500 group-hover:text-brand-700'
                  }`}>
                    {isExpanded ? 'Réduire' : 'Afficher détails'}
                  </span>
                  <svg
                    className={`w-4 h-4 transition-all duration-200 ${
                      isExpanded ? 'rotate-180 text-brand-700' : 'text-slate-400 group-hover:text-brand-700'
                    }`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                )}

                {/* Contenu principal - toujours visible */}
                <div
                  className={`p-6 pl-8 ${canExpand ? 'pr-40 cursor-pointer' : 'pr-6'}`}
                  onClick={canExpand ? () => toggleExpand(demande.id, demande.statut) : undefined}
                >
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    {/* Badge statut — message sp\u00e9cifique si proposition r\u00e9cemment refus\u00e9e */}
                    {demande.statut === 'en_attente_proposition' && refusedDemandeIds.has(demande.id) ? (
                      <span className="px-3 py-1 rounded-full text-sm font-semibold bg-orange-100 text-orange-800">
                        ↩️ Proposition refusée
                      </span>
                    ) : (
                      getStatutBadge(demande.statut)
                    )}
                    {getUrgenceBadge(demande.urgence, demande.typeTravauxExpress)}
                    {demande.expiresAt && demande.statut === 'en_attente_proposition' && (
                      <span className="px-3 py-1 bg-orange-50 border border-orange-200 text-orange-600 rounded-full text-xs font-semibold">
                        ⏱️ Expire le {format(tsToDate(demande.expiresAt), 'dd MMMM à HH:mm', { locale: fr })} ({getExpressArtisanWindowLabel(demande)})
                      </span>
                    )}
                    {['payee', 'en_cours', 'travaux_termines', 'terminee'].includes(demande.statut) ? (
                      montantsPaiementMap.has(demande.id) && (
                        <span className="px-3 py-1 bg-brand-700 text-white rounded-full text-sm font-bold">
                          💰 {montantsPaiementMap.get(demande.id)}€
                        </span>
                      )
                    ) : (
                      demande.budgetPropose && (
                        <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                          {t('clientExpressRequests.card.budgetProposed').replace('{amount}', String(demande.budgetPropose))}
                        </span>
                      )
                    )}
                  </div>

                  <h3 className="text-xl font-bold text-navy-800 mb-2">
                    {artisanNomMap.has(demande.id) && (
                      <span className="text-navy-800">{artisanNomMap.get(demande.id)} - </span>
                    )}
                    {demande.categorie.charAt(0).toUpperCase() + demande.categorie.slice(1)}
                    {demande.sousCategorie && ` - ${demande.sousCategorie}`}
                  </h3>

                  <p className="text-slate-500 mb-3 line-clamp-3 break-all whitespace-pre-wrap overflow-hidden">
                    {demande.description}
                  </p>

                  <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                    <span>📍 {demande.ville} ({demande.codePostal})</span>
                    <span>{t('clientExpressRequests.card.createdOn')} {format(tsToDate(demande.createdAt), 'dd MMMM yyyy à HH:mm', { locale: fr })}</span>

                    {/* Date de début des travaux (artisan a cliqué sur "Début des travaux") */}
                    {demande.travauxDebutAt && (
                      <span className="text-blue-700 font-semibold">
                        🔧 Début Travaux : {format(tsToDate(demande.travauxDebutAt), 'dd MMMM yyyy à HH:mm', { locale: fr })}
                      </span>
                    )}

                    {/* Date de fin des travaux — réelle si déclarée, sinon délai estimé */}
                    {demande.travauxTerminesAt ? (
                      <span className="text-green-700 font-semibold">
                        ✅ Fin Travaux : {format(tsToDate(demande.travauxTerminesAt), 'dd MMMM yyyy à HH:mm', { locale: fr })}
                      </span>
                    ) : (['payee', 'en_cours', 'travaux_termines'].includes(demande.statut) && !demande.travauxDebutAt) ? (
                      <span className="text-blue-700 font-semibold">
                        ⏱️ Intervention sous {getExpressArtisanWindowLabel(demande)}
                      </span>
                    ) : null}
                  </div>

                  {demande.statut === 'en_attente_proposition' && !demande.artisanId && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-lg">⏳</span>
                      <p className="text-sm text-yellow-800 font-medium">Votre demande est en ligne. Un artisan va bientôt vous faire une proposition.</p>
                    </div>
                  )}
                </div>

                {/* Zone dépliée */}
                {isExpanded && (() => {
                  const prop = propositionsMap.get(demande.id);
                  const propositionCount = propositionsCountMap.get(demande.id) || 0;
                  const isPublished = !demande.artisanId;
                  const loadingProp = loadingPropsIds.has(demande.id);
                  return (
                    <div className="border-t border-slate-100">
                      {/* Adresse si disponible */}
                      {demande.adresse && (
                        <div className="px-8 py-3 bg-slate-50 border-b border-slate-100">
                          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-0.5">📍 Adresse complète</p>
                          <p className="text-sm font-medium text-navy-800">{demande.adresse}</p>
                        </div>
                      )}

                      {/* Photos du chantier */}
                      {demande.photos && demande.photos.length > 0 && (
                        <div className="px-8 py-4 border-b border-slate-100">
                          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-2">
                            📷 Photos ({demande.photos.length})
                          </p>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {demande.photos.map((url: string, i: number) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={url}
                                  alt={`Photo ${i + 1}`}
                                  className="w-full h-24 object-cover rounded-lg border-2 border-slate-200 hover:border-brand-500 transition-colors cursor-pointer"
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="px-8 py-5 space-y-4">

                        {/* En attente de proposition */}
                        {demande.statut === 'en_attente_proposition' && (
                          <div className={`border-2 rounded-xl p-5 ${refusedDemandeIds.has(demande.id) ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'}`}>
                            <div className="flex items-start gap-3">
                              <span className="text-3xl">{refusedDemandeIds.has(demande.id) ? '↩️' : '⏳'}</span>
                              <div className="flex-1">
                                {refusedDemandeIds.has(demande.id) ? (
                                  <>
                                    <p className="font-bold text-orange-900 mb-2 text-lg">Proposition refusée</p>
                                    <p className="text-sm text-orange-800 mb-3">
                                      {/* Message adapté selon le type de demande : directe ou publiée */}
                                      {demande.artisanId
                                        ? "Vous avez refusé la proposition. L'artisan peut vous soumettre une nouvelle proposition si vous le souhaitez."
                                        : "Vous avez refusé la proposition. La demande est de nouveau ouverte aux artisans."
                                      }
                                    </p>
                                  </>
                                ) : (
                                  <>
                                    <p className="font-bold text-blue-900 mb-2 text-lg">En attente d'une proposition</p>
                                    {demande.artisanId ? (
                                      <p className="text-sm text-blue-800 mb-3">
                                        L'artisan a été notifié de votre demande. Il va vous envoyer une proposition dans les prochaines heures.
                                      </p>
                                    ) : (
                                      <p className="text-sm text-blue-800 mb-3">
                                        Votre demande est publiée. Les artisans qualifiés de votre secteur vont la consulter et vous enverront des propositions rapidement.
                                      </p>
                                    )}
                                  </>
                                )}
                                {demande.expiresAt && (() => {
                                  const diff = tsToDate(demande.expiresAt).getTime() - Date.now();
                                  if (diff > 0) {
                                    const hours = Math.floor(diff / (60 * 60 * 1000));
                                    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
                                    return (
                                      <p className="text-xs text-blue-700 bg-blue-100 inline-block px-3 py-1.5 rounded-lg">
                                        ⏱️ Expire dans {hours}h{minutes > 0 ? ` ${minutes}min` : ''} - Délai pour recevoir une proposition ({getExpressArtisanWindowLabel(demande)})
                                      </p>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Proposition reçue — chargement */}
                        {demande.statut === 'proposition_recue' && loadingProp && (
                          <div className="flex items-center gap-3 py-4">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-500" />
                            <p className="text-sm text-slate-500">Chargement de la proposition…</p>
                          </div>
                        )}

                        {/* Proposition reçue — affichage */}
                        {demande.statut === 'proposition_recue' && !loadingProp && prop && (
                          <div className="space-y-4">
                            {isPublished && propositionCount > 1 && (
                              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
                                <p className="text-sm text-amber-900 font-medium mb-3">
                                  📢 Cette demande publiée a reçu {propositionCount} propositions.
                                  Comparez-les avant de choisir un artisan.
                                </p>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/client/demandes-express/${demande.id}`);
                                  }}
                                  className="px-4 py-2 bg-navy-800 text-white rounded-lg hover:bg-navy-900 text-sm font-semibold"
                                >
                                  Comparer les propositions
                                </button>
                              </div>
                            )}

                            {/* Header proposition */}
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className="text-base font-bold text-navy-800">💬 Proposition de l&apos;artisan</span>
                              <span className="text-xs text-slate-500">
                                Reçue le {prop.createdAt ? format(tsToDate(prop.createdAt), 'dd MMM yyyy à HH:mm', { locale: fr }) : ''}
                              </span>
                            </div>

                            {/* Montant + comparaison budget */}
                            <div className="flex items-center gap-4 p-4 bg-brand-50 rounded-xl">
                              <div>
                                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-0.5">Montant proposé TTC</p>
                                <p className="text-4xl font-extrabold text-brand-700">{prop.montantPropose}€</p>
                              </div>
                              {demande.budgetPropose && (
                                <div className="ml-auto text-right">
                                  <p className="text-xs text-slate-500 mb-0.5">Votre budget</p>
                                  <p className="text-xl font-bold text-slate-500">{demande.budgetPropose}€</p>
                                  {prop.montantPropose <= demande.budgetPropose
                                    ? <p className="text-xs text-green-600 font-semibold mt-0.5">✅ Dans votre budget</p>
                                    : <p className="text-xs text-orange-600 font-semibold mt-0.5">⚠️ Au-dessus de votre budget</p>
                                  }
                                </div>
                              )}
                            </div>

                            {/* Description */}
                            <div>
                              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">📝 Ce qui est inclus</p>
                              <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-sm text-navy-800 whitespace-pre-wrap break-words leading-relaxed">{prop.description}</p>
                              </div>
                            </div>

                            {/* Délai */}
                            {prop.delaiIntervention && (
                              <div>
                                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">⏱️ Délai d&apos;intervention</p>
                                <span className="bg-purple-100 text-purple-800 px-3 py-1.5 rounded-lg text-sm font-semibold">
                                  {prop.delaiIntervention}
                                </span>
                              </div>
                            )}

                            {/* Boutons d'action */}
                            {!isPublished || propositionCount <= 1 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                                <button
                                  onClick={(e) => { e.stopPropagation(); motifRefusField.reset(); setRefusModal({ id: demande.id, propId: prop.id }); }}
                                  disabled={submitting}
                                  className="px-4 py-2.5 border-2 border-red-400 text-red-600 rounded-xl hover:bg-red-50 font-semibold text-sm transition-all disabled:opacity-50"
                                >
                                  ❌ Refuser
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleAccepterInline(demande.id, prop.id, prop); }}
                                  disabled={submitting}
                                  className="px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 font-bold text-sm transition-all disabled:opacity-50 shadow"
                                >
                                  {submitting ? '⏳…' : prop.devisJoint ? '📋 Signer le devis et payer' : '✅ Accepter et payer'}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        )}

                        {/* Proposition reçue mais absente en base */}
                        {demande.statut === 'proposition_recue' && !loadingProp && !prop && (
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 font-medium">
                            💬 Une proposition a été reçue. Cliquez sur &quot;Voir détails&quot; pour la consulter.
                          </div>
                        )}

                        {/* Acceptée — en attente de paiement client */}
                        {demande.statut === 'acceptee' && (
                          <div className="flex items-center gap-3 bg-purple-50 border-2 border-purple-300 rounded-xl p-4">
                            <span className="text-2xl">✅</span>
                            <div className="flex-1">
                              <p className="text-sm text-purple-900 font-semibold">Proposition acceptée — en attente de paiement</p>
                              <p className="text-xs text-purple-700 mt-1">Le paiement sécurise l&apos;intervention. L&apos;artisan interviendra dès réception.</p>
                            </div>
                            {prop && (
                              <button
                                onClick={(e) => { e.stopPropagation(); router.push(`/client/paiement-express/${prop.id}`); }}
                                className="shrink-0 px-4 py-2 bg-brand-700 text-white rounded-lg hover:bg-brand-800 text-sm font-semibold transition-all"
                              >
                                💳 Payer maintenant
                              </button>
                            )}
                          </div>
                        )}

                        {/* En cours */}
                        {demande.statut === 'en_cours' && (
                          <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                            <span className="text-2xl">🔧</span>
                            <p className="flex-1 text-sm text-indigo-800 font-medium">L&apos;artisan est en cours d&apos;intervention. Vous serez notifié à la fin.</p>
                            {prop?.devisJoint && (
                              <button
                                onClick={() => setDevisConsultModal(prop)}
                                className="shrink-0 flex items-center gap-1.5 bg-navy-800 text-white px-3 py-2 rounded-lg hover:bg-navy-900 transition-colors text-xs font-semibold"
                              >
                                📋 Voir le devis
                              </button>
                            )}
                          </div>
                        )}

                        {/* Payée */}
                        {demande.statut === 'payee' && (
                          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
                            <span className="text-2xl">💳</span>
                            <div className="flex-1">
                              <p className="text-sm text-green-800 font-medium">Paiement confirmé.</p>
                              {prop && <p className="text-sm text-green-700">Montant sécurisé : <strong>{prop.montantPropose}€</strong></p>}
                            </div>
                            {/* Bouton devis si montant > 150€ avec devis joint */}
                            {prop?.devisJoint && (
                              <button
                                onClick={() => setDevisConsultModal(prop)}
                                className="shrink-0 flex items-center gap-1.5 bg-navy-800 text-white px-3 py-2 rounded-lg hover:bg-navy-900 transition-colors text-xs font-semibold"
                              >
                                📋 Voir le devis
                              </button>
                            )}
                          </div>
                        )}

                        {/* Travaux terminés - validation client requise */}
                        {demande.statut === 'travaux_termines' && (
                          <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                              <span className="text-2xl">⏳</span>
                              <div className="flex-1">
                                <p className="font-bold text-navy-800 mb-1">L&apos;artisan a terminé les travaux</p>
                                <p className="text-sm text-amber-800 mb-1">Validez pour libérer le paiement à l&apos;artisan.</p>
                                <p className="text-xs text-slate-500 mb-3">
                                  Si vous ne validez pas dans 24h, le paiement sera libéré automatiquement.
                                  {demande.travauxTerminesAt && (() => {
                                    const autoAt = tsToDate(demande.travauxTerminesAt!).getTime() + 24 * 60 * 60 * 1000;
                                    const rem = autoAt - Date.now();
                                    if (rem > 0) {
                                      const h = Math.floor(rem / 3600000);
                                      const m = Math.floor((rem % 3600000) / 60000);
                                      return ` (auto-libération dans ${h}h${m > 0 ? ` ${m}min` : ''})`;
                                    }
                                    return null;
                                  })()}
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleSignalerProbleme(demande.id); }}
                                    disabled={validatingId === demande.id}
                                    className="px-4 py-3 border-2 border-red-400 text-red-600 rounded-xl hover:bg-red-50 font-bold text-sm transition-all disabled:opacity-50"
                                  >
                                    {t('clientExpressRequests.dispute.reportButton')}
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleValiderTravaux(demande.id); }}
                                    disabled={validatingId === demande.id}
                                    className="px-4 py-3 bg-green-700 text-white rounded-xl hover:bg-green-700 font-bold text-sm transition-all disabled:opacity-50"
                                  >
                                    {validatingId === demande.id ? '⏳ Libération du paiement...' : t('clientExpressRequests.dispute.validateButton')}
                                  </button>
                                </div>
                                {/* Bouton consultation devis joint si montant > 150€ */}
                                {prop?.devisJoint && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setDevisConsultModal(prop); }}
                                    className="w-full flex items-center justify-center gap-1.5 bg-navy-800 text-white px-3 py-2 rounded-lg hover:bg-navy-900 transition-colors text-xs font-semibold"
                                  >
                                    📋 Consulter / Télécharger le devis
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Litige en cours */}
                        {demande.statut === 'litige' && (
                          <div className="bg-red-50 border-2 border-red-400 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                              <span className="text-2xl">🚨</span>
                              <div className="flex-1">
                                <p className="font-bold text-red-900 mb-1">{t('clientExpressRequests.dispute.disputeInProgress')}</p>
                                <p className="text-sm text-red-800">{t('clientExpressRequests.dispute.disputeMessage')}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Terminée — bouton avis conditionnel */}
                        {demande.statut === 'terminee' && (() => {
                          const dejaEvalue = avisExistantsMap.get(demande.id) === true;
                          return (
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
                                <span className="text-2xl">✅</span>
                                <p className="text-sm text-green-800 font-medium">Intervention terminée avec succès.</p>
                              </div>
                              {/* Bouton consultation devis joint si montant > 150€ */}
                              {prop?.devisJoint && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDevisConsultModal(prop); }}
                                  className="w-full flex items-center justify-center gap-1.5 bg-navy-800 text-white px-3 py-2 rounded-lg hover:bg-navy-900 transition-colors text-xs font-semibold"
                                >
                                  📋 Consulter / Télécharger le devis
                                </button>
                              )}
                              {dejaEvalue ? (
                                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-5 py-3">
                                  <span className="text-lg">⭐</span>
                                  <p className="text-sm text-slate-500 italic">Votre évaluation a bien été prise en compte. Merci pour votre retour.</p>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAvisDemandeId(demande.id);
                                    setAvisArtisanId(demande.artisanId ?? null);
                                    setAvisNote(0);
                                    setAvisNoteHover(0);
                                    setAvisCommentaire('');
                                    setAvisPointsForts([]);
                                    setAvisPointsAmelioration([]);
                                    setShowAvisPopup(true);
                                  }}
                                  className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-brand-700 hover:bg-brand-800 text-white rounded-xl font-semibold transition-colors"
                                >
                                  ⭐ Évaluer cette intervention
                                </button>
                              )}
                            </div>
                          );
                        })()}

                      </div>
                    </div>
                  );
                })()}
              </div>
              );
            })}
          </div>
        )}

      </div>
    </div>

    {/* ── Modale Signature Devis (propositions > 150€) ───────────── */}
    {signatureDevisModal && (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg my-4">
          {/* En-tête */}
          <div className="bg-navy-800 text-white rounded-t-2xl px-6 py-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">📋 Signature du devis</h2>
              <p className="text-sm text-slate-300 mt-0.5">
                Montant : <strong className="text-brand-700">{signatureDevisModal.prop.devisJoint!.totaux.totalTTC.toFixed(2)}€ TTC</strong>
              </p>
            </div>
            <button
              onClick={() => setSignatureDevisModal(null)}
              className="text-slate-300 hover:text-white text-2xl leading-none"
            >
              ×
            </button>
          </div>

          {/* Corps */}
          <div className="p-6 space-y-4">
            {/* Récapitulatif devis */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Prestations</p>
              <div className="space-y-1 text-sm">
                {signatureDevisModal.prop.devisJoint!.lignes.map((l, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-navy-800">
                      {l.description} &times; {l.quantite} {l.unite}
                    </span>
                    <span className="font-medium text-navy-800">{l.totalTTC.toFixed(2)}€</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Conditions */}
            {signatureDevisModal.prop.devisJoint!.delaiRealisation && (
              <p className="text-xs text-slate-500">
                ⏱️ Délai : <strong>{signatureDevisModal.prop.devisJoint!.delaiRealisation}</strong>
              </p>
            )}
            {signatureDevisModal.prop.devisJoint!.conditions && (
              <p className="text-xs text-slate-500 italic">
                {signatureDevisModal.prop.devisJoint!.conditions}
              </p>
            )}

            {/* Totaux */}
            <div className="bg-brand-50 rounded-xl p-4 space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Total HT</span>
                <span>{signatureDevisModal.prop.devisJoint!.totaux.totalHT.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>TVA</span>
                <span>{signatureDevisModal.prop.devisJoint!.totaux.totalTVAGlobal.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between font-bold text-navy-800 text-base border-t pt-1">
                <span>Total TTC</span>
                <span className="text-brand-700">{signatureDevisModal.prop.devisJoint!.totaux.totalTTC.toFixed(2)}€</span>
              </div>
            </div>

            {/* Signature artisan (aperçu) */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Signature artisan (apposée)
              </p>
              <div className="border border-green-300 rounded-lg overflow-hidden h-16">
                <img
                  src={signatureDevisModal.prop.devisJoint!.signatureArtisan.dataURL}
                  alt="Signature artisan"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Zone de signature client */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Votre signature <span className="text-red-500">*</span>
              </p>
              <p className="text-xs text-slate-400 mb-2">
                Signez ci-dessous pour accepter les conditions de ce devis.
              </p>
              <div
                className="relative bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg overflow-hidden"
                style={{ height: 100 }}
              >
                <canvas
                  ref={signatureCanvasRef}
                  width={500}
                  height={100}
                  className="w-full h-full cursor-crosshair touch-none"
                  onMouseDown={signatureStartDraw}
                  onMouseMove={signatureDraw}
                  onMouseUp={signatureStopDraw}
                  onMouseLeave={signatureStopDraw}
                  onTouchStart={signatureStartDraw}
                  onTouchMove={signatureDraw}
                  onTouchEnd={signatureStopDraw}
                />
                {!signatureHasDrawn && (
                  <span className="absolute inset-0 flex items-center justify-center text-slate-300 text-sm pointer-events-none select-none">
                    ✍️ Signez ici
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between mt-1">
                <button
                  type="button"
                  onClick={effacerSignatureClient}
                  className="text-xs text-slate-400 hover:text-red-500 transition"
                >
                  Effacer
                </button>
                {signatureDataURL
                  ? <span className="text-xs text-green-600 font-medium">✓ Signé</span>
                  : <span className="text-xs text-orange-500">Signature requise</span>
                }
              </div>
            </div>

            {/* Boutons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setSignatureDevisModal(null)}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 border-2 border-slate-200 text-slate-500 rounded-xl hover:border-navy-800 font-medium text-sm"
              >
                Annuler
              </button>
              <button
                onClick={handleAccepterAvecSignature}
                disabled={submitting || !signatureDataURL}
                className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold text-sm disabled:opacity-50"
                title={!signatureDataURL ? 'Vous devez signer pour continuer' : undefined}
              >
                {submitting ? '⏳ Traitement…' : '✅ Confirmer et payer'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── Modale Signature Devis (propositions > 150€) ─────────────────── */}
    {signatureDevisModal && (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg my-4">
          {/* En-tête */}
          <div className="bg-navy-800 text-white rounded-t-2xl px-6 py-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">📋 Signature du devis</h2>
              <p className="text-sm text-slate-300 mt-0.5">
                Montant : <strong className="text-brand-700">{signatureDevisModal.prop.devisJoint!.totaux.totalTTC.toFixed(2)}€ TTC</strong>
              </p>
            </div>
            <button
              onClick={() => setSignatureDevisModal(null)}
              className="text-slate-300 hover:text-white text-2xl leading-none"
            >
              ×
            </button>
          </div>

          {/* Corps */}
          <div className="p-6 space-y-4">
            {/* Récapitulatif devis */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Prestations</p>
              <div className="space-y-1 text-sm">
                {signatureDevisModal.prop.devisJoint!.lignes.map((l, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-navy-800">
                      {l.description} &times; {l.quantite} {l.unite}
                    </span>
                    <span className="font-medium text-navy-800">{l.totalTTC.toFixed(2)}€</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Conditions */}
            {signatureDevisModal.prop.devisJoint!.delaiRealisation && (
              <p className="text-xs text-slate-500">
                ⏱️ Délai : <strong>{signatureDevisModal.prop.devisJoint!.delaiRealisation}</strong>
              </p>
            )}
            {signatureDevisModal.prop.devisJoint!.conditions && (
              <p className="text-xs text-slate-500 italic">
                {signatureDevisModal.prop.devisJoint!.conditions}
              </p>
            )}

            {/* Totaux */}
            <div className="bg-brand-50 rounded-xl p-4 space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Total HT</span>
                <span>{signatureDevisModal.prop.devisJoint!.totaux.totalHT.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>TVA</span>
                <span>{signatureDevisModal.prop.devisJoint!.totaux.totalTVAGlobal.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between font-bold text-navy-800 text-base border-t pt-1">
                <span>Total TTC</span>
                <span className="text-brand-700">{signatureDevisModal.prop.devisJoint!.totaux.totalTTC.toFixed(2)}€</span>
              </div>
            </div>

            {/* Signature artisan (aperçu) */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Signature artisan (apposée)
              </p>
              <div className="border border-green-300 rounded-lg overflow-hidden h-16 bg-white">
                <img
                  src={signatureDevisModal.prop.devisJoint!.signatureArtisan.dataURL}
                  alt="Signature artisan"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Zone de signature client */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Votre signature <span className="text-red-500">*</span>
              </p>
              <p className="text-xs text-slate-400 mb-2">
                Signez ci-dessous pour accepter les conditions de ce devis.
              </p>
              <div
                className="relative bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg overflow-hidden"
                style={{ height: 100 }}
              >
                <canvas
                  ref={signatureCanvasRef}
                  width={500}
                  height={100}
                  className="w-full h-full cursor-crosshair touch-none"
                  onMouseDown={signatureStartDraw}
                  onMouseMove={signatureDraw}
                  onMouseUp={signatureStopDraw}
                  onMouseLeave={signatureStopDraw}
                  onTouchStart={signatureStartDraw}
                  onTouchMove={signatureDraw}
                  onTouchEnd={signatureStopDraw}
                />
                {!signatureHasDrawn && (
                  <span className="absolute inset-0 flex items-center justify-center text-slate-300 text-sm pointer-events-none select-none">
                    ✍️ Signez ici
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between mt-1">
                <button
                  type="button"
                  onClick={effacerSignatureClient}
                  className="text-xs text-slate-400 hover:text-red-500 transition"
                >
                  Effacer
                </button>
                {signatureDataURL
                  ? <span className="text-xs text-green-600 font-medium">✓ Signé</span>
                  : <span className="text-xs text-orange-500">Signature requise</span>
                }
              </div>
            </div>

            {/* Boutons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setSignatureDevisModal(null)}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 border-2 border-slate-200 text-slate-500 rounded-xl hover:border-navy-800 font-medium text-sm"
              >
                Annuler
              </button>
              <button
                onClick={handleAccepterAvecSignature}
                disabled={submitting || !signatureDataURL}
                className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold text-sm disabled:opacity-50"
                title={!signatureDataURL ? 'Vous devez signer pour continuer' : undefined}
              >
                {submitting ? '⏳ Traitement…' : '✅ Confirmer et payer'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── Modale Refus ─────────────────────────────── */}
    {refusModal && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 max-w-md w-full p-6">
          <h3 className="text-xl font-bold text-navy-800 mb-2">❌ Refuser la proposition</h3>
          <p className="text-slate-500 text-sm mb-4">Indiquez pourquoi vous refusez (l&apos;artisan sera notifié). La demande reviendra en attente.</p>
          <textarea
            value={motifRefusField.value}
            onChange={motifRefusField.onChange}
            onBlur={motifRefusField.onBlur}
            rows={4}
            className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none mb-1 text-sm transition-colors ${
              motifRefusField.warning ? 'border-orange-400 focus:border-orange-500' : 'border-slate-200 focus:border-red-400'
            }`}
            placeholder="Ex : Le tarif est trop élevé pour ce travail…"
          />
          {motifRefusField.warning ? (
            <div className="mb-3 flex items-start gap-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              <span className="shrink-0">⚠️</span>
              <span>{motifRefusField.warning}</span>
            </div>
          ) : (
            <p className="mb-3 text-xs text-slate-500">🔒 Coordonnées personnelles non autorisées avant paiement</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => { setRefusModal(null); motifRefusField.reset(); }}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 border-2 border-slate-200 text-slate-500 rounded-xl hover:border-navy-800 font-medium text-sm"
            >
              Annuler
            </button>
            <button
              onClick={handleRefuserInline}
              disabled={submitting || !motifRefusField.value.trim()}
              className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 font-semibold text-sm disabled:opacity-50"
            >
              {submitting ? '⏳ Envoi…' : 'Confirmer le refus'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ===== POPUP AVIS POST-VALIDATION EXPRESS ===== */}
    {showAvisPopup && (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg my-4">
          {/* En-tête */}
          <div className="bg-navy-800 text-white rounded-t-2xl px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">⭐ Donner un avis</h2>
                <p className="text-sm text-slate-300 mt-0.5">
                  Partagez votre expérience avec{' '}
                  <span className="text-brand-700 font-semibold">
                    {avisDemandeId ? (artisanNomMap.get(avisDemandeId) ?? 'l\'artisan') : 'l\'artisan'}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setShowAvisPopup(false)}
                className="text-slate-300 hover:text-white text-2xl leading-none"
                title="Plus tard"
              >
                ×
              </button>
            </div>
          </div>

          {/* Corps scrollable */}
          <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
            {/* Sélection de la note */}
            <div>
              <label className="block text-sm font-semibold text-navy-800 mb-3">
                Note globale <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2 justify-center">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setAvisNote(star)}
                    onMouseEnter={() => setAvisNoteHover(star)}
                    onMouseLeave={() => setAvisNoteHover(0)}
                    className="transition-transform hover:scale-105"
                  >
                    <svg
                      className={`w-10 h-10 ${
                        star <= (avisNoteHover || avisNote)
                          ? 'text-yellow-400 fill-current'
                          : 'text-slate-300'
                      }`}
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  </button>
                ))}
                {avisNote > 0 && (
                  <span className="ml-2 text-2xl font-bold text-brand-700 self-center">
                    {avisNote}/5
                  </span>
                )}
              </div>
            </div>

            {/* Commentaire */}
            <div>
              <label className="block text-sm font-semibold text-navy-800 mb-2">
                Votre commentaire <span className="text-red-500">*</span>
              </label>
              <textarea
                value={avisCommentaire}
                onChange={e => setAvisCommentaire(e.target.value)}
                placeholder="Décrivez votre expérience (minimum 10 caractères)..."
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none text-sm"
                rows={4}
              />
              <p className="text-xs text-slate-400 mt-1 text-right">{avisCommentaire.length}/500</p>
            </div>

            {/* Points forts */}
            <div>
              <label className="block text-sm font-semibold text-navy-800 mb-2">
                Points forts <span className="text-slate-400 font-normal">(optionnel)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {AVIS_POINTS_FORTS.map(point => (
                  <button
                    key={point}
                    type="button"
                    onClick={() => setAvisPointsForts(prev =>
                      prev.includes(point) ? prev.filter(p => p !== point) : [...prev, point]
                    )}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                      avisPointsForts.includes(point)
                        ? 'bg-green-50 border-green-500 text-green-700'
                        : 'border-slate-300 text-slate-600 hover:border-green-400'
                    }`}
                  >
                    {avisPointsForts.includes(point) && '✓ '}{point}
                  </button>
                ))}
              </div>
            </div>

            {/* Points à améliorer */}
            <div>
              <label className="block text-sm font-semibold text-navy-800 mb-2">
                Points à améliorer <span className="text-slate-400 font-normal">(optionnel)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {AVIS_POINTS_AMELIORATION.map(point => (
                  <button
                    key={point}
                    type="button"
                    onClick={() => setAvisPointsAmelioration(prev =>
                      prev.includes(point) ? prev.filter(p => p !== point) : [...prev, point]
                    )}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                      avisPointsAmelioration.includes(point)
                        ? 'bg-orange-50 border-orange-500 text-orange-700'
                        : 'border-slate-300 text-slate-600 hover:border-orange-400'
                    }`}
                  >
                    {avisPointsAmelioration.includes(point) && '⚠ '}{point}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Boutons */}
          <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
            <button
              type="button"
              onClick={() => setShowAvisPopup(false)}
              className="flex-1 px-4 py-2.5 border-2 border-slate-300 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition text-sm"
            >
              Plus tard
            </button>
            <button
              type="button"
              onClick={handleSubmitAvisExpress}
              disabled={avisSubmitting || avisNote === 0 || avisCommentaire.trim().length < 10}
              className="flex-1 px-4 py-2.5 bg-brand-700 text-white rounded-lg font-semibold hover:bg-brand-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition text-sm"
            >
              {avisSubmitting ? 'Publication...' : '⭐ Publier mon avis'}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
}
