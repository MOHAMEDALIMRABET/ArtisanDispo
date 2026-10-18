/**
 * Page Client - Détail Litige
 * Vue complète d'un litige avec timeline et actions
 */

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStatus } from '@/hooks/useAuthStatus';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getLitigeById,
  addLitigeComment,
  acceptLitigeResolution,
  rejectLitigeResolution,
} from '@/lib/firebase/litige-service';
import { Litige } from '@/types/litige';
import LitigeTimeline from '@/components/litiges/LitigeTimeline';
import { ArrowLeft, MessageSquare, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';

export default function ClientLitigeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, role, loading: authLoading } = useAuthStatus();
  const { t } = useLanguage();
  const [litige, setLitige] = useState<Litige | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentaire, setCommentaire] = useState('');
  const [motifRefus, setMotifRefus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showRefusForm, setShowRefusForm] = useState(false);

  const litigeId = params.id as string;

  useEffect(() => {
    if (authLoading) return;
    if (!user || role !== 'client') {
      router.push('/login');
      return;
    }

    loadLitige();
  }, [user, role, authLoading, litigeId]);

  async function loadLitige() {
    try {
      setLoading(true);
      const data = await getLitigeById(litigeId);
      
      if (!data) {
        alert(t('alerts.dispute.notFound'));
        router.push('/client/litiges');
        return;
      }

      // Vérifier que l'utilisateur est bien le client
      if (data.clientId !== user?.uid) {
        alert(t('alerts.dispute.accessDenied'));
        router.push('/client/litiges');
        return;
      }

      setLitige(data);
    } catch (error) {
      console.error('Erreur chargement litige:', error);
      alert(t('alerts.dispute.loadError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleAddComment() {
    if (!user || !commentaire.trim()) return;

    try {
      setSubmitting(true);
      await addLitigeComment(litigeId, user.uid, 'client', commentaire);
      setCommentaire('');
      await loadLitige(); // Recharger pour voir le nouveau commentaire
    } catch (error) {
      console.error('Erreur ajout commentaire:', error);
      alert(t('alerts.dispute.commentError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAcceptResolution() {
    if (!user) return;
    
    const confirm = window.confirm(
      'Êtes-vous sûr d\'accepter cette proposition de résolution ? Cette action est irréversible.'
    );
    if (!confirm) return;

    try {
      setSubmitting(true);
      await acceptLitigeResolution(litigeId, user.uid, 'client');
      await loadLitige();
      alert(t('alerts.dispute.acceptSuccess'));
    } catch (error) {
      console.error('Erreur acceptation:', error);
      alert(t('alerts.dispute.acceptError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRejectResolution() {
    if (!user || !motifRefus.trim()) {
      alert(t('alerts.refusal.refusalReasonRequired'));
      return;
    }

    try {
      setSubmitting(true);
      await rejectLitigeResolution(litigeId, user.uid, 'client', motifRefus);
      setMotifRefus('');
      setShowRefusForm(false);
      await loadLitige();
      alert(t('alerts.dispute.proposalRejected'));
    } catch (error) {
      console.error('Erreur refus:', error);
      alert(t('alerts.dispute.refusalError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center">
          <p className="text-slate-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!litige) {
    return null;
  }

  const canRespond = litige.statut === 'ouvert' || litige.statut === 'en_mediation';
  const hasProposition = litige.statut === 'proposition_resolution';
  const isResolved = litige.statut === 'resolu_accord' || litige.statut === 'resolu_admin';

  // Vérifier si le client a déjà accepté la proposition
  const clientAlreadyAccepted = litige.historique.some(
    (action) =>
      action.type === 'acceptation_resolution' && action.acteurRole === 'client'
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Navigation */}
      <Link
        href="/client/litiges"
        className="inline-flex items-center gap-2 text-brand-700 hover:underline mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour à mes litiges
      </Link>

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-navy-800 mb-2">{litige.motif}</h1>
            <p className="text-slate-600">{litige.description}</p>
          </div>
          <div className="text-right">
            {litige.statut === 'ouvert' && (
              <span className="inline-block px-4 py-2 bg-yellow-100 text-yellow-800 rounded-full font-medium">
                Ouvert
              </span>
            )}
            {litige.statut === 'en_mediation' && (
              <span className="inline-block px-4 py-2 bg-blue-100 text-blue-800 rounded-full font-medium">
                En médiation
              </span>
            )}
            {litige.statut === 'proposition_resolution' && (
              <span className="inline-block px-4 py-2 bg-purple-100 text-purple-800 rounded-full font-medium">
                Proposition
              </span>
            )}
            {isResolved && (
              <span className="inline-block px-4 py-2 bg-green-100 text-green-800 rounded-full font-medium">
                Résolu
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-slate-500">Type</p>
            <p className="font-medium text-navy-800">{litige.type}</p>
          </div>
          <div>
            <p className="text-slate-500">Montant contesté</p>
            <p className="font-medium text-navy-800">{litige.montantConteste}€</p>
          </div>
          <div>
            <p className="text-slate-500">Date d'ouverture</p>
            <p className="font-medium text-navy-800">
              {litige.dateOuverture ? formatDate(litige.dateOuverture.toDate()) : 'N/A'}
            </p>
          </div>
          {litige.dateResolution && (
            <div>
              <p className="text-slate-500">Date de résolution</p>
              <p className="font-medium text-navy-800">
                {formatDate(litige.dateResolution.toDate())}
              </p>
            </div>
          )}
        </div>

        {litige.adminAssigne && (
          <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <p className="text-sm text-purple-800">
              👤 Un médiateur a été assigné à ce litige et suit activement son évolution
            </p>
          </div>
        )}
      </div>

      {/* Proposition de résolution */}
      {hasProposition && !clientAlreadyAccepted && (
        <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-8 h-8 text-purple-600 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-bold text-purple-900 mb-2">
                Proposition de résolution
              </h3>
              <p className="text-purple-800 mb-4">
                Le médiateur a proposé une solution pour résoudre ce litige. Veuillez examiner la
                proposition dans l'historique ci-dessous et indiquer si vous l'acceptez ou la
                refusez.
              </p>

              {!showRefusForm ? (
                <div className="flex gap-3">
                  <button
                    onClick={handleAcceptResolution}
                    disabled={submitting}
                    className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Accepter la proposition
                  </button>
                  <button
                    onClick={() => setShowRefusForm(true)}
                    disabled={submitting}
                    className="flex items-center gap-2 bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                  >
                    <XCircle className="w-5 h-5" />
                    Refuser
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={motifRefus}
                    onChange={(e) => setMotifRefus(e.target.value)}
                    placeholder="Expliquez pourquoi vous refusez cette proposition..."
                    className="w-full p-3 border border-slate-300 rounded-lg resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    rows={3}
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={handleRejectResolution}
                      disabled={submitting || !motifRefus.trim()}
                      className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                    >
                      Confirmer le refus
                    </button>
                    <button
                      onClick={() => {
                        setShowRefusForm(false);
                        setMotifRefus('');
                      }}
                      disabled={submitting}
                      className="bg-slate-300 text-slate-700 px-6 py-2 rounded-lg hover:bg-slate-400 transition"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {clientAlreadyAccepted && hasProposition && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-4 mb-6">
          <p className="text-green-800">
            ✅ Vous avez accepté la proposition. En attente de la réponse de l'artisan.
          </p>
        </div>
      )}

      {/* Timeline */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6">
        <LitigeTimeline historique={litige.historique} currentUserId={user?.uid || ''} />
      </div>

      {/* Formulaire commentaire */}
      {canRespond && !isResolved && (
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-navy-800 mb-4">
            Ajouter un commentaire
          </h3>
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Partagez des informations complémentaires..."
            className="w-full p-3 border border-slate-300 rounded-lg resize-none focus:ring-2 focus:ring-brand-500 focus:border-transparent mb-4"
            rows={4}
          />
          <button
            onClick={handleAddComment}
            disabled={submitting || !commentaire.trim()}
            className="flex items-center gap-2 bg-brand-700 text-white px-6 py-2 rounded-lg hover:bg-brand-800 transition disabled:opacity-50"
          >
            <MessageSquare className="w-5 h-5" />
            Envoyer le commentaire
          </button>
        </div>
      )}
    </div>
  );
}
