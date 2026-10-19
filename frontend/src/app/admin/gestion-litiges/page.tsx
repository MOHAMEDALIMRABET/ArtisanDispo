'use client';

/**
 * Dashboard Admin - Gestion des Litiges
 * Page: /admin/gestion-litiges
 * 
 * Fonctionnalités :
 * - Vue d'ensemble des litiges (statistiques)
 * - Liste complète avec filtres (statut, priorité, type)
 * - Détails de chaque litige avec timeline
 * - Actions admin : médiation, proposition résolution, clôture
 * - Historique complet des actions
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth-service';
import {
  getAllLitiges,
  getLitigeById,
  updateLitigeStatus,
  addLitigeComment,
  proposeLitigeResolution,
} from '@/lib/firebase/litige-service';
import { getUserById } from '@/lib/firebase/user-service';
import { getDevisById } from '@/lib/firebase/devis-service';
import {
  Litige,
  LitigeStatut,
  LitigeType,
  LitigePriorite,
  LITIGE_STATUT_LABELS,
  LITIGE_TYPE_LABELS,
  LITIGE_STATUT_COLORS,
  LITIGE_PRIORITE_LABELS,
  LITIGE_PRIORITE_COLORS,
} from '@/types/litige';
import LitigeTimeline from '@/components/litiges/LitigeTimeline';
import LitigesNavigation from '@/components/admin/LitigesNavigation';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Scale,
  MessageSquare,
  FileText,
  Filter,
  Search,
  RefreshCw,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface LitigeWithDetails extends Litige {
  clientNom?: string;
  artisanNom?: string;
  devisMontant?: number;
}

interface Stats {
  total: number;
  ouverts: number;
  enMediation: number;
  resolus: number;
  parPriorite: Record<LitigePriorite, number>;
  parType: Record<LitigeType, number>;
}

export default function AdminGestionLitigesPage() {
  const router = useRouter();

  // États
  const [litiges, setLitiges] = useState<LitigeWithDetails[]>([]);
  const [filteredLitiges, setFilteredLitiges] = useState<LitigeWithDetails[]>([]);
  const [selectedLitige, setSelectedLitige] = useState<LitigeWithDetails | null>(null);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    ouverts: 0,
    enMediation: 0,
    resolus: 0,
    parPriorite: { urgente: 0, haute: 0, moyenne: 0, basse: 0 },
    parType: {
      non_conformite: 0,
      retard: 0,
      abandon_chantier: 0,
      facture_excessive: 0,
      malfacon: 0,
      non_respect_delais: 0,
      autre: 0,
    },
  });

  // Filtres
  const [filterStatut, setFilterStatut] = useState<LitigeStatut | 'tous'>('tous');
  const [filterPriorite, setFilterPriorite] = useState<LitigePriorite | 'tous'>('tous');
  const [filterType, setFilterType] = useState<LitigeType | 'tous'>('tous');
  const [searchTerm, setSearchTerm] = useState('');

  // UI
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'mediation' | 'proposition' | 'cloture'>('mediation');
  const [actionComment, setActionComment] = useState('');
  const [propositionMontant, setPropositionMontant] = useState<number>(0);

  // Authentification et chargement initial
  useEffect(() => {
    const checkAuthAndLoad = async () => {
      try {
        const user = authService.getCurrentUser();
        if (!user) {
          router.push('/admin/login');
          return;
        }

        // Vérifier rôle admin
        const userData = await getUserById(user.uid);
        if (userData?.role !== 'admin') {
          router.push('/');
          return;
        }

        await loadLitiges();
      } catch (error) {
        console.error('Erreur authentification:', error);
        router.push('/admin/login');
      }
    };

    checkAuthAndLoad();
  }, [router]);

  // Charger tous les litiges
  const loadLitiges = async () => {
    try {
      setLoading(true);
      const allLitiges = await getAllLitiges();

      // Enrichir avec infos clients/artisans/devis
      const enrichedLitiges = await Promise.all(
        allLitiges.map(async (litige) => {
          try {
            const [client, artisan, devis] = await Promise.all([
              getUserById(litige.clientId),
              getUserById(litige.artisanId),
              getDevisById(litige.devisId),
            ]);

            return {
              ...litige,
              clientNom: client ? `${client.prenom} ${client.nom}` : 'Client inconnu',
              artisanNom: artisan ? `${artisan.prenom} ${artisan.nom}` : 'Artisan inconnu',
              devisMontant: devis?.totaux?.totalTTC || 0,
            } as LitigeWithDetails;
          } catch (error) {
            console.error(`Erreur enrichissement litige ${litige.id}:`, error);
            return litige as LitigeWithDetails;
          }
        })
      );

      setLitiges(enrichedLitiges);
      setFilteredLitiges(enrichedLitiges);
      calculateStats(enrichedLitiges);
    } catch (error) {
      console.error('Erreur chargement litiges:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculer statistiques
  const calculateStats = (litigesData: Litige[]) => {
    const newStats: Stats = {
      total: litigesData.length,
      ouverts: 0,
      enMediation: 0,
      resolus: 0,
      parPriorite: { urgente: 0, haute: 0, moyenne: 0, basse: 0 },
      parType: {
        non_conformite: 0,
        retard: 0,
        abandon_chantier: 0,
        facture_excessive: 0,
        malfacon: 0,
        non_respect_delais: 0,
        autre: 0,
      },
    };

    litigesData.forEach((litige) => {
      // Statuts
      if (litige.statut === 'ouvert') newStats.ouverts++;
      if (litige.statut === 'en_mediation') newStats.enMediation++;
      if (['resolu_accord', 'resolu_admin', 'resolu'].includes(litige.statut)) {
        newStats.resolus++;
      }

      // Priorité
      if (litige.priorite) {
        newStats.parPriorite[litige.priorite]++;
      }

      // Type
      newStats.parType[litige.type]++;
    });

    setStats(newStats);
  };

  // Appliquer filtres
  useEffect(() => {
    let filtered = [...litiges];

    // Filtre statut
    if (filterStatut !== 'tous') {
      filtered = filtered.filter((l) => l.statut === filterStatut);
    }

    // Filtre priorité
    if (filterPriorite !== 'tous') {
      filtered = filtered.filter((l) => l.priorite === filterPriorite);
    }

    // Filtre type
    if (filterType !== 'tous') {
      filtered = filtered.filter((l) => l.type === filterType);
    }

    // Recherche
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.id.toLowerCase().includes(term) ||
          l.clientNom?.toLowerCase().includes(term) ||
          l.artisanNom?.toLowerCase().includes(term) ||
          l.description.toLowerCase().includes(term)
      );
    }

    setFilteredLitiges(filtered);
  }, [filterStatut, filterPriorite, filterType, searchTerm, litiges]);

  // Sélectionner litige pour détails
  const handleSelectLitige = async (litigeId: string) => {
    try {
      const litige = await getLitigeById(litigeId);
      if (litige) {
        // Enrichir avec infos
        const [client, artisan, devis] = await Promise.all([
          getUserById(litige.clientId),
          getUserById(litige.artisanId),
          getDevisById(litige.devisId),
        ]);

        setSelectedLitige({
          ...litige,
          clientNom: client ? `${client.prenom} ${client.nom}` : 'Client inconnu',
          artisanNom: artisan ? `${artisan.prenom} ${artisan.nom}` : 'Artisan inconnu',
          devisMontant: devis?.totaux?.totalTTC || 0,
        });
      }
    } catch (error) {
      console.error('Erreur sélection litige:', error);
    }
  };

  // Ouvrir modal action
  const openActionModal = (type: typeof actionType) => {
    setActionType(type);
    setActionComment('');
    setPropositionMontant(selectedLitige?.montantConteste || 0);
    setShowActionModal(true);
  };

  // Exécuter action admin
  const handleAdminAction = async () => {
    if (!selectedLitige) return;

    try {
      setActionLoading(true);
      const user = authService.getCurrentUser();
      if (!user) throw new Error('Non authentifié');

      switch (actionType) {
        case 'mediation':
          // Passer en médiation
          await updateLitigeStatus(selectedLitige.id, 'en_mediation');
          if (actionComment.trim()) {
            await addLitigeComment(selectedLitige.id, user.uid, 'admin', actionComment);
          }
          break;

        case 'proposition':
          // Proposer résolution
          await proposeLitigeResolution(
            selectedLitige.id,
            user.uid,
            actionComment,
            propositionMontant
          );
          break;

        case 'cloture':
          // Clôturer
          await updateLitigeStatus(selectedLitige.id, 'clos_sans_suite');
          if (actionComment.trim()) {
            await addLitigeComment(selectedLitige.id, user.uid, 'admin', actionComment);
          }
          break;
      }

      // Recharger
      await loadLitiges();
      await handleSelectLitige(selectedLitige.id);
      setShowActionModal(false);
      setActionComment('');
    } catch (error) {
      console.error('Erreur action admin:', error);
      alert('Erreur lors de l\'action. Veuillez réessayer.');
    } finally {
      setActionLoading(false);
    }
  };

  // Badge statut
  const getStatutBadge = (statut: LitigeStatut) => {
    const color = LITIGE_STATUT_COLORS[statut] || '#6C757D';
    return (
      <span
        className="px-2 py-1 rounded-full text-xs font-medium text-white"
        style={{ backgroundColor: color }}
      >
        {LITIGE_STATUT_LABELS[statut]}
      </span>
    );
  };

  // Badge priorité
  const getPrioriteBadge = (priorite: LitigePriorite) => {
    const color = LITIGE_PRIORITE_COLORS[priorite];
    return (
      <span
        className="px-2 py-1 rounded-full text-xs font-medium text-white"
        style={{ backgroundColor: color }}
      >
        {LITIGE_PRIORITE_LABELS[priorite]}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-brand-700 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Chargement des litiges...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <LitigesNavigation />
      <div className="py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-navy-800 mb-2">Gestion des Litiges</h1>
          <p className="text-slate-600">
            Médiation et résolution des litiges entre clients et artisans
          </p>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total</p>
                <p className="text-3xl font-bold text-navy-800">{stats.total}</p>
              </div>
              <FileText className="w-12 h-12 text-slate-400" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Ouverts</p>
                <p className="text-3xl font-bold text-brand-700">{stats.ouverts}</p>
              </div>
              <AlertTriangle className="w-12 h-12 text-brand-700" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">En médiation</p>
                <p className="text-3xl font-bold text-amber-500">{stats.enMediation}</p>
              </div>
              <Scale className="w-12 h-12 text-amber-500" />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Résolus</p>
                <p className="text-3xl font-bold text-green-700">{stats.resolus}</p>
              </div>
              <CheckCircle className="w-12 h-12 text-green-700" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Panneau gauche - Liste des litiges */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-xl font-bold text-navy-800 mb-4">
              Liste des litiges ({filteredLitiges.length})
            </h2>

            {/* Filtres */}
            <div className="mb-6 space-y-4">
              {/* Recherche */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Rechercher par ID, client, artisan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>

              {/* Filtres */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Statut
                  </label>
                  <select
                    value={filterStatut}
                    onChange={(e) => setFilterStatut(e.target.value as LitigeStatut | 'tous')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  >
                    <option value="tous">Tous</option>
                    <option value="ouvert">Ouvert</option>
                    <option value="en_mediation">En médiation</option>
                    <option value="proposition_resolution">Proposition</option>
                    <option value="resolu_accord">Résolu (accord)</option>
                    <option value="resolu_admin">Résolu (admin)</option>
                    <option value="clos_sans_suite">Clos sans suite</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Priorité
                  </label>
                  <select
                    value={filterPriorite}
                    onChange={(e) =>
                      setFilterPriorite(e.target.value as LitigePriorite | 'tous')
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  >
                    <option value="tous">Toutes</option>
                    <option value="urgente">Urgente</option>
                    <option value="haute">Haute</option>
                    <option value="moyenne">Moyenne</option>
                    <option value="basse">Basse</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Type
                  </label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as LitigeType | 'tous')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  >
                    <option value="tous">Tous</option>
                    {Object.entries(LITIGE_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Liste */}
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {filteredLitiges.length === 0 ? (
                <div className="text-center py-12">
                  <AlertTriangle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">Aucun litige trouvé</p>
                </div>
              ) : (
                filteredLitiges.map((litige) => (
                  <div
                    key={litige.id}
                    onClick={() => handleSelectLitige(litige.id)}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      selectedLitige?.id === litige.id
                        ? 'border-brand-500 bg-orange-50'
                        : 'border-slate-200 hover:border-brand-500 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-navy-800">
                            Litige #{litige.id.substring(0, 8)}
                          </span>
                          {litige.priorite && getPrioriteBadge(litige.priorite)}
                        </div>
                        <p className="text-sm text-slate-600 mb-2">
                          {LITIGE_TYPE_LABELS[litige.type]}
                        </p>
                      </div>
                      {getStatutBadge(litige.statut)}
                    </div>

                    <div className="text-sm text-slate-700 mb-2 line-clamp-2">
                      {litige.description}
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <div>
                        <span className="font-medium">Client:</span> {litige.clientNom}
                      </div>
                      <div>
                        <span className="font-medium">Artisan:</span> {litige.artisanNom}
                      </div>
                    </div>

                    {litige.montantConteste && litige.montantConteste > 0 && (
                      <div className="mt-2 text-sm font-medium text-brand-700">
                        Montant contesté : {litige.montantConteste.toFixed(2)} €
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Panneau droit - Détails */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            {selectedLitige ? (
              <>
                <h2 className="text-xl font-bold text-navy-800 mb-4">Détails du litige</h2>

                {/* Informations générales */}
                <div className="space-y-3 mb-6">
                  <div>
                    <p className="text-sm text-slate-600">ID</p>
                    <p className="font-medium text-navy-800">
                      {selectedLitige.id.substring(0, 12)}...
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-600">Statut</p>
                    {getStatutBadge(selectedLitige.statut)}
                  </div>

                  {selectedLitige.priorite && (
                    <div>
                      <p className="text-sm text-slate-600">Priorité</p>
                      {getPrioriteBadge(selectedLitige.priorite)}
                    </div>
                  )}

                  <div>
                    <p className="text-sm text-slate-600">Type</p>
                    <p className="font-medium text-navy-800">
                      {LITIGE_TYPE_LABELS[selectedLitige.type]}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-600">Client</p>
                    <p className="font-medium text-navy-800">{selectedLitige.clientNom}</p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-600">Artisan</p>
                    <p className="font-medium text-navy-800">{selectedLitige.artisanNom}</p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-600">Date d'ouverture</p>
                    <p className="font-medium text-navy-800">
                      {selectedLitige.dateOuverture
                        ? formatDate(selectedLitige.dateOuverture.toDate())
                        : '-'}
                    </p>
                  </div>

                  {selectedLitige.montantConteste && selectedLitige.montantConteste > 0 && (
                    <div>
                      <p className="text-sm text-slate-600">Montant contesté</p>
                      <p className="font-bold text-brand-700 text-lg">
                        {selectedLitige.montantConteste.toFixed(2)} €
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-sm text-slate-600 mb-1">Description</p>
                    <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">
                      {selectedLitige.description}
                    </p>
                  </div>
                </div>

                {/* Actions admin */}
                <div className="border-t pt-4 mb-6">
                  <p className="text-sm font-medium text-slate-700 mb-3">Actions admin</p>
                  <div className="space-y-2">
                    {selectedLitige.statut === 'ouvert' && (
                      <button
                        onClick={() => openActionModal('mediation')}
                        className="w-full px-4 py-2 bg-amber-400 text-white rounded-lg hover:bg-yellow-600 transition-colors flex items-center justify-center gap-2"
                      >
                        <Scale className="w-4 h-4" />
                        Passer en médiation
                      </button>
                    )}

                    {['ouvert', 'en_mediation'].includes(selectedLitige.statut) && (
                      <button
                        onClick={() => openActionModal('proposition')}
                        className="w-full px-4 py-2 bg-brand-700 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
                      >
                        <MessageSquare className="w-4 h-4" />
                        Proposer résolution
                      </button>
                    )}

                    <button
                      onClick={() => openActionModal('cloture')}
                      className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      Clôturer sans suite
                    </button>
                  </div>
                </div>

                {/* Timeline */}
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-slate-700 mb-3">
                    Historique des actions
                  </p>
                  <LitigeTimeline 
                    historique={selectedLitige.historique} 
                    currentUserId={authService.getCurrentUser()?.uid || ''}
                  />
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <Clock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">Sélectionnez un litige pour voir les détails</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Action Admin */}
      {showActionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-navy-800 mb-4">
              {actionType === 'mediation' && 'Passer en médiation'}
              {actionType === 'proposition' && 'Proposer une résolution'}
              {actionType === 'cloture' && 'Clôturer le litige'}
            </h3>

            <div className="space-y-4 mb-6">
              {actionType === 'proposition' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Montant proposé (€)
                  </label>
                  <input
                    type="number"
                    value={propositionMontant}
                    onChange={(e) => setPropositionMontant(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    min="0"
                    step="0.01"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Commentaire {actionType === 'proposition' ? '(obligatoire)' : '(optionnel)'}
                </label>
                <textarea
                  value={actionComment}
                  onChange={(e) => setActionComment(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  placeholder="Expliquez votre décision..."
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowActionModal(false)}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleAdminAction}
                disabled={
                  actionLoading ||
                  (actionType === 'proposition' && !actionComment.trim())
                }
                className="flex-1 px-4 py-2 bg-brand-700 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'En cours...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
