'use client';

/**
 * Page de messagerie avec système anti-bypass intégré
 * Permet la communication sécurisée entre artisans et clients
 */

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  Timestamp,
  or,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { validateMessage, validateMessageWithHistory } from '@/lib/antiBypassValidator';

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: Timestamp;
  read: boolean;
  deleted?: boolean; // Soft delete par admin uniquement
  deletedAt?: Timestamp;
  deletedBy?: string;
  // ✅ NOUVEAUX CHAMPS - Messages refusés (style BlaBlaCar)
  rejected?: boolean;           // true si message refusé par validation
  rejectionReason?: string;     // Raison du refus (ex: "Numéro de téléphone détecté")
  rejectionPatterns?: string[]; // Patterns détectés (ex: ["telephone_fragmente", "9_chiffres"])
  visibleTo?: string[];         // Si rejected=true, visible uniquement par senderId
}

interface Conversation {
  id: string;
  participants: string[];
  participantNames: Record<string, string>;
  lastMessage: string;
  lastMessageDate: Timestamp;
  unreadCount?: number;
  devisId?: string; // Lien vers le devis associé (si conversation créée depuis un devis)
  demandeId?: string; // Lien vers la demande associée
}

interface UserInfo {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE D'ERREUR STANDARDISÉ (fallback si validation.message vide)
// ─────────────────────────────────────────────────────────────────────────────
const BLOCKED_MSG =
  "⚠️ Le partage de coordonnées personnelles est interdit avant l'acceptation du devis.";

// Composant pour afficher une conversation dans la liste
function ConversationItem({ 
  conversation, 
  otherUserId, 
  defaultName, 
  isSelected, 
  isInactive,
  onClick 
}: { 
  conversation: Conversation; 
  otherUserId: string; 
  defaultName: string; 
  isSelected: boolean;
  isInactive?: boolean;
  onClick: () => void;
}) {
  const [fullName, setFullName] = useState(defaultName);

  useEffect(() => {
    if (!otherUserId) return;

    const loadFullName = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', otherUserId));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const prenom = data.prenom || '';
          const nom = data.nom || '';
          const name = `${prenom} ${nom}`.trim() || data.email || 'Utilisateur';
          setFullName(name);
        }
      } catch (error) {
        console.error('Erreur chargement nom:', error);
      }
    };

