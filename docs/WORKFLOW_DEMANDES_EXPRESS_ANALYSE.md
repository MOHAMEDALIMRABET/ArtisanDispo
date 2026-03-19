# 📊 Workflow Demandes Express — Analyse Complète & Problème Identifié

**Date**: 19 mars 2026  
**Contexte**: Analyse du workflow complet des demandes express (< 150€) et identification d'un **problème critique** entre acceptation et paiement.

---

## 🔄 Workflow Actuel Complet

### 1️⃣ Phase Création & Proposition

```
┌─────────────────────────────────────────────────────────────┐
│ CLIENT crée demande express                                 │
│ Status: en_attente_proposition                              │
│ Expiration: immediat=1h, urgent=6h                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ARTISAN fait une proposition                                │
│ Status demande: proposition_recue                           │
│ Status proposition: en_attente_acceptation                  │
└─────────────────────────────────────────────────────────────┘
```

**Code source**: `demande-express-service.ts` ligne 25-78
- Expiration artisan: **1h** (immédiat) ou **6h** (urgent)
- Budget max: **150€**
- Notification automatique si demande directe

---

### 2️⃣ Phase Négociation (Optionnelle)

```
CLIENT a 3 options:
├─ ✅ Accepter directement → Passe à phase paiement
├─ 💬 Contre-proposer → Négociation (Round 2)
└─ ❌ Refuser → Demande repart en attente (nouvelle fenêtre 1h/6h)

SI négociation lancée:
┌─────────────────────────────────────────────────────────────┐
│ CLIENT contre-propose (montant + message)                   │
│ Status proposition: en_negociation                          │
│ → L'artisan DOIT répondre                                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
ARTISAN a 3 options (Round 3):
├─ ✅ Accepter le prix client → proposition: en_attente_acceptation
├─ 💬 Proposition finale (DERNIER tour) → proposition_finale_artisan
└─ ❌ Refuser → Négociation rompue, demande repart en attente
```

**Code source**: `demande-express-service.ts` ligne 277-417
- Maximum **3 rounds** de négociation
- Historique complet dans `rounds[]`
- Proposition finale = **dernier tour**, client accepte/refuse uniquement

---

### 3️⃣ Phase Acceptation & Paiement ⚠️ **PROBLÈME ICI**

```
┌─────────────────────────────────────────────────────────────┐
│ CLIENT clique "Accepter la proposition"                     │
│ Status demande: acceptee ← ⚠️ PAS DE TIMEOUT ICI           │
│ Status proposition: acceptee                                │
│ acceptedAt: Timestamp.now()                                 │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ÉCRAN CLIENT: "Procéder au paiement"                        │
│ Bouton: 💳 Procéder au paiement                             │
│ Redirige vers: /client/paiement-express/{propositionId}    │
│                                                             │
│ ⚠️ PROBLÈME: Le client peut ABANDONNER ici sans limite !   │
└─────────────────────────────────────────────────────────────┘
                          ↓ (SI le client paie)
┌─────────────────────────────────────────────────────────────┐
│ PAIEMENT Stripe confirmé                                    │
│ Status demande: payee                                       │
│ Webhook: markDemandePaid()                                  │
│ Notification artisan: "Intervention confirmée"              │
└─────────────────────────────────────────────────────────────┘
```

**Code source problématique**:
- `acceptPropositionExpress()` ligne 213-244: **Aucun champ `paymentDeadline`**
- `client/demandes-express/[id]/page.tsx` ligne 599-622: Affiche juste un bouton, **aucun chrono**
- Aucune Cloud Function pour vérifier l'expiration

---

### 4️⃣ Phase Intervention

```
┌─────────────────────────────────────────────────────────────┐
│ ARTISAN démarre intervention                                │
│ Status: en_cours                                            │
│ Bouton artisan: "Marquer l'intervention comme démarrée"    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ ARTISAN termine & déclare fin                               │
│ Status: travaux_termines                                    │
│ travauxTerminesAt: Timestamp.now()                          │
│ Client a 24h pour valider (libération auto après 24h)      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ CLIENT valide ou libération automatique après 24h          │
│ Status: terminee                                            │
│ Backend: Stripe capture + libération séquestre             │
│ Wallet artisan +montant, wallet plateforme +commission     │
└─────────────────────────────────────────────────────────────┘
```

