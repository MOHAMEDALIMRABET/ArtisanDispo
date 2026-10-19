'use client';

/**
 * Dashboard Admin - Gestion des Litiges et Historique des Conversations
 * Page: /admin/litiges
 * 
 * Permet aux administrateurs de :
 * - Consulter toutes les conversations entre clients et artisans
 * - Filtrer par statut de litige
 * - Rechercher par nom, email, ou ID
 * - Voir l'historique complet des messages
 * - Marquer/démarquer comme litige
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService } from '@/lib/auth-service';
import { db } from '@/lib/firebase/config';
import { 
  collection, 
  query, 
  getDocs, 
  doc, 
  updateDoc,
  orderBy,
  where,
  Timestamp 
} from 'firebase/firestore';
import { 
  getLitigesByAdmin,
  getLitigesStats,
} from '@/lib/firebase/litige-service';
import { createNotification } from '@/lib/firebase/notification-service';
import type { Litige } from '@/types/litige';
import {
  LITIGE_TYPE_LABELS,
  LITIGE_STATUT_LABELS,
  LITIGE_PRIORITE_LABELS,
} from '@/types/litige';
import LitigesNavigation from '@/components/admin/LitigesNavigation';

interface Conversation {
  id: string;
  participants: string[];
  participantNames: { [key: string]: string };
  lastMessage: string;
  lastMessageDate: Timestamp;
  demandeId?: string;
  litige?: boolean;
  litigeDate?: Timestamp;
  litigeDescription?: string;
  litigeMarkedBy?: string;
  unreadCount?: { [key: string]: number };
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: Timestamp;
  read: boolean;
  deleted?: boolean;
  deletedAt?: Timestamp;
  deletedBy?: string;
}

interface UserInfo {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  role: 'client' | 'artisan' | 'admin';
}

export default function AdminLitigesPage() {
  const router = useRouter();
  
  // État pour les onglets
  const [activeTab, setActiveTab] = useState<'conversations' | 'litiges'>('conversations');
  
  // État pour les conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [participantsInfo, setParticipantsInfo] = useState<{ [key: string]: UserInfo }>({});
  
  // État pour les litiges formels
  const [litiges, setLitiges] = useState<Litige[]>([]);
  const [filteredLitiges, setFilteredLitiges] = useState<Litige[]>([]);
  const [litigesStats, setLitigesStats] = useState({
    total: 0,
    ouverts: 0,
    enMediation: 0,
    resolus: 0,
    abandonnes: 0,
    delaiMoyenResolution: 0,
  });
  
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLitige, setFilterLitige] = useState<'all' | 'litige' | 'normal'>('all');
  
  const [showLitigeModal, setShowLitigeModal] = useState(false);
  const [litigeDescription, setLitigeDescription] = useState('');
  const [markingLitige, setMarkingLitige] = useState(false);
  const [showEscaladeModal, setShowEscaladeModal] = useState(false);
  const [escalading, setEscalading] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);

  // Vérification admin et chargement
  useEffect(() => {
    const checkAuth = async () => {
      try {
        setAuthLoading(true);
        const user = authService.getCurrentUser();
        if (!user) {
          router.push('/access-x7k9m2p4w8n3');
          return;
        }
        await Promise.all([
          loadAllConversations(),
          loadLitigesFormels(),
        ]);
      } catch (error) {
        console.error('Erreur authentification:', error);
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, [router]);

  // Charger toutes les conversations
  async function loadAllConversations() {
    try {
      setLoading(true);
      const q = query(collection(db, 'conversations'));
      const querySnapshot = await getDocs(q);
      
      const convs: Conversation[] = [];
      const userIds = new Set<string>();

      querySnapshot.forEach((doc) => {
        const data = doc.data() as Omit<Conversation, 'id'>;
        convs.push({ id: doc.id, ...data });
        data.participants.forEach(uid => userIds.add(uid));
      });

      // Trier par date décroissante
      convs.sort((a, b) => {
        const dateA = a.lastMessageDate?.toMillis() || 0;
        const dateB = b.lastMessageDate?.toMillis() || 0;
        return dateB - dateA;
      });

      setConversations(convs);
      setFilteredConversations(convs);

      // Charger les infos des utilisateurs
      await loadUsersInfo(Array.from(userIds));
    } catch (error) {
      console.error('Erreur chargement conversations:', error);
    } finally {
      setLoading(false);
    }
  }

  // Charger les infos des utilisateurs
  async function loadUsersInfo(userIds: string[]) {
    try {
      const usersInfo: { [key: string]: UserInfo } = {};
      
      for (const uid of userIds) {
        const userDoc = await getDocs(query(collection(db, 'users'), where('__name__', '==', uid)));
        if (!userDoc.empty) {
          const userData = userDoc.docs[0].data();
          usersInfo[uid] = {
            id: uid,
            email: userData.email || '',
            nom: userData.nom || '',
            prenom: userData.prenom || '',
            role: userData.role || 'client',
          };
        }
      }

      setParticipantsInfo(usersInfo);
    } catch (error) {
      console.error('Erreur chargement users:', error);
    }
  }

  // Charger les messages d'une conversation
  async function loadMessages(conversationId: string) {
    try {
      setLoadingMessages(true);
      const q = query(
        collection(db, 'messages'),
        where('conversationId', '==', conversationId)
      );
      
      const querySnapshot = await getDocs(q);
      const msgs: Message[] = [];

      querySnapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as Message);
      });

      // ✅ Filtrer les messages supprimés
      const activeMessages = msgs.filter(msg => !msg.deleted);

      // Trier par date croissante (ordre chronologique)
      activeMessages.sort((a, b) => {
        const dateA = a.createdAt?.toMillis() || 0;
        const dateB = b.createdAt?.toMillis() || 0;
        return dateA - dateB;
      });

      setMessages(activeMessages);
    } catch (error) {
      console.error('Erreur chargement messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  }

  // Charger les litiges formels
  async function loadLitigesFormels() {
    try {
      const [litigesData, statsData] = await Promise.all([
        getLitigesByAdmin(),
        getLitigesStats(),
      ]);
      setLitiges(litigesData);
      setFilteredLitiges(litigesData);
      setLitigesStats(statsData);
    } catch (error) {
      console.error('Erreur chargement litiges formels:', error);
    }
  }

  // Sélectionner une conversation
  function handleSelectConversation(conversationId: string) {
    setSelectedConversation(conversationId);
    loadMessages(conversationId);
  }

  // Filtrer les conversations
  useEffect(() => {
    let filtered = conversations;

    // Filtre par recherche
    if (searchTerm) {
      filtered = filtered.filter(conv => {
        const names = Object.values(conv.participantNames || {}).join(' ').toLowerCase();
        const participants = conv.participants.map(uid => {
          const user = participantsInfo[uid];
          return user ? `${user.prenom} ${user.nom} ${user.email}`.toLowerCase() : '';
        }).join(' ');
        
        return names.includes(searchTerm.toLowerCase()) || 
               participants.includes(searchTerm.toLowerCase()) ||
               conv.id.includes(searchTerm);
      });
    }

    // Filtre par statut litige
    if (filterLitige === 'litige') {
      filtered = filtered.filter(conv => conv.litige === true);
    } else if (filterLitige === 'normal') {
      filtered = filtered.filter(conv => !conv.litige);
    }

    setFilteredConversations(filtered);
  }, [searchTerm, filterLitige, conversations, participantsInfo]);

  // Filtrer les litiges formels  
  useEffect(() => {
    if (activeTab !== 'litiges') return;
    
    let filtered = litiges;

    if (searchTerm) {
      filtered = filtered.filter(l =>
        l.motif?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.id.includes(searchTerm)
      );
    }

    setFilteredLitiges(filtered);
  }, [searchTerm, litiges, activeTab]);

  // Marquer comme litige
  async function handleMarkLitige() {
    if (!selectedConversation || !litigeDescription.trim()) {
      alert('Veuillez décrire le motif du litige');
      return;
    }

    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      alert('Erreur : utilisateur non connecté');
      return;
    }

    try {
      setMarkingLitige(true);
      
      // Récupérer la conversation pour avoir les participants
      const convDoc = await getDocs(
        query(collection(db, 'conversations'), where('__name__', '==', selectedConversation))
      );
      
      if (convDoc.empty) {
        alert('Conversation introuvable');
        return;
      }

      const convData = convDoc.docs[0].data();
      const [clientId, artisanId] = convData.participants || [];

      console.log('🔍 [DEBUG] Participants:', { clientId, artisanId, allParticipants: convData.participants });

      if (!clientId || !artisanId) {
        alert('❌ Erreur : Impossible de récupérer les participants de la conversation');
        console.error('❌ Participants manquants:', { clientId, artisanId });
        return;
      }

      // Mettre à jour la conversation
      await updateDoc(doc(db, 'conversations', selectedConversation), {
        litige: true,
        litigeDate: Timestamp.now(),
        litigeDescription: litigeDescription.trim(),
        litigeMarkedBy: currentUser.uid,
      });

      // 🆕 NOTIFIER LE CLIENT ET L'ARTISAN
      console.log('📧 [NOTIFICATIONS] Début envoi notifications...');
      
      try {
        if (clientId) {
          console.log('📧 Envoi notification CLIENT:', clientId);
          const notifId = await createNotification(clientId, {
            type: 'admin_surveillance',
            titre: '⚠️ Conversation sous surveillance',
            message: 'Un administrateur surveille votre conversation pour détecter d\'eventuels problèmes. Merci de rester courtois et professionnel.',
            lien: `/messages?conversationId=${selectedConversation}`,
          });
          console.log('✅ Notification CLIENT créée avec ID:', notifId);
        } else {
          console.warn('⚠️ ClientId manquant, notification non envoyée');
        }

        if (artisanId) {
          console.log('📧 Envoi notification ARTISAN:', artisanId);
          const notifId = await createNotification(artisanId, {
            type: 'admin_surveillance',
            titre: '⚠️ Conversation sous surveillance',
            message: 'Un administrateur surveille votre conversation pour détecter d\'eventuels problèmes. Merci de rester courtois et professionnel.',
            lien: `/messages?conversationId=${selectedConversation}`,
          });
          console.log('✅ Notification ARTISAN créée avec ID:', notifId);
        } else {
          console.warn('⚠️ ArtisanId manquant, notification non envoyée');
        }
        
        console.log('✅ [NOTIFICATIONS] Toutes les notifications ont été envoyées avec succès');
      } catch (notifError) {
        console.error('❌ Erreur lors de l\'envoi des notifications:', notifError);
        // Ne pas bloquer l'opération si les notifications échouent
      }

      // Mettre à jour l'état local
      setConversations(prev => prev.map(conv => 
        conv.id === selectedConversation 
          ? { 
              ...conv, 
              litige: true, 
              litigeDate: Timestamp.now(),
              litigeDescription: litigeDescription.trim(),
              litigeMarkedBy: currentUser.uid,
            }
          : conv
      ));

      setShowLitigeModal(false);
      setLitigeDescription('');
      
      const message = clientId && artisanId 
        ? '✅ Conversation marquée comme litige\n📧 Client et artisan ont été notifiés'
        : '✅ Conversation marquée comme litige\n⚠️ Attention : Certains participants n\'ont pas pu être notifiés';
      
      alert(message);
    } catch (error) {
      console.error('Erreur marquage litige:', error);
      alert('Erreur lors du marquage');
    } finally {
      setMarkingLitige(false);
    }
  }

  // Escalader vers litige formel
  async function handleEscalade() {
    if (!selectedConversation) return;

    const selectedConv = conversations.find(c => c.id === selectedConversation);
    if (!selectedConv) return;

    if (!confirm(
      '⚠️ ESCALADE VERS LITIGE FORMEL\n\n' +
      'Cette action va :\n' +
      '1. Créer un litige formel dans le système\n' +
      '2. Notifier le client et l\'artisan\n' +
      '3. Bloquer la conversation jusqu\'à résolution\n\n' +
      'Voulez-vous continuer ?'
    )) return;

    try {
      setEscalading(true);

      // Récupérer la demande liée à cette conversation
      const demandeId = selectedConv.demandeId;
      if (!demandeId) {
        alert('❌ Impossible : aucune demande liée à cette conversation');
        return;
      }

      // Récupérer les participants
      const [clientId, artisanId] = selectedConv.participants;

      // Rediriger vers la page de création de litige formel avec contexte
      alert(
        '✅ Préparation de l\'escalade\n\n' +
        'Vous allez être redirigé vers la page de gestion des litiges formels.\n' +
        'La conversation restera marquée en surveillance.'
      );

      // Rediriger vers /admin/gestion-litiges avec le contexte
      router.push(`/admin/gestion-litiges?demandeId=${demandeId}&source=escalade`);
    } catch (error) {
      console.error('Erreur escalade:', error);
      alert('Erreur lors de l\'escalade');
    } finally {
      setEscalading(false);
    }
  }

  // Retirer le marquage litige
  async function handleUnmarkLitige() {
    if (!selectedConversation) return;
    
    if (!confirm('Voulez-vous retirer le marquage de litige ?')) return;

    try {
      await updateDoc(doc(db, 'conversations', selectedConversation), {
        litige: false,
        litigeDate: null,
        litigeDescription: null,
        litigeMarkedBy: null,
      });

      setConversations(prev => prev.map(conv => 
        conv.id === selectedConversation 
          ? { ...conv, litige: false }
          : conv
      ));

      alert('✅ Marquage litige retiré');
    } catch (error) {
      console.error('Erreur retrait litige:', error);
      alert('Erreur lors du retrait');
    }
  }

  // Exporter la conversation en PDF (fonctionnalité future)
  function handleExportConversation() {
    alert('Fonctionnalité d\'export PDF à venir');
  }

  // 🗑️ Fonction de suppression admin de message
  async function handleDeleteMessage(messageId: string) {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      alert('❌ Erreur : utilisateur non connecté');
      return;
    }

    const confirmed = confirm(
      '❓ Supprimer ce message ?\n\n⚠️ Action Admin : Le message sera supprimé définitivement pour tous les participants.\n\n✅ Cette action sera tracée dans les logs.'
    );
    if (!confirmed) return;

    try {
      setDeletingMessageId(messageId);

      await updateDoc(doc(db, 'messages', messageId), {
        deleted: true,
        deletedAt: Timestamp.now(),
        deletedBy: currentUser.uid,
      });

      // Mettre à jour localement
      setMessages(prev => prev.filter(msg => msg.id !== messageId));

      console.log('✅ [ADMIN] Message supprimé:', messageId, 'par:', currentUser.email);
      alert('✅ Message supprimé avec succès');
    } catch (error) {
      console.error('❌ Erreur suppression message:', error);
      alert('❌ Erreur lors de la suppression du message');
    } finally {
      setDeletingMessageId(null);
    }
  }

  // Helpers pour les badges de couleur des litiges formels
  const getPrioriteColor = (priorite?: string) => {
    switch (priorite) {
      case 'urgente': return 'bg-red-700 text-white';
      case 'haute': return 'bg-brand-700 text-white';
      case 'moyenne': return 'bg-amber-400 text-black';
      case 'basse': return 'bg-green-700 text-white';
      default: return 'bg-slate-500 text-white';
    }
  };

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto"></div>
          <p className="mt-4 text-slate-600">Chargement des conversations...</p>
        </div>
      </div>
    );
  }



  const selectedConv = conversations.find(c => c.id === selectedConversation);

  return (
    <div className="min-h-screen bg-slate-50">
      <LitigesNavigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h1 className="text-3xl font-bold text-navy-800 mb-2">
            Gestion des Litiges et Historique
          </h1>
          <p className="text-slate-600">
            Consultation de toutes les conversations entre clients et artisans pour résolution de litiges
          </p>
        </div>

        {/* Filtres */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Recherche */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                🔍 Rechercher une conversation
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Nom, email, ou ID de conversation..."
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            {/* Filtre litige */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                🚨 Statut
              </label>
              <select
                value={filterLitige}
                onChange={(e) => setFilterLitige(e.target.value as 'all' | 'litige' | 'normal')}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              >
                <option value="all">Toutes ({conversations.length})</option>
                <option value="litige">Litiges uniquement ({conversations.filter(c => c.litige).length})</option>
                <option value="normal">Normales ({conversations.filter(c => !c.litige).length})</option>
              </select>
            </div>
          </div>
        </div>

        {/* Interface split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Liste des conversations */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-4 bg-navy-800 text-white font-semibold">
              💬 Conversations ({filteredConversations.length})
            </div>
            <div className="divide-y divide-slate-200 max-h-[600px] overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  Aucune conversation trouvée
                </div>
              ) : (
                filteredConversations.map(conv => {
                  const participant1 = participantsInfo[conv.participants[0]];
                  const participant2 = participantsInfo[conv.participants[1]];
                  
                  return (
                    <div
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={`p-4 cursor-pointer hover:bg-slate-50 transition ${
                        selectedConversation === conv.id ? 'bg-blue-50 border-l-4 border-brand-500' : ''
                      }`}
                    >
                      {conv.litige && (
                        <span className="inline-block bg-red-500 text-white text-xs px-2 py-1 rounded mb-2">
                          🚨 LITIGE
                        </span>
                      )}
                      <p className="font-semibold text-slate-900">
                        {participant1 ? `${participant1.prenom} ${participant1.nom}` : 'Utilisateur inconnu'}
                        <span className="text-slate-500 text-xs ml-2">
                          ({participant1?.role || 'N/A'})
                        </span>
                      </p>
                      <p className="font-semibold text-slate-900">
                        {participant2 ? `${participant2.prenom} ${participant2.nom}` : 'Utilisateur inconnu'}
                        <span className="text-slate-500 text-xs ml-2">
                          ({participant2?.role || 'N/A'})
                        </span>
                      </p>
                      <p className="text-sm text-slate-600 mt-1 truncate">
                        {conv.lastMessage || 'Pas de message'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {conv.lastMessageDate?.toDate().toLocaleString('fr-FR') || 'Date inconnue'}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Historique des messages */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-md overflow-hidden">
            {!selectedConversation ? (
              <div className="p-8 text-center text-slate-500">
                <p className="text-lg">👈 Sélectionnez une conversation pour voir l'historique complet</p>
              </div>
            ) : (
              <>
                {/* Header conversation */}
                <div className="p-4 bg-navy-800 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-lg">
                        📜 Historique Complet
                      </h2>
                      {selectedConv && (
                        <p className="text-sm text-slate-300 mt-1">
                          ID: {selectedConv.id}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {selectedConv?.litige ? (
                        <>
                          <button
                            onClick={handleEscalade}
                            disabled={escalading}
                            className="bg-red-700 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                          >
                            🚀 Escalader vers litige formel
                          </button>
                          <button
                            onClick={handleUnmarkLitige}
                            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm"
                          >
                            ✅ Retirer surveillance
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setShowLitigeModal(true)}
                          className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm"
                        >
                          🚨 Marquer comme litige
                        </button>
                      )}
                      <button
                        onClick={handleExportConversation}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
                      >
                        📥 Exporter PDF
                      </button>
                    </div>
                  </div>

                  {/* Info litige */}
                  {selectedConv?.litige && (
                    <div className="mt-4 bg-red-600 p-4 rounded">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold">🚨 CONVERSATION SOUS SURVEILLANCE</p>
                          <p className="text-sm mt-1">
                            {selectedConv.litigeDescription || 'Pas de description'}
                          </p>
                          <p className="text-xs text-slate-200 mt-1">
                            Marquée le {selectedConv.litigeDate?.toDate().toLocaleString('fr-FR')}
                          </p>
                        </div>
                        <span className="bg-white text-red-600 text-xs px-2 py-1 rounded font-medium">
                          PRÉVENTION
                        </span>
                      </div>
                      <div className="mt-3 pt-3 border-t border-red-500">
                        <p className="text-xs text-slate-200">
                          ℹ️ Le client et l'artisan ont été notifiés de la surveillance.<br/>
                          Vous pouvez escalader vers un litige formel si nécessaire.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Messages */}
                <div className="p-4 max-h-[500px] overflow-y-auto bg-slate-50">
                  {loadingMessages ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mx-auto"></div>
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="text-center text-slate-500 py-8">
                      Aucun message dans cette conversation
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {messages.map((msg) => {
                        const sender = participantsInfo[msg.senderId];
                        const isArtisan = sender?.role === 'artisan';
                        const isDeleting = deletingMessageId === msg.id;
                        
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isArtisan ? 'justify-start' : 'justify-end'} group`}
                          >
                            <div className="flex items-end gap-2">
                              {/* 🗑️ Bouton suppression admin (toujours visible au hover) */}
                              <button
                                onClick={() => handleDeleteMessage(msg.id)}
                                disabled={isDeleting}
                                className="opacity-0 group-hover:opacity-100 transition-opacity bg-red-600 hover:bg-red-700 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs shadow-lg disabled:opacity-50"
                                title="[Admin] Supprimer ce message définitivement"
                              >
                                {isDeleting ? '⏳' : '🗑️'}
                              </button>
                              
                              <div className={`max-w-[70%] ${isArtisan ? 'bg-white border border-slate-300' : 'bg-brand-700 text-white'} rounded-lg p-3 shadow`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-semibold text-sm">
                                    {sender ? `${sender.prenom} ${sender.nom}` : 'Utilisateur inconnu'}
                                  </span>
                                  <span className={`text-xs px-2 py-0.5 rounded ${
                                    isArtisan ? 'bg-blue-100 text-blue-800' : 'bg-orange-200 text-orange-900'
                                  }`}>
                                    {sender?.role || 'N/A'}
                                  </span>
                                </div>
                                <p className={`text-sm ${isArtisan ? 'text-slate-800' : 'text-white'}`}>
                                  {msg.content}
                                </p>
                                <p className={`text-xs mt-1 ${isArtisan ? 'text-slate-400' : 'text-orange-100'}`}>
                                  {msg.createdAt?.toDate().toLocaleString('fr-FR')}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal marquage litige */}
      {showLitigeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-navy-800 mb-4">
              🚨 Marquer comme litige
            </h3>
            <p className="text-slate-600 mb-4">
              Décrivez le motif du litige pour archivage et suivi :
            </p>
            <textarea
              value={litigeDescription}
              onChange={(e) => setLitigeDescription(e.target.value)}
              placeholder="Ex: Non-paiement, malfaçons, abandon de chantier..."
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent mb-4"
              rows={4}
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowLitigeModal(false);
                  setLitigeDescription('');
                }}
                className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={handleMarkLitige}
                disabled={markingLitige || !litigeDescription.trim()}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {markingLitige ? '⏳' : '🚨'} Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
