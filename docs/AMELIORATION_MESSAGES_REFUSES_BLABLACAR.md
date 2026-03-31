# 🚨 Amélioration Messagerie : Affichage Messages Refusés (Inspiration BlaBlaCar)

**Date** : 31 mars 2026  
**Référence** : Capture BlaBlaCar - Messages refusés par la modération

---

## 📸 Analyse Image BlaBlaCar

### Ce qu'on observe :

1. **Messages refusés affichés** : 
   - `0662738827` → ❌ "Message refusé par la modération"
   - `06` → ❌ "Message refusé par la modération"
   - `0` → ❌ "Message refusé par la modération"
   - `06 mars` → ❌ "Message refusé par la modération" (false positive ? contient "06")

2. **Messages autorisés** :
   - `Mars` → ✅ Passe (aucun pattern détecté)

3. **UI/UX** :
   - Texte du message visible dans une bulle bleue foncée
   - Texte rouge en dessous : "Message refusé par la modération"
   - Icône ⛔ à côté de l'heure
   - Message **visible uniquement par l'expéditeur**
   - Historique complet des tentatives

---

## ⚙️ Système Actuel ArtisanSafe

### Fonctionnement actuel :

```typescript
// frontend/src/app/messages/page.tsx (ligne 581-640)
const handleSendMessage = async (e: React.FormEvent) => {
  // ...
  
  // Validation avec antiBypassValidator
  const validation = validateMessageWithHistory(messageContent.trim(), recentSenderMessages, isPaid);

  if (!validation.isValid) {
    alert(validation.message); // ❌ Simple alert()
    setSending(false);
    return; // ❌ Message PAS enregistré
  }

  // Envoi normal du message
  await addDoc(collection(db, 'messages'), {
    conversationId: selectedConversation,
    senderId: user.uid,
    receiverId,
    content: messageContent.trim(),
    createdAt: serverTimestamp(),
    read: false,
  });
}
```

### Limites actuelles :

❌ **Pas d'historique** : Les messages refusés disparaissent (pas dans Firestore)  
❌ **Alert() intrusive** : Interrompt l'expérience utilisateur  
❌ **Pas de visibilité** : Impossible de voir ses propres tentatives refusées  
❌ **Pas d'analyse** : Admin ne peut pas voir les tentatives de contournement  

---

## ✅ Proposition d'Amélioration (Style BlaBlaCar)

### 1️⃣ Modifications Firestore

**Collection `messages` - Ajouter champs** :

```typescript
interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: Timestamp;
  read: boolean;
  
  // ✅ NOUVEAUX CHAMPS
  rejected?: boolean;           // true si message refusé par validation
  rejectionReason?: string;     // Raison du refus (ex: "Numéro de téléphone détecté")
  rejectionPatterns?: string[]; // Patterns détectés (ex: ["telephone_fragmente", "9_chiffres"])
  visibleTo?: string[];         // Si rejected=true, visible uniquement par senderId
}
```

**Exemple document refusé** :

```json
{
  "id": "msg123",
  "conversationId": "conv456",
  "senderId": "user789",
  "receiverId": "user012",
  "content": "0662738827",
  "createdAt": "2026-03-31T19:50:00Z",
  "read": false,
  "rejected": true,
  "rejectionReason": "Numéro de téléphone détecté",
  "rejectionPatterns": ["telephone_standard"],
  "visibleTo": ["user789"]
}
```

---

### 2️⃣ Modifications Code Frontend

#### A) Fonction `handleSendMessage` modifiée :

```typescript
const handleSendMessage = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!user || !selectedConversation || !messageContent.trim()) return;

  if (isConversationInactive) {
    alert(t('alerts.message.conversationClosed'));
    return;
  }

  setSending(true);

  try {
    const statutsPostPaiement = ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'];
    const isPaid = devisStatus ? statutsPostPaiement.includes(devisStatus) : false;
    
    const recentSenderMessages = messages
      .filter(m => m.senderId === user.uid)
      .slice(-10)
      .map(m => m.content || '');

    const validation = validateMessageWithHistory(messageContent.trim(), recentSenderMessages, isPaid);

    const conv = conversations.find(c => c.id === selectedConversation);
    if (!conv) return;

    const receiverId = conv.participants.find(p => p !== user.uid);
    if (!receiverId) return;

    // ✅ NOUVEAUTÉ : Enregistrer MÊME si refusé
    const messageData: any = {
      conversationId: selectedConversation,
      senderId: user.uid,
      receiverId,
      content: messageContent.trim(),
      createdAt: serverTimestamp(),
      read: false,
    };

    if (!validation.isValid) {
      // ✅ Message refusé : ajouter les flags
      messageData.rejected = true;
      messageData.rejectionReason = validation.message;
      messageData.rejectionPatterns = validation.detectedPatterns || [];
      messageData.visibleTo = [user.uid]; // Visible uniquement par expéditeur
      
      // Enregistrer le message refusé
      await addDoc(collection(db, 'messages'), messageData);
      
      // ✅ NE PAS mettre à jour lastMessage (message refusé invisible pour destinataire)
      
      setMessageContent('');
      setSending(false);
      return;
    }

    // Message valide : enregistrement normal
    await addDoc(collection(db, 'messages'), messageData);

    // Mettre à jour la conversation
    await updateDoc(doc(db, 'conversations', selectedConversation), {
      lastMessage: messageContent.trim().substring(0, 100),
      lastMessageDate: serverTimestamp(),
      [`unreadCount.${receiverId}`]: (conv.unreadCount || 0) + 1,
    });

    setMessageContent('');
  } catch (error) {
    console.error('Erreur envoi message:', error);
    alert(t('alerts.message.sendError'));
  } finally {
    setSending(false);
  }
};
```

