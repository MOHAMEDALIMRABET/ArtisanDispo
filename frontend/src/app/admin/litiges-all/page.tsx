'use client';

/**
 * Dashboard Admin - Gestion des Litiges (avec onglets)
 * Page: /admin/litiges-all
 * 
 * 2 ONGLETS :
 * 1. Conversations (historique messagerie - visible même si grisé/supprimé)
 * 2. Litiges Formels (système de litiges officiels avec demande + devis)
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
  where,
  Timestamp 
} from 'firebase/firestore';
import { 
  getLitigesByAdmin,
  getLitigesStats,
} from '@/lib/firebase/litige-service';
import type { Litige } from '@/types/litige';
import {
  LITIGE_TYPE_LABELS,
  LITIGE_STATUT_LABELS,
  LITIGE_PRIORITE_LABELS,
} from '@/types/litige';

interface Conversation {
  id: string;
  participants: string[];
  participantNames: { [key: string]: string };
  lastMessage: string;
  lastMessageDate: Timestamp;
  litige?: boolean;
  litigeDate?: Timestamp;
  litigeDescription?: string;
  litigeMarkedBy?: string;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: Timestamp;
  read: boolean;
}

interface UserInfo {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  role: 'client' | 'artisan' | 'admin';
}

export default function AdminLitigesAllPage() {
  const router = useRouter();
  
  // Onglets
  const [activeTab, setActiveTab] = useState<'conversations' | 'litiges'>('conversations');
  
  // Conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [participantsInfo, setParticipantsInfo] = useState<{ [key: string]: UserInfo }>({});
  
  // Litiges formels
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

  async function loadAllConversations() {
    try {
      setLoading(true);
      const q = query(collection(db, 'conversations'));
      const querySnapshot = await getDocs(q);
      
      const convs: Conversation[] = [];
      const userIds = new Set<string>();

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data() as Omit<Conversation, 'id'>;
        convs.push({ id: docSnap.id, ...data });
        data.participants.forEach(uid => userIds.add(uid));
      });

      convs.sort((a, b) => {
        const dateA = a.lastMessageDate?.toMillis() || 0;
        const dateB = b.lastMessageDate?.toMillis() || 0;
        return dateB - dateA;
      });

      setConversations(convs);
      setFilteredConversations(convs);
      await loadUsersInfo(Array.from(userIds));
    } catch (error) {
      console.error('Erreur chargement conversations:', error);
    } finally {
      setLoading(false);
    }
  }

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

  async function loadMessages(conversationId: string) {
    try {
      setLoadingMessages(true);
      const q = query(
        collection(db, 'messages'),
        where('conversationId', '==', conversationId)
      );
      
      const querySnapshot = await getDocs(q);
      const msgs: Message[] = [];

      querySnapshot.forEach((docSnap) => {
        msgs.push({ id: docSnap.id, ...docSnap.data() } as Message);
      });

      msgs.sort((a, b) => {
        const dateA = a.createdAt?.toMillis() || 0;
        const dateB = b.createdAt?.toMillis() || 0;
        return dateA - dateB;
      });

      setMessages(msgs);
    } catch (error) {
      console.error('Erreur chargement messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  }

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

  function handleSelectConversation(conversationId: string) {
    setSelectedConversation(conversationId);
    loadMessages(conversationId);
  }

  useEffect(() => {
    if (activeTab !== 'conversations') return;

    let filtered = conversations;

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

    if (filterLitige === 'litige') {
      filtered = filtered.filter(conv => conv.litige === true);
    } else if (filterLitige === 'normal') {
      filtered = filtered.filter(conv => !conv.litige);
    }

    setFilteredConversations(filtered);
  }, [searchTerm, filterLitige, conversations, participantsInfo, activeTab]);

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
      await updateDoc(doc(db, 'conversations', selectedConversation), {
        litige: true,
        litigeDate: Timestamp.now(),
        litigeDescription: litigeDescription.trim(),
        litigeMarkedBy: currentUser.uid,
      });

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
      alert('✅ Conversation marquée comme litige');
    } catch (error) {
      console.error('Erreur marquage litige:', error);
      alert('Erreur lors du marquage');
    } finally {
      setMarkingLitige(false);
    }
  }

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

  function handleExportConversation() {
    alert('Fonctionnalité d\'export PDF à venir');
  }

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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto"></div>
          <p className="mt-4 text-slate-500">Chargement...</p>
        </div>
      </div>
    );
  }

  const selectedConv = conversations.find(c => c.id === selectedConversation);

  return (
    <div className="min-h-screen bg-slate-50 pt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h1 className="text-3xl font-bold text-navy-800 mb-2">
            🛡️ Gestion des Litiges et Historique
          </h1>
          <p className="text-slate-500">
            Toutes les conversations (même grisées) et litiges formels accessibles pour l'admin
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="border-b border-slate-200">
            <div className="flex">
              <button
                onClick={() => { setActiveTab('conversations'); setSearchTerm(''); }}
                className={`px-6 py-3 font-medium border-b-2 ${
                  activeTab === 'conversations'
                    ? 'text-brand-700 border-brand-500'
                    : 'text-slate-500 border-transparent hover:text-navy-800'
                }`}
              >
                💬 Conversations ({conversations.length})
              </button>
              
              <button
                onClick={() => { setActiveTab('litiges'); setSearchTerm(''); }}
                className={`px-6 py-3 font-medium border-b-2 ${
                  activeTab === 'litiges'
                    ? 'text-brand-700 border-brand-500'
                    : 'text-slate-500 border-transparent hover:text-navy-800'
                }`}
              >
                ⚖️ Litiges Formels ({litiges.length})
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'conversations' ? (
          <div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="🔍 Rechercher..."
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <select
                  value={filterLitige}
                  onChange={(e) => setFilterLitige(e.target.value as any)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="all">Toutes</option>
                  <option value="litige">Litiges</option>
                  <option value="normal">Normales</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow-md">
                <div className="p-4 bg-navy-800 text-white">
                  Conversations ({filteredConversations.length})
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  {filteredConversations.map(conv => (
                    <div
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={`p-4 cursor-pointer hover:bg-slate-50 border-b ${
                        selectedConversation === conv.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      {conv.litige && <span className="bg-red-500 text-white text-xs px-2 py-1 rounded">🚨 LITIGE</span>}
                      <p className="font-semibold text-navy-800 mt-2">
                        {participantsInfo[conv.participants[0]]?.prenom} {participantsInfo[conv.participants[0]]?.nom}
                      </p>
                      <p className="text-sm text-slate-500 truncate">{conv.lastMessage}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2 bg-white rounded-lg shadow-md">
                {selectedConv ? (
                  <>
                    <div className="p-4 bg-navy-800 text-white">
                      <div className="flex justify-between">
                        <div>
                          <h2>Historique</h2>
                          <p className="text-sm">{selectedConv.id}</p>
                        </div>
                        <div className="flex gap-2">
                          {selectedConv.litige ? (
                            <button onClick={handleUnmarkLitige} className="bg-green-500 px-4 py-2 rounded">✅ Retirer</button>
                          ) : (
                            <button onClick={() => setShowLitigeModal(true)} className="bg-red-500 px-4 py-2 rounded">🚨 Marquer</button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="p-4 max-h-[500px] overflow-y-auto bg-slate-50">
                      {messages.map(msg => {
                        const sender = participantsInfo[msg.senderId];
                        return (
                          <div key={msg.id} className="mb-4">
                            <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200">
                              <p className="font-semibold text-sm">{sender?.prenom} {sender?.nom}</p>
                              <p className="text-sm">{msg.content}</p>
                              <p className="text-xs text-slate-500">{msg.createdAt?.toDate().toLocaleString('fr-FR')}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center text-slate-500">Sélectionnez une conversation</div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="bg-white rounded-lg p-4 mb-6">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="🔍 Rechercher litiges..."
                className="w-full px-4 py-2 border border-slate-200 rounded-lg"
              />
            </div>

            <div className="bg-white rounded-lg shadow-md">
              <div className="p-4 bg-navy-800 text-white">
                Litiges Formels ({filteredLitiges.length})
              </div>
              <div>
                {filteredLitiges.map(litige => (
                  <Link key={litige.id} href={`/admin/litiges/${litige.id}`} className="block p-4 border-b hover:bg-slate-50">
                    <div className="flex justify-between">
                      <div>
                        <h3 className="font-semibold text-navy-800">{litige.motif}</h3>
                        <p className="text-sm text-slate-500">{LITIGE_TYPE_LABELS[litige.type]}</p>
                        <p className="text-sm text-slate-500 line-clamp-2">{litige.description}</p>
                      </div>
                      <div className="text-right">
                        <span className={`px-2 py-1 rounded text-xs ${getStatutColor(litige.statut)}`}>
                          {LITIGE_STATUT_LABELS[litige.statut]}
                        </span>
                        <p className="text-sm text-brand-700 mt-2">Voir détails →</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {showLitigeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-navy-800 mb-4">🚨 Marquer comme litige</h3>
            <textarea
              value={litigeDescription}
              onChange={(e) => setLitigeDescription(e.target.value)}
              placeholder="Motif..."
              className="w-full px-4 py-2 border rounded-lg mb-4"
              rows={4}
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowLitigeModal(false); setLitigeDescription(''); }}
                className="flex-1 px-4 py-2 border rounded-lg"
              >
                Annuler
              </button>
              <button
                onClick={handleMarkLitige}
                disabled={markingLitige || !litigeDescription.trim()}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg disabled:opacity-50"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