**Code source**: `demande-express-service.ts` ligne 454-521
- Client a **24h** pour valider ou **libération automatique**
- Cloud Function watchdog recommandée (NON implémentée actuellement)

---

## 🚨 Problème Critique Identifié

### Description

**Entre le statut `acceptee` et `payee`, il n'y a AUCUN mécanisme de protection temporelle.**

#### Scénario problématique

1. ✅ Client accepte proposition → `statut: acceptee`
2. ⏸️ Client **ferme l'onglet** ou **abandonne** sans payer
3. ⚠️ **LA DEMANDE RESTE BLOQUÉE INDÉFINIMENT** en statut `acceptee`
4. ❌ Artisan croit que c'est validé (notification "Proposition acceptée !")
5. ❌ Artisan **attend le paiement** qui ne viendra **JAMAIS**
6. ❌ La proposition de l'artisan est **bloquée**

#### Conséquences

| Acteur      | Impact                                                      |
|-------------|-------------------------------------------------------------|
| **Artisan** | Perd son temps à attendre un paiement inexistant            |
| **Client**  | Ne peut plus annuler, demande bloquée                       |
| **Plateforme** | Mauvaise UX, perte de confiance, demandes zombies          |

**Note importante**: Les demandes express sont **toujours directes** (envoyées à un artisan spécifique), pas de remise en circulation pour d'autres artisans.

---

## ✅ Scénario Optimal Professionnel

### Principe

**Ajouter un délai de paiement adapté selon l'urgence de la demande après acceptation.**  
- **Demandes immédiates** (intervention 2h) → **15 minutes** pour payer
- **Demandes urgentes** (intervention 24h) → **30 minutes** pour payer

Passé ce délai → **annulation automatique** + libération artisan (proposition reste active).

**Logique adaptée** : Les demandes express sont toujours directes (1 artisan spécifique)
- Pas de remise en circulation pour d'autres artisans
- L'artisan garde sa proposition active
- Le client peut re-accepter ou chercher un autre artisan

---

### 🔧 Solution Technique Recommandée

#### 1. Modification Type `DemandeExpress`

```typescript
// frontend/src/types/firestore.ts (ligne ~960)
export interface DemandeExpress {
  // ... champs existants
  
  // ✅ NOUVEAU: Deadline de paiement
  paymentDeadline?: Timestamp; // Ajouté lors de l'acceptation
}
```

#### 2. Modification `acceptPropositionExpress()`

```typescript
// frontend/src/lib/firebase/demande-express-service.ts (ligne ~213)
export async function acceptPropositionExpress(propositionId: string): Promise<void> {
  const proposition = await getPropositionExpressById(propositionId);
  if (!proposition) {
    throw new Error('Proposition introuvable');
  }

  if (proposition.statut !== 'en_attente_acceptation' && proposition.statut !== 'proposition_finale_artisan') {
    throw new Error('Cette proposition ne peut plus être acceptée');
  }

  // ✅ NOUVEAU: Calculer deadline 30 minutes
  const paymentDeadline = Timestamp.fromDate(new Date(Date.now() + 30 * 60 * 1000));

  // Mettre à jour la proposition
  await updateDoc(doc(db, 'propositions_express', propositionId), {
    statut: 'acceptee',
    acceptedAt: Timestamp.now(),
  });

  // Mettre à jour la demande avec deadline
  await updateDoc(doc(db, 'demandes_express', proposition.demandeId), {
    statut: 'acceptee',
    updatedAt: Timestamp.now(),
    paymentDeadline, // ✅ NOUVEAU
  });

  // Notifier l'artisan
  await createNotification(proposition.artisanId, {
    type: 'proposition_acceptee',
    titre: 'Proposition acceptée !',
    message: 'Le client a accepté votre proposition. En attente du paiement (30 min).',
    lien: `/artisan/demandes-express/${proposition.demandeId}`,
  });
}
```