---

#### B) Affichage des messages modifié :

```typescript
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
              ? 'bg-red-900 text-white border-2 border-red-500' // ✅ Style spécial messages refusés
              : isOwn
              ? 'bg-[#FF6B00] text-white'
              : 'bg-gray-200 text-[#2C3E50]'
          }`}
        >
          <p className="break-words">{msg.content}</p>
          <p className={`text-xs mt-1 flex items-center gap-1 ${
            isRejected ? 'text-red-200' :
            isOwn ? 'text-orange-100' : 'text-gray-500'
          }`}>
            {msg.createdAt?.toDate().toLocaleTimeString(language === 'en' ? 'en-US' : 'fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {isRejected && <span>⛔</span>}
          </p>
        </div>
        
        {/* ✅ Message d'erreur en dessous (style BlaBlaCar) */}
        {isRejected && (
          <p className="text-red-600 text-sm font-semibold mt-1 px-2">
            ⚠️ Message refusé par la modération
          </p>
        )}
      </div>
    </div>
  );
})}
```

---

### 3️⃣ Modifications `antiBypassValidator.ts`

**Ajouter détails patterns détectés** :

```typescript
export interface ValidationResult {
  isValid: boolean;
  message: string;
  detectedPatterns?: string[]; // ✅ NOUVEAU : Liste des patterns détectés
}

