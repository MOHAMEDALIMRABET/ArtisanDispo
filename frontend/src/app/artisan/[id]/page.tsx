'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getArtisanById } from '@/lib/firebase/artisan-service';
import { getAvisByArtisanId, calculateAverageRating } from '@/lib/firebase/avis-service';
import { getUserById } from '@/lib/firebase/user-service';
import { METIERS_MAP } from '@/lib/constants/metiers';
import type { Artisan, Avis } from '@/types/firestore';

export default function ArtisanPublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const artisanId = params.id as string;

  const [artisan, setArtisan] = useState<Artisan | null>(null);
  const [avis, setAvis] = useState<Avis[]>([]);
  const [clientsNoms, setClientsNoms] = useState<Record<string, string>>({});
  const [stats, setStats] = useState({ moyenne: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    loadData();
  }, [artisanId]);

  async function loadData() {
    try {
      const artisanData = await getArtisanById(artisanId);
      if (!artisanData) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }
      setArtisan(artisanData);

      const [avisData, statsData] = await Promise.all([
        getAvisByArtisanId(artisanData.userId),
        calculateAverageRating(artisanData.userId),
      ]);
      setAvis(avisData);
      setStats(statsData);

      // Noms des clients
      const ids = [...new Set(avisData.map(a => a.clientId))];
      const nomsMap: Record<string, string> = {};
      await Promise.all(
        ids.map(async (id) => {
          try {
            const u = await getUserById(id);
            if (u) nomsMap[id] = `${u.prenom} ${u.nom}`.trim();
          } catch {}
        })
      );
      setClientsNoms(nomsMap);

      setIsLoading(false);
    } catch (err) {
      console.error(err);
      setNotFound(true);
      setIsLoading(false);
    }
  }

  function renderStars(note: number, size: string = 'w-5 h-5') {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            className={`${size} ${star <= note ? 'text-yellow-400 fill-current' : 'text-slate-300 fill-current'}`}
            viewBox="0 0 24 24"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        ))}
      </div>
    );
  }

  function formatDate(timestamp: any): string {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-slate-500">Chargement du profil...</p>
        </div>
      </div>
    );
  }

  if (notFound || !artisan) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">😔</div>
          <h1 className="text-2xl font-bold text-navy-800 mb-2">Artisan introuvable</h1>
          <p className="text-slate-500 mb-6">Ce profil n'existe pas ou a été supprimé.</p>
          <Link href="/recherche" className="bg-brand-700 text-white px-6 py-3 rounded-lg font-semibold hover:bg-brand-800 transition-colors">
            Retour à la recherche
          </Link>
        </div>
      </div>
    );
  }

  const zone = artisan.zonesIntervention?.[0];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-navy-800 text-white py-8">
        <div className="container mx-auto px-4 max-w-4xl">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-slate-300 hover:text-brand-700 mb-4 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour aux résultats
          </button>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">{artisan.raisonSociale}</h1>
              {zone && (
                <p className="text-slate-300 mt-1 flex items-center gap-2">
                  <svg className="w-4 h-4 text-brand-700" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  {zone.ville} {zone.codePostal ? `(${zone.codePostal})` : ''}
                  {zone.rayonKm ? ` · Rayon ${zone.rayonKm} km` : ''}
                </p>
              )}
              {artisan.metiers && artisan.metiers.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {artisan.metiers.map((m) => (
                    <span key={m} className="bg-brand-700 text-white px-3 py-1 rounded-full text-sm font-medium">
                      {(METIERS_MAP as Record<string, string>)[m] || m}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {stats.total > 0 && (
              <div className="bg-white bg-opacity-10 rounded-xl px-6 py-4 text-center flex-shrink-0">
                <div className="text-4xl font-bold text-brand-700">{stats.moyenne.toFixed(1)}</div>
                {renderStars(Math.round(stats.moyenne), 'w-5 h-5')}
                <p className="text-slate-300 text-sm mt-1">{stats.total} avis</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-4xl py-8">

        {/* Présentation */}
        {artisan.presentation && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
            <h2 className="text-lg font-bold text-navy-800 mb-3">À propos</h2>
            <p className="text-slate-500 leading-relaxed">{artisan.presentation}</p>
          </div>
        )}

        {/* Avis */}
        <div>
          <h2 className="text-2xl font-bold text-navy-800 mb-4">
            ⭐ Avis clients
            {stats.total > 0 && (
              <span className="ml-2 text-lg font-normal text-slate-500">
                ({stats.total} avis · {stats.moyenne.toFixed(1)}/5)
              </span>
            )}
          </h2>

          {avis.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 text-center">
              <div className="text-5xl mb-4">💬</div>
              <p className="text-navy-800 font-semibold text-lg">Aucun avis pour le moment</p>
              <p className="text-slate-500 mt-2">Cet artisan n'a pas encore reçu d'avis.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {avis.map((avisItem) => (
                <div key={avisItem.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-lg transition-shadow">
                  {/* En-tête */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-11 h-11 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-sm">
                        {(clientsNoms[avisItem.clientId] || 'CL').substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-navy-800">
                          {clientsNoms[avisItem.clientId] || 'Client vérifié'}
                        </span>
                        <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Vérifié
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {renderStars(avisItem.note)}
                        <span className="text-brand-700 font-bold">{avisItem.note}/5</span>
                        <span className="text-sm text-slate-500">· {formatDate(avisItem.dateCreation)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Points forts */}
                  {avisItem.points_forts && avisItem.points_forts.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {avisItem.points_forts.map((point, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-full text-sm font-medium">
                          ✓ {point}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Commentaire */}
                  {avisItem.commentaire && (
                    <div className="bg-slate-50 border-l-4 border-slate-300 px-4 py-3 rounded-r-lg mb-4">
                      <p className="text-navy-800 leading-relaxed">"{avisItem.commentaire}"</p>
                    </div>
                  )}

                  {/* Photos */}
                  {avisItem.photos && avisItem.photos.length > 0 && (
                    <div className="flex gap-3 mb-4 overflow-x-auto pb-1">
                      {avisItem.photos.map((photo, idx) => (
                        <img
                          key={idx}
                          src={photo}
                          alt={`Photo ${idx + 1}`}
                          className="h-24 w-24 object-cover rounded-lg border-2 border-slate-200 hover:border-brand-500 transition-colors cursor-pointer flex-shrink-0"
                        />
                      ))}
                    </div>
                  )}

                  {/* Réponse artisan */}
                  {avisItem.reponseArtisan && (
                    <div className="bg-orange-50 border-l-4 border-brand-500 px-4 py-3 rounded-r-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-brand-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        <span className="font-semibold text-navy-800 text-sm">Réponse de {artisan.raisonSociale}</span>
                        <span className="text-xs text-slate-500">· {formatDate(avisItem.reponseArtisan.date)}</span>
                      </div>
                      <p className="text-navy-800 text-sm leading-relaxed">{avisItem.reponseArtisan.contenu}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
