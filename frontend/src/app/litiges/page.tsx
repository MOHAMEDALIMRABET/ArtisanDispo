'use client';

/**
 * Page - Mes Litiges (Client/Artisan)
 * Liste tous les litiges de l'utilisateur connecté
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth-service';
import { getLitigesByUser } from '@/lib/firebase/litige-service';
import { Litige, LitigeStatut, LITIGE_STATUT_LABELS } from '@/types/litige';
import LitigeCard from '@/components/litige/LitigeCard';

export default function MesLitigesPage() {
  const router = useRouter();
  const [litiges, setLitiges] = useState<Litige[]>([]);
  const [filteredLitiges, setFilteredLitiges] = useState<Litige[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatut, setFilterStatut] = useState<LitigeStatut | 'tous'>('tous');
  const [userRole, setUserRole] = useState<'client' | 'artisan'>('client');

  useEffect(() => {
    const loadLitiges = async () => {
      try {
        setLoading(true);
        const user = authService.getCurrentUser();
        if (!user) {
          router.push('/connexion');
          return;
        }

        // Déterminer le rôle de l'utilisateur
        const userData = await authService.getUserData(user.uid);
        if (!userData) {
          router.push('/connexion');
          return;
        }
        setUserRole(userData.role as 'client' | 'artisan');

        // Charger les litiges
        const data = await getLitigesByUser(user.uid);
        setLitiges(data);
        setFilteredLitiges(data);
      } catch (error) {
        console.error('Erreur chargement litiges:', error);
      } finally {
        setLoading(false);
      }
    };

    loadLitiges();
  }, [router]);

  // Filtrer par statut
  useEffect(() => {
    if (filterStatut === 'tous') {
      setFilteredLitiges(litiges);
    } else {
      setFilteredLitiges(litiges.filter(l => l.statut === filterStatut));
    }
  }, [filterStatut, litiges]);

  // Statistiques
  const stats = {
    total: litiges.length,
    ouverts: litiges.filter(l => l.statut === 'ouvert').length,
    enMediation: litiges.filter(l => l.statut === 'en_mediation').length,
    resolus: litiges.filter(l => 
      l.statut === 'resolu_accord' || 
      l.statut === 'resolu_admin' || 
      l.statut === 'resolu'
    ).length,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto mb-4"></div>
          <p className="text-slate-500">Chargement des litiges...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-navy-800 mb-2">
            Mes Litiges
          </h1>
          <p className="text-slate-500">
            Suivez l'état de vos litiges et échangez avec notre équipe de médiation
          </p>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
            <div className="text-3xl font-bold text-navy-800 mb-1">
              {stats.total}
            </div>
            <div className="text-sm text-slate-500">Total litiges</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
            <div className="text-3xl font-bold text-amber-500 mb-1">
              {stats.ouverts}
            </div>
            <div className="text-sm text-slate-500">Ouverts</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
            <div className="text-3xl font-bold text-brand-700 mb-1">
              {stats.enMediation}
            </div>
            <div className="text-sm text-slate-500">En médiation</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200">
            <div className="text-3xl font-bold text-green-700 mb-1">
              {stats.resolus}
            </div>
            <div className="text-sm text-slate-500">Résolus</div>
          </div>
        </div>

        {/* Filtres */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6 border border-slate-200">
          <div className="flex flex-wrap items-center gap-4">
            <label className="text-sm font-semibold text-navy-800">
              Filtrer par statut :
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterStatut('tous')}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                  filterStatut === 'tous'
                    ? 'bg-brand-700 text-white'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                Tous ({stats.total})
              </button>
              <button
                onClick={() => setFilterStatut('ouvert')}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                  filterStatut === 'ouvert'
                    ? 'bg-amber-400 text-white'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                Ouverts ({stats.ouverts})
              </button>
              <button
                onClick={() => setFilterStatut('en_mediation')}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                  filterStatut === 'en_mediation'
                    ? 'bg-brand-700 text-white'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                En médiation ({stats.enMediation})
              </button>
              <button
                onClick={() => setFilterStatut('resolu')}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                  filterStatut === 'resolu'
                    ? 'bg-green-700 text-white'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                Résolus ({stats.resolus})
              </button>
            </div>
          </div>
        </div>

        {/* Liste des litiges */}
        {filteredLitiges.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center border border-slate-200">
            <div className="text-6xl mb-4">🤝</div>
            <h3 className="text-xl font-bold text-navy-800 mb-2">
              {filterStatut === 'tous' 
                ? 'Aucun litige' 
                : `Aucun litige ${LITIGE_STATUT_LABELS[filterStatut as LitigeStatut]?.toLowerCase()}`}
            </h3>
            <p className="text-slate-500 mb-6">
              {filterStatut === 'tous'
                ? 'Vous n\'avez aucun litige en cours. C\'est excellent !'
                : 'Essayez un autre filtre pour voir vos litiges'}
            </p>
            {filterStatut !== 'tous' && (
              <button
                onClick={() => setFilterStatut('tous')}
                className="px-6 py-3 bg-brand-700 text-white rounded-lg hover:bg-brand-800 font-semibold"
              >
                Voir tous les litiges
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredLitiges.map(litige => (
              <LitigeCard key={litige.id} litige={litige} userRole={userRole} />
            ))}
          </div>
        )}

        {/* Info médiation */}
        <div className="mt-8 bg-blue-50 border-l-4 border-sky-600 rounded-lg p-6">
          <h3 className="font-bold text-blue-900 mb-2">
            💡 Besoin d'aide ?
          </h3>
          <p className="text-sm text-blue-900 mb-4">
            Notre équipe de médiation est à votre disposition pour résoudre tous les litiges de manière
            équitable et rapide. N'hésitez pas à fournir un maximum de détails et de preuves.
          </p>
          <div className="flex items-center gap-4 text-sm text-blue-900">
            <span>✓ Réponse sous 24h</span>
            <span>✓ Médiation gratuite</span>
            <span>✓ Solution équitable</span>
          </div>
        </div>
      </div>
    </div>
  );
}