export function validateMessage(text: string, isPaid: boolean = false): ValidationResult {
  if (isPaid) {
    return { isValid: true, message: '', detectedPatterns: [] };
  }

  const detectedPatterns: string[] = [];
  
  // Exemple téléphone standard
  if (/\b0[1-9](?:[\s\.\-]?\d{2}){4}\b/gi.test(text)) {
    detectedPatterns.push('telephone_standard');
  }
  
  // 9+ chiffres consécutifs
  if (/\d{9,}/g.test(text)) {
    detectedPatterns.push('9_chiffres');
  }
  
  // ... autres patterns
  
  if (detectedPatterns.length > 0) {
    return {
      isValid: false,
      message: '🚫 Coordonnées interdites...',
      detectedPatterns: detectedPatterns
    };
  }
  
  return { isValid: true, message: '', detectedPatterns: [] };
}
```

---

### 4️⃣ Interface Admin - Analyse Messages Refusés

**Nouvelle page `/admin/messages-refuses`** :

Permet de voir :
- 📊 **Statistiques** : Nombre tentatives par jour
- 👤 **Utilisateurs** : Qui tente de contourner le plus
- 🔍 **Patterns** : Quels patterns déclenchent le plus
- 📜 **Historique** : Liste complète des messages refusés

```typescript
// Requête Firestore
const refusedMessagesQuery = query(
  collection(db, 'messages'),
  where('rejected', '==', true),
  orderBy('createdAt', 'desc'),
  limit(100)
);
```

---

## 📊 Avantages de cette approche

### ✅ Expérience Utilisateur :
- ✅ **Historique visible** : L'utilisateur voit ses tentatives refusées
- ✅ **Feedback immédiat** : Pas d'alert(), message affiché directement
- ✅ **Pédagogique** : Comprend pourquoi c'est refusé

### ✅ Sécurité :
- ✅ **Traçabilité** : Toutes les tentatives enregistrées
- ✅ **Analyse** : Admin peut détecter patterns nouveaux
- ✅ **Conformité RGPD** : Historique de modération

### ✅ Technique :
- ✅ **Backward compatible** : Anciens messages non affectés
- ✅ **Firestore simple** : Juste 3 champs ajoutés
- ✅ **Performance** : Query `where('visibleTo', 'array-contains', userId)` rapide

---

## 🎨 Mockup UI (Style BlaBlaCar)

```
┌─────────────────────────────────────────────┐
│  💬 Conversation avec Jean Dupont          │
├─────────────────────────────────────────────┤
│                                             │
│  ┌────────────────────────────┐            │
│  │ Bonjour, pouvez-vous venir │            │
│  │ demain ?                   │            │
│  │ 14:30                      │            │
│  └────────────────────────────┘            │
│                                             │
│            ┌──────────────────────────┐    │
│            │ Oui, pas de problème     │    │
│            │ 14:35                    │    │
│            └──────────────────────────┘    │
│                                             │
│            ┌──────────────────────────┐    │
│            │ 0662738827           ⛔   │    │ ← Bulle rouge foncé
│            │ 19:50                    │    │
│            └──────────────────────────┘    │
│            ⚠️ Message refusé par la         │ ← Texte rouge en dessous
│               modération                    │
│                                             │
│            ┌──────────────────────────┐    │
│            │ 06                   ⛔   │    │ ← Bulle rouge foncé
│            │ 19:50                    │    │
│            └──────────────────────────┘    │
│            ⚠️ Message refusé par la         │
│               modération                    │
│                                             │
│            ┌──────────────────────────┐    │
│            │ Appelez-moi demain       │    │ ← Message autorisé
│            │ 19:51                    │    │
│            └──────────────────────────┘    │
│                                             │
├─────────────────────────────────────────────┤
│  [Votre message...]              [Envoyer] │
└─────────────────────────────────────────────┘
```

---

## 🚀 Plan d'Implémentation

### Phase 1 : Backend (Firestore)
1. ✅ Ajouter champs `rejected`, `rejectionReason`, `rejectionPatterns`, `visibleTo` dans interface `Message`
2. ✅ Modifier `antiBypassValidator.ts` pour retourner `detectedPatterns`
3. ✅ Tester en local avec messages refusés

### Phase 2 : Frontend (Messagerie)
1. ✅ Modifier `handleSendMessage` pour enregistrer messages refusés
2. ✅ Modifier affichage messages (bulle rouge + texte d'erreur)
3. ✅ Filtrer messages refusés pour destinataire
4. ✅ Tester UX complète

### Phase 3 : Admin
1. ✅ Créer page `/admin/messages-refuses`
2. ✅ Dashboard statistiques
3. ✅ Export CSV pour analyse

### Phase 4 : Tests & Déploiement
1. ✅ Tests unitaires validation
2. ✅ Tests E2E parcours complet
3. ✅ Déploiement progressif

---

## 📝 Traductions (locales)

```json
// fr.json
{
  "messaging": {
    "messageRejected": "Message refusé par la modération",
    "messageRejectedIcon": "⛔",
    "rejectionReasonPhone": "Numéro de téléphone détecté",
    "rejectionReasonEmail": "Adresse email détectée",
    "rejectionReasonAddress": "Adresse postale détectée"
  }
}

// en.json
{
  "messaging": {
    "messageRejected": "Message rejected by moderation",
    "messageRejectedIcon": "⛔",
    "rejectionReasonPhone": "Phone number detected",
    "rejectionReasonEmail": "Email address detected",
    "rejectionReasonAddress": "Postal address detected"
  }
}
```

---

## ⚠️ Points d'Attention

### 1. False Positives (comme "06 mars")
- ✅ **Solution** : Améliorer patterns dans `antiBypassValidator.ts`
- ✅ **Exemple** : Détecter contexte date (`\d{2}\s+(janvier|février|mars|...)`)
- ✅ **Whitelist** : Autoriser certains patterns légitimes

### 2. Explosion volume Firestore
- ✅ **Solution** : Nettoyer messages refusés > 30 jours
- ✅ **Cloud Function** : Scheduled delete tous les jours

### 3. Performance queries
- ✅ **Index Firestore** : `rejected ASC, createdAt DESC`
- ✅ **Pagination** : Charger seulement 50 messages à la fois

---

## 📈 Métriques de Succès

- **Taux tentatives** : Nombre messages refusés / total messages
- **Patterns nouveaux** : Detection automatique nouveaux contournements
- **Satisfaction** : Feedback utilisateurs sur clarté UI
- **Conformité** : 100% tentatives tracées

---

## 🎯 Conclusion

Cette amélioration inspirée de BlaBlaCar apporte :

1. ✅ **Transparence** : Utilisateur voit ses erreurs
2. ✅ **Sécurité** : Traçabilité complète
3. ✅ **UX améliorée** : Pas d'alert() intrusif
4. ✅ **Admin efficace** : Analyse patterns contournement

**Temps estimé** : 6-8 heures développement + tests

**Impact** : Meilleure compréhension utilisateurs + analyse admin facilitée