#### 3. Nouveau: Fonction d'annulation automatique

```typescript
// frontend/src/lib/firebase/demande-express-service.ts (NOUVEAU)
/**
 * Annuler une demande acceptée non payée (appelé si timeout dépassé)
 */
export async function cancelAcceptedUnpaid(demandeId: string): Promise<void> {
  const demande = await getDemandeExpressById(demandeId);
  if (!demande) throw new Error('Demande introuvable');
  
  if (demande.statut !== 'acceptee') {
    throw new Error('Seules les demandes acceptées non payées peuvent être annulées');
  }

  // Récupérer la proposition acceptée
  const propositions = await getPropositionsByDemande(demandeId);
  const propositionAcceptee = propositions.find(p => p.statut === 'acceptee');
  
  if (!propositionAcceptee) {
    throw new Error('Aucune proposition acceptée trouvée');
  }

  // Nouvelle fenêtre d'expiration pour artisan
  const newExpiresAt = Timestamp.fromDate(new Date(Date.now() + (
    demande.urgence === 'immediat' ? 60 * 60 * 1000 : 6 * 60 * 60 * 1000
  )));

  // Remettre la proposition en attente (artisan garde sa chance)
  await updateDoc(doc(db, 'propositions_express', propositionAcceptee.id), {
    statut: 'en_attente_acceptation', // Retour à l'état précédent
    acceptedAt: null, // Supprimer date acceptation
  });

  // Remettre la demande en circulation
  await updateDoc(doc(db, 'demandes_express', demandeId), {
    statut: 'proposition_recue', // Retour à l'état avec proposition
    updatedAt: Timestamp.now(),
    paymentDeadline: null, // Supprimer deadline
    expiresAt: newExpiresAt, // Nouvelle fenêtre pour artisan
  });

  // Notifier le client
  await createNotification(demande.clientId, {
    type: 'paiement_expire',
    titre: '⏰ Délai de paiement dépassé',
    message: 'Votre acceptation a expiré (30 min). Vous pouvez accepter à nouveau la proposition.',
    lien: `/client/demandes-express/${demandeId}`,
  });

  // Notifier l'artisan
  if (demande.artisanId) {
    await createNotification(demande.artisanId, {
      type: 'acceptation_expiree',
      titre: '⏰ Acceptation expirée',
      message: 'Le client n\'a pas payé dans les 30 min. Votre proposition reste active.',
      lien: `/artisan/demandes-express/${demandeId}`,
    });
  }
}
```

#### 4. Cloud Function Watchdog (PRIORITÉ HAUTE)

