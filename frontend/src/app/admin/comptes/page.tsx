'use client';

/**
 * Dashboard Admin - Gestion des Comptes
 * Page: /admin/comptes
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth-service';
import { getAllArtisansForAdmin } from '@/lib/firebase/artisan-service';
import { 
  getAllClientsForAdmin,
  suspendArtisan,
  reactivateArtisan,
  suspendClient,
  reactivateClient,
  deleteArtisanAccount,
  deleteClientAccount,
  scheduleAccountDeletion,
  addAdminNoteArtisan,
  addAdminNoteClient
} from '@/lib/firebase/account-service';
import type { Artisan } from '@/types/firestore';
import { getWalletByArtisanId } from '@/lib/firebase/wallet-service';

type FilterType = 'all' | 'active' | 'suspended';
type AccountType = 'artisans' | 'clients';

interface Client {
  userId: string;
  nom?: string;
  prenom?: string;
  email: string;
  role: string;
  suspended?: boolean;
  suspensionReason?: string;
  dateInscription?: any;
  adminNotes?: any[];
}

export default function AdminComptesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accountType, setAccountType] = useState<AccountType>('artisans');
  
  // Données
  const [artisans, setArtisans] = useState<Artisan[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredData, setFilteredData] = useState<any[]>([]);
  
  // Filtres
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'confirm' | 'loading' | 'result'>('confirm');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteResult, setDeleteResult] = useState<{ success: boolean; details?: string; error?: string } | null>(null);
  const [walletPreCheck, setWalletPreCheck] = useState<{ soldeDisponible: number; soldeEnAttente: number; loaded: boolean } | null>(null);
  
  // Form states
  const [suspensionReason, setSuspensionReason] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    checkAdminAndLoad();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [accountType, selectedFilter, searchTerm, artisans, clients]);

  const checkAdminAndLoad = async () => {
    try {
      const user = authService.getCurrentUser();
      if (!user) {
        router.push('/access-x7k9m2p4w8n3');
        return;
      }

      await loadData();
    } catch (error) {
      console.error('Erreur:', error);
      setLoading(false);
    }
  };

  const loadData = async () => {
    try {
      const [artisansData, clientsData] = await Promise.all([
        getAllArtisansForAdmin(),
        getAllClientsForAdmin()
      ]);
      
      setArtisans(artisansData);
      setClients(clientsData);
    } catch (error) {
      console.error('Erreur chargement données:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    const data = accountType === 'artisans' ? artisans : clients;
    let filtered = [...data];

    // Filtre par statut
    if (selectedFilter === 'active') {
      filtered = filtered.filter(item => !item.suspended);
    } else if (selectedFilter === 'suspended') {
      filtered = filtered.filter(item => item.suspended);
    }

    // Recherche
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        item.nom?.toLowerCase().includes(searchLower) ||
        item.prenom?.toLowerCase().includes(searchLower) ||
        item.email?.toLowerCase().includes(searchLower) ||
        (accountType === 'artisans' && (item as Artisan).siret?.includes(searchTerm))
      );
    }

    setFilteredData(filtered);
  };

  const exportToCSV = () => {
    const data = accountType === 'artisans' ? filteredData : filteredData;
    const csvRows = [];
    
    // Headers
    const headers = accountType === 'artisans'
      ? ['Nom', 'Prénom', 'Email', 'SIRET', 'Statut', 'Date Inscription']
      : ['Nom', 'Prénom', 'Email', 'Statut', 'Date Inscription'];
    csvRows.push(headers.join(','));
    
    // Data rows
    data.forEach(account => {
      const row = accountType === 'artisans'
        ? [
            account.nom || '',
            account.prenom || '',
            account.email || '',
            (account as Artisan).siret || '',
            account.suspended ? 'Suspendu' : 'Actif',
            account.dateInscription ? new Date(account.dateInscription.toDate()).toLocaleDateString('fr-FR') : ''
          ]
        : [
            account.nom || '',
            account.prenom || '',
            account.email || '',
            account.suspended ? 'Suspendu' : 'Actif',
            account.dateInscription ? new Date(account.dateInscription.toDate()).toLocaleDateString('fr-FR') : ''
          ];
      csvRows.push(row.join(','));
    });
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${accountType}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSuspend = async () => {
    if (!selectedAccount || !suspensionReason.trim()) return;

    setActionLoading(true);
    try {
      const result = accountType === 'artisans'
        ? await suspendArtisan(selectedAccount.userId, suspensionReason, 'admin_temp', 'Admin')
        : await suspendClient(selectedAccount.userId, suspensionReason, 'admin_temp', 'Admin');

      if (result.success) {
        await loadData();
        setShowSuspendDialog(false);
        setSuspensionReason('');
        setSelectedAccount(null);
        alert('Compte suspendu avec succès');
      } else {
        alert(result.error || 'Erreur lors de la suspension');
      }
    } catch (error) {
      alert('Erreur lors de la suspension');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async (account: any) => {
    if (!confirm('Voulez-vous réactiver ce compte ?')) return;

    setActionLoading(true);
    try {
      const result = accountType === 'artisans'
        ? await reactivateArtisan(account.userId, 'admin_temp', 'Admin')
        : await reactivateClient(account.userId, 'admin_temp', 'Admin');

      if (result.success) {
        await loadData();
        alert('Compte réactivé avec succès');
      } else {
        alert(result.error || 'Erreur lors de la réactivation');
      }
    } catch (error) {
      alert('Erreur lors de la réactivation');
    } finally {
      setActionLoading(false);
    }
  };

  // Suppression PROGRAMMÉE (15 jours) - RECOMMANDÉ
  const handleScheduledDeleteDirect = async (account: Artisan | Client) => {
    const reason = prompt(
      '📅 SUPPRESSION PROGRAMMÉE (15 jours)\n\n' +
      'L\'utilisateur sera notifié et aura 15 jours pour contester.\n' +
      'Le compte sera suspendu immédiatement.\n\n' +
      'Raison de la suppression :'
    );
    
    if (!reason || !reason.trim()) {
      alert('Raison obligatoire');
      return;
    }

    if (!confirm(
      '✅ Confirmer la suppression programmée ?\n\n' +
      `Utilisateur : ${account.nom} ${account.prenom}\n` +
      `Email : ${account.email}\n` +
      `Raison : ${reason}\n\n` +
      '→ Compte suspendu immédiatement\n' +
      '→ Email de notification envoyé\n' +
      '→ Suppression définitive dans 15 jours'
    )) return;

    setActionLoading(true);
    try {
      const result = await scheduleAccountDeletion(
        account.userId,
        accountType === 'artisans' ? 'artisan' : 'client',
        reason,
        'admin_temp',
        'Admin',
        15
      );

      if (result.success) {
        await loadData();
        alert('✅ Suppression programmée avec succès\n\n→ Utilisateur notifié par email\n→ Délai de recours : 15 jours\n→ Compte suspendu immédiatement');
      } else {
        alert('❌ ' + (result.error || 'Erreur lors de la programmation'));
      }
    } catch (error) {
      alert('❌ Erreur lors de la programmation de la suppression');
    } finally {
      setActionLoading(false);
    }
  };

  // Suppression IMMÉDIUATE — ouvre le modal de confirmation + pré-vérifie le wallet artisan
  const handleImmediateDeleteDirect = async (account: Artisan | Client) => {
    setSelectedAccount(account);
    setDeleteStep('confirm');
    setDeleteReason('');
    setDeleteResult(null);
    setWalletPreCheck(null);
    setShowDeleteModal(true);
    // Pré-charger le solde wallet pour artisans (blocage si séquestre > 0)
    if (accountType === 'artisans') {
      try {
        const wallet = await getWalletByArtisanId(account.userId);
        setWalletPreCheck({
          soldeDisponible: wallet?.soldeDisponible || 0,
          soldeEnAttente: wallet?.soldeEnAttente || 0,
          loaded: true,
        });
      } catch {
        setWalletPreCheck({ soldeDisponible: 0, soldeEnAttente: 0, loaded: true });
      }
    }
  };

  // Exécution de la suppression après confirmation dans le modal
  const executeImmediateDelete = async () => {
    if (!selectedAccount || !deleteReason.trim()) return;

    setDeleteStep('loading');
    try {
      const result = accountType === 'artisans'
        ? await deleteArtisanAccount(selectedAccount.userId, 'admin_temp', 'Admin', deleteReason)
        : await deleteClientAccount(selectedAccount.userId, 'admin_temp', 'Admin', deleteReason);

      setDeleteResult(result);
      setDeleteStep('result');
      if (result.success) {
        await loadData();
      }
    } catch (error) {
      setDeleteResult({ success: false, error: 'Erreur inattendue lors de la suppression' });
      setDeleteStep('result');
    }
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setSelectedAccount(null);
    setDeleteReason('');
    setDeleteStep('confirm');
    setDeleteResult(null);
    setWalletPreCheck(null);
  };

  const handleAddNote = async () => {
    if (!selectedAccount || !adminNote.trim()) return;

    setActionLoading(true);
    try {
      const result = accountType === 'artisans'
        ? await addAdminNoteArtisan(selectedAccount.userId, adminNote, 'admin_temp', 'Admin')
        : await addAdminNoteClient(selectedAccount.userId, adminNote, 'admin_temp', 'Admin');

      if (result.success) {
        await loadData();
        setShowNoteDialog(false);
        setAdminNote('');
        setSelectedAccount(null);
        alert('Note ajoutée avec succès');
      } else {
        alert(result.error || 'Erreur lors de l\'ajout de la note');
      }
    } catch (error) {
      alert('Erreur lors de l\'ajout de la note');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl text-slate-600">Chargement...</p>
      </div>
    );
  }

  const stats = {
    artisansTotal: artisans.length,
    artisansActifs: artisans.filter(a => !a.suspended).length,
    artisansSuspendus: artisans.filter(a => a.suspended).length,
    clientsTotal: clients.length,
    clientsActifs: clients.filter(c => !c.suspended).length,
    clientsSuspendus: clients.filter(c => c.suspended).length
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy-800 mb-2">Gestion des Comptes</h1>
        <p className="text-slate-600">Administration des comptes artisans et clients</p>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="text-sm text-slate-500 uppercase">Artisans</div>
          <div className="text-3xl font-bold text-brand-700">{stats.artisansTotal}</div>
          <div className="text-xs text-slate-500 mt-2">
            {stats.artisansActifs} actifs • {stats.artisansSuspendus} suspendus
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="text-sm text-slate-500 uppercase">Clients</div>
          <div className="text-3xl font-bold text-navy-800">{stats.clientsTotal}</div>
          <div className="text-xs text-slate-500 mt-2">
            {stats.clientsActifs} actifs • {stats.clientsSuspendus} suspendus
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="text-sm text-slate-500 uppercase">Total Utilisateurs</div>
          <div className="text-3xl font-bold text-slate-800">
            {stats.artisansTotal + stats.clientsTotal}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="text-sm text-slate-500 uppercase">Comptes Suspendus</div>
          <div className="text-3xl font-bold text-red-600">
            {stats.artisansSuspendus + stats.clientsSuspendus}
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-slate-200">
          <div className="flex">
            <button
              onClick={() => setAccountType('artisans')}
              className={`px-6 py-4 font-medium ${
                accountType === 'artisans'
                  ? 'border-b-2 border-brand-500 text-brand-700'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              🔧 Artisans ({artisans.length})
            </button>
            <button
              onClick={() => setAccountType('clients')}
              className={`px-6 py-4 font-medium ${
                accountType === 'clients'
                  ? 'border-b-2 border-brand-500 text-brand-700'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              👥 Clients ({clients.length})
            </button>
          </div>
        </div>

        {/* Filtres */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Recherche */}
            <div className="flex-1">
              <input
                type="text"
                placeholder={`Rechercher un ${accountType === 'artisans' ? 'artisan' : 'client'}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {/* Filtres statut */}
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedFilter('all')}
                className={`px-4 py-2 rounded-lg ${
                  selectedFilter === 'all'
                    ? 'bg-brand-700 text-white'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                Tous
              </button>
              <button
                onClick={() => setSelectedFilter('active')}
                className={`px-4 py-2 rounded-lg ${
                  selectedFilter === 'active'
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                Actifs
              </button>
              <button
                onClick={() => setSelectedFilter('suspended')}
                className={`px-4 py-2 rounded-lg ${
                  selectedFilter === 'suspended'
                    ? 'bg-red-600 text-white'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                Suspendus
              </button>
              <button
                onClick={exportToCSV}
                className="px-4 py-2 rounded-lg bg-navy-800 text-white hover:bg-navy-900 flex items-center gap-2"
              >
                📥 Exporter CSV
              </button>
            </div>
          </div>
        </div>

        {/* Tableau */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Utilisateur
                </th>
                {accountType === 'artisans' && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    SIRET
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Inscription
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredData.map((account) => (
                <tr key={account.userId} className="hover:bg-slate-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="font-medium text-slate-900">
                        {account.nom} {account.prenom}
                      </div>
                      <div className="text-sm text-slate-500">{account.email}</div>
                    </div>
                  </td>
                  {accountType === 'artisans' && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                      {(account as Artisan).siret || '-'}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    {account.suspended ? (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                        Suspendu
                      </span>
                    ) : (
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        Actif
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {(account as any).dateCreation
                      ? new Date((account as any).dateCreation.toDate()).toLocaleDateString('fr-FR')
                      : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => {
                        setSelectedAccount(account);
                        setShowDetailsDialog(true);
                      }}
                      disabled={actionLoading}
                      className="text-navy-800 hover:text-navy-900 disabled:opacity-50"
                    >
                      👁️ Détails
                    </button>
                    {account.suspended ? (
                      <button
                        onClick={() => handleReactivate(account)}
                        disabled={actionLoading}
                        className="text-green-600 hover:text-green-900 disabled:opacity-50"
                      >
                        Réactiver
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedAccount(account);
                          setShowSuspendDialog(true);
                        }}
                        disabled={actionLoading}
                        className="text-orange-600 hover:text-orange-900 disabled:opacity-50"
                      >
                        Suspendre
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setSelectedAccount(account);
                        setShowNoteDialog(true);
                      }}
                      disabled={actionLoading}
                      className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                    >
                      Note
                    </button>
                    <button
                      onClick={() => handleScheduledDeleteDirect(account)}
                      disabled={actionLoading}
                      className="text-red-600 hover:text-red-900 disabled:opacity-50 font-semibold"
                      title="Suppression programmée (15 jours) avec notification utilisateur"
                    >
                      Supprimer
                    </button>
                    <button
                      onClick={() => handleImmediateDeleteDirect(account)}
                      disabled={actionLoading}
                      className="text-xs text-red-800 hover:text-red-950 disabled:opacity-50 underline"
                      title="⚠️ Suppression immédiate et irréversible (tests/fraude uniquement)"
                    >
                      Immédiat
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredData.length === 0 && (
            <div className="text-center py-12">
              <p className="text-slate-500">Aucun compte trouvé</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Suspension */}
      {showSuspendDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Suspendre le compte</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Raison de la suspension *
              </label>
              <textarea
                value={suspensionReason}
                onChange={(e) => setSuspensionReason(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Expliquez la raison de la suspension..."
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSuspend}
                disabled={actionLoading || !suspensionReason.trim()}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? 'Suspension...' : 'Suspendre'}
              </button>
              <button
                onClick={() => {
                  setShowSuspendDialog(false);
                  setSuspensionReason('');
                  setSelectedAccount(null);
                }}
                className="flex-1 bg-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-400"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Suppression - SUPPRIMÉ (actions directes dans la liste) */}

      {/* Modal Note */}
      {showNoteDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Ajouter une note admin</h3>
            
            {/* Notes existantes */}
            {selectedAccount?.adminNotes && selectedAccount.adminNotes.length > 0 && (
              <div className="mb-4 max-h-40 overflow-y-auto bg-slate-50 p-3 rounded-lg">
                <p className="text-xs font-semibold text-slate-600 mb-2">Notes existantes :</p>
                {selectedAccount.adminNotes.map((note: any, index: number) => (
                  <div key={index} className="text-xs text-slate-700 mb-2 pb-2 border-b border-slate-200 last:border-0">
                    <p className="font-medium">{note.note}</p>
                    <p className="text-slate-500 mt-1">
                      Par {note.adminName} - {new Date(note.createdAt.toDate()).toLocaleString('fr-FR')}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Nouvelle note privée (visible uniquement par les admins)
              </label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Votre note..."
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddNote}
                disabled={actionLoading || !adminNote.trim()}
                className="flex-1 bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50"
              >
                {actionLoading ? 'Ajout...' : 'Ajouter'}
              </button>
              <button
                onClick={() => {
                  setShowNoteDialog(false);
                  setAdminNote('');
                  setSelectedAccount(null);
                }}
                className="flex-1 bg-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-400"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Détails */}
      {showDetailsDialog && selectedAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-bold text-navy-800">
                  {selectedAccount.nom} {selectedAccount.prenom}
                </h3>
                <p className="text-slate-600">{selectedAccount.email}</p>
              </div>
              {selectedAccount.suspended ? (
                <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-semibold">
                  Suspendu
                </span>
              ) : (
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                  Actif
                </span>
              )}
            </div>

            {/* Informations générales */}
            <div className="mb-6">
              <h4 className="font-semibold text-slate-700 mb-3">Informations générales</h4>
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
                <div>
                  <p className="text-xs text-slate-500">Nom complet</p>
                  <p className="font-medium">{selectedAccount.nom} {selectedAccount.prenom}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Email</p>
                  <p className="font-medium text-sm break-all">{selectedAccount.email}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Rôle</p>
                  <p className="font-medium capitalize">{selectedAccount.role || 'Non défini'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Date d'inscription</p>
                  <p className="font-medium">
                    {(selectedAccount as any).dateCreation
                      ? (() => {
                          try {
                            const date = typeof (selectedAccount as any).dateCreation.toDate === 'function'
                              ? (selectedAccount as any).dateCreation.toDate()
                              : new Date((selectedAccount as any).dateCreation);
                            return new Date(date).toLocaleDateString('fr-FR');
                          } catch (e) {
                            return '-';
                          }
                        })()
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Email vérifié</p>
                  <p className="font-medium">
                    {selectedAccount.emailVerified ? (
                      <span className="text-green-600">✓ Oui</span>
                    ) : (
                      <span className="text-red-600">✗ Non</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Téléphone</p>
                  <p className="font-medium">{selectedAccount.telephone || '-'}</p>
                </div>
                {accountType === 'artisans' && (
                  <>
                    <div className="col-span-2 border-t border-slate-200 pt-4 mt-2">
                      <p className="text-xs text-slate-500 font-semibold mb-3">📋 Informations entreprise</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">SIRET</p>
                      <p className="font-medium font-mono">{(selectedAccount as Artisan).siret || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Raison sociale</p>
                      <p className="font-medium">{(selectedAccount as Artisan).raisonSociale || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Nom commercial</p>
                      <p className="font-medium">{(selectedAccount as Artisan).raisonSociale || '-'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-slate-500">Métiers</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {(selectedAccount as Artisan).metiers && (selectedAccount as Artisan).metiers.length > 0 ? (
                          (selectedAccount as Artisan).metiers.map((metier, idx) => (
                            <span key={idx} className="px-2 py-1 bg-brand-700 text-white rounded-full text-xs">
                              {metier}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-slate-500">Adresse entreprise 🏢</p>
                      <p className="font-medium">
                        {(selectedAccount as Artisan).zonesIntervention && (selectedAccount as Artisan).zonesIntervention.length > 0
                          ? (() => {
                              const zone = (selectedAccount as Artisan).zonesIntervention[0];
                              const parts = [];
                              if (zone.adresse) parts.push(zone.adresse);
                              if (zone.codePostal) parts.push(zone.codePostal);
                              if (zone.ville) parts.push(zone.ville);
                              return parts.length > 0 ? parts.join(', ') : '-';
                            })()
                          : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Statut vérification</p>
                      <p className="font-medium">
                        {(selectedAccount as Artisan).verificationStatus === 'approved' ? (
                          <span className="text-green-600">✓ Approuvé</span>
                        ) : (selectedAccount as Artisan).verificationStatus === 'rejected' ? (
                          <span className="text-red-600">✗ Rejeté</span>
                        ) : (
                          <span className="text-orange-600">⏳ En attente</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">SIRET vérifié</p>
                      <p className="font-medium">
                        {(selectedAccount as Artisan).siretVerified ? (
                          <span className="text-green-600">✓ Oui</span>
                        ) : (
                          <span className="text-slate-600">- Non</span>
                        )}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Suspension info */}
            {selectedAccount.suspended && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-semibold text-red-700 mb-2">⚠️ Compte suspendu</h4>
                <p className="text-sm text-red-600 mb-2">
                  <strong>Raison :</strong> {selectedAccount.suspensionReason}
                </p>
                {selectedAccount.accountActions && selectedAccount.accountActions.length > 0 && (
                  <p className="text-xs text-red-500">
                    Suspendu le{' '}
                    {new Date(
                      selectedAccount.accountActions.find((a: any) => a.action === 'suspended')?.timestamp.toDate()
                    ).toLocaleString('fr-FR')}
                  </p>
                )}
              </div>
            )}

            {/* Notes admin */}
            {selectedAccount.adminNotes && selectedAccount.adminNotes.length > 0 && (
              <div className="mb-6">
                <h4 className="font-semibold text-slate-700 mb-3">📝 Notes administratives</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {selectedAccount.adminNotes.map((note: any, index: number) => (
                    <div key={index} className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded">
                      <p className="text-sm text-slate-800">{note.note}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        Par {note.adminName} - {new Date(note.createdAt.toDate()).toLocaleString('fr-FR')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Historique des actions */}
            {selectedAccount.accountActions && selectedAccount.accountActions.length > 0 && (
              <div className="mb-6">
                <h4 className="font-semibold text-slate-700 mb-3">📋 Historique des actions</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {selectedAccount.accountActions
                    .sort((a: any, b: any) => b.timestamp.toMillis() - a.timestamp.toMillis())
                    .map((action: any, index: number) => (
                      <div key={index} className="flex items-start gap-3 text-sm bg-slate-50 p-3 rounded">
                        <span className="text-lg">
                          {action.action === 'suspended'
                            ? '⏸️'
                            : action.action === 'reactivated'
                            ? '▶️'
                            : action.action === 'note_added'
                            ? '📝'
                            : '🔄'}
                        </span>
                        <div className="flex-1">
                          <p className="font-medium text-slate-800">
                            {action.action === 'suspended'
                              ? 'Compte suspendu'
                              : action.action === 'reactivated'
                              ? 'Compte réactivé'
                              : action.action === 'note_added'
                              ? 'Note ajoutée'
                              : action.action}
                          </p>
                          {action.reason && (
                            <p className="text-xs text-slate-600 mt-1">Raison : {action.reason}</p>
                          )}
                          <p className="text-xs text-slate-500 mt-1">
                            Par {action.adminName} - {new Date(action.timestamp.toDate()).toLocaleString('fr-FR')}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <button
              onClick={() => {
                setShowDetailsDialog(false);
                setSelectedAccount(null);
              }}
              className="w-full bg-navy-800 text-white px-4 py-2 rounded-lg hover:bg-navy-900"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
      {/* Modal Suppression Immédiate — 3 étapes */}
      {showDeleteModal && selectedAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-lg w-full overflow-hidden">

            {/* Étape 1 — Confirmation + saisie raison */}
            {deleteStep === 'confirm' && (
              <>
                <div className="bg-red-600 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">⚠️</span>
                    <div>
                      <h3 className="text-lg font-bold text-white">Suppression immédiate définitive</h3>
                      <p className="text-red-200 text-sm">Action irréversible — toutes les données seront supprimées</p>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  {/* Récapitulatif utilisateur */}
                  <div className="bg-slate-50 rounded-lg p-4 mb-5 border border-slate-200">
                    <p className="text-xs text-slate-500 uppercase font-semibold mb-2">Utilisateur ciblé</p>
                    <p className="font-bold text-navy-800 text-lg">{selectedAccount.nom} {selectedAccount.prenom}</p>
                    <p className="text-slate-600 text-sm">{selectedAccount.email}</p>
                    {accountType === 'artisans' && selectedAccount.siret && (
                      <p className="text-slate-500 text-xs mt-1 font-mono">SIRET : {selectedAccount.siret}</p>
                    )}
                  </div>

                  {/* Alerte wallet artisan */}
                  {accountType === 'artisans' && (
                    <>
                      {/* Chargement en cours */}
                      {!walletPreCheck && (
                        <div className="bg-slate-50 rounded-lg p-3 mb-4 border border-slate-200 flex items-center gap-2 text-sm text-slate-500">
                          <span className="animate-spin">⏳</span> Vérification du solde wallet...
                        </div>
                      )}
                      {/* BLOQUANT — argent en séquestre */}
                      {walletPreCheck?.loaded && walletPreCheck.soldeEnAttente > 0 && (
                        <div className="bg-red-100 rounded-lg p-4 mb-4 border border-red-400">
                          <p className="text-sm font-bold text-red-800 flex items-center gap-2">
                            🚫 Suppression impossible — Séquestre actif
                          </p>
                          <p className="text-sm text-red-700 mt-1">
                            <strong>{walletPreCheck.soldeEnAttente.toFixed(2)} €</strong> sont actuellement en séquestre Stripe (paiement non encore libéré). Attendez que le client valide les travaux ou traitez le litige avant de supprimer ce compte.
                          </p>
                        </div>
                      )}
                      {/* AVERTISSEMENT — solde disponible → virement urgent auto */}
                      {walletPreCheck?.loaded && walletPreCheck.soldeEnAttente === 0 && walletPreCheck.soldeDisponible > 0 && (
                        <div className="bg-orange-50 rounded-lg p-4 mb-4 border border-orange-300">
                          <p className="text-sm font-bold text-orange-800 flex items-center gap-2">
                            💰 Solde à virer avant suppression
                          </p>
                          <p className="text-sm text-orange-700 mt-1">
                            L'artisan a <strong>{walletPreCheck.soldeDisponible.toFixed(2)} €</strong> de solde disponible. Un virement urgent sera automatiquement créé lors de la suppression et apparaîtra dans la file d'attente admin pour traitement.
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Ce qui sera supprimé */}
                  <div className="bg-red-50 rounded-lg p-4 mb-5 border border-red-100">
                    <p className="text-xs font-semibold text-red-700 mb-2">Données supprimées en cascade :</p>
                    <div className="grid grid-cols-2 gap-1 text-xs text-red-600">
                      <span>🗑️ Compte utilisateur</span>
                      <span>🗑️ Messages</span>
                      <span>🗑️ Notifications</span>
                      <span>🗑️ Demandes</span>
                      <span>🗑️ Devis</span>
                      <span>🗑️ Contrats</span>
                      <span>🗑️ Conversations</span>
                      <span>🗑️ Litiges</span>
                      <span>🗑️ Tickets support</span>
                      <span>🗑️ Rappels &amp; Avis</span>
                      {accountType === 'artisans' && <span>🗑️ Wallet &amp; Transactions</span>}
                      {accountType === 'artisans' && <span>🗑️ Disponibilités</span>}
                      {accountType === 'artisans' && <span>⚠️ Virements en attente annulés</span>}
                    </div>
                  </div>

                  {/* Raison */}
                  <div className="mb-5">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Raison de la suppression <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      rows={3}
                      placeholder="Fraude avérée, demande RGPD, compte test..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={closeDeleteModal}
                      className="flex-1 border-2 border-navy-800 text-navy-800 hover:bg-navy-800 hover:text-white px-4 py-2.5 rounded-lg font-semibold transition-colors"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={executeImmediateDelete}
                      disabled={!deleteReason.trim() || (accountType === 'artisans' && (walletPreCheck?.soldeEnAttente || 0) > 0)}
                      className="flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 rounded-lg font-bold transition-colors"
                    >
                      {accountType === 'artisans' && (walletPreCheck?.soldeEnAttente || 0) > 0
                        ? '🚫 Séquestre actif — impossible'
                        : 'Supprimer définitivement'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Étape 2 — Chargement */}
            {deleteStep === 'loading' && (
              <div className="p-10 text-center">
                <div className="inline-block w-16 h-16 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                <p className="text-lg font-semibold text-navy-800 mb-2">Suppression en cours…</p>
                <p className="text-slate-500 text-sm">Suppression en cascade de toutes les données associées</p>
              </div>
            )}

            {/* Étape 3 — Résultat */}
            {deleteStep === 'result' && deleteResult && (
              <>
                <div className={`px-6 py-4 ${deleteResult.success ? 'bg-green-600' : 'bg-red-600'}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{deleteResult.success ? '✅' : '❌'}</span>
                    <div>
                      <h3 className="text-lg font-bold text-white">
                        {deleteResult.success ? 'Suppression effectuée' : 'Erreur lors de la suppression'}
                      </h3>
                      <p className="text-sm opacity-90 text-white">
                        {deleteResult.success
                          ? `${selectedAccount.nom} ${selectedAccount.prenom} — compte définitivement supprimé`
                          : deleteResult.error}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  {deleteResult.success && deleteResult.details && (
                    <div className="bg-slate-50 rounded-lg p-4 mb-5 border border-slate-200">
                      <p className="text-xs font-semibold text-slate-600 uppercase mb-3">Rapport de suppression</p>
                      <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                        {deleteResult.details}
                      </pre>
                    </div>
                  )}

                  <button
                    onClick={closeDeleteModal}
                    className="w-full bg-navy-800 text-white hover:bg-navy-900 px-4 py-2.5 rounded-lg font-semibold transition-colors"
                  >
                    Fermer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
