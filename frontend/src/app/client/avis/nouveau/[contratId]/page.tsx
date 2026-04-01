'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { authService } from '@/lib/auth-service';
import { getUserById } from '@/lib/firebase/user-service';
import { useLanguage } from '@/contexts/LanguageContext';
import { getDevisById } from '@/lib/firebase/devis-service';
import { getArtisanById } from '@/lib/firebase/artisan-service';
import { createAvis, getAvisByContratId } from '@/lib/firebase/avis-service';
import type { User, Artisan } from '@/types/firestore';
import type { Devis } from '@/types/devis';
import Link from 'next/link';

const POINTS_FORTS_OPTIONS = [
  'Ponctuel',
  'Soigneux',
  'Professionnel',
  'Rapide',
  'Bon rapport qualité/prix',
  'À l\'écoute',
  'Travail de qualité'
];

const POINTS_AMELIORATION_OPTIONS = [
  'Délais trop longs',
  'Communication insuffisante',
  'Propreté du chantier',
  'Prix élevé',
  'Manque de professionnalisme'
];

export default function NouvelAvisPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const routeParamId = params.contratId as string; // Historique: segment nommé contratId
  const devisIdFromQuery = searchParams.get('devisId');
  // Compatibilité: certains liens envoient /client/avis/nouveau/<artisanId>?devisId=<devisId>
  const effectiveDevisId = devisIdFromQuery || routeParamId;
  const { t } = useLanguage();

  const [user, setUser] = useState<User | null>(null);
  const [contrat, setContrat] = useState<Devis | null>(null); // Devis signé = contrat juridique
  const [artisan, setArtisan] = useState<Artisan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Formulaire
  const [note, setNote] = useState(0);
  const [noteHover, setNoteHover] = useState(0);
  const [commentaire, setCommentaire] = useState('');
  const [pointsForts, setPointsForts] = useState<string[]>([]);
  const [pointsAmelioration, setPointsAmelioration] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, [effectiveDevisId]);

  async function loadData() {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        router.push('/connexion');
        return;
      }

      const userData = await getUserById(currentUser.uid);
      if (!userData || userData.role !== 'client') {
        router.push('/dashboard');
        return;
      }

      setUser(userData);

      // Charger le devis (un devis signé = contrat juridique)
      const contratData = await getDevisById(effectiveDevisId);
      if (!contratData) {
        alert(t('alerts.review.contractNotFound'));
        router.push('/dashboard');
        return;
      }

      // Vérifier que c'est bien le contrat du client
      if (contratData.clientId !== currentUser.uid) {
        alert(t('alerts.review.unauthorized'));
        router.push('/dashboard');
        return;
      }

      // Vérifier que le contrat est terminé
      if (contratData.statut !== 'termine_valide' && contratData.statut !== 'termine_auto_valide') {
        alert(t('alerts.review.workNotCompleted'));
        router.push('/dashboard');
        return;
      }

      // Vérifier qu'un avis n'a pas déjà été donné pour ce travail
      const avisExistant = await getAvisByContratId(effectiveDevisId);
      if (avisExistant) {
        alert('✅ Vous avez déjà donné un avis pour cette intervention. Un seul avis est possible par travaux terminés.');
        router.push('/client/avis');
        return;
      }

      setContrat(contratData);

      // Charger les infos de l'artisan
      const artisanData = await getArtisanById(contratData.artisanId);
      if (artisanData) {
        setArtisan(artisanData);
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Erreur chargement données:', error);
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (note === 0) {
      alert(t('alerts.review.ratingRequired'));
      return;
    }

    if (!commentaire.trim() || commentaire.trim().length < 10) {
      alert(t('alerts.review.commentTooShort'));
      return;
    }

    if (!contrat || !user) return;

    try {
      setSubmitting(true);

      await createAvis({
        contratId: effectiveDevisId,
        artisanId: contrat.artisanId,
        clientId: user.uid,
        note,
        commentaire: commentaire.trim(),
        points_forts: pointsForts,
        points_amelioration: pointsAmelioration,
      });

      alert(t('alerts.review.publishSuccess'));
      router.push('/client/avis');
    } catch (error: any) {
      console.error('Erreur création avis:', error);
      alert(error.message || t('alerts.review.publishError'));
    } finally {
      setSubmitting(false);
    }
  }

  function renderStars() {
    return (
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setNote(star)}
            onMouseEnter={() => setNoteHover(star)}
            onMouseLeave={() => setNoteHover(0)}
            className="transition-transform hover:scale-110"
          >
            <svg
              className={`w-10 h-10 ${
                star <= (noteHover || note)
                  ? 'text-yellow-400 fill-current'
                  : 'text-gray-300'
              }`}
              viewBox="0 0 24 24"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        ))}
      </div>
    );
  }

  function togglePointFort(point: string) {
    setPointsForts(prev =>
      prev.includes(point) ? prev.filter(p => p !== point) : [...prev, point]
    );
  }

  function togglePointAmelioration(point: string) {
    setPointsAmelioration(prev =>
      prev.includes(point) ? prev.filter(p => p !== point) : [...prev, point]
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00] mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-[#FF6B00] hover:underline"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour au tableau de bord
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#2C3E50] mb-2">Donner un avis</h1>
          <p className="text-gray-600">
            Partagez votre expérience avec {artisan?.raisonSociale || 'cet artisan'}
          </p>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit}>
          {/* Note */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-[#2C3E50] mb-4">
              Note globale <span className="text-red-500">*</span>
            </h2>
            <div className="flex items-center gap-4">
              {renderStars()}
              {note > 0 && (
                <span className="text-2xl font-bold text-[#FF6B00]">
                  {note}/5
                </span>
              )}
            </div>
          </div>

          {/* Commentaire */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-[#2C3E50] mb-4">
              Votre commentaire <span className="text-red-500">*</span>
            </h2>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Décrivez votre expérience avec cet artisan (minimum 10 caractères)..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B00] resize-none"
              rows={6}
              required
              minLength={10}
            />
            <p className="text-sm text-gray-500 mt-2">
              {commentaire.length}/500 caractères
            </p>
          </div>

          {/* Points forts */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-[#2C3E50] mb-4">
              Points forts <span className="text-gray-400">(optionnel)</span>
            </h2>
            <div className="flex flex-wrap gap-3">
              {POINTS_FORTS_OPTIONS.map((point) => (
                <button
                  key={point}
                  type="button"
                  onClick={() => togglePointFort(point)}
                  className={`px-4 py-2 rounded-full border-2 transition-all ${
                    pointsForts.includes(point)
                      ? 'bg-green-50 border-green-500 text-green-700 font-medium'
                      : 'border-gray-300 text-gray-600 hover:border-green-400'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {pointsForts.includes(point) && (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {point}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Points d'amélioration */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-[#2C3E50] mb-4">
              Points à améliorer <span className="text-gray-400">(optionnel)</span>
            </h2>
            <div className="flex flex-wrap gap-3">
              {POINTS_AMELIORATION_OPTIONS.map((point) => (
                <button
                  key={point}
                  type="button"
                  onClick={() => togglePointAmelioration(point)}
                  className={`px-4 py-2 rounded-full border-2 transition-all ${
                    pointsAmelioration.includes(point)
                      ? 'bg-orange-50 border-orange-500 text-orange-700 font-medium'
                      : 'border-gray-300 text-gray-600 hover:border-orange-400'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {pointsAmelioration.includes(point) && (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    )}
                    {point}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Boutons */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting || note === 0 || commentaire.trim().length < 10}
              className="flex-1 px-6 py-3 bg-[#FF6B00] text-white rounded-lg font-medium hover:bg-[#E56100] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Publication...' : 'Publier l\'avis'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
