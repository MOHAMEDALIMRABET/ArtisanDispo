'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { 
  getDemandeExpressById,
  getPropositionsByDemande,
  createPropositionExpress,
  repondreArtisanNegociation,
  markInterventionEnCours,
  markInterventionTerminee
} from '@/lib/firebase/demande-express-service';
import { getUserById } from '@/lib/firebase/user-service';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import type { DemandeExpress, PropositionExpress, User } from '@/types/firestore';
import { Button } from '@/components/ui/Button';
import type { Timestamp } from 'firebase/firestore';
import { EXPRESS_WORK_TAXONOMY, getExpressArtisanWindowMs, parsePrixMax } from '@/lib/express-work-taxonomy';
import DevisExpressForm from '@/components/DevisExpressForm';
import type { DevisExpressJoint } from '@/types/firestore';
import { useAntiBypassField } from '@/hooks/useAntiBypassField';


/**
 * Normalise le champ photos : accepte tableau OU objet-map {0:url,...} (bug historique sanitizeForFirestore).
 * Retourne toujours un tableau de strings, ou undefined si absent.
 */
function normalizePhotos(photos: any): string[] | undefined {
  if (!photos) return undefined;
  if (Array.isArray(photos)) return photos.length > 0 ? photos : undefined;
  // Objet {0: url, 1: url, ...} → tableau
  const keys = Object.keys(photos);
  if (keys.length === 0) return undefined;
  return keys.sort((a, b) => Number(a) - Number(b)).map(k => photos[k]);
}