```typescript
// functions/src/index.ts (À CRÉER)
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Watchdog: Vérifier toutes les 5 minutes les demandes acceptées non payées
 * Annule automatiquement si deadline dépassée
 */
export const checkPaymentDeadlines = functions.pubsub
  .schedule('every 5 minutes')
  .timeZone('Europe/Paris')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    
    // Requête: demandes acceptées + deadline dépassée
    const snapshot = await admin.firestore()
      .collection('demandes_express')
      .where('statut', '==', 'acceptee')
      .where('paymentDeadline', '<', now) // Deadline dépassée
      .get();
    
    console.log(`🔍 ${snapshot.size} demande(s) acceptée(s) avec deadline dépassée`);

    const promises = snapshot.docs.map(async (doc) => {
      const demandeId = doc.id;
      const demande = doc.data();
      
      try {
        // Appeler fonction d'annulation
        // ⚠️ Reproduire la logique de cancelAcceptedUnpaid() ici (Firebase Admin SDK)
        
        // Récupérer proposition acceptée
        const propositionsSnap = await admin.firestore()
          .collection('propositions_express')
          .where('demandeId', '==', demandeId)
          .where('statut', '==', 'acceptee')
          .get();
        
        if (propositionsSnap.empty) {
          console.warn(`⚠️ Demande ${demandeId} acceptée mais aucune proposition acceptée trouvée`);
          return;
        }

        const propositionDoc = propositionsSnap.docs[0];
        const proposition = propositionDoc.data();
        
        // Nouvelle fenêtre d'expiration
        const newExpiresAt = admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + (demande.urgence === 'immediat' ? 60 * 60 * 1000 : 6 * 60 * 60 * 1000))
        );

        // Mise à jour batch
        const batch = admin.firestore().batch();
        
        // Remettre proposition en attente
        batch.update(propositionDoc.ref, {
          statut: 'en_attente_acceptation',
          acceptedAt: null,
        });
        
        // Remettre demande en circulation
        batch.update(doc.ref, {
          statut: 'proposition_recue',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          paymentDeadline: null,
          expiresAt: newExpiresAt,
        });
        
        // Notifications
        batch.set(admin.firestore().collection('notifications').doc(), {
          recipientId: demande.clientId,
          type: 'paiement_expire',
          titre: '⏰ Délai de paiement dépassé',
          message: 'Votre acceptation a expiré (30 min). Vous pouvez accepter à nouveau la proposition.',
          lien: `/client/demandes-express/${demandeId}`,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        if (demande.artisanId) {
          batch.set(admin.firestore().collection('notifications').doc(), {
            recipientId: demande.artisanId,
            type: 'acceptation_expiree',
            titre: '⏰ Acceptation expirée',
            message: 'Le client n\'a pas payé dans les 30 min. Votre proposition reste active.',
            lien: `/artisan/demandes-express/${demandeId}`,
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        
        await batch.commit();
        console.log(`✅ Demande ${demandeId} annulée et remise en circulation`);
        
      } catch (error) {
        console.error(`❌ Erreur annulation demande ${demandeId}:`, error);
      }
    });

    await Promise.all(promises);
    console.log(`✅ Watchdog terminé: ${promises.length} demande(s) traitée(s)`);
  });
```

#### 5. UI Client: Afficher le compte à rebours

```tsx
// frontend/src/app/client/demandes-express/[id]/page.tsx (ligne ~599)
{demande.statut === 'acceptee' && (
  <div className="bg-green-50 border-2 border-green-300 rounded-2xl p-6">
    <div className="flex items-start gap-4">
      <div className="text-3xl">✅</div>
      <div className="flex-1">
        <h3 className="text-lg font-bold text-[#2C3E50] mb-1">Proposition acceptée</h3>
        
        {/* ✅ NOUVEAU: Chrono 30 minutes */}
        {demande.paymentDeadline && (
          <div className="bg-orange-100 border border-orange-400 rounded-lg px-3 py-2 mb-4">
            <p className="text-sm font-semibold text-orange-800">
              ⏰ Temps restant pour payer: <CountdownTimer expiresAt={demande.paymentDeadline} />
            </p>
            <p className="text-xs text-orange-600 mt-1">
              Passé ce délai, l'acceptation sera annulée automatiquement
            </p>
          </div>
        )}
        
        <p className="text-[#6C757D] text-sm mb-4">
          Procédez au paiement sécurisé pour confirmer l'intervention de l'artisan.
        </p>
        {proposition && (
          <p className="text-2xl font-extrabold text-[#FF6B00] mb-4">{proposition.montantPropose}€ TTC</p>
        )}
        <button
          onClick={() => router.push(`/client/paiement-express/${proposition?.id}`)}
          className="px-6 py-3 bg-[#FF6B00] text-white rounded-xl hover:bg-[#E56100] font-bold shadow-md"
        >
          💳 Procéder au paiement
        </button>
      </div>
    </div>
  </div>
)}
```

**Composant CountdownTimer** (à créer):

