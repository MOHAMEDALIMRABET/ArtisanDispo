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
import { EXPRESS_WORK_TAXONOMY } from '@/lib/express-work-taxonomy';
import { getExpressArtisanWindowMs } from '@/lib/express-work-taxonomy';
import DevisExpressForm from '@/components/DevisExpressForm';
import type { DevisExpressJoint } from '@/types/firestore';


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
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Devis joint (obligatoire si montant > 150€)
  const [devisExpress, setDevisExpress] = useState<DevisExpressJoint | undefined>(undefined);
  // Modale de consultation du devis joint envoyé
  const [devisModalOpen, setDevisModalOpen] = useState(false);
  // Chargement génération PDF


  /** True si le montant TTC saisi est égal ou supérieur à 150€ → le formulaire de devis doit s'afficher */
  const montantVal = parseFloat(montantPropose);
  const besoinDevis = !isNaN(montantVal) && montantVal >= 150;

  // Réponse à la contre-proposition client
  const [negoAction, setNegoAction] = useState<'accepter_prix_client' | 'refuser' | 'proposition_finale' | null>(null);
  const [negoMontantFinal, setNegoMontantFinal] = useState('');
  const [negoMessageFinal, setNegoMessageFinal] = useState('');

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

      // Pré-remplir avec budget client si disponible
      if (demandeData.budgetPropose && !montantPropose) {
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
    // Si montant >= 150€ : le devis est obligatoire et doit être signé
    if (montant >= 150 && !devisExpress) {
      alert('Vous devez remplir et signer le devis pour soumettre une proposition de 150€ ou plus.');
      return;
    }

    setSubmitting(true);
    try {
      await createPropositionExpress({
        demandeId: demandeId,
        artisanId: firebaseUser.uid,
        clientId: demande.clientId,
        montantPropose: montant,
        description: description.trim(),
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00] mx-auto mb-4"></div>
          <p className="text-[#6C757D]">Chargement...</p>
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
  const interventionWindowHours = Math.round(getExpressArtisanWindowMs(demande) / (60 * 60 * 1000));

  const maProposition = propositions.find(p => p.artisanId === firebaseUser?.uid);
  const isPublished = !demande.artisanId;
  const peutFaireProposition = !maProposition && (
    demande.statut === 'en_attente_proposition' ||
    (isPublished && demande.statut === 'proposition_recue')
  );

  async function handleRepondreNegociation() {
    if (!maProposition || !negoAction) return;
    if (negoAction === 'proposition_finale') {
      const montant = parseFloat(negoMontantFinal);
      if (isNaN(montant) || montant <= 0) { alert('Montant invalide'); return; }
      if (montant > 150) { alert('Maximum 150€'); return; }
      if (!negoMessageFinal.trim()) { alert('Veuillez décrire ce qui est inclus'); return; }
    }
    setSubmitting(true);
    try {
      await repondreArtisanNegociation(
        maProposition.id,
        negoAction,
        negoAction === 'proposition_finale' ? parseFloat(negoMontantFinal) : undefined,
        negoAction === 'proposition_finale' ? negoMessageFinal.trim() : undefined,
      );
      const msgs: Record<string, string> = {
        accepter_prix_client: '✅ Vous avez accepté le budget du client. Il va recevoir une notification.',
        refuser: '❌ Vous avez refusé la contre-proposition. La demande est de nouveau visible.',
        proposition_finale: '✅ Proposition finale envoyée ! Le client doit maintenant accepter ou refuser.',
      };
      alert(msgs[negoAction]);
      setNegoAction(null);
      setNegoMontantFinal('');
      setNegoMessageFinal('');
      await loadData();
    } catch (error: any) {
      console.error('Erreur réponse négociation:', error);
      alert(error.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">

      {/* ═══ MODALE DEVIS JOINT ═══ */}
      {devisModalOpen && maProposition?.devisJoint && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center overflow-y-auto py-8 px-4"
          onClick={() => setDevisModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête modale */}
            <div className="bg-[#2C3E50] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="text-lg font-bold">📋 Devis envoyé</h2>
              <button
                onClick={() => setDevisModalOpen(false)}
                className="text-white/70 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Lignes de prestation */}
              <div>
                <h3 className="font-bold text-[#2C3E50] mb-3 text-sm uppercase tracking-wide">Prestations</h3>
                <div className="border border-[#E9ECEF] rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#F8F9FA]">
                      <tr>
                        <th className="text-left px-4 py-2 text-[#6C757D] font-semibold">Description</th>
                        <th className="text-right px-4 py-2 text-[#6C757D] font-semibold">Qté</th>
                        <th className="text-right px-4 py-2 text-[#6C757D] font-semibold">PU HT</th>
                        <th className="text-right px-4 py-2 text-[#6C757D] font-semibold">Total HT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {maProposition.devisJoint.lignes.map((ligne, i) => (
                        <tr key={i} className="border-t border-[#E9ECEF]">
                          <td className="px-4 py-2 text-[#2C3E50]">{ligne.description || '—'}</td>
                          <td className="px-4 py-2 text-right text-[#6C757D]">{ligne.quantite} {ligne.unite}</td>
                          <td className="px-4 py-2 text-right text-[#6C757D]">{ligne.prixUnitaireHT.toFixed(2)} €</td>
                          <td className="px-4 py-2 text-right font-semibold text-[#2C3E50]">{ligne.totalHT.toFixed(2)} €</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Main d'œuvre */}
              {maProposition.devisJoint.mainOeuvre && maProposition.devisJoint.mainOeuvre.prixHT > 0 && (
                <div>
                  <h3 className="font-bold text-[#2C3E50] mb-2 text-sm uppercase tracking-wide">Main d'œuvre</h3>
                  <div className="bg-[#F8F9FA] rounded-lg px-4 py-3 flex justify-between text-sm">
                    <span className="text-[#6C757D]">{maProposition.devisJoint.mainOeuvre.quantite} {maProposition.devisJoint.mainOeuvre.unite} — TVA {maProposition.devisJoint.mainOeuvre.tauxTVA}%</span>
                    <span className="font-semibold text-[#2C3E50]">{maProposition.devisJoint.mainOeuvre.prixHT.toFixed(2)} € HT</span>
                  </div>
                </div>
              )}

              {/* Matières premières */}
              {maProposition.devisJoint.matierePremiere && (
                <div>
                  <h3 className="font-bold text-[#2C3E50] mb-2 text-sm uppercase tracking-wide">Matières premières</h3>
                  <div className="bg-[#F8F9FA] rounded-lg px-4 py-3 flex justify-between text-sm">
                    <span className="text-[#6C757D]">{maProposition.devisJoint.matierePremiere.quantite} {maProposition.devisJoint.matierePremiere.unite} — TVA {maProposition.devisJoint.matierePremiere.tauxTVA}%</span>
                    <span className="font-semibold text-[#2C3E50]">{maProposition.devisJoint.matierePremiere.prixHT.toFixed(2)} € HT</span>
                  </div>
                </div>
              )}

              {/* Totaux */}
              <div className="bg-[#FF6B00]/5 border border-[#FF6B00]/20 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm text-[#6C757D]">
                  <span>Total HT</span>
                  <span>{maProposition.devisJoint.totaux.totalHT.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between text-sm text-[#6C757D]">
                  <span>TVA</span>
                  <span>{maProposition.devisJoint.totaux.totalTVAGlobal.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-[#FF6B00] border-t border-[#FF6B00]/20 pt-2">
                  <span>Total TTC</span>
                  <span>{maProposition.devisJoint.totaux.totalTTC.toFixed(2)} €</span>
                </div>
              </div>

              {/* Conditions */}
              {(maProposition.devisJoint.delaiRealisation || maProposition.devisJoint.dateDebutPrevue || maProposition.devisJoint.conditions) && (
                <div className="space-y-2 text-sm border-t border-[#E9ECEF] pt-4">
                  {maProposition.devisJoint.delaiRealisation && (
                    <div className="flex gap-2"><span className="text-[#6C757D] font-semibold min-w-32">Délai :</span><span>{maProposition.devisJoint.delaiRealisation}</span></div>
                  )}
                  {maProposition.devisJoint.dateDebutPrevue && (
                    <div className="flex gap-2"><span className="text-[#6C757D] font-semibold min-w-32">Début prévu :</span><span>{maProposition.devisJoint.dateDebutPrevue}</span></div>
                  )}
                  {maProposition.devisJoint.conditions && (
                    <div className="flex gap-2"><span className="text-[#6C757D] font-semibold min-w-32">Conditions :</span><span>{maProposition.devisJoint.conditions}</span></div>
                  )}
                </div>
              )}

              {/* Signature artisan */}
              {maProposition.devisJoint.signatureArtisan?.dataURL && (
                <div className="border-t border-[#E9ECEF] pt-4">
                  <p className="text-sm font-semibold text-[#2C3E50] mb-2">✍️ Votre signature</p>
                  <img
                    src={maProposition.devisJoint.signatureArtisan.dataURL}
                    alt="Signature artisan"
                    className="h-16 border border-[#E9ECEF] rounded-lg bg-white p-1"
                  />
                </div>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-3">
              {/* Bouton téléchargement PDF du devis */}
              <button
                onClick={() => {
                  if (!maProposition?.id) return;
                  // Ouvre la page d'impression dans un nouvel onglet (comme le devis classique)
                  window.open(`/devis-express-print/${maProposition.id}`, '_blank');
                }}
                className="flex-1 flex items-center justify-center gap-2 bg-[#2C3E50] text-white px-4 py-3 rounded-lg hover:bg-[#1A3A5C] transition-colors font-semibold"
              >
                🖨️ Imprimer / PDF
              </button>
              <button
                onClick={() => setDevisModalOpen(false)}
                className="flex-1 bg-[#FF6B00] text-white px-4 py-3 rounded-lg hover:bg-[#E56100] transition-colors font-semibold"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white shadow-sm border-b border-[#E9ECEF]">
        <div className="container mx-auto px-4 py-6">
          <nav className="flex items-center gap-2 text-sm mb-4">
            <Link href="/artisan/dashboard" className="text-[#2C3E50] hover:text-[#FF6B00]">
              Dashboard
            </Link>
            <span className="text-[#6C757D]">&gt;</span>
            <Link href="/artisan/demandes-express" className="text-[#2C3E50] hover:text-[#FF6B00]">
              Demandes express
            </Link>
            <span className="text-[#6C757D]">&gt;</span>
            <span className="text-[#2C3E50] font-semibold">Détails</span>
          </nav>

          <h1 className="text-2xl md:text-3xl font-bold text-[#2C3E50]">
            🚀 Demande express
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
                ? 'bg-gray-100 border-gray-300 text-gray-600'
                : countdown.isUrgent
                ? 'bg-red-50 border-red-400 text-red-800'
                : 'bg-orange-50 border-[#FF6B00] text-[#2C3E50]'
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
          <div className={`grid gap-6 items-start ${
            (maProposition?.devisJoint || besoinDevis)
              ? 'grid-cols-1 max-w-2xl mx-auto w-full'
              : 'grid-cols-1 lg:grid-cols-2'
          }`}>

            {/* ══ COLONNE GAUCHE : Infos demande ══ */}
            {!(maProposition?.devisJoint || besoinDevis) && (
            <div className="space-y-6">

            {/* Infos demande */}
            <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[#2C3E50]">
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
                  {demande.typeTravauxExpress === 'depannage-urgence' ? '🚨 Urgent (30 min - 1h)' : '⚡ Immédiat (2h)'}
                </span>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#2C3E50] mb-1">
                  Description des travaux
                </label>
                <p className="text-[#6C757D] whitespace-pre-wrap break-words">{demande.description}</p>
              </div>

              {/* Photos du chantier */}
              {(() => { const photosList = normalizePhotos(demande.photos); return photosList && (
                <div>
                  <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                    📷 Photos du chantier ({photosList.length})
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {photosList.map((url, index) => (
                      <a key={index} href={url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={url}
                          alt={`Photo chantier ${index + 1}`}
                          className="w-full h-32 object-cover rounded-lg border-2 border-[#E9ECEF] hover:border-[#FF6B00] transition-colors cursor-pointer"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              ); })()}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[#2C3E50] mb-1">
                    🧭 Type de travaux
                  </label>
                  <p className="text-[#6C757D]">{typeTravauxLabel}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#2C3E50] mb-1">
                    🛠️ Catégorie déclarée
                  </label>
                  <p className="text-[#6C757D]">{categorieLabel}</p>
                </div>
                {sousCategorieLabel && (
                  <div>
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-1">
                      🔎 Sous catégorie
                    </label>
                    <p className="text-[#6C757D]">{sousCategorieLabel}</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-[#2C3E50] mb-1">
                    📍 Localisation
                  </label>
                  <p className="text-[#6C757D]">{demande.ville} ({demande.codePostal})</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#2C3E50] mb-1">
                    {demande.urgence === 'immediat' ? '⚡' : '🚨'} Intervention attendue
                  </label>
                  <p className="font-semibold text-[#FF6B00]">
                    {`Dans les ${interventionWindowHours}h`} après création
                  </p>
                  {demande.createdAt && (
                    <p className="text-sm text-[#6C757D] mt-0.5">
                      Avant le {new Date(
                        demande.createdAt.toDate().getTime() +
                        getExpressArtisanWindowMs(demande)
                      ).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#2C3E50] mb-1">
                    🕐 Date de création
                  </label>
                  <p className="text-[#6C757D]">{formatTimestamp(demande.createdAt)}</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#2C3E50] mb-1">
                    ⏳ Date/heure d'expiration
                  </label>
                  <p className={`font-semibold ${countdown.isExpired ? 'text-gray-400' : countdown.isUrgent ? 'text-red-600' : 'text-[#FF6B00]'}`}>
                    {formatTimestamp(demande.expiresAt)}
                  </p>
                </div>

                {demande.budgetPropose && (
                  <div>
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-1">
                      💰 Budget client
                    </label>
                    <p className="text-2xl font-bold text-[#FF6B00]">{demande.budgetPropose}€</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-[#2C3E50] mb-1">
                    👤 Client
                  </label>
                  <p className="text-[#6C757D]">
                    {clientData ? `${clientData.prenom} ${clientData.nom}` : 'Chargement...'}
                  </p>
                </div>

                {demande.adresse && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-1">
                      🏠 Adresse exacte (révélée après acceptation)
                    </label>
                    <p className="text-[#6C757D]">{demande.adresse}</p>
                  </div>
                )}
              </div>
            </div>
            </div>
            </div>
            )}{/* fin condition !devisJoint — colonne gauche masquée si devisJoint présent */}

            {/* ══ COLONNE DROITE : Proposition / Actions ══ */}
            <div className="space-y-6 lg:sticky lg:top-8">

          {/* Ma proposition (si déjà envoyée) */}
          {maProposition && (
            <div className="bg-purple-50 border-2 border-purple-300 rounded-xl p-6">
              <h3 className="text-lg font-bold text-[#2C3E50] mb-4">
                ✅ Votre proposition
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-[#2C3E50] mb-1">
                    Montant proposé
                  </label>
                  <p className="text-2xl font-bold text-[#FF6B00]">{maProposition.montantPropose}€</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#2C3E50] mb-1">
                    Description
                  </label>
                  <p className="text-[#6C757D] whitespace-pre-wrap break-words">{maProposition.description}</p>
                </div>
                {maProposition.delaiIntervention && (
                  <div>
                    <label className="block text-sm font-semibold text-[#2C3E50] mb-1">
                      Délai d'intervention
                    </label>
                    <p className="text-[#6C757D]">{maProposition.delaiIntervention}</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-[#2C3E50] mb-1">
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

                {/* Bouton consulter le devis joint (si devis > 150€) */}
                {maProposition.devisJoint && (
                  <div className="pt-3 border-t border-purple-200">
                    <button
                      onClick={() => setDevisModalOpen(true)}
                      className="w-full flex items-center justify-center gap-2 bg-[#2C3E50] text-white px-4 py-2.5 rounded-lg hover:bg-[#1A3A5C] transition-colors font-semibold text-sm"
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
                  <h3 className="text-lg font-bold text-[#2C3E50]">Contre-proposition du client</h3>
                  <p className="text-sm text-[#6C757D]">Le client ne souhaite pas payer votre tarif initial. À vous de décider.</p>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 space-y-2 border border-blue-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#6C757D]">Votre proposition initiale</span>
                  <span className="font-bold text-[#2C3E50] line-through">{maProposition.montantPropose}€</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#6C757D]">Budget souhaité par le client</span>
                  <span className="text-2xl font-extrabold text-blue-700">{maProposition.contrePropositionMontant}€</span>
                </div>
                {maProposition.contrePropositionMessage && (
                  <div className="pt-2 border-t border-blue-100">
                    <p className="text-xs text-[#6C757D] font-semibold uppercase tracking-wide mb-1">Message client</p>
                    <p className="text-sm text-[#2C3E50] italic">"{maProposition.contrePropositionMessage}"</p>
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
                    className="px-4 py-3 bg-[#FF6B00] text-white rounded-xl hover:bg-[#E56100] font-semibold text-sm transition-all"
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
                  <p className="text-sm text-[#2C3E50]">Vous allez accepter le budget de <strong className="text-green-700">{maProposition.contrePropositionMontant}€</strong> proposé par le client.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setNegoAction(null)} className="flex-1 px-4 py-2.5 border-2 border-gray-200 text-[#6C757D] rounded-xl text-sm hover:border-[#2C3E50]">Retour</button>
                    <button onClick={handleRepondreNegociation} disabled={submitting} className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                      {submitting ? '⏳…' : '✅ Confirmer'}
                    </button>
                  </div>
                </div>
              )}

              {/* Confirmation refus */}
              {negoAction === 'refuser' && (
                <div className="bg-white rounded-xl p-4 border border-red-300 space-y-3">
                  <p className="text-sm text-[#2C3E50]">La négociation sera rompue. La demande redeviendra visible pour d'autres artisans.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setNegoAction(null)} className="flex-1 px-4 py-2.5 border-2 border-gray-200 text-[#6C757D] rounded-xl text-sm hover:border-[#2C3E50]">Retour</button>
                    <button onClick={handleRepondreNegociation} disabled={submitting} className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 disabled:opacity-50">
                      {submitting ? '⏳…' : 'Confirmer le refus'}
                    </button>
                  </div>
                </div>
              )}

              {/* Formulaire proposition finale */}
              {negoAction === 'proposition_finale' && (
                <div className="bg-white rounded-xl p-4 border border-[#FF6B00] space-y-4">
                  <p className="text-sm font-semibold text-[#2C3E50]">Proposition finale (le client ne pourra plus contre-proposer)</p>
                  <div>
                    <label className="text-sm font-semibold text-[#2C3E50] mb-1 block">Votre tarif final (max 150€)</label>
                    <div className="relative">
                      <input
                        type="number" min="1" max="150"
                        value={negoMontantFinal}
                        onChange={e => setNegoMontantFinal(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-xl focus:outline-none focus:border-[#FF6B00] pr-10"
                        placeholder="Ex : 110"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6C757D] font-bold">€</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-[#2C3E50] mb-1 block">Justification / détail inclus</label>
                    <textarea
                      value={negoMessageFinal}
                      onChange={e => setNegoMessageFinal(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-xl focus:outline-none focus:border-[#FF6B00] text-sm"
                      placeholder="Ex : Je ne peux pas descendre plus bas à cause des pièces à fournir. Ce tarif comprend tout."
                    />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setNegoAction(null)} className="flex-1 px-4 py-2.5 border-2 border-gray-200 text-[#6C757D] rounded-xl text-sm hover:border-[#2C3E50]">Retour</button>
                    <button onClick={handleRepondreNegociation} disabled={submitting || !negoMontantFinal || !negoMessageFinal.trim()} className="flex-1 px-4 py-2.5 bg-[#FF6B00] text-white rounded-xl text-sm font-semibold hover:bg-[#E56100] disabled:opacity-50">
                      {submitting ? '⏳…' : '🔔 Envoyer proposition finale'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Formulaire proposition */}
          {peutFaireProposition && (
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-xl font-bold text-[#2C3E50] mb-6">
                💬 Faire une proposition
              </h3>

              <form onSubmit={handleSubmitProposition} className="space-y-6">
                <div>
                  <label htmlFor="montant" className="block text-sm font-semibold text-[#2C3E50] mb-2">
                    Montant proposé <span className="text-[#FF6B00]">TTC</span> *{' '}
                    <span className="text-[#6C757D] font-normal">
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
                          : 'border-[#E9ECEF] focus:border-[#FF6B00]'
                      }`}
                      placeholder="Ex: 120"
                    />
                    <span className="absolute right-4 top-3 text-[#6C757D] font-semibold">€</span>
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
                </div>

                {/* Formulaire devis (affiché quand Total TTC >= 150€) */}
                {besoinDevis && (
                  <DevisExpressForm
                    onChange={(devis) => {
                      setDevisExpress(devis);
                    }}
                    onTotauxChange={(ttc) => {
                      // Mettre à jour le champ "Montant proposé TTC" en temps réel
                      setMontantPropose(ttc.toFixed(2));
                    }}
                    montantInitial={Math.round((montantVal / 1.20) * 100) / 100}
                  />
                )}

                <div>
                  <label htmlFor="description" className="block text-sm font-semibold text-[#2C3E50] mb-2">
                    Que comprend votre prestation ?
                  </label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:outline-none focus:border-[#FF6B00]"
                    placeholder="Ex: Fourniture des pièces, main d'œuvre, déplacement inclus..."
                  />
                  <p className="text-sm text-[#6C757D] mt-1">
                    Soyez précis sur ce qui est inclus dans votre tarif
                  </p>
                </div>

                <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-[#2C3E50]">
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
              <h3 className="text-lg font-bold text-[#2C3E50] mb-4">
                ✅ Paiement reçu - Vous pouvez intervenir
              </h3>
              <p className="text-[#6C757D] mb-4">
                Le client a payé. L'argent est bloqué jusqu'à la fin de l'intervention.
              </p>
              <div className="flex flex-col gap-3">
                <Button onClick={handleMarquerEnCours} disabled={submitting}>
                  🚀 Marquer l'intervention comme démarrée
                </Button>
                {/* Bouton accès rapide au devis joint (si montant > 150€) */}
                {maProposition?.devisJoint && (
                  <button
                    onClick={() => setDevisModalOpen(true)}
                    className="w-full flex items-center justify-center gap-2 bg-[#2C3E50] text-white px-4 py-2.5 rounded-lg hover:bg-[#1A3A5C] transition-colors font-semibold text-sm"
                  >
                    📋 Consulter / Télécharger le devis
                  </button>
                )}
              </div>
            </div>
          )}

          {demande.statut === 'en_cours' && (
            <div className="bg-purple-50 border-2 border-purple-300 rounded-xl p-6">
              <h3 className="text-lg font-bold text-[#2C3E50] mb-4">
                🔧 Intervention en cours
              </h3>
              <p className="text-[#6C757D] mb-4">
                Une fois les travaux terminés, déclarez-le. Le client aura 24h pour valider et libérer votre paiement (libération automatique après 24h).
              </p>
              <div className="flex flex-col gap-3">
                <Button onClick={handleMarquerTerminee} disabled={submitting}>
                  ✅ Déclarer la fin des travaux
                </Button>
                {/* Bouton accès rapide au devis joint (si montant > 150€) */}
                {maProposition?.devisJoint && (
                  <button
                    onClick={() => setDevisModalOpen(true)}
                    className="w-full flex items-center justify-center gap-2 bg-[#2C3E50] text-white px-4 py-2.5 rounded-lg hover:bg-[#1A3A5C] transition-colors font-semibold text-sm"
                  >
                    📋 Consulter / Télécharger le devis
                  </button>
                )}
              </div>
            </div>
          )}

          {demande.statut === 'travaux_termines' && (
            <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-6">
              <h3 className="text-lg font-bold text-[#2C3E50] mb-4">
                ⏳ En attente de validation du client
              </h3>
              <p className="text-[#6C757D] mb-4">
                Le client a été notifié. Il doit valider les travaux pour libérer votre paiement.
                Le paiement sera automatiquement libéré dans 24h si le client ne répond pas.
              </p>
              {/* Bouton accès rapide au devis joint (si montant > 150€) */}
              {maProposition?.devisJoint && (
                <button
                  onClick={() => setDevisModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 bg-[#2C3E50] text-white px-4 py-2.5 rounded-lg hover:bg-[#1A3A5C] transition-colors font-semibold text-sm"
                >
                  📋 Consulter / Télécharger le devis
                </button>
              )}
            </div>
          )}

          {demande.statut === 'terminee' && (
            <div className="bg-green-50 border-2 border-green-300 rounded-xl p-6">
              <h3 className="text-lg font-bold text-[#2C3E50] mb-2">
                🎉 Travaux validés — Paiement libéré !
              </h3>
              <p className="text-[#6C757D] mb-4">
                Le client a validé les travaux. Votre paiement a été versé.
              </p>
              {/* Bouton accès rapide au devis joint (si montant > 150€) */}
              {maProposition?.devisJoint && (
                <button
                  onClick={() => setDevisModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 bg-[#2C3E50] text-white px-4 py-2.5 rounded-lg hover:bg-[#1A3A5C] transition-colors font-semibold text-sm"
                >
                  📋 Consulter / Télécharger le devis
                </button>
              )}
            </div>
          )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