/** Formate un Timestamp Firestore en date + heure lisibles */
function formatTimestamp(ts: Timestamp | undefined): string {
  if (!ts) return '—';
  const d = ts.toDate();
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Calcule le temps restant avant expiration et retourne un objet { label, isExpired, isUrgent } */
function getCountdown(expiresAt: Timestamp | undefined): { label: string; isExpired: boolean; isUrgent: boolean } {
  if (!expiresAt) return { label: '—', isExpired: false, isUrgent: false };
  const diff = expiresAt.toDate().getTime() - Date.now();
  if (diff <= 0) return { label: 'Expirée', isExpired: true, isUrgent: false };
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const label = h > 0
    ? `${h}h ${String(m).padStart(2, '0')}min`
    : `${m}min ${String(s).padStart(2, '0')}s`;
  return { label, isExpired: false, isUrgent: diff < 30 * 60 * 1000 };
}

export default function DemandeExpressDetailArtisanPage() {
  const router = useRouter();
  const params = useParams();
  const demandeId = params.id as string;
  const { user: firebaseUser, loading: authLoading } = useAuth();
  const { markTypeAsRead } = useNotifications(firebaseUser?.uid);

  const [userData, setUserData] = useState<User | null>(null);
  const [demande, setDemande] = useState<DemandeExpress | null>(null);
  const [clientData, setClientData] = useState<User | null>(null);
  const [propositions, setPropositions] = useState<PropositionExpress[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState<{ label: string; isExpired: boolean; isUrgent: boolean }>({ label: '—', isExpired: false, isUrgent: false });

  // Mise à jour du chrono chaque seconde — actif uniquement quand en_attente_proposition
  useEffect(() => {
    if (!demande?.expiresAt || demande?.statut !== 'en_attente_proposition') {
      setCountdown({ label: '—', isExpired: false, isUrgent: false });
      return;
    }
    const tick = () => setCountdown(getCountdown(demande.expiresAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [demande?.expiresAt, demande?.statut]);

  // Form state
  const [montantPropose, setMontantPropose] = useState('');
  /* Champs liberté de texte protégés anti-bypass (coordonnées avant paiement) */
  const descriptionField = useAntiBypassField();
  const [submitting, setSubmitting] = useState(false);
  // Devis joint (obligatoire si montant >= 150€)
  const [devisExpress, setDevisExpress] = useState<DevisExpressJoint | undefined>(undefined);
  // Données initiales du devis pour pré-remplir DevisExpressForm lors d'une reprise après refus
  // (lignes, main d'œuvre, matières premières, délai, date, conditions — signatures exclues)
  const [devisInitialData, setDevisInitialData] = useState<Omit<DevisExpressJoint, 'signatureArtisan' | 'signatureClient'> | undefined>(undefined);
  // Ouverture du devis formaté dans un nouvel onglet (page dédiée comme la demande classique)
  // Panneau gauche (détails intervention) visible/masqué quand le devis est affiché
  const [showDetails, setShowDetails] = useState(false);
  // Chargement génération PDF


  /** True si le montant TTC saisi est égal ou supérieur à 150€ → le formulaire de devis doit s'afficher */
  const montantVal = parseFloat(montantPropose);
  const besoinDevis = !isNaN(montantVal) && montantVal >= 150;

  // Réponse à la contre-proposition client
  const [negoAction, setNegoAction] = useState<'accepter_prix_client' | 'refuser' | 'proposition_finale' | null>(null);
  const [negoMontantFinal, setNegoMontantFinal] = useState('');
  const negoMessageField = useAntiBypassField();

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.push('/connexion');
      return;
    }
    loadData();
  }, [firebaseUser, authLoading, demandeId]);

  // Marquer les notifications express liées à cette demande comme lues à l'ouverture de la page
  useEffect(() => {
    if (!firebaseUser || authLoading) return;
    markTypeAsRead([
      'proposition_acceptee',
      'contre_proposition_recue',
      'paiement_recu_express',
      'nouvelle_demande_express',
      'acceptation_expiree',
      'paiement_libere_express',
    ]);
  }, [firebaseUser, authLoading]);

  async function loadData() {
    if (!firebaseUser) return;

    try {
      const user = await getUserById(firebaseUser.uid);
      setUserData(user);

      if (user?.role !== 'artisan') {
        alert('Accès réservé aux artisans');
        router.push('/');
        return;
      }

      const demandeData = await getDemandeExpressById(demandeId);
      if (!demandeData) {
        alert('Demande introuvable');
        router.push('/artisan/demandes-express');
        return;
      }
      setDemande(demandeData);

      // Client info
      const client = await getUserById(demandeData.clientId);
      setClientData(client);

      // Propositions
      const propositionsList = await getPropositionsByDemande(demandeId);
      setPropositions(propositionsList);

      // Pré-remplir le formulaire depuis la proposition refusée si elle existe,
      // sinon utiliser le budget client comme montant par défaut.
      // La signature client est réinitialisée (elle sera demandée à la nouvelle acceptation).
      const myRefusedProp = propositionsList.find(
        p => p.artisanId === firebaseUser.uid && p.statut === 'refusee'
      );
      if (myRefusedProp) {
        setMontantPropose(myRefusedProp.montantPropose.toString());
        descriptionField.setValue(myRefusedProp.description);
        if (myRefusedProp.devisJoint) {
          // Réutiliser le devis existant en effaçant les deux signatures
          // (l'artisan et le client devront re-signer lors de la nouvelle proposition/acceptation)
          const { signatureClient: _sc, signatureArtisan: _sa, ...devisBase } = myRefusedProp.devisJoint;
          setDevisInitialData(devisBase);
          setDevisExpress(devisBase as typeof myRefusedProp.devisJoint);
        }
      } else if (demandeData.budgetPropose && !montantPropose) {
        setMontantPropose(demandeData.budgetPropose.toString());
      }
    } catch (error: any) {
      console.error('Erreur chargement demande:', error);
      alert(`Erreur lors du chargement: ${error?.message || error?.code || JSON.stringify(error)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitProposition(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !demande) return;

    const montant = parseFloat(montantPropose);
    if (isNaN(montant) || montant <= 0) {
      alert('Montant invalide');
      return;
    }

    // Vérification du plafond de prix de la taxonomie
    // Si la sous-catégorie a un prix "Max X€", l'artisan ne peut pas dépasser ce plafond
    if (demande.typeTravauxExpress && demande.sousCategorie) {
      const prixIndicatifTaxo = EXPRESS_WORK_TAXONOMY[demande.typeTravauxExpress]?.categories
        ?.flatMap((c: { sousCategories: { value: string; prix?: string }[] }) => c.sousCategories)
        ?.find((sc: { value: string }) => sc.value === demande.sousCategorie)
        ?.prix;
      const plafond = parsePrixMax(prixIndicatifTaxo);
      if (plafond !== null && montant > plafond) {
        alert(
          `⛔ Votre proposition de ${montant}€ TTC dépasse le plafond autorisé pour cette prestation.\n\n` +
          `💰 Prix maximum : ${plafond}€ TTC (${prixIndicatifTaxo})\n\n` +
          `Veuillez réduire votre montant à ${plafond}€ TTC maximum.`
        );
        return;
      }
    }

    // Si montant >= 150€ : le devis est obligatoire et doit être signé
    if (montant >= 150 && !devisExpress) {
      alert('Vous devez remplir et signer le devis pour soumettre une proposition de 150€ ou plus.');
      return;
    }

    /* Blocage dur anti-bypass : coordonnées personnelles interdites avant paiement */
    if (!descriptionField.validate()) return;

    setSubmitting(true);
    try {
      await createPropositionExpress({
        demandeId: demandeId,
        artisanId: firebaseUser.uid,
        clientId: demande.clientId,
        montantPropose: montant,
        description: descriptionField.value.trim(),
        devisJoint: devisExpress,
      });

      alert('✅ Proposition envoyée avec succès !');
      // Recharger
      await loadData();
    } catch (error: any) {
      console.error('Erreur envoi proposition:', error);
      alert(error.message || 'Erreur lors de l\'envoi de la proposition');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarquerEnCours() {
    if (!confirm('Confirmez-vous le début de l\'intervention ?')) return;
    
    setSubmitting(true);
    try {
      await markInterventionEnCours(demandeId);
      alert('✅ Intervention marquée comme en cours');
      await loadData();
    } catch (error: any) {
      console.error('Erreur:', error);
      alert(error.message || 'Erreur lors de la mise à jour');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarquerTerminee() {
    if (!confirm('Confirmez-vous que l\'intervention est terminée ?')) return;
    
    setSubmitting(true);
    try {
      await markInterventionTerminee(demandeId);
      alert('✅ Intervention terminée ! Le client va recevoir une notification.');
      await loadData();
    } catch (error: any) {
      console.error('Erreur:', error);
      alert(error.message || 'Erreur lors de la mise à jour');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto mb-4"></div>
          <p className="text-slate-500">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!demande) {
    return null;
  }

  const typeTravauxLabel = demande.typeTravauxExpress
    ? EXPRESS_WORK_TAXONOMY[demande.typeTravauxExpress].label
    : 'Travaux express';
  const categorieLabel = demande.categorieLabel || (demande.categorie.charAt(0).toUpperCase() + demande.categorie.slice(1));
  const sousCategorieLabel = demande.sousCategorieLabel || demande.sousCategorie;

  // Prix indicatif de la sous-catégorie selon la taxonomie (ex: "Max 350 €" ou "À partir de 120 €")
  // Permet à l'artisan de connaître le plafond de prix attendu pour cette prestation
  const prixIndicatif = demande.typeTravauxExpress && demande.sousCategorie
    ? EXPRESS_WORK_TAXONOMY[demande.typeTravauxExpress]?.categories
        ?.flatMap((c: { sousCategories: { value: string; prix?: string }[] }) => c.sousCategories)
        ?.find((sc: { value: string }) => sc.value === demande.sousCategorie)
        ?.prix ?? null
    : null;

  // Plafond numérique extrait du prix indicatif (ex: "Max 199 €" → 199)
  // Utilisé pour le retour visuel en temps réel sur le champ montant
  const prixMaxTaxonomie = parsePrixMax(prixIndicatif);
  const montantExcedePlafond = prixMaxTaxonomie !== null && !isNaN(montantVal) && montantVal > prixMaxTaxonomie;
  const interventionWindowHours = Math.round(getExpressArtisanWindowMs(demande) / (60 * 60 * 1000));

  const maProposition = propositions.find(p => p.artisanId === firebaseUser?.uid);
  const isPublished = !demande.artisanId;
  // Peut soumettre une proposition si aucune active n'existe, OU si la précédente a été refusée
  // et que la demande est de nouveau ouverte (statut en_attente_proposition)
  const peutFaireProposition = (
    !maProposition ||
    (maProposition.statut === 'refusee' && demande.statut === 'en_attente_proposition')
  ) && (
    demande.statut === 'en_attente_proposition' ||
    (isPublished && demande.statut === 'proposition_recue')
  );

  async function handleRepondreNegociation() {
    if (!maProposition || !negoAction) return;
    if (negoAction === 'proposition_finale') {
      const montant = parseFloat(negoMontantFinal);
      if (isNaN(montant) || montant <= 0) { alert('Montant invalide'); return; }
      if (montant > 150) { alert('Maximum 150€'); return; }
      if (!negoMessageField.value.trim()) { alert('Veuillez décrire ce qui est inclus'); return; }
      /* Blocage dur anti-bypass sur le message de négociation */
      if (!negoMessageField.validate()) return;
    }
    setSubmitting(true);
    try {
      await repondreArtisanNegociation(
        maProposition.id,
        negoAction,
        negoAction === 'proposition_finale' ? parseFloat(negoMontantFinal) : undefined,
        negoAction === 'proposition_finale' ? negoMessageField.value.trim() : undefined,
      );
      const msgs: Record<string, string> = {
        accepter_prix_client: '✅ Vous avez accepté le budget du client. Il va recevoir une notification.',
        refuser: '❌ Vous avez refusé la contre-proposition. La demande est de nouveau visible.',
        proposition_finale: '✅ Proposition finale envoyée ! Le client doit maintenant accepter ou refuser.',
      };
      alert(msgs[negoAction]);
      setNegoAction(null);
      setNegoMontantFinal('');
      negoMessageField.reset();
      await loadData();
    } catch (error: any) {
      console.error('Erreur réponse négociation:', error);
      alert(error.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-white shadow-sm border-b border-slate-200">
        <div className="container mx-auto px-4 py-6">
          <nav className="flex items-center gap-2 text-sm mb-4">
            <Link href="/artisan/dashboard" className="text-navy-800 hover:text-brand-700">
              Dashboard
            </Link>
            <span className="text-slate-500">&gt;</span>
            <Link href="/artisan/demandes-express" className="text-navy-800 hover:text-brand-700">
              Demandes express
            </Link>
            <span className="text-slate-500">&gt;</span>
            <span className="text-navy-800 font-semibold">Détails</span>
          </nav>

          <h1 className="text-2xl md:text-3xl font-bold text-navy-800">
            Demande express
          </h1>
        </div>
      </div>

      {/* Contenu */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* ── Bandeaux pleine largeur ── */}
          {demande.expiresAt && demande.statut === 'en_attente_proposition' && (
            <div className={`rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-2 ${
              countdown.isExpired
                ? 'bg-slate-100 border-slate-300 text-slate-600'
                : countdown.isUrgent
                ? 'bg-red-50 border-red-400 text-red-800'
                : 'bg-orange-50 border-brand-500 text-navy-800'
            }`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{countdown.isExpired ? '⏹️' : countdown.isUrgent ? '🔴' : '⏱️'}</span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                    {countdown.isExpired ? 'Demande expirée' : 'Soumettez votre proposition avant'}
                  </p>
                  <p className={`text-2xl font-black ${countdown.isUrgent && !countdown.isExpired ? 'animate-pulse' : ''}`}>
                    {countdown.label}
                  </p>
                </div>
              </div>
              <div className="text-sm">
                <p className="opacity-70">Limite le</p>
                <p className="font-semibold">{formatTimestamp(demande.expiresAt)}</p>
              </div>
            </div>
          )}
          {maProposition && ['proposition_recue', 'en_negociation', 'proposition_finale_artisan'].includes(maProposition.statut) && (
            <div className="bg-blue-50 border-2 border-blue-300 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📨</span>
                <div>
                  <p className="text-sm font-semibold text-blue-800">
                    {maProposition.statut === 'proposition_finale_artisan'
                      ? '🔔 Proposition finale envoyée — en attente de la décision du client'
                      : '✅ Proposition envoyée — en attente du client'}
                  </p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    Le client doit répondre avant le{' '}
                    <strong>{formatTimestamp(demande.expiresAt)}</strong>
                  </p>
                </div>
              </div>
              <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-semibold whitespace-nowrap">⏳ En attente</span>
            </div>
          )}

          {/* ── Grille deux colonnes ── */}

          {/* Lien toggle : visible uniquement quand le devis est affiché (montant >= 150 ou devis déjà joint) */}
          {(maProposition?.devisJoint || besoinDevis) && (
            <div className="mb-2 flex justify-start">
              <button
                type="button"
                onClick={() => setShowDetails(prev => !prev)}
                className="text-sm text-brand-700 hover:underline flex items-center gap-1"
              >
                {showDetails ? '▲ Masquer les détails de l\'intervention' : '▼ Voir les détails de l\'intervention'}
              </button>
            </div>
          )}

          <div className={`grid gap-6 items-start ${
            (maProposition?.devisJoint || besoinDevis) && !showDetails
              ? 'grid-cols-1 max-w-2xl mx-auto w-full'
              : 'grid-cols-1 lg:grid-cols-2'
          }`}>

            {/* ══ COLONNE GAUCHE : Infos demande ══ */}
            {(!(maProposition?.devisJoint || besoinDevis) || showDetails) && (
            <div className="space-y-6">

            {/* Infos demande */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-navy-800">
                {categorieLabel}
                {sousCategorieLabel && ` • ${sousCategorieLabel}`}
              </h2>
              {demande.urgence === 'urgent' && (
                <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-semibold">
                  🚨 Urgent (24h)
                </span>
              )}
              {demande.urgence === 'immediat' && (
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  demande.typeTravauxExpress === 'depannage-urgence'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-orange-100 text-orange-800'
                }`}>
                  {demande.typeTravauxExpress === 'depannage-urgence' ? '⚡ Immédiat (30 min - 1h)' : '🚨 En urgence (2h)'}
                </span>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-navy-800 mb-1">
                  Description des travaux
                </label>
                <p className="text-slate-500 whitespace-pre-wrap break-words">{demande.description}</p>
              </div>

              {/* Photos du chantier */}
              {(() => { const photosList = normalizePhotos(demande.photos); return photosList && (
                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-2">
                    📷 Photos du chantier ({photosList.length})
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {photosList.map((url, index) => (
                      <a key={index} href={url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={url}
                          alt={`Photo chantier ${index + 1}`}
                          className="w-full h-32 object-cover rounded-lg border-2 border-slate-200 hover:border-brand-500 transition-colors cursor-pointer"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              ); })()}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1">
                    🧭 Type de travaux
                  </label>
                  <p className="text-slate-500">{typeTravauxLabel}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1">
                    🛠️ Catégorie déclarée
                  </label>
                  <p className="text-slate-500">{categorieLabel}</p>
                </div>
                {sousCategorieLabel && (
                  <div>
                    <label className="block text-sm font-semibold text-navy-800 mb-1">
                      🔎 Sous catégorie
                    </label>
                    <p className="text-slate-500">{sousCategorieLabel}</p>
                  </div>
                )}

                {/* Prix indicatif de la taxonomie pour cette sous-catégorie */}
                {prixIndicatif && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-navy-800 mb-1">
                      💰 Prix indicatif plateforme
                    </label>
                    <div className="inline-flex items-center gap-2 bg-brand-50 border border-brand-500 rounded-lg px-3 py-2">
                      <span className="text-sm font-bold text-brand-700">{prixIndicatif}</span>
                      <span className="text-xs text-slate-500">(fourchette indicative pour cette prestation)</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1">
                    📍 Localisation
                  </label>
                  <p className="text-slate-500">{demande.ville} ({demande.codePostal})</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1">
                    {demande.urgence === 'immediat' ? '⚡' : '🚨'} Intervention attendue
                  </label>
                  <p className="font-semibold text-brand-700">
                    {`Dans les ${interventionWindowHours}h`} après création
                  </p>
                  {demande.createdAt && (
                    <p className="text-sm text-slate-500 mt-0.5">
                      Avant le {new Date(
                        demande.createdAt.toDate().getTime() +
                        getExpressArtisanWindowMs(demande)
                      ).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1">
                    🕐 Date de création
                  </label>
                  <p className="text-slate-500">{formatTimestamp(demande.createdAt)}</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1">
                    ⏳ Date/heure d'expiration
                  </label>
                  <p className={`font-semibold ${countdown.isExpired ? 'text-slate-400' : countdown.isUrgent ? 'text-red-600' : 'text-brand-700'}`}>
                    {formatTimestamp(demande.expiresAt)}
                  </p>
                </div>

                {demande.budgetPropose && (
                  <div>
                    <label className="block text-sm font-semibold text-navy-800 mb-1">
                      💰 Budget client
                    </label>
                    <p className="text-2xl font-bold text-brand-700">{demande.budgetPropose}€</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1">
                    👤 Client
                  </label>
                  <p className="text-slate-500">
                    {clientData ? `${clientData.prenom} ${clientData.nom}` : 'Chargement...'}
                  </p>
                </div>

                {demande.adresse && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-navy-800 mb-1">
                      🏠 Adresse exacte (révélée après acceptation)
                    </label>
                    <p className="text-slate-500">{demande.adresse}</p>
                  </div>
                )}
              </div>
            </div>
            </div>
            </div>
            )}{/* fin condition colonne gauche */}

            {/* ══ COLONNE DROITE : Proposition / Actions ══ */}
            <div className="space-y-6 lg:sticky lg:top-8">

          {/* Ma proposition (si déjà envoyée) */}
          {maProposition && (
            <div className={`border-2 rounded-xl p-6 ${
              maProposition.statut === 'refusee'
                ? 'bg-red-50 border-red-300'
                : 'bg-purple-50 border-purple-300'
            }`}>
              <h3 className={`text-lg font-bold mb-4 ${
                maProposition.statut === 'refusee' ? 'text-red-700' : 'text-navy-800'
              }`}>
                {maProposition.statut === 'refusee' ? '❌ Proposition refusée' : '✅ Votre proposition'}
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1">
                    Montant proposé
                  </label>
                  <p className="text-2xl font-bold text-brand-700">{maProposition.montantPropose}€</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1">
                    Description
                  </label>
                  <p className="text-slate-500 whitespace-pre-wrap break-words">{maProposition.description}</p>
                </div>
                {maProposition.delaiIntervention && (
                  <div>
                    <label className="block text-sm font-semibold text-navy-800 mb-1">
                      Délai d'intervention
                    </label>
                    <p className="text-slate-500">{maProposition.delaiIntervention}</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-navy-800 mb-1">
                    Statut
                  </label>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                    maProposition.statut === 'acceptee' ? 'bg-green-100 text-green-800' :
                    maProposition.statut === 'refusee' ? 'bg-red-100 text-red-800' :
                    maProposition.statut === 'en_negociation' ? 'bg-blue-100 text-blue-800' :
                    maProposition.statut === 'proposition_finale_artisan' ? 'bg-purple-100 text-purple-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {maProposition.statut === 'acceptee' ? '✅ Acceptée' :
                     maProposition.statut === 'refusee' ? '❌ Refusée' :
                     maProposition.statut === 'en_negociation' ? '💬 Contre-proposition client' :
                     maProposition.statut === 'proposition_finale_artisan' ? '🔔 Proposition finale envoyée' :
                     "⏳ En attente d'acceptation"}
                  </span>
                </div>

                {/* Motif de refus : visible uniquement quand la proposition a été refusée */}
                {maProposition.statut === 'refusee' && maProposition.motifRefus && (
                  <div className="bg-white border border-red-100 rounded-lg p-3">
                    <label className="block text-xs text-red-600 font-semibold mb-1">📝 Motif de refus du client</label>
                    <p className="text-sm text-slate-700">{maProposition.motifRefus}</p>
                  </div>
                )}

                {/* Bouton consulter le devis joint : ouvre la page formatée */}
                {maProposition.devisJoint && (
                  <div className="pt-3 border-t border-purple-200">
                    <button
                      onClick={() => window.open(`/devis-express-print/${maProposition.id}`, '_blank')}
                      className="w-full flex items-center justify-center gap-2 bg-navy-800 text-white px-4 py-2.5 rounded-lg hover:bg-navy-900 transition-colors font-semibold text-sm"
                    >
                      📋 Consulter le devis envoyé
                    </button>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* ── Contre-proposition client : artisan doit répondre ── */}
          {maProposition?.statut === 'en_negociation' && (
            <div className="bg-blue-50 border-2 border-blue-400 rounded-xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">💬</span>
                <div>
                  <h3 className="text-lg font-bold text-navy-800">Contre-proposition du client</h3>
                  <p className="text-sm text-slate-500">Le client ne souhaite pas payer votre tarif initial. À vous de décider.</p>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 space-y-2 border border-blue-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Votre proposition initiale</span>
                  <span className="font-bold text-navy-800 line-through">{maProposition.montantPropose}€</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Budget souhaité par le client</span>
                  <span className="text-2xl font-extrabold text-blue-700">{maProposition.contrePropositionMontant}€</span>
                </div>
                {maProposition.contrePropositionMessage && (
                  <div className="pt-2 border-t border-blue-100">
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">Message client</p>
                    <p className="text-sm text-navy-800 italic">"{maProposition.contrePropositionMessage}"</p>
                  </div>
                )}
              </div>

              {/* Choix d'action */}
              {!negoAction && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={() => setNegoAction('accepter_prix_client')}
                    className="px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold text-sm transition-all"
                  >
                    ✅ Accepter {maProposition.contrePropositionMontant}€
                  </button>
                  <button
                    onClick={() => setNegoAction('proposition_finale')}
                    className="px-4 py-3 bg-brand-700 text-white rounded-xl hover:bg-brand-800 font-semibold text-sm transition-all"
                  >
                    💬 Proposer un autre tarif
                  </button>
                  <button
                    onClick={() => setNegoAction('refuser')}
                    className="px-4 py-3 bg-white border-2 border-red-400 text-red-600 rounded-xl hover:bg-red-50 font-semibold text-sm transition-all"
                  >
                    ✕ Refuser et passer
                  </button>
                </div>
              )}

              {/* Confirmation accepter */}
              {negoAction === 'accepter_prix_client' && (
                <div className="bg-white rounded-xl p-4 border border-green-300 space-y-3">
                  <p className="text-sm text-navy-800">Vous allez accepter le budget de <strong className="text-green-700">{maProposition.contrePropositionMontant}€</strong> proposé par le client.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setNegoAction(null)} className="flex-1 px-4 py-2.5 border-2 border-slate-200 text-slate-500 rounded-xl text-sm hover:border-navy-800">Retour</button>
                    <button onClick={handleRepondreNegociation} disabled={submitting} className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                      {submitting ? '⏳…' : '✅ Confirmer'}
                    </button>
                  </div>
                </div>
              )}

              {/* Confirmation refus */}
              {negoAction === 'refuser' && (
                <div className="bg-white rounded-xl p-4 border border-red-300 space-y-3">
                  <p className="text-sm text-navy-800">La négociation sera rompue. La demande redeviendra visible pour d'autres artisans.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setNegoAction(null)} className="flex-1 px-4 py-2.5 border-2 border-slate-200 text-slate-500 rounded-xl text-sm hover:border-navy-800">Retour</button>
                    <button onClick={handleRepondreNegociation} disabled={submitting} className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-50">
                      {submitting ? '⏳…' : 'Confirmer le refus'}
                    </button>
                  </div>
                </div>
              )}

              {/* Formulaire proposition finale */}
              {negoAction === 'proposition_finale' && (
                <div className="bg-white rounded-xl p-4 border border-brand-500 space-y-4">
                  <p className="text-sm font-semibold text-navy-800">Proposition finale (le client ne pourra plus contre-proposer)</p>
                  <div>
                    <label className="text-sm font-semibold text-navy-800 mb-1 block">Votre tarif final (max 150€)</label>
                    <div className="relative">
                      <input
                        type="number" min="1" max="150"
                        value={negoMontantFinal}
                        onChange={e => setNegoMontantFinal(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-brand-500 pr-10"
                        placeholder="Ex : 110"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">€</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-navy-800 mb-1 block">Justification / détail inclus</label>
                    <textarea
                      value={negoMessageField.value}
                      onChange={negoMessageField.onChange}
                      onBlur={negoMessageField.onBlur}
                      rows={3}
                      className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none text-sm ${
                        negoMessageField.warning
                          ? 'border-orange-400 focus:border-orange-400'
                          : 'border-slate-200 focus:border-brand-500'
                      }`}
                      placeholder="Ex : Je ne peux pas descendre plus bas à cause des pièces à fournir. Ce tarif comprend tout."
                    />
                    {negoMessageField.warning ? (
                      <div className="mt-1.5 flex items-start gap-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                        <span className="shrink-0">⚠️</span>
                        <span>{negoMessageField.warning}</span>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">🔒 Coordonnées personnelles non autorisées avant paiement</p>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setNegoAction(null)} className="flex-1 px-4 py-2.5 border-2 border-slate-200 text-slate-500 rounded-xl text-sm hover:border-navy-800">Retour</button>
                    <button onClick={handleRepondreNegociation} disabled={submitting || !negoMontantFinal || !negoMessageField.value.trim()} className="flex-1 px-4 py-2.5 bg-brand-700 text-white rounded-xl text-sm font-semibold hover:bg-brand-800 disabled:opacity-50">
                      {submitting ? '⏳…' : '🔔 Envoyer proposition finale'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Formulaire proposition — visible si aucune proposition active, ou si la précédente a été refusée */}
          {peutFaireProposition && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-xl font-bold text-navy-800 mb-6">
                {maProposition?.statut === 'refusee' ? '💬 Faire une nouvelle proposition' : '💬 Faire une proposition'}
              </h3>

              <form onSubmit={handleSubmitProposition} className="space-y-6">
                <div>
                  <label htmlFor="montant" className="block text-sm font-semibold text-navy-800 mb-2">
                    Montant proposé <span className="text-brand-700">TTC</span> *{' '}
                    <span className="text-slate-500 font-normal">
                      {besoinDevis ? '(devis signé requis)' : '(< 150€ sans devis)'}
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      id="montant"
                      value={besoinDevis && devisExpress ? devisExpress.totaux.totalTTC.toFixed(2) : montantPropose}
                      onChange={(e) => {
                        if (besoinDevis && devisExpress) return; // piloté par le devis
                        setMontantPropose(e.target.value);
                        // Réinitialiser le devis si on repasse sous 150€
                        if (parseFloat(e.target.value) < 150) setDevisExpress(undefined);
                      }}
                      readOnly={besoinDevis && !!devisExpress}
                      min={1}
                      step={0.01}
                      required
                      className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none pr-12 ${
                        besoinDevis && devisExpress
                          ? 'border-green-400 bg-green-50 text-green-800 font-bold cursor-default'
                          : 'border-slate-200 focus:border-brand-500'
                      }`}
                      placeholder="Ex: 120"
                    />
                    <span className="absolute right-4 top-3 text-slate-500 font-semibold">€</span>
                  </div>
                  {besoinDevis && devisExpress && (
                    <p className="mt-1 text-xs text-green-700 font-medium">
                      ✓ Montant calculé depuis le devis (HT : {devisExpress.totaux.totalHT.toFixed(2)}€ + TVA : {devisExpress.totaux.totalTVAGlobal.toFixed(2)}€)
                    </p>
                  )}
                  {besoinDevis && !devisExpress && (
                    <p className="mt-1 text-xs text-orange-600 font-medium">
                      ⚠️ Montant &gt;= 150€ — remplissez le devis ci-dessous, il déterminera le montant final.
                    </p>
                  )}
                  {/* Avertissement en temps réel si le montant dépasse le plafond de la taxonomie */}
                  {montantExcedePlafond && (
                    <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-300 rounded-lg px-3 py-2">
                      <span className="text-red-600 text-sm flex-shrink-0">⛔</span>
                      <p className="text-sm text-red-700 font-medium">
                        Votre montant ({montantVal}€) dépasse le plafond autorisé pour cette prestation.{' '}
                        <strong>Maximum : {prixMaxTaxonomie}€ TTC ({prixIndicatif})</strong>.
                        La soumission sera bloquée.
                      </p>
                    </div>
                  )}
                </div>

                {/* Formulaire devis (affiché quand Total TTC >= 150€) */}
                {besoinDevis && (
                  <DevisExpressForm
                    onChange={(devis) => {
                      setDevisExpress(devis);
                    }}
                    montantInitial={Math.round((montantVal / 1.20) * 100) / 100}
                    initialDevis={devisInitialData}
                  />
                )}

                <div>
                  <label htmlFor="description" className="block text-sm font-semibold text-navy-800 mb-2">
                    Que comprend votre prestation ?
                  </label>
                  <textarea
                    id="description"
                    value={descriptionField.value}
                    onChange={descriptionField.onChange}
                    onBlur={descriptionField.onBlur}
                    rows={4}
                    className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none ${
                      descriptionField.warning
                        ? 'border-orange-400 focus:border-orange-400'
                        : 'border-slate-200 focus:border-brand-500'
                    }`}
                    placeholder="Ex: Fourniture des pièces, main d'œuvre, déplacement inclus..."
                  />
                  {descriptionField.warning ? (
                    <div className="mt-1.5 flex items-start gap-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                      <span className="shrink-0">⚠️</span>
                      <span>{descriptionField.warning}</span>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 mt-1">
                      🔒 Coordonnées personnelles non autorisées avant paiement
                    </p>
                  )}
                </div>

                <div className="bg-slate-50 border-2 border-slate-200 rounded-lg p-4">
                  <p className="text-sm text-navy-800">
                    <strong>ℹ️ À savoir :</strong> Une fois votre proposition envoyée, le client pourra l'accepter et procéder au paiement. L'argent sera bloqué jusqu'à la fin de l'intervention.
                  </p>
                </div>

                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => router.push('/artisan/demandes-express')}
                    disabled={submitting}
                  >
                    Retour
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting || (besoinDevis && !devisExpress)}
                    className="flex-1"
                    title={besoinDevis && !devisExpress ? 'Remplissez et signez le devis pour continuer' : undefined}
                  >
                    {submitting ? '⏳ Envoi...' : besoinDevis && !devisExpress ? '📋 Devis requis' : '💬 Envoyer ma proposition'}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Actions intervention */}
          {demande.statut === 'payee' && (
            <div className="bg-green-50 border-2 border-green-300 rounded-xl p-6">
              <h3 className="text-lg font-bold text-navy-800 mb-4">
                ✅ Paiement reçu - Vous pouvez intervenir
              </h3>
              <p className="text-slate-500 mb-4">
                Le client a payé. L'argent est bloqué jusqu'à la fin de l'intervention.
              </p>
              <div className="flex flex-col gap-3">
                <Button onClick={handleMarquerEnCours} disabled={submitting}>
                  🚀 Marquer l'intervention comme démarrée
                </Button>
              </div>
            </div>
          )}

          {demande.statut === 'en_cours' && (
            <div className="bg-purple-50 border-2 border-purple-300 rounded-xl p-6">
              <h3 className="text-lg font-bold text-navy-800 mb-4">
                🔧 Intervention en cours
              </h3>
              <p className="text-slate-500 mb-4">
                Une fois les travaux terminés, déclarez-le. Le client aura 24h pour valider et libérer votre paiement (libération automatique après 24h).
              </p>
              <div className="flex flex-col gap-3">
                <Button onClick={handleMarquerTerminee} disabled={submitting}>
                  ✅ Déclarer la fin des travaux
                </Button>
              </div>
            </div>
          )}

          {demande.statut === 'travaux_termines' && (
            <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-6">
              <h3 className="text-lg font-bold text-navy-800 mb-4">
                ⏳ En attente de validation du client
              </h3>
              <p className="text-slate-500 mb-4">
                Le client a été notifié. Il doit valider les travaux pour libérer votre paiement.
                Le paiement sera automatiquement libéré dans 24h si le client ne répond pas.
              </p>
            </div>
          )}

          {demande.statut === 'terminee' && (
            <div className="bg-green-50 border-2 border-green-300 rounded-xl p-6">
              <h3 className="text-lg font-bold text-navy-800 mb-2">
                🎉 Travaux validés — Paiement libéré !
              </h3>
              <p className="text-slate-500 mb-4">
                Le client a validé les travaux. Votre paiement a été versé.
              </p>
            </div>
          )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