```tsx
// frontend/src/components/CountdownTimer.tsx
'use client';

import { useState, useEffect } from 'react';
import type { Timestamp } from 'firebase/firestore';

interface CountdownTimerProps {
  expiresAt: Timestamp;
}

export function CountdownTimer({ expiresAt }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const tick = () => {
      const diff = expiresAt.toDate().getTime() - Date.now();
      
      if (diff <= 0) {
        setTimeLeft('Expiré');
        setIsExpired(true);
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${minutes}:${String(seconds).padStart(2, '0')}`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <span className={isExpired ? 'text-red-700 font-bold' : 'text-orange-800 font-bold'}>
      {timeLeft}
    </span>
  );
}
```

---

## 📋 Checklist d'Implémentation

### Phase 1: Backend (Haute priorité)

- [ ] **1.1** Ajouter `paymentDeadline?: Timestamp` dans type `DemandeExpress`
- [ ] **1.2** Modifier `acceptPropositionExpress()` pour définir deadline 30 min
- [ ] **1.3** Créer fonction `cancelAcceptedUnpaid(demandeId)`
- [ ] **1.4** Déployer Cloud Function `checkPaymentDeadlines` (watchdog toutes les 5 min)
- [ ] **1.5** Tester scénario: accepter sans payer → vérifier annulation après 30 min

### Phase 2: Frontend (Moyenne priorité)

- [ ] **2.1** Créer composant `CountdownTimer.tsx`
- [ ] **2.2** Afficher chrono 30 min sur page client après acceptation
- [ ] **2.3** Afficher message "Délai de paiement dépassé" si `paymentDeadline` expiré
- [ ] **2.4** Gérer cas où client revient après expiration → afficher erreur + proposition re-disponible

### Phase 3: Notifications & UX (Basse priorité)

- [ ] **3.1** Email client 10 min avant expiration: "N'oubliez pas de payer"
- [ ] **3.2** SMS client si pas de paiement après 20 min (optionnel)
- [ ] **3.3** Badge "⏰ Paiement en attente" sur dashboard artisan
- [ ] **3.4** Statistiques admin: demandes acceptées non payées (taux d'abandon)

---

## 📊 Métriques à Suivre

| Métrique                               | Seuil acceptable | Action si dépassé         |
|----------------------------------------|------------------|---------------------------|
| % demandes acceptées non payées        | < 15%            | Simplifier process paiement |
| Temps moyen acceptation → paiement     | < 5 min          | UX trop complexe          |
| % annulations auto après 30 min        | < 10%            | Deadline trop courte      |
| % artisans insatisfaits (enquête)      | < 5%             | Revoir UX notifications   |

---

## 🎯 Résumé Exécutif

### Problème Actuel

❌ **Gap critique**: Entre `acceptee` et `payee`, aucun timeout → demandes bloquées indéfiniment

### Solution Recommandée

✅ **Deadline de paiement**: 30 minutes après acceptation  
✅ **Cloud Function watchdog**: Vérification automatique toutes les 5 min  
✅ **Annulation intelligente**: Remise en circulation (artisan garde sa proposition)  
✅ **UX transparente**: Chrono visible + notifications préventives

### Impact Business

| Avant                    | Après                        |
|--------------------------|------------------------------|
| Demandes zombies         | Auto-nettoyage               |
| Artisan frustré          | Artisan informé en temps réel |
| Client peut abandonner   | Client incité à finaliser     |
| Perte conversion         | +20-30% conversion estimée    |

### Priorité

🔴 **CRITIQUE** — À implémenter avant mise en production des demandes express

---

## 📝 Annexe: États & Transitions Complètes

```
STATUTS POSSIBLES DemandeExpress:
├─ en_attente_proposition   → Création (expire 1h/6h)
├─ proposition_recue        → Artisan a proposé
├─ acceptee                 → Client accepte ⚠️ NOUVEAU: + paymentDeadline 30 min
├─ payee                    → Paiement confirmé
├─ en_cours                 → Intervention démarrée
├─ travaux_termines         → Artisan a terminé (client 24h validation)
├─ terminee                 → Validé ou auto-libération 24h
├─ annulee                  → Annulée manuellement
├─ expiree                  → Timeout proposition artisan (1h/6h)
└─ refusee_artisan          → Artisan refuse demande

TRANSITIONS AJOUTÉES:
acceptee (+ timeout 30 min) → proposition_recue (annulation auto + nouvelle fenêtre)
```

---

**Fichier créé**: `docs/WORKFLOW_DEMANDES_EXPRESS_ANALYSE.md`  
**Auteur**: AI Agent GitHub Copilot  
**Révision recommandée**: Product Owner + Lead Dev avant implémentation
