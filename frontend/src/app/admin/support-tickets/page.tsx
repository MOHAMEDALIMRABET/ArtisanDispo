'use client';

/**
 * Page Admin - Gestion Tickets Support
 * Permet aux admins de visualiser et répondre aux tickets
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  getAllSupportTickets,
  addTicketResponse,
  updateTicketStatus,
  updateTicketPriority,
  markTicketAsViewed,
  getCategorieLabel,
  getStatutColor,
  getPrioriteColor,
  type SupportTicket,
  type SupportTicketStatut,
  type SupportTicketCategorie,
  type SupportTicketPriorite,
} from '@/lib/firebase/support-ticket-service';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export default function AdminSupportTicketsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  // Tickets
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);

  // Filtres
  const [filterStatut, setFilterStatut] = useState<SupportTicketStatut | 'tous'>('tous');
  const [filterCategorie, setFilterCategorie] = useState<SupportTicketCategorie | 'tous'>('tous');
  const [showOnlyNonVus, setShowOnlyNonVus] = useState(false);

  // Réponse
  const [reponseMessage, setReponseMessage] = useState('');
  const [submittingReponse, setSubmittingReponse] = useState(false);

  // Vérifier admin
  useEffect(() => {
    if (!user) return;

    const checkAdmin = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists() && userDoc.data().role === 'admin') {
          setIsAdmin(true);
        } else {
          router.push('/');
        }
      } catch (error) {
        console.error('Erreur vérification admin:', error);
        router.push('/');
      }
    };

    checkAdmin();
  }, [user, router]);

  // Charger tickets
  useEffect(() => {
    if (!isAdmin) return;

    const loadTickets = async () => {
      try {
        const allTickets = await getAllSupportTickets();
        setTickets(allTickets);
      } catch (error) {
        console.error('Erreur chargement tickets:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTickets();

    // Refresh toutes les 30 secondes
    const interval = setInterval(loadTickets, 30000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  // Filtrer tickets
  const ticketsFiltres = tickets.filter((ticket) => {
    if (filterStatut !== 'tous' && ticket.statut !== filterStatut) return false;
    if (filterCategorie !== 'tous' && ticket.categorie !== filterCategorie) return false;
    if (showOnlyNonVus && ticket.vueParAdmin) return false;
    return true;
  });

  // Ouvrir ticket
  const handleOpenTicket = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);

    // Marquer comme vu
    if (!ticket.vueParAdmin) {
      try {
        await markTicketAsViewed(ticket.id);
        // Recharger tickets
        const allTickets = await getAllSupportTickets();
        setTickets(allTickets);
      } catch (error) {
        console.error('Erreur marquage vu:', error);
      }
    }
  };

  // Envoyer réponse
  const handleSendReponse = async () => {
    if (!selectedTicket || !reponseMessage.trim() || !user) return;

    setSubmittingReponse(true);

    try {
      // Récupérer nom admin
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const adminNom = userDoc.exists() 
        ? `${userDoc.data().prenom || ''} ${userDoc.data().nom || ''}`.trim() || 'Admin'
        : 'Admin';

      await addTicketResponse(selectedTicket.id, {
        auteurId: user.uid,
        auteurNom: adminNom,
        auteurRole: 'admin',
        message: reponseMessage,
      });

      alert('✅ Réponse envoyée ! L\'artisan recevra une notification par email.');

      setReponseMessage('');

      // Recharger tickets et détail
      const allTickets = await getAllSupportTickets();
      setTickets(allTickets);

      const updatedTicket = allTickets.find(t => t.id === selectedTicket.id);
      if (updatedTicket) {
        setSelectedTicket(updatedTicket);
      }
    } catch (error) {
      console.error('Erreur envoi réponse:', error);
      alert('❌ Erreur lors de l\'envoi. Veuillez réessayer.');
    } finally {
      setSubmittingReponse(false);
    }
  };

  // Changer statut
  const handleChangeStatut = async (ticketId: string, newStatut: SupportTicketStatut) => {
    try {
      await updateTicketStatus(ticketId, newStatut);

      // Recharger
      const allTickets = await getAllSupportTickets();
      setTickets(allTickets);

      const updatedTicket = allTickets.find(t => t.id === ticketId);
      if (updatedTicket) {
        setSelectedTicket(updatedTicket);
      }

      alert('✅ Statut mis à jour');
    } catch (error) {
      console.error('Erreur changement statut:', error);
      alert('❌ Erreur lors de la mise à jour');
    }
  };

  // Changer priorité
  const handleChangePriorite = async (ticketId: string, newPriorite: SupportTicketPriorite) => {
    try {
      await updateTicketPriority(ticketId, newPriorite);

      // Recharger
      const allTickets = await getAllSupportTickets();
      setTickets(allTickets);

      const updatedTicket = allTickets.find(t => t.id === ticketId);
      if (updatedTicket) {
        setSelectedTicket(updatedTicket);
      }
    } catch (error) {
      console.error('Erreur changement priorité:', error);
      alert('❌ Erreur lors de la mise à jour');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto mb-4"></div>
          <p className="text-slate-500">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const statsTickets = {
    total: tickets.length,
    ouverts: tickets.filter(t => t.statut === 'ouvert').length,
    enCours: tickets.filter(t => t.statut === 'en_cours').length,
    nonVus: tickets.filter(t => !t.vueParAdmin).length,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-navy-800 text-white py-6">
        <div className="max-w-7xl mx-auto px-4">
          <h1 className="text-3xl font-bold mb-2">🎫 Support Tickets</h1>
          <p className="text-slate-300">Gestion des demandes utilisateurs</p>
        </div>
      </div>

      {/* Stats */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <p className="text-slate-500 text-sm mb-1">Total tickets</p>
            <p className="text-2xl font-bold text-navy-800">{statsTickets.total}</p>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-4">
            <p className="text-blue-700 text-sm mb-1">Ouverts</p>
            <p className="text-2xl font-bold text-blue-800">{statsTickets.ouverts}</p>
          </div>
          <div className="bg-yellow-50 rounded-lg shadow p-4">
            <p className="text-yellow-700 text-sm mb-1">En cours</p>
            <p className="text-2xl font-bold text-yellow-800">{statsTickets.enCours}</p>
          </div>
          <div className="bg-orange-50 rounded-lg shadow p-4">
            <p className="text-orange-700 text-sm mb-1">Non vus</p>
            <p className="text-2xl font-bold text-orange-800">{statsTickets.nonVus}</p>
          </div>
        </div>

        {/* Filtres */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Statut</label>
              <select
                value={filterStatut}
                onChange={(e) => setFilterStatut(e.target.value as any)}
                className="px-3 py-2 border border-slate-300 rounded text-sm"
              >
                <option value="tous">Tous</option>
                <option value="ouvert">Ouvert</option>
                <option value="en_cours">En cours</option>
                <option value="resolu">Résolu</option>
                <option value="ferme">Fermé</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Catégorie</label>
              <select
                value={filterCategorie}
                onChange={(e) => setFilterCategorie(e.target.value as any)}
                className="px-3 py-2 border border-slate-300 rounded text-sm"
              >
                <option value="tous">Toutes</option>
                <option value="modification_iban">Modification IBAN</option>
                <option value="compte_restreint">Compte Restreint</option>
                <option value="verification_documents">Vérification Documents</option>
                <option value="probleme_technique">Problème Technique</option>
                <option value="question_generale">Question Générale</option>
                <option value="autre">Autre</option>
              </select>
            </div>

            <div className="flex items-center gap-2 mt-5">
              <input
                type="checkbox"
                id="nonVus"
                checked={showOnlyNonVus}
                onChange={(e) => setShowOnlyNonVus(e.target.checked)}
                className="w-4 h-4 text-brand-700 rounded"
              />
              <label htmlFor="nonVus" className="text-sm text-navy-800">
                Seulement non vus
              </label>
            </div>

            <div className="ml-auto text-sm text-slate-500">
              {ticketsFiltres.length} ticket(s) affiché(s)
            </div>
          </div>
        </div>

        {/* Layout: Liste + Détail */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Liste tickets (1/3) */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-lg shadow max-h-[calc(100vh-400px)] overflow-y-auto">
              {ticketsFiltres.length === 0 ? (
                <p className="text-center text-slate-500 py-8">Aucun ticket</p>
              ) : (
                <div className="divide-y">
                  {ticketsFiltres.map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => handleOpenTicket(ticket)}
                      className={`w-full p-4 text-left hover:bg-slate-50 transition ${
                        selectedTicket?.id === ticket.id ? 'bg-blue-50 border-l-4 border-brand-500' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-xs font-mono text-slate-500">{ticket.numero}</span>
                        {!ticket.vueParAdmin && (
                          <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
nouvelle
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-navy-800 text-sm mb-1 line-clamp-2">
                        {ticket.sujet}
                      </p>
                      <p className="text-xs text-slate-500 mb-2">
                        {getCategorieLabel(ticket.categorie)}
                      </p>
                      <div className="flex items-center justify-between text-xs">
                        <span className={`px-2 py-0.5 rounded ${getStatutColor(ticket.statut)}`}>
                          {ticket.statut}
                        </span>
                        <span className={getPrioriteColor(ticket.priorite)}>
                          {ticket.priorite === 'urgente' && '🔥'}
                          {ticket.priorite === 'haute' && '⚠️'}
                          {ticket.priorite}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Détail ticket (2/3) */}
          <div className="md:col-span-2">
            {!selectedTicket ? (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
                <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <p className="text-slate-500">Sélectionnez un ticket pour voir les détails</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow">
                {/* Header ticket */}
                <div className="border-b p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <span className="text-sm font-mono text-slate-500">{selectedTicket.numero}</span>
                      <h2 className="text-2xl font-bold text-navy-800 mt-1">{selectedTicket.sujet}</h2>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={selectedTicket.statut}
                        onChange={(e) => handleChangeStatut(selectedTicket.id, e.target.value as SupportTicketStatut)}
                        className={`px-3 py-1 rounded text-sm font-semibold ${getStatutColor(selectedTicket.statut)}`}
                      >
                        <option value="ouvert">Ouvert</option>
                        <option value="en_cours">En cours</option>
                        <option value="resolu">Résolu</option>
                        <option value="ferme">Fermé</option>
                      </select>

                      <select
                        value={selectedTicket.priorite}
                        onChange={(e) => handleChangePriorite(selectedTicket.id, e.target.value as SupportTicketPriorite)}
                        className={`px-3 py-1 rounded text-sm font-semibold ${getPrioriteColor(selectedTicket.priorite)}`}
                      >
                        <option value="basse">Basse</option>
                        <option value="normale">Normale</option>
                        <option value="haute">Haute</option>
                        <option value="urgente">Urgente</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                    <div>
                      <strong>De:</strong> {selectedTicket.userNom} ({selectedTicket.userEmail})
                    </div>
                    <div>
                      <strong>Catégorie:</strong> {getCategorieLabel(selectedTicket.categorie)}
                    </div>
                    <div>
                      <strong>Créé:</strong> {selectedTicket.createdAt.toDate().toLocaleString('fr-FR')}
                    </div>
                  </div>
                </div>

                {/* Message initial */}
                <div className="p-6 bg-slate-50 border-b">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                      {selectedTicket.userNom.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="bg-white rounded-xl p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <strong className="text-navy-800">{selectedTicket.userNom}</strong>
                          <span className="text-xs text-slate-500">
                            {selectedTicket.createdAt.toDate().toLocaleString('fr-FR')}
                          </span>
                        </div>
                        <p className="text-navy-800 whitespace-pre-wrap">{selectedTicket.message}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Réponses */}
                {selectedTicket.reponses.length > 0 && (
                  <div className="p-6 space-y-4 max-h-[400px] overflow-y-auto">
                    {selectedTicket.reponses.map((reponse, index) => (
                      <div key={index} className={`flex items-start gap-3 ${reponse.auteurRole === 'admin' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                          reponse.auteurRole === 'admin' ? 'bg-brand-700 text-white' : 'bg-blue-500 text-white'
                        }`}>
                          {reponse.auteurNom.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className={`rounded-lg p-4 shadow-sm ${
                            reponse.auteurRole === 'admin' ? 'bg-orange-50' : 'bg-white'
                          }`}>
                            <div className="flex items-center justify-between mb-2">
                              <strong className="text-navy-800">{reponse.auteurNom}</strong>
                              <span className="text-xs text-slate-500">
                                {reponse.dateReponse.toDate().toLocaleString('fr-FR')}
                              </span>
                            </div>
                            <p className="text-navy-800 whitespace-pre-wrap">{reponse.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Formulaire réponse (seulement si pas fermé) */}
                {selectedTicket.statut !== 'ferme' && (
                  <div className="p-6 border-t bg-slate-50">
                    <textarea
                      value={reponseMessage}
                      onChange={(e) => setReponseMessage(e.target.value)}
                      placeholder="Votre réponse à l'artisan..."
                      rows={4}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                    />
                    <div className="flex items-center justify-between mt-3">
                      <p className="text-xs text-slate-500">
                        💡 L'artisan recevra une notification par email
                      </p>
                      <button
                        onClick={handleSendReponse}
                        disabled={!reponseMessage.trim() || submittingReponse}
                        className="bg-brand-700 text-white px-6 py-2 rounded-lg font-semibold hover:bg-brand-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition"
                      >
                        {submittingReponse ? 'Envoi...' : '📨 Envoyer la réponse'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
