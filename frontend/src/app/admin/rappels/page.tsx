/**
 * Page d'administration - Gestion des demandes de rappel
 * Permet aux admins de voir et traiter les demandes "Être rappelé"
 */

'use client';

import { useEffect, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth-service';
import { getUserById } from '@/lib/firebase/user-service';
import { 
  getAllRappels, 
  getRappelStats, 
  markRappelAsTraite, 
  markRappelAsAnnule,
  formatTempsTraitement,
  type Rappel,
  type RappelStats
} from '@/lib/firebase/rappel-service';

const horaireLabels: Record<string, string> = {
  'matin': 'Matin (9h - 12h)',
  'apres-midi': 'Après-midi (14h - 18h)',
  'soir': 'Soir (18h - 20h)',
  'indifferent': 'Indifférent',
};

const statutColors = {
  'en_attente': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  'traite': 'bg-green-100 text-green-800 border-green-300',
  'annule': 'bg-slate-100 text-slate-800 border-slate-300',
};

export default function AdminRappelsPage() {
  const router = useRouter();
  const [rappels, setRappels] = useState<Rappel[]>([]);
  const [filteredRappels, setFilteredRappels] = useState<Rappel[]>([]);
  const [stats, setStats] = useState<RappelStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filterStatut, setFilterStatut] = useState<string>('all');

  useEffect(() => {
    checkAdminAccess();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadRappels();
    }
  }, [isAdmin]);

  useEffect(() => {
    // Filtrer par statut
    if (filterStatut === 'all') {
      setFilteredRappels(rappels);
    } else {
      setFilteredRappels(rappels.filter(r => r.statut === filterStatut));
    }
  }, [filterStatut, rappels]);

  async function checkAdminAccess() {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        router.push('/admin/login');
        return;
      }

      const userData = await getUserById(currentUser.uid);
      if (userData?.role !== 'admin') {
        router.push('/');
        return;
      }

      setIsAdmin(true);
    } catch (error) {
      console.error('Erreur vérification admin:', error);
      router.push('/admin/login');
    }
  }

  async function loadRappels() {
    try {
      setIsLoading(true);
      
      // Charger rappels et stats en parallèle
      const [rappelsData, statsData] = await Promise.all([
        getAllRappels(),
        getRappelStats()
      ]);
      
      setRappels(rappelsData);
      setFilteredRappels(rappelsData);
      setStats(statsData);
    } catch (error) {
      console.error('Erreur chargement rappels:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function updateStatut(rappelId: string, newStatut: 'traite' | 'annule') {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) return;

      const rappel = rappels.find(r => r.id === rappelId);
      if (!rappel) return;

      if (newStatut === 'traite') {
        await markRappelAsTraite(rappelId, currentUser.uid, rappel);
      } else {
        await markRappelAsAnnule(rappelId, currentUser.uid);
      }

      // Recharger les données
      await loadRappels();
    } catch (error) {
      console.error('Erreur mise à jour statut:', error);
      alert('Erreur lors de la mise à jour du statut');
    }
  }

  function formatDate(timestamp: Timestamp): string {
    return timestamp.toDate().toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="container mx-auto max-w-7xl">
        {/* En-tête */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-navy-800">Demandes de rappel</h1>
            <button
              onClick={() => router.push('/admin/dashboard')}
              className="flex items-center gap-2 text-slate-600 hover:text-brand-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Retour au dashboard
            </button>
          </div>
          
          {/* Statistiques */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="text-yellow-800 font-semibold text-sm">En attente</div>
              <div className="text-3xl font-bold text-yellow-900">
                {stats?.enAttente || 0}
              </div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="text-green-800 font-semibold text-sm">Traitées</div>
              <div className="text-3xl font-bold text-green-900">
                {stats?.traites || 0}
              </div>
              <div className="text-xs text-green-700 mt-1">
                Taux: {stats?.tauxTraitement || 0}%
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-blue-800 font-semibold text-sm">Temps moyen</div>
              <div className="text-2xl font-bold text-blue-900">
                {stats ? formatTempsTraitement(stats.tempsMoyenTraitement) : '-'}
              </div>
              <div className="text-xs text-blue-700 mt-1">
                Traitement
              </div>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="text-purple-800 font-semibold text-sm">Cette semaine</div>
              <div className="text-3xl font-bold text-purple-900">
                {stats?.rappelsSemaine || 0}
              </div>
              <div className="text-xs text-purple-700 mt-1">
                Aujourd'hui: {stats?.rappelsAujourdhui || 0}
              </div>
            </div>
          </div>

          {/* Filtres */}
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-700">Filtrer par statut :</span>
            <select
              value={filterStatut}
              onChange={(e) => setFilterStatut(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="all">Tous</option>
              <option value="en_attente">En attente</option>
              <option value="traite">Traitées</option>
              <option value="annule">Annulées</option>
            </select>
          </div>
        </div>

        {/* Liste des demandes */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500"></div>
            <p className="mt-4 text-slate-600">Chargement des demandes...</p>
          </div>
        ) : filteredRappels.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-slate-200">
            <svg className="w-16 h-16 mx-auto text-slate-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <p className="text-slate-600">Aucune demande de rappel</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRappels.map((rappel) => (
              <div key={rappel.id} className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-brand-700 rounded-full p-3">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-navy-800">
                        {rappel.prenom} {rappel.nom}
                      </h3>
                      <div className="text-sm text-slate-600 space-y-1 mt-2">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <a href={`tel:${rappel.telephone}`} className="text-brand-700 hover:underline font-medium">
                            {rappel.telephone}
                          </a>
                        </div>
                        {rappel.email && (
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <a href={`mailto:${rappel.email}`} className="text-brand-700 hover:underline">
                              {rappel.email}
                            </a>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {horaireLabels[rappel.horairePrefere]}
                        </div>
                        <div className="flex items-center gap-2 text-slate-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Reçue le {formatDate(rappel.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${statutColors[rappel.statut]}`}>
                      {rappel.statut === 'en_attente' && 'En attente'}
                      {rappel.statut === 'traite' && 'Traitée'}
                      {rappel.statut === 'annule' && 'Annulée'}
                    </span>
                  </div>
                </div>

                {rappel.message && (
                  <div className="bg-slate-50 rounded-lg p-4 mb-4">
                    <p className="text-sm font-medium text-slate-700 mb-1">Message :</p>
                    <p className="text-slate-600">{rappel.message}</p>
                  </div>
                )}

                {rappel.statut === 'en_attente' && rappel.id && (
                  <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
                    <button
                      onClick={() => updateStatut(rappel.id!, 'traite')}
                      className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Marquer comme traitée
                    </button>
                    <button
                      onClick={() => updateStatut(rappel.id!, 'annule')}
                      className="flex items-center gap-2 bg-slate-500 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Annuler
                    </button>
                  </div>
                )}

                {rappel.dateTraitement && (
                  <div className="text-sm text-slate-500 pt-4 border-t border-slate-200">
                    Traitée le {formatDate(rappel.dateTraitement)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
