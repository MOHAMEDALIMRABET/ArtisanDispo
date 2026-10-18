'use client';

/**
 * Page Admin - Liste des litiges formels
 * 
 * Liste tous les litiges créés via le système formel (table litiges)
 * Permet de filtrer par statut, priorité et d'accéder aux détails
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService } from '@/lib/auth-service';
import { 
  getLitigesByAdmin,
  getLitigesStats,
} from '@/lib/firebase/litige-service';
import type { Litige } from '@/types/litige';
import {
  LITIGE_TYPE_LABELS,
  LITIGE_STATUT_LABELS,
  LITIGE_PRIORITE_LABELS,
  type LitigeStatut,
  type LitigePriorite,
} from '@/types/litige';

export default function LitigesFormelsPage() {
  const router = useRouter();
  
  const [litiges, setLitiges] = useState<Litige[]>([]);
  const [filteredLitiges, setFilteredLitiges] = useState<Litige[]>([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  
  const [filterStatut, setFilterStatut] = useState<'all' | LitigeStatut>('all');
  const [filterPriorite, setFilterPriorite] = useState<'all' | LitigePriorite>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [stats, setStats] = useState({
    total: 0,
    ouverts: 0,
    enMediation: 0,
    resolus: 0,
    abandonnes: 0,
    delaiMoyenResolution: 0,
  });

  // Vérification admin
  useEffect(() => {
    const checkAuth = async () => {
      try {
        setAuthLoading(true);
        const user = authService.getCurrentUser();
        if (!user) {
          router.push('/access-x7k9m2p4w8n3');
          return;
        }
        await loadLitiges();
        await loadStats();
      } catch (error) {
        console.error('Erreur authentification:', error);
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  const loadLitiges = async () => {
    try {
      setLoading(true);
      const data = await getLitigesByAdmin();
      setLitiges(data);
      setFilteredLitiges(data);
    } catch (error) {
      console.error('Erreur chargement litiges:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await getLitigesStats();
      setStats(statsData);
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    }
  };

  // Filtrage
  useEffect(() => {
    let filtered = [...litiges];

    // Filtre par statut
    if (filterStatut !== 'all') {
      filtered = filtered.filter(l => l.statut === filterStatut);
    }

    // Filtre par priorité
    if (filterPriorite !== 'all') {
      filtered = filtered.filter(l => l.priorite === filterPriorite);
    }

    // Filtre par recherche
    if (searchTerm) {
      filtered = filtered.filter(l => 
        l.motif?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.id.includes(searchTerm)
      );
    }

    setFilteredLitiges(filtered);
  }, [filterStatut, filterPriorite, searchTerm, litiges]);

  // Badge couleur priorité
  const getPrioriteColor = (priorite?: string) => {
    switch (priorite) {
      case 'urgente': return 'bg-red-700 text-white';
      case 'haute': return 'bg-brand-700 text-white';
      case 'moyenne': return 'bg-amber-400 text-black';
      case 'basse': return 'bg-green-700 text-white';
      default: return 'bg-slate-500 text-white';
    }
  };

  // Badge couleur statut
  const getStatutColor = (statut: string) => {
    switch (statut) {
      case 'ouvert': return 'bg-brand-700 text-white';
      case 'en_mediation': return 'bg-amber-400 text-black';
      case 'resolu_accord':
      case 'resolu_admin': return 'bg-green-700 text-white';
      case 'abandonne': return 'bg-slate-500 text-white';
      default: return 'bg-navy-800 text-white';
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto"></div>
          <p className="mt-4 text-slate-500">Chargement des litiges...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-navy-800 mb-2">
            ⚖️ Gestion des Litiges
          </h1>
          <p className="text-slate-500">
            Litiges formels déclarés par les clients ou artisans
          </p>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <p className="text-sm text-slate-500">Total</p>
            <p className="text-2xl font-bold text-navy-800">{stats.total}</p>
          </div>
          <div className="bg-brand-50 rounded-lg shadow-md p-4">
            <p className="text-sm text-slate-500">Ouverts</p>
            <p className="text-2xl font-bold text-brand-700">{stats.ouverts}</p>
          </div>
          <div className="bg-amber-50 rounded-lg shadow-md p-4">
            <p className="text-sm text-slate-500">En médiation</p>
            <p className="text-2xl font-bold text-amber-500">{stats.enMediation}</p>
          </div>
          <div className="bg-green-50 rounded-lg shadow-md p-4">
            <p className="text-sm text-slate-500">Résolus</p>
            <p className="text-2xl font-bold text-green-700">{stats.resolus}</p>
          </div>
          <div className="bg-slate-50 rounded-lg shadow-md p-4">
            <p className="text-sm text-slate-500">Délai moyen</p>
            <p className="text-2xl font-bold text-navy-800">{stats.delaiMoyenResolution}j</p>
          </div>
        </div>

        {/* Filtres */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">
                Recherche
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Motif, description, ID..."
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">
                Statut
              </label>
              <select
                value={filterStatut}
                onChange={(e) => setFilterStatut(e.target.value as any)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              >
                <option value="all">Tous les statuts</option>
                <option value="ouvert">Ouvert</option>
                <option value="en_mediation">En médiation</option>
                <option value="proposition_resolution">Proposition en attente</option>
                <option value="resolu_accord">Résolu (Accord)</option>
                <option value="resolu_admin">Résolu (Admin)</option>
                <option value="abandonne">Abandonné</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">
                Priorité
              </label>
              <select
                value={filterPriorite}
                onChange={(e) => setFilterPriorite(e.target.value as any)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              >
                <option value="all">Toutes les priorités</option>
                <option value="urgente">Urgente</option>
                <option value="haute">Haute</option>
                <option value="moyenne">Moyenne</option>
                <option value="basse">Basse</option>
              </select>
            </div>
          </div>
        </div>

        {/* Liste des litiges */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-4 bg-navy-800 text-white flex justify-between items-center">
            <h2 className="text-lg font-semibold">
              📋 Litiges ({filteredLitiges.length})
            </h2>
            <button
              onClick={() => loadLitiges()}
              className="bg-brand-700 hover:bg-brand-800 text-white px-4 py-2 rounded-lg text-sm"
            >
              🔄 Actualiser
            </button>
          </div>

          <div className="divide-y divide-slate-200">
            {filteredLitiges.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <p className="text-lg">Aucun litige trouvé</p>
                <p className="text-sm mt-2">Modifiez les filtres pour voir plus de résultats</p>
              </div>
            ) : (
              filteredLitiges.map((litige) => (
                <Link
                  key={litige.id}
                  href={`/admin/litiges/${litige.id}`}
                  className="block p-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-navy-800">
                          {litige.motif}
                        </h3>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getPrioriteColor(litige.priorite)}`}>
                          {litige.priorite ? LITIGE_PRIORITE_LABELS[litige.priorite] : 'N/A'}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatutColor(litige.statut)}`}>
                          {LITIGE_STATUT_LABELS[litige.statut]}
                        </span>
                      </div>
                      
                      <p className="text-sm text-slate-500 mb-2">
                        {LITIGE_TYPE_LABELS[litige.type]}
                      </p>
                      
                      <p className="text-sm text-slate-500 line-clamp-2">
                        {litige.description}
                      </p>
                      
                      {litige.montantConteste && litige.montantConteste > 0 && (
                        <p className="text-sm text-brand-700 font-medium mt-2">
                          💰 Montant contesté : {litige.montantConteste.toFixed(2)} €
                        </p>
                      )}
                    </div>
                    
                    <div className="text-right ml-4">
                      <p className="text-xs text-slate-500">
                        {litige.dateOuverture?.toDate().toLocaleDateString('fr-FR')}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        ID: {litige.id.slice(0, 8)}
                      </p>
                      <p className="text-sm text-brand-700 font-medium mt-2">
                        Voir détails →
                      </p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
