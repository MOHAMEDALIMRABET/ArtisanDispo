'use client';

/**
 * Dashboard Admin - Gestion et Vérification des Artisans
 * Page: /admin/verifications
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth-service';
import { getAllArtisansForAdmin } from '@/lib/firebase/artisan-service';
import { validateDocument, rejectDocument } from '@/lib/firebase/verification-service';
import { artisanDoitDecennale } from '@/lib/decennale-helper';
import type { Artisan } from '@/types/firestore';

type FilterType = 'all' | 'pending' | 'verified' | 'rejected';

export default function AdminVerificationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [artisans, setArtisans] = useState<Artisan[]>([]);
  const [filteredArtisans, setFilteredArtisans] = useState<Artisan[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal de détail
  const [selectedArtisan, setSelectedArtisan] = useState<Artisan | null>(null);
  const [showModal, setShowModal] = useState(false);
  
  // État pour les actions
  const [actionLoading, setActionLoading] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectDocType, setRejectDocType] = useState<'kbis' | 'idCard' | 'rcPro' | 'decennale' | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    checkAdminAndLoad();
  }, []);

  const checkAdminAndLoad = async () => {
    try {
      const user = authService.getCurrentUser();
      if (!user) {
        router.push('/access-x7k9m2p4w8n3');
        return;
      }

      // TODO: Vérifier que c'est un admin
      await loadArtisans();
    } catch (error) {
      console.error('Erreur:', error);
      setLoading(false);
    }
  };

  const loadArtisans = async () => {
    try {
      const data = await getAllArtisansForAdmin();
      setArtisans(data);
      applyFilters(selectedFilter, searchTerm, data);
    } catch (error) {
      console.error('Erreur chargement artisans:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (filter: FilterType, search: string, data: Artisan[]) => {
    let filtered = data;

    // Filtre par statut
    if (filter === 'pending') {
      filtered = filtered.filter(a => {
        const kbisPending = !!a.verificationDocuments?.kbis?.url && !a.verificationDocuments?.kbis?.verified;
        const idPending = !!a.verificationDocuments?.idCard?.url && !a.verificationDocuments?.idCard?.verified;
        const rcProPending = !!a.verificationDocuments?.rcPro?.url && !a.verificationDocuments?.rcPro?.verified;
        const needsDecennale = a.metiers && artisanDoitDecennale(a.metiers);
        const decennalePending = needsDecennale && !!a.verificationDocuments?.decennale?.url && !a.verificationDocuments?.decennale?.verified;
        return kbisPending || idPending || rcProPending || decennalePending;
      });
    } else if (filter === 'verified') {
      filtered = filtered.filter(a => 
        a.verificationDocuments?.kbis?.verified && 
        a.verificationDocuments?.idCard?.verified && 
        a.verificationDocuments?.rcPro?.verified
      );
    } else if (filter === 'rejected') {
      filtered = filtered.filter(a => 
        a.verificationDocuments?.kbis?.rejected || 
        a.verificationDocuments?.idCard?.rejected || 
        a.verificationDocuments?.rcPro?.rejected
      );
    }

    // Recherche
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(a => 
        a.nom?.toLowerCase().includes(searchLower) ||
        a.prenom?.toLowerCase().includes(searchLower) ||
        a.siret?.includes(search) ||
        a.raisonSociale?.toLowerCase().includes(searchLower)
      );
    }

    setFilteredArtisans(filtered);
  };

  const handleFilterChange = (filter: FilterType) => {
    setSelectedFilter(filter);
    applyFilters(filter, searchTerm, artisans);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    applyFilters(selectedFilter, value, artisans);
  };

  const handleValidateDocument = async (documentType: 'kbis' | 'idCard' | 'rcPro' | 'decennale') => {
    if (!selectedArtisan) return;
    
    const docName = documentType === 'kbis' ? 'KBIS' : 
                    documentType === 'idCard' ? 'Pièce d\'identité' : 
                    documentType === 'rcPro' ? 'RC Pro' : 
                    'Garantie Décennale';
    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir valider le document ${docName} ?`
    );
    
    if (!confirmed) return;
    
    setActionLoading(true);
    try {
      const adminId = authService.getCurrentUser()?.uid || 'admin';
      const result = await validateDocument(selectedArtisan.userId, documentType, adminId);
      
      if (result.success) {
        alert('Document validé avec succès !');
        // Recharger les données
        await loadArtisans();
        // Recharger l'artisan sélectionné
        const updatedArtisans = await getAllArtisansForAdmin();
        const updatedArtisan = updatedArtisans.find(a => a.userId === selectedArtisan.userId);
        if (updatedArtisan) {
          setSelectedArtisan(updatedArtisan);
        }
      } else {
        alert('Erreur: ' + (result.error || 'Échec de la validation'));
      }
    } catch (error) {
      console.error('Erreur validation:', error);
      alert('Une erreur est survenue lors de la validation');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectDocument = (documentType: 'kbis' | 'idCard' | 'rcPro') => {
    setRejectDocType(documentType);
    setRejectReason('');
    setShowRejectDialog(true);
  };

  const confirmRejectDocument = async () => {
    if (!selectedArtisan || !rejectDocType || !rejectReason.trim()) {
      alert('Veuillez saisir une raison de rejet');
      return;
    }
    
    setActionLoading(true);
    try {
      const adminId = authService.getCurrentUser()?.uid || 'admin';
      const result = await rejectDocument(selectedArtisan.userId, rejectDocType, adminId, rejectReason);
      
      if (result.success) {
        alert('Document rejeté avec succès !');
        setShowRejectDialog(false);
        setRejectReason('');
        setRejectDocType(null);
        // Recharger les données
        await loadArtisans();
        // Recharger l'artisan sélectionné
        const updatedArtisans = await getAllArtisansForAdmin();
        const updatedArtisan = updatedArtisans.find(a => a.userId === selectedArtisan.userId);
        if (updatedArtisan) {
          setSelectedArtisan(updatedArtisan);
        }
      } else {
        alert('Erreur: ' + (result.error || 'Échec du rejet'));
      }
    } catch (error) {
      console.error('Erreur rejet:', error);
      alert('Une erreur est survenue lors du rejet');
    } finally {
      setActionLoading(false);
    }
  };

  const getDocumentStatus = (doc: any): 'missing' | 'pending' | 'verified' | 'rejected' => {
    if (!doc?.url) return 'missing';
    if (doc.rejected) return 'rejected';
    if (doc.verified) return 'verified';
    return 'pending';
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      missing: <span className="text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded-full">📄 Manquant</span>,
      pending: <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">⏳ En attente</span>,
      verified: <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">✅ Vérifié</span>,
      rejected: <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">❌ Rejeté</span>,
    };
    return badges[status as keyof typeof badges] || badges.missing;
  };

  const pendingCount = artisans.filter(a => {
    const kbisPending = !!a.verificationDocuments?.kbis?.url && !a.verificationDocuments?.kbis?.verified;
    const idPending = !!a.verificationDocuments?.idCard?.url && !a.verificationDocuments?.idCard?.verified;
    return kbisPending || idPending;
  }).length;

  const verifiedCount = artisans.filter(a => 
    a.verificationDocuments?.kbis?.verified && a.verificationDocuments?.idCard?.verified
  ).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto"></div>
          <p className="mt-4 text-slate-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Gestion des Artisans</h1>
          <p className="text-slate-600 mt-2">Vérification et validation des documents</p>
        </div>

        {/* Filtres */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex flex-wrap gap-3 mb-4">
            <button
              onClick={() => handleFilterChange('all')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                selectedFilter === 'all'
                  ? 'bg-brand-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Tous ({artisans.length})
            </button>
            <button
              onClick={() => handleFilterChange('pending')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                selectedFilter === 'pending'
                  ? 'bg-brand-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              ⏳ En attente ({pendingCount})
            </button>
            <button
              onClick={() => handleFilterChange('verified')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                selectedFilter === 'verified'
                  ? 'bg-brand-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              ✅ Vérifiés ({verifiedCount})
            </button>
            <button
              onClick={() => handleFilterChange('rejected')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                selectedFilter === 'rejected'
                  ? 'bg-brand-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              ❌ Rejetés
            </button>
          </div>

          {/* Recherche */}
          <input
            type="text"
            placeholder="Rechercher par nom, SIRET, entreprise..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>

        {/* Tableau */}
        <div className="bg-white rounded-lg shadow-md overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Artisan
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Entreprise
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  SIRET
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  KBIS
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Pièce ID
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  RC Pro
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Décennale
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredArtisans.map((artisan) => {
                const kbisStatus = getDocumentStatus(artisan.verificationDocuments?.kbis);
                const idStatus = getDocumentStatus(artisan.verificationDocuments?.idCard);
                const rcProStatus = getDocumentStatus(artisan.verificationDocuments?.rcPro);
                const needsDecennale = artisan.metiers && artisanDoitDecennale(artisan.metiers);
                const decennaleStatus = needsDecennale ? getDocumentStatus(artisan.verificationDocuments?.decennale) : null;

                return (
                  <tr key={artisan.userId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div>
                        <div className="font-medium text-slate-900 text-sm">
                          {artisan.nom} {artisan.prenom}
                        </div>
                        <div className="text-xs text-slate-500">{artisan.email}</div>
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="text-sm text-slate-900 max-w-[140px] truncate" title={artisan.raisonSociale || '-'}>{artisan.raisonSociale || '-'}</div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="text-sm font-mono text-slate-900">{artisan.siret}</div>
                      {artisan.siretVerified && (
                        <span className="text-xs text-green-600">✓ SIRENE</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(kbisStatus)}
                        {artisan.verificationDocuments?.kbis?.uploadHistory && 
                         artisan.verificationDocuments.kbis.uploadHistory.length > 3 && (
                          <span className="bg-yellow-100 text-yellow-800 text-xs px-1.5 py-0.5 rounded" title={`${artisan.verificationDocuments.kbis.uploadHistory.length} uploads`}>
                            {artisan.verificationDocuments.kbis.uploadHistory.length}×
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(idStatus)}
                        {artisan.verificationDocuments?.idCard?.uploadHistory && 
                         artisan.verificationDocuments.idCard.uploadHistory.length > 3 && (
                          <span className="bg-yellow-100 text-yellow-800 text-xs px-1.5 py-0.5 rounded" title={`${artisan.verificationDocuments.idCard.uploadHistory.length} uploads`}>
                            {artisan.verificationDocuments.idCard.uploadHistory.length}×
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(rcProStatus)}
                        {artisan.verificationDocuments?.rcPro?.uploadHistory && 
                         artisan.verificationDocuments.rcPro.uploadHistory.length > 3 && (
                          <span className="bg-yellow-100 text-yellow-800 text-xs px-1.5 py-0.5 rounded" title={`${artisan.verificationDocuments.rcPro.uploadHistory.length} uploads`}>
                            {artisan.verificationDocuments.rcPro.uploadHistory.length}×
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {needsDecennale ? (
                        <div className="flex items-center gap-2">
                          {decennaleStatus ? getStatusBadge(decennaleStatus) : (
                            <span className="text-xs text-slate-400">Non uploadé</span>
                          )}
                          {artisan.verificationDocuments?.decennale?.uploadHistory && 
                           artisan.verificationDocuments.decennale.uploadHistory.length > 3 && (
                            <span className="bg-yellow-100 text-yellow-800 text-xs px-1.5 py-0.5 rounded" title={`${artisan.verificationDocuments.decennale.uploadHistory.length} uploads`}>
                              {artisan.verificationDocuments.decennale.uploadHistory.length}×
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Non requise</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => {
                          setSelectedArtisan(artisan);
                          setShowModal(true);
                        }}
                        className="text-brand-700 hover:text-brand-800 font-semibold whitespace-nowrap"
                      >
                        Voir détails
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredArtisans.length === 0 && (
            <div className="text-center py-12">
              <p className="text-slate-500">Aucun artisan trouvé</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de détail complet */}
      {showModal && selectedArtisan && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto"
          onClick={() => setShowModal(false)}
        >
          <div 
            className="bg-white rounded-lg w-full max-w-6xl my-8"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header du modal */}
            <div className="border-b border-slate-200 px-6 py-4 flex justify-between items-center bg-navy-800 text-white rounded-t-lg">
              <div>
                <h2 className="text-2xl font-bold">
                  {selectedArtisan.nom} {selectedArtisan.prenom}
                </h2>
                <p className="text-slate-300 text-sm mt-1">{selectedArtisan.email}</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-white hover:text-slate-300 text-3xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 max-h-[80vh] overflow-y-auto">
              {/* Grid à 2 colonnes */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Colonne 1: Informations Artisan & Entreprise */}
                <div className="space-y-6">
                  
                  {/* Informations Artisan */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
                      👤 Informations Artisan
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-slate-500 uppercase">Nom complet</label>
                        <p className="text-slate-900 font-medium">
                          {selectedArtisan.nom && selectedArtisan.prenom 
                            ? `${selectedArtisan.nom} ${selectedArtisan.prenom}`
                            : selectedArtisan.nom || selectedArtisan.prenom || '-'
                          }
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 uppercase">Email</label>
                        <p className="text-slate-900">{selectedArtisan.email || '-'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 uppercase">Téléphone</label>
                        <p className="text-slate-900">{selectedArtisan.telephone || '-'}</p>
                        {selectedArtisan.telephoneVerified && (
                          <span className="text-xs text-green-600 ml-2">✓ Vérifié</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Informations Entreprise */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
                      🏢 Informations Entreprise
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-slate-500 uppercase">SIRET</label>
                        <p className="text-slate-900 font-mono">{selectedArtisan.siret}</p>
                        {selectedArtisan.siretVerified && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full inline-block mt-1">
                            ✓ Vérifié SIRENE
                          </span>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 uppercase">Raison sociale</label>
                        <p className="text-slate-900">{selectedArtisan.raisonSociale || '-'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 uppercase">Forme juridique</label>
                        <p className="text-slate-900">{selectedArtisan.formeJuridique || '-'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 uppercase">Métiers</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {selectedArtisan.metiers?.map((metier, idx) => (
                            <span 
                              key={idx}
                              className="bg-brand-700 text-white px-3 py-1 rounded-full text-sm"
                            >
                              {metier}
                            </span>
                          )) || <span className="text-slate-500">Aucun métier</span>}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 uppercase">Inscription</label>
                        <p className="text-slate-900 text-sm">
                          {selectedArtisan.dateInscription 
                            ? new Date(selectedArtisan.dateInscription.toDate()).toLocaleDateString('fr-FR')
                            : '-'
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Zone d'Intervention */}
                  <div className="bg-slate-50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
                      📍 Zone d'Intervention
                    </h3>
                    <div className="space-y-3">
                      {selectedArtisan.zonesIntervention && selectedArtisan.zonesIntervention.length > 0 ? (
                        selectedArtisan.zonesIntervention.map((zone, idx) => (
                          <div key={idx} className={idx > 0 ? 'pt-3 border-t border-slate-200' : ''}>
                            {selectedArtisan.zonesIntervention.length > 1 && (
                              <p className="text-xs font-semibold text-brand-700 mb-2">Zone {idx + 1}</p>
                            )}
                            <div className="space-y-2">
                              {zone.adresse && (
                                <div>
                                  <label className="text-xs text-slate-500 uppercase">Adresse de l'entreprise</label>
                                  <p className="text-slate-900">{zone.adresse}</p>
                                </div>
                              )}
                              <div>
                                <label className="text-xs text-slate-500 uppercase">Ville principale</label>
                                <p className="text-slate-900 font-medium">{zone.ville || '-'}</p>
                                {zone.codePostal && (
                                  <p className="text-slate-600 text-sm">Code postal: {zone.codePostal}</p>
                                )}
                              </div>
                              <div>
                                <label className="text-xs text-slate-500 uppercase">Rayon d'intervention</label>
                                <p className="text-slate-900 font-medium">
                                  {zone.rayonKm || zone.rayon ? (
                                    <span className="inline-flex items-center gap-2">
                                      <span className="text-lg">{zone.rayonKm || zone.rayon} km</span>
                                      <span className="text-xs bg-brand-700 text-white px-2 py-1 rounded-full">
                                        Rayon d'action
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-500">Non spécifié</span>
                                  )}
                                </p>
                              </div>
                              {zone.departements && zone.departements.length > 0 && (
                                <div>
                                  <label className="text-xs text-slate-500 uppercase">Départements couverts</label>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {zone.departements.map((dept, deptIdx) => (
                                      <span 
                                        key={deptIdx}
                                        className="bg-navy-800 text-white px-2 py-1 rounded text-xs"
                                      >
                                        {dept}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-500 text-sm">Aucune zone d'intervention renseignée</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Colonne 2: Documents */}
                <div className="space-y-6">
                  
                  {/* Document KBIS */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-100 px-4 py-3 flex justify-between items-center">
                      <h3 className="font-semibold text-slate-900 flex items-center">
                        📄 KBIS
                      </h3>
                      {getStatusBadge(getDocumentStatus(selectedArtisan.verificationDocuments?.kbis))}
                    </div>
                    
                    <div className="p-4">
                      {selectedArtisan.verificationDocuments?.kbis?.url ? (
                        <>
                          {/* Aperçu du document */}
                          <div className="mb-4 bg-slate-50 rounded-lg overflow-hidden">
                            {selectedArtisan.verificationDocuments.kbis.url.toLowerCase().endsWith('.pdf') ? (
                              <iframe
                                src={selectedArtisan.verificationDocuments.kbis.url}
                                className="w-full h-64 border-0"
                                title="KBIS PDF"
                              />
                            ) : (
                              <img
                                src={selectedArtisan.verificationDocuments.kbis.url}
                                alt="KBIS"
                                className="w-full h-64 object-contain"
                              />
                            )}
                          </div>

                          {/* Informations du document */}
                          <div className="space-y-2 mb-4 text-sm">
                            <div>
                              <label className="text-xs text-slate-500 uppercase">Date d'upload</label>
                              <p className="text-slate-900">
                                {selectedArtisan.verificationDocuments.kbis.uploadDate
                                  ? new Date(selectedArtisan.verificationDocuments.kbis.uploadDate.toDate()).toLocaleDateString('fr-FR', {
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })
                                  : '-'
                                }
                              </p>
                            </div>

                            {/* Historique des uploads */}
                            {selectedArtisan.verificationDocuments.kbis.uploadHistory && selectedArtisan.verificationDocuments.kbis.uploadHistory.length > 0 && (
                              <div>
                                <label className="text-xs text-slate-500 uppercase flex items-center gap-2">
                                  Historique des uploads ({selectedArtisan.verificationDocuments.kbis.uploadHistory.length})
                                  {selectedArtisan.verificationDocuments.kbis.uploadHistory.length > 5 && (
                                    <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                                      ⚠️ SUSPECT
                                    </span>
                                  )}
                                </label>
                                <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-1 max-h-40 overflow-y-auto">
                                  {selectedArtisan.verificationDocuments.kbis.uploadHistory.map((upload, idx) => (
                                    <div key={idx} className="text-xs text-slate-700 mb-1 pb-1 border-b border-yellow-200 last:border-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">
                                          {new Date(upload.uploadedAt.toDate()).toLocaleDateString('fr-FR', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                          })}
                                        </span>
                                        <span className="text-slate-500">•</span>
                                        <span className="truncate max-w-[150px]" title={upload.fileName}>
                                          {upload.fileName}
                                        </span>
                                        <span className="text-slate-500">•</span>
                                        <span className="text-slate-500">
                                          {(upload.fileSize / 1024).toFixed(0)} KB
                                        </span>
                                      </div>
                                      {upload.previouslyRejected && (
                                        <p className="text-red-600 text-xs mt-0.5">
                                          ↻ Re-upload après rejet: {upload.rejectionReason}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {selectedArtisan.verificationDocuments.kbis.parsedData && (
                              <div>
                                <label className="text-xs text-slate-500 uppercase">Données extraites</label>
                                <div className="bg-white border border-slate-200 rounded p-2 mt-1">
                                  <p className="text-xs text-slate-700">
                                    SIRET: {selectedArtisan.verificationDocuments.kbis.parsedData.siret || '-'}
                                  </p>
                                  <p className="text-xs text-slate-700">
                                    Raison sociale: {selectedArtisan.verificationDocuments.kbis.parsedData.raisonSociale || '-'}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Boutons d'action */}
                          {!selectedArtisan.verificationDocuments.kbis.verified && !selectedArtisan.verificationDocuments.kbis.rejected && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleValidateDocument('kbis')}
                                disabled={actionLoading}
                                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {actionLoading ? '⏳ Validation...' : '✓ Valider'}
                              </button>
                              <button
                                onClick={() => handleRejectDocument('kbis')}
                                disabled={actionLoading}
                                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                ✕ Rejeter
                              </button>
                            </div>
                          )}

                          {/* Message si validé */}
                          {selectedArtisan.verificationDocuments.kbis.verified && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                              <p className="text-green-800 font-medium">✓ Document validé</p>
                              <p className="text-green-600 text-xs mt-1">
                                Le {selectedArtisan.verificationDocuments.kbis.validatedAt
                                  ? new Date(selectedArtisan.verificationDocuments.kbis.validatedAt.toDate()).toLocaleDateString('fr-FR')
                                  : '-'
                                }
                              </p>
                            </div>
                          )}

                          {/* Message si rejeté */}
                          {selectedArtisan.verificationDocuments.kbis.rejected && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                              <p className="text-red-800 font-medium">✕ Document rejeté</p>
                              <p className="text-red-600 text-xs mt-1">
                                Raison: {selectedArtisan.verificationDocuments.kbis.rejectionReason || 'Non spécifiée'}
                              </p>
                            </div>
                          )}

                          {/* Lien d'ouverture */}
                          <a
                            href={selectedArtisan.verificationDocuments.kbis.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-center text-brand-700 hover:underline text-sm mt-2"
                          >
                            Ouvrir dans un nouvel onglet →
                          </a>
                        </>
                      ) : (
                        <p className="text-slate-500 text-center py-8">Document non uploadé</p>
                      )}
                    </div>
                  </div>

                  {/* Document Pièce d'identité */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-100 px-4 py-3 flex justify-between items-center">
                      <h3 className="font-semibold text-slate-900 flex items-center">
                        🪪 Pièce d'identité
                      </h3>
                      {getStatusBadge(getDocumentStatus(selectedArtisan.verificationDocuments?.idCard))}
                    </div>
                    
                    <div className="p-4">
                      {selectedArtisan.verificationDocuments?.idCard?.url ? (
                        <>
                          {/* Aperçu du document */}
                          <div className="mb-4 bg-slate-50 rounded-lg overflow-hidden">
                            {selectedArtisan.verificationDocuments.idCard.url.toLowerCase().endsWith('.pdf') ? (
                              <iframe
                                src={selectedArtisan.verificationDocuments.idCard.url}
                                className="w-full h-64 border-0"
                                title="Pièce d'identité PDF"
                              />
                            ) : (
                              <img
                                src={selectedArtisan.verificationDocuments.idCard.url}
                                alt="Pièce d'identité"
                                className="w-full h-64 object-contain"
                              />
                            )}
                          </div>

                          {/* Informations du document */}
                          <div className="space-y-2 mb-4 text-sm">
                            <div>
                              <label className="text-xs text-slate-500 uppercase">Date d'upload</label>
                              <p className="text-slate-900">
                                {selectedArtisan.verificationDocuments.idCard.uploadDate
                                  ? new Date(selectedArtisan.verificationDocuments.idCard.uploadDate.toDate()).toLocaleDateString('fr-FR', {
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })
                                  : '-'
                                }
                              </p>
                            </div>

                            {/* Historique des uploads */}
                            {selectedArtisan.verificationDocuments.idCard.uploadHistory && selectedArtisan.verificationDocuments.idCard.uploadHistory.length > 0 && (
                              <div>
                                <label className="text-xs text-slate-500 uppercase flex items-center gap-2">
                                  Historique des uploads ({selectedArtisan.verificationDocuments.idCard.uploadHistory.length})
                                  {selectedArtisan.verificationDocuments.idCard.uploadHistory.length > 5 && (
                                    <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                                      ⚠️ SUSPECT
                                    </span>
                                  )}
                                </label>
                                <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-1 max-h-40 overflow-y-auto">
                                  {selectedArtisan.verificationDocuments.idCard.uploadHistory.map((upload, idx) => (
                                    <div key={idx} className="text-xs text-slate-700 mb-1 pb-1 border-b border-yellow-200 last:border-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">
                                          {new Date(upload.uploadedAt.toDate()).toLocaleDateString('fr-FR', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                          })}
                                        </span>
                                        <span className="text-slate-500">•</span>
                                        <span className="truncate max-w-[150px]" title={upload.fileName}>
                                          {upload.fileName}
                                        </span>
                                        <span className="text-slate-500">•</span>
                                        <span className="text-slate-500">
                                          {(upload.fileSize / 1024).toFixed(0)} KB
                                        </span>
                                      </div>
                                      {upload.previouslyRejected && (
                                        <p className="text-red-600 text-xs mt-0.5">
                                          ↻ Re-upload après rejet: {upload.rejectionReason}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {selectedArtisan.verificationDocuments.idCard.parsedData && (
                              <div>
                                <label className="text-xs text-slate-500 uppercase">Données extraites</label>
                                <div className="bg-white border border-slate-200 rounded p-2 mt-1">
                                  <p className="text-xs text-slate-700">
                                    Nom: {selectedArtisan.verificationDocuments.idCard.parsedData.nom || '-'}
                                  </p>
                                  <p className="text-xs text-slate-700">
                                    Prénom: {selectedArtisan.verificationDocuments.idCard.parsedData.prenom || '-'}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Boutons d'action */}
                          {!selectedArtisan.verificationDocuments.idCard.verified && !selectedArtisan.verificationDocuments.idCard.rejected && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleValidateDocument('idCard')}
                                disabled={actionLoading}
                                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {actionLoading ? '⏳ Validation...' : '✓ Valider'}
                              </button>
                              <button
                                onClick={() => handleRejectDocument('idCard')}
                                disabled={actionLoading}
                                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                ✕ Rejeter
                              </button>
                            </div>
                          )}

                          {/* Message si validé */}
                          {selectedArtisan.verificationDocuments.idCard.verified && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                              <p className="text-green-800 font-medium">✓ Document validé</p>
                              <p className="text-green-600 text-xs mt-1">
                                Le {selectedArtisan.verificationDocuments.idCard.validatedAt
                                  ? new Date(selectedArtisan.verificationDocuments.idCard.validatedAt.toDate()).toLocaleDateString('fr-FR')
                                  : '-'
                                }
                              </p>
                            </div>
                          )}

                          {/* Message si rejeté */}
                          {selectedArtisan.verificationDocuments.idCard.rejected && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                              <p className="text-red-800 font-medium">✕ Document rejeté</p>
                              <p className="text-red-600 text-xs mt-1">
                                Raison: {selectedArtisan.verificationDocuments.idCard.rejectionReason || 'Non spécifiée'}
                              </p>
                            </div>
                          )}

                          {/* Lien d'ouverture */}
                          <a
                            href={selectedArtisan.verificationDocuments.idCard.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-center text-brand-700 hover:underline text-sm mt-2"
                          >
                            Ouvrir dans un nouvel onglet →
                          </a>
                        </>
                      ) : (
                        <p className="text-slate-500 text-center py-8">Document non uploadé</p>
                      )}
                    </div>
                  </div>

                  {/* Document RC Pro */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-100 px-4 py-3 flex justify-between items-center">
                      <h3 className="font-semibold text-slate-900 flex items-center">
                        🛡️ RC Pro
                      </h3>
                      {getStatusBadge(getDocumentStatus(selectedArtisan.verificationDocuments?.rcPro))}
                    </div>
                    
                    <div className="p-4">
                      {selectedArtisan.verificationDocuments?.rcPro?.url ? (
                        <>
                          {/* Aperçu du document */}
                          <div className="mb-4 bg-slate-50 rounded-lg overflow-hidden">
                            {selectedArtisan.verificationDocuments.rcPro.url.toLowerCase().endsWith('.pdf') ? (
                              <iframe
                                src={selectedArtisan.verificationDocuments.rcPro.url}
                                className="w-full h-64 border-0"
                                title="RC Pro PDF"
                              />
                            ) : (
                              <img
                                src={selectedArtisan.verificationDocuments.rcPro.url}
                                alt="RC Pro"
                                className="w-full h-64 object-contain"
                              />
                            )}
                          </div>

                          {/* Informations du document */}
                          <div className="space-y-2 mb-4 text-sm">
                            <div>
                              <label className="text-xs text-slate-500 uppercase">Date d'upload</label>
                              <p className="text-slate-900">
                                {selectedArtisan.verificationDocuments.rcPro.uploadDate
                                  ? new Date(selectedArtisan.verificationDocuments.rcPro.uploadDate.toDate()).toLocaleDateString('fr-FR', {
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })
                                  : '-'
                                }
                              </p>
                            </div>

                            {/* Historique des uploads */}
                            {selectedArtisan.verificationDocuments.rcPro.uploadHistory && selectedArtisan.verificationDocuments.rcPro.uploadHistory.length > 0 && (
                              <div>
                                <label className="text-xs text-slate-500 uppercase flex items-center gap-2">
                                  Historique des uploads ({selectedArtisan.verificationDocuments.rcPro.uploadHistory.length})
                                  {selectedArtisan.verificationDocuments.rcPro.uploadHistory.length > 5 && (
                                    <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                                      ⚠️ SUSPECT
                                    </span>
                                  )}
                                </label>
                                <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-1 max-h-40 overflow-y-auto">
                                  {selectedArtisan.verificationDocuments.rcPro.uploadHistory.map((upload, idx) => (
                                    <div key={idx} className="text-xs text-slate-700 mb-1 pb-1 border-b border-yellow-200 last:border-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">
                                          {new Date(upload.uploadedAt.toDate()).toLocaleDateString('fr-FR', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                          })}
                                        </span>
                                        <span className="text-slate-500">•</span>
                                        <span className="truncate max-w-[150px]" title={upload.fileName}>
                                          {upload.fileName}
                                        </span>
                                        <span className="text-slate-500">•</span>
                                        <span className="text-slate-500">
                                          {(upload.fileSize / 1024).toFixed(0)} KB
                                        </span>
                                      </div>
                                      {upload.previouslyRejected && (
                                        <p className="text-red-600 text-xs mt-0.5">
                                          ↻ Re-upload après rejet: {upload.rejectionReason}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Boutons d'action */}
                          {!selectedArtisan.verificationDocuments.rcPro.verified && !selectedArtisan.verificationDocuments.rcPro.rejected && (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleValidateDocument('rcPro')}
                                disabled={actionLoading}
                                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {actionLoading ? '⏳ Validation...' : '✓ Valider'}
                              </button>
                              <button
                                onClick={() => handleRejectDocument('rcPro')}
                                disabled={actionLoading}
                                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                ✕ Rejeter
                              </button>
                            </div>
                          )}

                          {/* Message si validé */}
                          {selectedArtisan.verificationDocuments.rcPro.verified && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                              <p className="text-green-800 font-medium">✓ Document validé</p>
                              <p className="text-green-600 text-xs mt-1">
                                Le {selectedArtisan.verificationDocuments.rcPro.validatedAt
                                  ? new Date(selectedArtisan.verificationDocuments.rcPro.validatedAt.toDate()).toLocaleDateString('fr-FR')
                                  : '-'
                                }
                              </p>
                            </div>
                          )}

                          {/* Message si rejeté */}
                          {selectedArtisan.verificationDocuments.rcPro.rejected && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                              <p className="text-red-800 font-medium">✕ Document rejeté</p>
                              <p className="text-red-600 text-xs mt-1">
                                Raison: {selectedArtisan.verificationDocuments.rcPro.rejectionReason || 'Non spécifiée'}
                              </p>
                            </div>
                          )}

                          {/* Lien d'ouverture */}
                          <a
                            href={selectedArtisan.verificationDocuments.rcPro.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-center text-brand-700 hover:underline text-sm mt-2"
                          >
                            Ouvrir dans un nouvel onglet →
                          </a>
                        </>
                      ) : (
                        <p className="text-slate-500 text-center py-8">Document non uploadé</p>
                      )}
                    </div>
                  </div>

                  {/* Document Garantie Décennale (conditionnel) */}
                  {selectedArtisan.metiers && artisanDoitDecennale(selectedArtisan.metiers) && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-slate-100 px-4 py-3 flex justify-between items-center">
                        <h3 className="font-semibold text-slate-900 flex items-center">
                          🏗️ Garantie Décennale
                        </h3>
                        {getStatusBadge(getDocumentStatus(selectedArtisan.verificationDocuments?.decennale))}
                      </div>
                      
                      <div className="p-4">
                        {selectedArtisan.verificationDocuments?.decennale?.url ? (
                          <>
                            {/* Aperçu du document */}
                            <div className="mb-4 bg-slate-50 rounded-lg overflow-hidden">
                              {selectedArtisan.verificationDocuments.decennale.url.toLowerCase().endsWith('.pdf') ? (
                                <iframe
                                  src={selectedArtisan.verificationDocuments.decennale.url}
                                  className="w-full h-64 border-0"
                                  title="Garantie Décennale PDF"
                                />
                              ) : (
                                <img
                                  src={selectedArtisan.verificationDocuments.decennale.url}
                                  alt="Garantie Décennale"
                                  className="w-full h-64 object-contain"
                                />
                              )}
                            </div>

                            {/* Informations du document */}
                            <div className="space-y-2 mb-4 text-sm">
                              <div>
                                <label className="text-xs text-slate-500 uppercase">Date d'upload</label>
                                <p className="text-slate-900">
                                  {selectedArtisan.verificationDocuments.decennale.uploadDate
                                    ? new Date(selectedArtisan.verificationDocuments.decennale.uploadDate.toDate()).toLocaleDateString('fr-FR', {
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })
                                    : '-'
                                  }
                                </p>
                              </div>

                              {/* Historique des uploads */}
                              {selectedArtisan.verificationDocuments.decennale.uploadHistory && selectedArtisan.verificationDocuments.decennale.uploadHistory.length > 0 && (
                                <div>
                                  <label className="text-xs text-slate-500 uppercase flex items-center gap-2">
                                    Historique des uploads ({selectedArtisan.verificationDocuments.decennale.uploadHistory.length})
                                    {selectedArtisan.verificationDocuments.decennale.uploadHistory.length > 5 && (
                                      <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                                        ⚠️ SUSPECT
                                      </span>
                                    )}
                                  </label>
                                  <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-1 max-h-40 overflow-y-auto">
                                    {selectedArtisan.verificationDocuments.decennale.uploadHistory.map((upload, idx) => (
                                      <div key={idx} className="text-xs text-slate-700 mb-1 pb-1 border-b border-yellow-200 last:border-0">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">
                                            {new Date(upload.uploadedAt.toDate()).toLocaleDateString('fr-FR', {
                                              day: '2-digit',
                                              month: '2-digit',
                                              hour: '2-digit',
                                              minute: '2-digit'
                                            })}
                                          </span>
                                          <span className="text-slate-500">•</span>
                                          <span className="truncate max-w-[150px]" title={upload.fileName}>
                                            {upload.fileName}
                                          </span>
                                          <span className="text-slate-500">•</span>
                                          <span className="text-slate-500">
                                            {(upload.fileSize / 1024).toFixed(0)} KB
                                          </span>
                                        </div>
                                        {upload.previouslyRejected && (
                                          <p className="text-red-600 text-xs mt-0.5">
                                            ↻ Re-upload après rejet: {upload.rejectionReason}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Boutons d'action */}
                            {!selectedArtisan.verificationDocuments.decennale.verified && !selectedArtisan.verificationDocuments.decennale.rejected && (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleValidateDocument('decennale')}
                                  disabled={actionLoading}
                                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {actionLoading ? '⏳ Validation...' : '✓ Valider'}
                                </button>
                                <button
                                  onClick={() => handleRejectDocument('decennale')}
                                  disabled={actionLoading}
                                  className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  ✕ Rejeter
                                </button>
                              </div>
                            )}

                            {/* Message si validé */}
                            {selectedArtisan.verificationDocuments.decennale.verified && (
                              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                                <p className="text-green-800 font-medium">✓ Document validé</p>
                                <p className="text-green-600 text-xs mt-1">
                                  Le {selectedArtisan.verificationDocuments.decennale.validatedAt
                                    ? new Date(selectedArtisan.verificationDocuments.decennale.validatedAt.toDate()).toLocaleDateString('fr-FR')
                                    : '-'
                                  }
                                </p>
                              </div>
                            )}

                            {/* Message si rejeté */}
                            {selectedArtisan.verificationDocuments.decennale.rejected && (
                              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                                <p className="text-red-800 font-medium">✕ Document rejeté</p>
                                <p className="text-red-600 text-xs mt-1">
                                  Raison: {selectedArtisan.verificationDocuments.decennale.rejectionReason || 'Non spécifiée'}
                                </p>
                              </div>
                            )}

                            {/* Lien d'ouverture */}
                            <a
                              href={selectedArtisan.verificationDocuments.decennale.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-center text-brand-700 hover:underline text-sm mt-2"
                            >
                              Ouvrir dans un nouvel onglet →
                            </a>
                          </>
                        ) : (
                          <p className="text-slate-500 text-center py-8">Document non uploadé</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer du modal */}
            <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 rounded-b-lg">
              <button
                onClick={() => setShowModal(false)}
                className="w-full bg-slate-200 text-slate-700 px-6 py-3 rounded-lg hover:bg-slate-300 transition font-medium"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialogue de rejet */}
      {showRejectDialog && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]"
          onClick={() => setShowRejectDialog(false)}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-slate-900 mb-4">
              Rejeter le document {rejectDocType === 'kbis' ? 'KBIS' : 
                                   rejectDocType === 'idCard' ? 'Pièce d\'identité' : 
                                   rejectDocType === 'rcPro' ? 'RC Pro' : 
                                   'Garantie Décennale'}
            </h3>
            
            <p className="text-slate-600 text-sm mb-4">
              Veuillez indiquer la raison du rejet. Cette information sera communiquée à l'artisan.
            </p>

            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ex: Document illisible, informations manquantes, document expiré..."
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
              rows={4}
            />

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowRejectDialog(false);
                  setRejectReason('');
                }}
                disabled={actionLoading}
                className="flex-1 bg-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-300 transition font-medium disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmRejectDocument}
                disabled={actionLoading || !rejectReason.trim()}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? '⏳ Rejet...' : '✕ Confirmer le rejet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