    loadFullName();
  }, [otherUserId]);

  return (
    <button
      onClick={isInactive ? undefined : onClick}
      disabled={isInactive}
      title={isInactive ? 'Cette conversation est fermée (demande refusée ou annulée)' : undefined}
      className={`w-full p-4 border-b transition text-left ${
        isInactive
          ? 'opacity-40 bg-slate-100 cursor-not-allowed'
          : 'hover:bg-slate-50 cursor-pointer'
      } ${
        isSelected && !isInactive ? 'bg-blue-50 border-l-4 border-brand-500' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`font-semibold ${isInactive ? 'text-slate-400' : 'text-navy-800'}`}>{fullName}</span>
        {isInactive ? (
          <span className="text-xs text-slate-400">🚫 Fermée</span>
        ) : (conversation.unreadCount && conversation.unreadCount > 0 && (
          <span className="bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
            {conversation.unreadCount}
          </span>
        ))}
      </div>
      <p className="text-sm text-slate-600 truncate">{conversation.lastMessage || 'Aucun message'}</p>
      <p className="text-xs text-slate-400 mt-1">
        {conversation.lastMessageDate?.toDate().toLocaleDateString('fr-FR')}
      </p>
    </button>
  );
}

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetUserId = searchParams?.get('userId');
  const devisIdParam = searchParams?.get('devisId'); // Paramètre optionnel depuis les pages devis
  const demandeIdParam = searchParams?.get('demandeId'); // Paramètre optionnel depuis les pages demandes
  const { user, loading: authLoading } = useAuth();
  const { t, language } = useLanguage();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [otherUserInfo, setOtherUserInfo] = useState<UserInfo | null>(null);
  const [messageContent, setMessageContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  
  // États pour gérer le statut du devis associé
  const [devisStatus, setDevisStatus] = useState<string | null>(null);
  const [devisInfo, setDevisInfo] = useState<{ numeroDevis?: string; montantTTC?: number; typeRefus?: 'definitif' | 'revision' } | null>(null);
  const [isConversationInactive, setIsConversationInactive] = useState(false);
  // Map conversationId → inactive (pour griser la liste)
  const [inactiveConvIds, setInactiveConvIds] = useState<Set<string>>(new Set());
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Charger les conversations de l'utilisateur
  useEffect(() => {
    if (authLoading || !user) return;

    const q = query(
      collection(db, 'conversations'),
      or(
        where('participants', 'array-contains', user.uid)
      )
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const convs: Conversation[] = [];
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        convs.push({
          id: docSnap.id,
          participants: data.participants || [],
          participantNames: data.participantNames || {},
          lastMessage: data.lastMessage || '',
          lastMessageDate: data.lastMessageDate || Timestamp.now(),
          unreadCount: data.unreadCount?.[user.uid] || 0,
          devisId: data.devisId || undefined,
          demandeId: data.demandeId || undefined,
        });
      }

      // Trier par date de dernier message
      convs.sort((a, b) => {
        const dateA = a.lastMessageDate?.toMillis() || 0;
        const dateB = b.lastMessageDate?.toMillis() || 0;
        return dateB - dateA;
      });

      setConversations(convs);

      // Vérifier de façon asynchrone les conversations inactives (demande annulée)
      const newInactive = new Set<string>();
      await Promise.all(convs.map(async (conv) => {
        try {
          const otherParticipant = conv.participants.find(p => p !== user.uid);

          if (conv.demandeId) {
            const demandeSnap = await getDoc(doc(db, 'demandes', conv.demandeId));
            if (demandeSnap.exists()) {
              const data = demandeSnap.data();
              const st = data.statut;
              // Fermée si : annulée, expirée, terminée
              // OU si l'artisan a été explicitement refusé par le client (artisanRefuseId)
              const otherIp = conv.participants.find(p => p !== user.uid);
              const isRefused = data.artisanRefuseId && (
                data.artisanRefuseId === user.uid || data.artisanRefuseId === otherIp
              );
              if (
                st === 'annulee' || st === 'annule' ||
                st === 'expiree' || st === 'expire' ||
                st === 'terminee' ||
                isRefused
              ) {
                newInactive.add(conv.id);
              }
            }
          } else if (!conv.devisId && otherParticipant) {
            // Fallback pour conversations SANS demandeId (créées avant le fix)
            // ⚠️ Un seul where() par requête pour éviter les index composites
            const [qAsClient, qAsOther] = await Promise.all([
              getDocs(query(
                collection(db, 'demandes'),
                where('clientId', '==', user.uid)
              )),
              getDocs(query(
                collection(db, 'demandes'),
                where('clientId', '==', otherParticipant)
              )),
            ]);
            const allDocs = [...qAsClient.docs, ...qAsOther.docs];
            const STATUTS_FERMES = ['annulee', 'annule', 'expire'];
            const hasAnnulee = allDocs.some(d => {
              const data = d.data();
              if (!STATUTS_FERMES.includes(data.statut)) return false;
              const matches: string[] = data.artisansMatches || [];
              // Demande directe refusée : artisanRefuseId OU artisanId
              return (
                matches.includes(user.uid) || matches.includes(otherParticipant) ||
                data.artisanRefuseId === user.uid || data.artisanRefuseId === otherParticipant ||
                data.artisanId === user.uid || data.artisanId === otherParticipant
              );
            });
            if (hasAnnulee) newInactive.add(conv.id);
          }

          if (conv.devisId) {
            const devisSnap = await getDoc(doc(db, 'devis', conv.devisId));
            if (devisSnap.exists()) {
              const st = devisSnap.data().statut;
              const typeRefus = devisSnap.data().typeRefus;
              if (
                (st === 'refuse' && typeRefus === 'definitif') ||
                st === 'annule' || st === 'expire' ||
                st === 'termine_valide' || st === 'termine_auto_valide'
              ) {
                newInactive.add(conv.id);
              }
            }
          }
        } catch { /* silencieux */ }
      }));
      setInactiveConvIds(newInactive);
      setLoading(false);
    },
    (error) => {
      // Ignorer les erreurs de permission lors de la déconnexion
      if (error.code === 'permission-denied') {
        setConversations([]);
        setLoading(false);
        return;
      }
      console.error('Erreur écoute conversations (messages page):', error);
    }
    );

    return () => unsubscribe();
  }, [user, authLoading]);

  // Si userId fourni dans l'URL, créer/ouvrir conversation
  useEffect(() => {
    if (!user || !targetUserId || loading) return;

    // Priorité : trouver la conversation liée au contexte exact (demandeId ou devisId)
    // → Evite de réutiliser une ancienne conversation close pour une nouvelle demande
    let existingConv: Conversation | undefined;

    if (demandeIdParam) {
      // Chercher la conversation spécifique à cette demande
      existingConv = conversations.find(c =>
        c.participants.includes(targetUserId) && c.demandeId === demandeIdParam
      );
    } else if (devisIdParam) {
      // Chercher la conversation spécifique à ce devis
      existingConv = conversations.find(c =>
        c.participants.includes(targetUserId) && c.devisId === devisIdParam
      );
    } else {
      // Pas de contexte → ouvrir la conversation la plus récente avec cet utilisateur
      existingConv = conversations.find(c => c.participants.includes(targetUserId));
    }

    if (existingConv) {
      setSelectedConversation(existingConv.id);
    } else {
      // Créer nouvelle conversation si elle n'existe pas encore
      if (!loading) {
        createConversation(targetUserId);
      }
    }
  }, [targetUserId, user, conversations, loading]);

  // Charger les messages de la conversation sélectionnée
  useEffect(() => {
    if (!selectedConversation) {
      setMessages([]);
      return;
    }

    // Requête simple sans orderBy pour éviter l'index composite
    const q = query(
      collection(db, 'messages'),
      where('conversationId', '==', selectedConversation)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Message));

      console.log(`📨 Messages chargés pour conversation ${selectedConversation}:`, msgs.length);
      msgs.forEach(msg => {
        console.log(`  - Message ${msg.id}:`, {
          senderId: msg.senderId,
          content: msg.content.substring(0, 30),
          createdAt: msg.createdAt?.toDate?.()
        });
      });

      // ✅ Filtrer les messages supprimés (par admin uniquement)
      const activeMessages = msgs.filter(msg => !msg.deleted);

      // Tri côté client par date de création
      activeMessages.sort((a, b) => {
        const dateA = a.createdAt?.toMillis() || 0;
        const dateB = b.createdAt?.toMillis() || 0;
        return dateA - dateB; // Ordre croissant (ancien → récent)
      });

      setMessages(activeMessages);
      
      // Marquer comme lu
      markAsRead(selectedConversation);
    },
    (error) => {
      // Ignorer les erreurs de permission lors de la déconnexion
      if (error.code === 'permission-denied') {
        setMessages([]);
        return;
      }
      console.error('Erreur écoute messages:', error);
    }
    );

    return () => unsubscribe();
  }, [selectedConversation]);

  // Charger les infos de l'autre utilisateur
  useEffect(() => {
    if (!selectedConversation || !user) return;

    const conv = conversations.find(c => c.id === selectedConversation);
    if (!conv) return;

    const otherUserId = conv.participants.find(p => p !== user.uid);
    if (!otherUserId) return;

    loadUserInfo(otherUserId);
  }, [selectedConversation, user, conversations]);

  // Charger le devis associé pour vérifier son statut
  useEffect(() => {
    if (!selectedConversation || !conversations.length) return;

    const loadDevisStatus = async () => {
      const conv = conversations.find(c => c.id === selectedConversation);
      if (!conv || !conv.devisId) {
        // Pas de devisId → vérifier le demandeId
        if (conv?.demandeId) {
          try {
            const demandeDoc = await getDoc(doc(db, 'demandes', conv.demandeId));
            if (demandeDoc.exists()) {
              const data = demandeDoc.data();
              const st = data.statut;
              const otherIp = conv.participants.find(p => p !== user?.uid);
              const isRefused = data.artisanRefuseId && (
                data.artisanRefuseId === user?.uid || data.artisanRefuseId === otherIp
              );

              // IMPORTANT: certaines conversations sont liées à une demande mais sans devisId.
              // On cherche alors un devis entre ces 2 participants pour activer le bypass post-paiement.
              const devisByDemandeSnap = await getDocs(query(
                collection(db, 'devis'),
                where('demandeId', '==', conv.demandeId)
              ));
              const participantIds = new Set(conv.participants);
              const devisConversation = devisByDemandeSnap.docs
                .map((d) => ({ id: d.id, ...d.data() } as any))
                .filter((d) => participantIds.has(d.clientId) && participantIds.has(d.artisanId))
                .sort((a, b) => {
                  const dateA = a.dateCreation?.toMillis?.() || 0;
                  const dateB = b.dateCreation?.toMillis?.() || 0;
                  return dateB - dateA;
                });

              const statutsPostPaiement = ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'];
              const devisPostPaiement = devisConversation.find((d) => statutsPostPaiement.includes(d.statut));

              if (devisPostPaiement) {
                const devisStatut = devisPostPaiement.statut;
                const devisTypeRefus = devisPostPaiement.typeRefus;
                let isInactive = false;

                if (devisStatut === 'refuse') {
                  isInactive = devisTypeRefus === 'definitif';
                } else if (devisStatut === 'annule' || devisStatut === 'expire') {
                  isInactive = true;
                } else if (devisStatut === 'termine_valide' || devisStatut === 'termine_auto_valide') {
                  isInactive = true;
                }

                setDevisStatus(devisStatut);
                setDevisInfo({
                  numeroDevis: devisPostPaiement.numeroDevis,
                  montantTTC: devisPostPaiement.totaux?.montantTTC || devisPostPaiement.montantTTC,
                  typeRefus: devisTypeRefus,
                });
                setIsConversationInactive(isInactive);
                return;
              }

              const isInactive = (
                st === 'annulee' || st === 'annule' ||
                st === 'expiree' || st === 'expire' ||
                st === 'terminee' ||
                !!isRefused
              );
              setDevisStatus(st);
              setDevisInfo(null);
              setIsConversationInactive(isInactive);
              return;
            }
          } catch { /* silencieux */ }
        }
        // Pas de devis ni demande → utiliser le résultat du fallback inactiveConvIds
        setDevisStatus(null);
        setDevisInfo(null);
        setIsConversationInactive(inactiveConvIds.has(selectedConversation));
        return;
      }

      try {
        // Charger le devis
        const devisDoc = await getDoc(doc(db, 'devis', conv.devisId));
        
        if (!devisDoc.exists()) {
          console.warn('Devis introuvable:', conv.devisId);
          setDevisStatus(null);
          setDevisInfo(null);
          setIsConversationInactive(false);
          return;
        }

        const devisData = devisDoc.data();
        const statut = devisData.statut;
        const typeRefus = devisData.typeRefus;
        
        setDevisStatus(statut);
        setDevisInfo({
          numeroDevis: devisData.numeroDevis,
          montantTTC: devisData.totaux?.montantTTC || devisData.montantTTC,
          typeRefus: typeRefus,
        });

        // Vérifier si le devis est dans un état terminal (conversation inactive)
        // ⚠️ IMPORTANT : Refus définitif = conversation close, Refus révision = conversation active
        let isInactive = false;
        
        if (statut === 'refuse') {
          // Refus définitif → conversation close
          // Refus révision → conversation reste active (artisan peut proposer variante)
          isInactive = typeRefus === 'definitif';
        } else if (statut === 'annule' || statut === 'expire') {
          // Annulation ou expiration → toujours inactive
          isInactive = true;
        } else if (statut === 'termine_valide' || statut === 'termine_auto_valide') {
          // Travaux terminés ET validés par les deux parties → conversation close
          // Plus besoin de communication, prestation complète et acceptée
          isInactive = true;
        }
        
        setIsConversationInactive(isInactive);

        if (isInactive) {
          console.log(`🚫 Conversation ${selectedConversation} inactive (devis ${statut}${statut === 'refuse' ? `, typeRefus: ${typeRefus}` : ''})`);
        } else if (statut === 'refuse' && typeRefus === 'revision') {
          console.log(`✅ Conversation ${selectedConversation} active (refus révision - artisan peut proposer variante)`);
        }
      } catch (error) {
        console.error('Erreur chargement statut devis:', error);
        setDevisStatus(null);
        setDevisInfo(null);
        setIsConversationInactive(false);
      }
    };

    loadDevisStatus();
  }, [selectedConversation, conversations, inactiveConvIds]);

  // Auto-scroll vers le bas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Redirection si non connecté
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/connexion');
    }
  }, [user, authLoading, router]);

  // Créer une nouvelle conversation
  const createConversation = async (otherUserId: string) => {
    if (!user) return;

    try {
      // Charger infos des deux utilisateurs
      const [currentUserDoc, otherUserDoc] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        getDoc(doc(db, 'users', otherUserId)),
      ]);

      const currentUserData = currentUserDoc.data();
      const otherUserData = otherUserDoc.data();

      const currentUserName = `${currentUserData?.prenom || ''} ${currentUserData?.nom || ''}`.trim() || currentUserData?.email || 'Utilisateur';
      const otherUserName = `${otherUserData?.prenom || ''} ${otherUserData?.nom || ''}`.trim() || otherUserData?.email || 'Utilisateur';

      // Préparer les données de la conversation
      const conversationData: any = {
        participants: [user.uid, otherUserId],
        participantNames: {
          [user.uid]: currentUserName,
          [otherUserId]: otherUserName,
        },
        lastMessage: '',
        lastMessageDate: serverTimestamp(),
        createdAt: serverTimestamp(),
      };

      // Ajouter devisId et demandeId si présents (provenant des paramètres URL)
      if (devisIdParam) {
        conversationData.devisId = devisIdParam;
        console.log('📎 Conversation liée au devis:', devisIdParam);
      }
      if (demandeIdParam) {
        conversationData.demandeId = demandeIdParam;
        console.log('📎 Conversation liée à la demande:', demandeIdParam);
      }

      const conversationRef = await addDoc(collection(db, 'conversations'), conversationData);

      setSelectedConversation(conversationRef.id);
    } catch (error) {
      console.error('Erreur création conversation:', error);
    }
  };

  // Charger les infos d'un utilisateur
  const loadUserInfo = async (userId: string) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const data = userDoc.data();
        const prenom = data.prenom || '';
        const nom = data.nom || '';
        const fullName = `${prenom} ${nom}`.trim() || data.email || 'Utilisateur';
        
        setOtherUserInfo({
          uid: userId,
          displayName: fullName,
          email: data.email,
          photoURL: data.photoURL,
        });
      }
    } catch (error) {
      console.error('Erreur chargement utilisateur:', error);
    }
  };

  // Marquer les messages comme lus
  const markAsRead = async (conversationId: string) => {
    if (!user) return;

    try {
      const convRef = doc(db, 'conversations', conversationId);
      await updateDoc(convRef, {
        [`unreadCount.${user.uid}`]: 0,
      });
    } catch (error) {
      console.error('Erreur marquer comme lu:', error);
    }
  };

  // Valider le message en temps réel
  const handleMessageChange = (value: string) => {
    setMessageContent(value);
    
    // Validation instantanée (affichage warning en temps réel)
    // La validation complète multi-couches se fera à l'envoi
    // 🎉 DEVIS PAYÉ : Bypass validation (permet échange téléphone/email/adresse)
    // Statuts post-paiement où l'échange de coordonnées est autorisé
    const statutsPostPaiement = ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'];
    const isPaid = devisStatus ? statutsPostPaiement.includes(devisStatus) : false;
    // Validation temps réel avec historique
    // Fenêtre identique à l'envoi (10 messages) pour cohérence
    const recentSenderMessages = messages
      .filter(m => m.senderId === user?.uid)
      .slice(-10)
      .map(m => m.content || '');
    const validation = validateMessageWithHistory(value, recentSenderMessages, isPaid);
    if (!validation.isValid) {
      setValidationWarning(validation.message || '');
    } else {
      setValidationWarning(null);
    }
  };

  // Envoyer un message avec validation multi-couches
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !selectedConversation || !messageContent.trim()) return;

    // ========================================
    // VÉRIFICATION : Conversation inactive ?
    // ========================================
    if (isConversationInactive) {
      alert(t('alerts.message.conversationClosed'));
      return;
    }

    setSending(true);

    try {
      // ========================================
      // VALIDATION MULTI-COUCHES
      // ========================================
      // 🎉 DEVIS PAYÉ : Bypass validation (permet échange téléphone/email/adresse)
      // Statuts post-paiement où l'échange de coordonnées est autorisé
      const statutsPostPaiement = ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'];
      const isPaid = devisStatus ? statutsPostPaiement.includes(devisStatus) : false;
      // Récupérer les derniers messages envoyés par cet utilisateur dans cette conversation
      // Fenêtre élargie à 10 messages : couvre les fragmentations sur de nombreux messages courts
      const recentSenderMessages = messages
        .filter(m => m.senderId === user.uid)
        .slice(-10)
        .map(m => m.content || '');

      const validation = validateMessageWithHistory(messageContent.trim(), recentSenderMessages, isPaid);

      const conv = conversations.find(c => c.id === selectedConversation);
      if (!conv) return;

      const receiverId = conv.participants.find(p => p !== user.uid);
      if (!receiverId) return;

      // ========================================
      // NOUVEAUTÉ : Préparer les données du message
      // ========================================
      const messageData: any = {
        conversationId: selectedConversation,
        senderId: user.uid,
        receiverId,
        content: messageContent.trim(),
        createdAt: serverTimestamp(),
        read: false,
      };

      // ========================================
      // SI MESSAGE REFUSÉ : Style BlaBlaCar
      // ========================================
      if (!validation.isValid) {
        // ✅ Enregistrer le message refusé dans Firestore
        messageData.rejected = true;
        messageData.rejectionReason = validation.message || BLOCKED_MSG;
        messageData.rejectionPatterns = validation.blockedPatterns || [];
        messageData.visibleTo = [user.uid]; // Visible uniquement par expéditeur
        
        await addDoc(collection(db, 'messages'), messageData);
        
        // ✅ NE PAS mettre à jour lastMessage (message invisible pour destinataire)
        // Le message refusé apparaîtra uniquement dans l'historique de l'expéditeur
        
        setMessageContent('');
        setValidationWarning(null);
        setSending(false);
        return;
      }

      // ========================================
      // MESSAGE VALIDE : Enregistrement normal
      // ========================================
      await addDoc(collection(db, 'messages'), messageData);

      // Mettre à jour la conversation
      await updateDoc(doc(db, 'conversations', selectedConversation), {
        lastMessage: messageContent.trim().substring(0, 100),
        lastMessageDate: serverTimestamp(),
        [`unreadCount.${receiverId}`]: (conv.unreadCount || 0) + 1,
      });

      setMessageContent('');
      setValidationWarning(null);
    } catch (error) {
      console.error('Erreur envoi message:', error);
      alert(t('alerts.message.sendError'));
    } finally {
      setSending(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto"></div>
          <p className="mt-4 text-slate-600">{t('messaging.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Redirection gérée par useEffect
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-navy-800 text-white py-8">
        <div className="max-w-7xl mx-auto px-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-white hover:text-brand-300 mb-4 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('messaging.backToDashboard')}
          </button>
          <h1 className="text-3xl font-bold">{t('messaging.pageTitle')}</h1>
          <p className="text-slate-300 mt-2">{t('messaging.pageSubtitle')}</p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-8">

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 h-[calc(100dvh-15rem)] min-h-[480px]">
          {/* Liste des conversations */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-navy-800 text-white p-4">
              <h2 className="font-semibold">{t('messaging.conversations')}</h2>
            </div>
            
            <div className="overflow-y-auto h-full">
              {loading ? (
                <div className="p-4 text-center text-slate-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500 mx-auto mb-2"></div>
                  {t('messaging.loading')}
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-6 text-center text-slate-500">
                  <svg className="w-16 h-16 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p>{t('messaging.noConversations')}</p>
                </div>
              ) : (
                conversations.map((conv) => {
                  const otherUserId = conv.participants.find(p => p !== user.uid);
                  // Essayer d'abord participantNames, sinon chercher dans les données utilisateur
                  let otherUserName = otherUserId ? conv.participantNames[otherUserId] : 'Utilisateur';
                  
                  return (
                    <ConversationItem
                      key={conv.id}
                      conversation={conv}
                      otherUserId={otherUserId || ''}
                      defaultName={otherUserName}
                      isSelected={selectedConversation === conv.id}
                      isInactive={inactiveConvIds.has(conv.id)}
                      onClick={() => !inactiveConvIds.has(conv.id) && setSelectedConversation(conv.id)}
                    />
                  );
                })
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-md flex flex-col overflow-hidden">
            {selectedConversation && otherUserInfo ? (
              <>
                {/* Header */}
                <div className="bg-navy-800 text-white p-4 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold">{otherUserInfo.displayName}</h2>
                  </div>
                  <button
                    onClick={() => setSelectedConversation(null)}
                    className="lg:hidden text-white hover:text-slate-300"
                  >
                    ✕
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {/* Bandeau conversation inactive */}
                  {isConversationInactive && (
                    <div className="mb-4 p-4 bg-slate-100 border-l-4 border-slate-500 rounded">
                      <div className="flex items-start">
                        <span className="text-2xl mr-3">🚫</span>
                        <div>
                          <h3 className="font-semibold text-slate-700 mb-1">
                            {t('messaging.conversationInactive.title')}
                          </h3>
                          <p className="text-sm text-slate-600">
                            {devisStatus === 'annule' && t('messaging.conversationInactive.cancelled')}
                            {devisStatus === 'refuse' && t('messaging.conversationInactive.refusedDefinitive')}
                            {devisStatus === 'expire' && t('messaging.conversationInactive.expired')}
                            {(devisStatus === 'termine_valide' || devisStatus === 'termine_auto_valide') && t('messaging.conversationInactive.completed')}
                          </p>
                          {devisInfo?.numeroDevis && (
                            <p className="text-xs text-slate-500 mt-1">
                              Devis #{devisInfo.numeroDevis}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {messages.map((msg) => {
                    const isOwn = msg.senderId === user.uid;
                    const isRejected = msg.rejected || false;
                    
                    // ✅ Si message refusé et pas l'expéditeur → ne pas afficher
                    if (isRejected && !isOwn) {
                      return null;
                    }
                    
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${
                          isConversationInactive ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="max-w-[70%]">
                          {/* Bulle du message */}
                          <div
                            className={`rounded-lg px-4 py-2 ${
                              isRejected 
                                ? 'bg-navy-900 text-white border-2 border-red-500' // ✅ Style BlaBlaCar : Bleu foncé + bordure rouge
                                : isOwn
                                ? 'bg-brand-700 text-white'
                                : 'bg-slate-200 text-navy-800'
                            }`}
                          >
                            <p className="break-words">{msg.content}</p>
                            <p className={`text-xs mt-1 flex items-center gap-1 ${
                              isRejected ? 'text-red-200' :
                              isOwn ? 'text-orange-100' : 'text-slate-500'
                            }`}>
                              {msg.createdAt?.toDate().toLocaleTimeString(language === 'en' ? 'en-US' : 'fr-FR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              {isRejected && <span className="text-red-300">⛔</span>}
                            </p>
                          </div>
                          
                          {/* ✅ Message d'erreur en dessous (style BlaBlaCar) */}
                          {isRejected && (
                            <p className="text-red-600 text-sm font-semibold mt-1 px-2">
                              {t('messaging.messageRejected')}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Avertissement anti-bypass */}
                {validationWarning && (
                  <div className="px-4 py-2 bg-red-50 border-t-2 border-red-500">
                    <p className="text-sm text-red-700 whitespace-pre-line">{validationWarning}</p>
                  </div>
                )}

                {/* Formulaire */}
                <form 
                  onSubmit={handleSendMessage} 
                  className={`p-4 border-t ${
                    isConversationInactive ? 'bg-slate-200' : 'bg-slate-50'
                  }`}
                >
                  {isConversationInactive && (
                    <div className="mb-2 text-center">
                      <p className="text-sm text-slate-500 italic">
                        ❌ {t('messaging.conversationInactive.sendDisabled')}
                      </p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={messageContent}
                      onChange={(e) => handleMessageChange(e.target.value)}
                      placeholder={
                        isConversationInactive 
                          ? t('messaging.conversationClosed')
                          : t('messaging.typePlaceholder')
                      }
                      className={`flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent ${
                        isConversationInactive 
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-300' 
                          : 'bg-white border-slate-300'
                      }`}
                      disabled={sending || isConversationInactive}
                    />
                    <button
                      type="submit"
                      disabled={sending || !messageContent.trim() || isConversationInactive}
                      className="bg-brand-700 text-white px-6 py-2 rounded-lg font-semibold hover:bg-brand-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sending ? '⏳' : '📤'} {sending ? t('messaging.sending') : t('messaging.send')}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500">
                <div className="text-center">
                  <svg className="w-20 h-20 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-lg font-medium">{t('messaging.noConversation')}</p>
                  <p className="text-sm text-slate-400 mt-2">{t('messaging.noConversationDesc')}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
