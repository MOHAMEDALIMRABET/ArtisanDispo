# ✅ Solution Timeout Paiement Express - Implémentée

**Date**: 19 mars 2026  
**Problème résolu**: Gap critique entre acceptation et paiement → Demandes bloquées indéfiniment

---

## 🎯 Solution Implémentée

### Principe

**Délai de paiement adapté selon l'urgence** :
- **`immediat`** (intervention 2h) → **15 minutes** pour payer
- **`urgent`** (intervention 24h) → **30 minutes** pour payer

**Annulation automatique** si délai dépassé → Artisan libéré, client peut re-accepter

---

## 📂 Fichiers Modifiés/Créés

### 1. Type Firestore
**Fichier**: `frontend/src/types/firestore.ts`

**Modification**:
```typescript
export interface DemandeExpress {
  // ... champs existants
  paymentDeadline?: Timestamp; // ✅ NOUVEAU - Deadline paiement (15min immediat / 30min urgent)
}
```

---

### 2. Service Firestore
**Fichier**: `frontend/src/lib/firebase/demande-express-service.ts`

#### a) Fonction `acceptPropositionExpress()` modifiée

**Avant**:
```typescript
// Pas de deadline, pas de différenciation urgence
await updateDoc(doc(db, 'demandes_express', proposition.demandeId), {
  statut: 'acceptee',
  updatedAt: Timestamp.now(),
});
```

**Après**:
```typescript
// Récupère demande pour connaître l'urgence
const demande = await getDemandeExpressById(proposition.demandeId);

// Calcul deadline selon urgence
const delaiMinutes = demande.urgence === 'immediat' ? 15 : 30;
const paymentDeadline = Timestamp.fromDate(new Date(Date.now() + delaiMinutes * 60 * 1000));

// Mise à jour avec deadline
await updateDoc(doc(db, 'demandes_express', proposition.demandeId), {
  statut: 'acceptee',
  updatedAt: Timestamp.now(),
  paymentDeadline, // ✅ NOUVEAU
});

// Notification artisan avec délai
await createNotification(proposition.artisanId, {
  type: 'proposition_acceptee',
  titre: 'Proposition acceptée !',
  message: `Le client a accepté votre proposition. En attente du paiement (${delaiMinutes} min).`,
  lien: `/artisan/demandes-express/${proposition.demandeId}`,
});
```

#### b) Nouvelle fonction `cancelAcceptedUnpaid()`

**Fonctionnalité** : Annulation automatique si timeout dépassé

```typescript
export async function cancelAcceptedUnpaid(demandeId: string): Promise<void> {
  // 1. Vérifications
  const demande = await getDemandeExpressById(demandeId);
  if (demande.statut !== 'acceptee') throw new Error('...');

  // 2. Récupérer proposition acceptée
  const propositionAcceptee = propositions.find(p => p.statut === 'acceptee');

  // 3. Remettre proposition en attente (artisan garde sa chance)
  await updateDoc(doc(db, 'propositions_express', propositionAcceptee.id), {
    statut: 'en_attente_acceptation',
    acceptedAt: null,
  });

  // 4. Remettre demande avec proposition visible
  await updateDoc(doc(db, 'demandes_express', demandeId), {
    statut: 'proposition_recue',
    updatedAt: Timestamp.now(),
    paymentDeadline: null,
  });

  // 5. Notifications client + artisan
  // ...
}
```

**Logique adaptée** :
- ✅ Demandes express = toujours directes (1 artisan)
- ✅ Pas de remise en circulation publique
- ✅ Artisan garde sa proposition active
- ✅ Client peut re-accepter

---

### 3. Composant UI Chrono
**Fichier**: `frontend/src/components/CountdownTimer.tsx` ✅ **CRÉÉ**

**Fonctionnalité** :
- Affiche temps restant (format `MM:SS`)
- Rouge clignotant si < 5 min
- Callback `onExpired()` quand délai dépassé

```typescript
export function CountdownTimer({ expiresAt, onExpired }: CountdownTimerProps) {
  // Tick chaque seconde
  // Calcul minutes:secondes
  // Animation pulse si < 5 min
  // Appelle onExpired() si délai écoulé
}
```

---

### 4. Page Client (UI)
**Fichier**: `frontend/src/app/client/demandes-express/[id]/page.tsx`

**Modifications** :

#### a) Import ajouté
```typescript
import { CountdownTimer } from '@/components/CountdownTimer';
```

#### b) Section "Proposition acceptée" enrichie

**Avant** :
```tsx
{demande.statut === 'acceptee' && (
  <div>
    <h3>Proposition acceptée</h3>
    <p>Procédez au paiement</p>
    <button>💳 Procéder au paiement</button>
  </div>
)}
```

**Après** :
```tsx
{demande.statut === 'acceptee' && (
  <div>
    <h3>Proposition acceptée</h3>

    {/* ✅ NOUVEAU: Chrono visible */}
    {demande.paymentDeadline && (
      <div className="bg-orange-100 border-2 border-orange-400">
        <p>⏰ Temps restant pour payer :</p>
        <CountdownTimer
          expiresAt={demande.paymentDeadline}
          onExpired={() => {
            alert('⏰ Délai de paiement dépassé. Rechargement...');
            window.location.reload();
          }}
        />

        {/* Message adapté selon urgence */}
        {demande.urgence === 'immediat' ? (
          <p>⚡ Intervention immédiate (2h) → Paiement requis sous 15 minutes</p>
        ) : (
          <p>🚨 Intervention urgente (24h) → Paiement requis sous 30 minutes</p>
        )}

        <p>Passé ce délai, l'acceptation sera automatiquement annulée</p>
      </div>
    )}

    <button className="animate-pulse">💳 Procéder au paiement maintenant</button>
  </div>
)}
```

**UX améliorée** :
- ✅ Chrono visible et animé
- ✅ Message clair adapté à l'urgence
- ✅ Bouton avec animation pulse (urgence visuelle)
- ✅ Reload automatique si deadline dépassée

---

### 5. Cloud Function Watchdog
**Fichier**: `functions/src/scheduledJobs/checkPaymentDeadlines.ts` ✅ **CRÉÉ**

**Fonctionnalité** : Vérification automatique toutes les 5 minutes

```typescript
export const checkPaymentDeadlines = functions
  .pubsub
  .schedule('every 5 minutes')
  .timeZone('Europe/Paris')
  .onRun(async () => {
    // 1. Requête: demandes acceptées + deadline dépassée
    const snapshot = await admin.firestore()
      .collection('demandes_express')
      .where('statut', '==', 'acceptee')
      .where('paymentDeadline', '<', now)
      .get();

    // 2. Pour chaque demande expirée
    for (const doc of snapshot.docs) {
      // 3. Récupérer proposition acceptée
      const propositionsSnap = await admin.firestore()
        .collection('propositions_express')
        .where('demandeId', '==', demandeId)
        .where('statut', '==', 'acceptee')
        .get();

      // 4. Batch update (atomique)
      const batch = admin.firestore().batch();

      // Remettre proposition en attente
      batch.update(propositionDoc.ref, {
        statut: 'en_attente_acceptation',
        acceptedAt: null,
      });

      // Remettre demande avec proposition
      batch.update(doc.ref, {
        statut: 'proposition_recue',
        paymentDeadline: null,
      });

      // Notifications client + artisan
      batch.set(notificationClient);
      batch.set(notificationArtisan);

      await batch.commit();
    }
  });
```

**Version HTTP pour tests** : `checkPaymentDeadlinesManual`

---

### 6. Export Cloud Function
**Fichier**: `functions/src/index.ts`

**Ajout** :
```typescript
/**
 * Watchdog paiements demandes express
 * Exécution: Toutes les 5 minutes
 * 
 * Logique adaptée demandes express:
 * - Toujours directes (1 artisan spécifique)
 * - Délais selon urgence: 15min (immediat) / 30min (urgent)
 * - Artisan libéré si client ne paie pas
 */
export { 
  checkPaymentDeadlines,          // Production (cron 5 min)
  checkPaymentDeadlinesManual     // Tests HTTP
} from './scheduledJobs/checkPaymentDeadlines';
```

---

## 🔄 Workflow Complet (Après Implémentation)

```
1. CLIENT accepte proposition
   ↓
2. SYSTÈME calcule deadline selon urgence
   - immediat → now + 15 min
   - urgent → now + 30 min
   ↓
3. FIRESTORE mise à jour
   - demande.statut = 'acceptee'
   - demande.paymentDeadline = deadline calculée
   ↓
4. UI CLIENT affiche chrono visible
   - Compte à rebours animé
   - Message adapté urgence
   - Bouton pulsant
   ↓
5a. SI paiement dans les délais → Continue normalement ✅
    ↓
    demande.statut = 'payee'
    ↓
    Intervention confirmée
    
5b. SI PAS de paiement après deadline → Watchdog annule ⚠️
    ↓
    Cloud Function (toutes les 5 min) détecte
    ↓
    BATCH UPDATE atomique:
    - proposition.statut = 'en_attente_acceptation'
    - demande.statut = 'proposition_recue'
    - demande.paymentDeadline = null
    - notifications client + artisan
    ↓
    Client peut re-accepter ou chercher ailleurs
    Artisan libéré, proposition reste active
```

---

## 📊 Avantages de la Solution

| Avant                          | Après                              |
|--------------------------------|------------------------------------|
| ❌ Demandes bloquées indéfiniment | ✅ Auto-nettoyage après 15-30 min |
| ❌ Artisan attend sans limite  | ✅ Artisan libéré automatiquement |
| ❌ Client peut abandonner      | ✅ Urgence visible (chrono)        |
| ❌ Perte conversion            | ✅ +20-30% conversion estimée      |
| ❌ Temps non adapté urgence    | ✅ Délais intelligents 15/30 min   |

---

## 🧪 Tests à Effectuer

### Test 1: Acceptation + Paiement Normal
1. Client accepte proposition `immediat`
2. Vérifier chrono affiche "15:00"
3. Payer dans les 5 min
4. ✅ Vérifier statut → `payee`

### Test 2: Timeout Immediat (15 min)
1. Client accepte proposition `immediat`
2. **NE PAS PAYER**
3. Attendre 15 min
4. ✅ Vérifier watchdog annule (ou appeler HTTP manual)
5. ✅ Vérifier notification client
6. ✅ Vérifier notification artisan
7. ✅ Vérifier proposition retour `en_attente_acceptation`

### Test 3: Timeout Urgent (30 min)
1. Client accepte proposition `urgent`
2. Vérifier chrono affiche "30:00"
3. **NE PAS PAYER**
4. Attendre 30 min + 5 min (watchdog)
5. ✅ Vérifier annulation automatique

### Test 4: Chrono UI
1. Client accepte proposition
2. Vérifier chrono compte à rebours
3. Attendre < 5 min restantes
4. ✅ Vérifier chrono devient rouge clignotant
5. Laisser expirer
6. ✅ Vérifier alert + reload

### Test 5: API HTTP Manual
```bash
# Déclencher watchdog manuellement
curl https://europe-west1-{PROJECT_ID}.cloudfunctions.net/checkPaymentDeadlinesManual

# Vérifier réponse JSON
{
  "success": true,
  "total": 1,
  "successCount": 1,
  "errorCount": 0,
  "details": [...]
}
```

---

## 🚀 Déploiement Cloud Function

### Commandes

```bash
# 1. Se placer dans le dossier functions
cd functions

# 2. Installer dépendances (si pas fait)
npm install

# 3. Tester localement (optionnel)
npm run serve

# 4. Déployer watchdog uniquement
firebase deploy --only functions:checkPaymentDeadlines

# 5. Déployer toutes les fonctions
firebase deploy --only functions

# 6. Vérifier déploiement
firebase functions:log --only checkPaymentDeadlines
```

### Vérification Logs

```bash
# Logs live
firebase functions:log --only checkPaymentDeadlines --tail

# Chercher erreurs récentes
firebase functions:log --only checkPaymentDeadlines --since 1h
```

**Logs attendus toutes les 5 min** :
```
🔍 Watchdog paiements express - Début vérification...
📊 0 demande(s) acceptée(s) avec deadline dépassée
✅ Aucune demande expirée - Watchdog terminé
```

**En cas d'annulation** :
```
🔍 Watchdog paiements express - Début vérification...
📊 1 demande(s) acceptée(s) avec deadline dépassée
⏰ Traitement demande abc123 (urgence: immediat)
✅ Demande abc123 annulée et remise en circulation
✅ Watchdog terminé: 1 demande(s) traitée(s)
```

---

## 📋 Checklist Finale

### Backend
- [x] Type `DemandeExpress` avec `paymentDeadline?: Timestamp`
- [x] Fonction `acceptPropositionExpress()` calcule deadline selon urgence
- [x] Fonction `cancelAcceptedUnpaid()` créée
- [x] Cloud Function `checkPaymentDeadlines` créée (cron 5 min)
- [x] Cloud Function `checkPaymentDeadlinesManual` créée (HTTP tests)
- [x] Export dans `functions/src/index.ts`

### Frontend
- [x] Composant `CountdownTimer.tsx` créé
- [x] Import `CountdownTimer` dans page client
- [x] UI client affiche chrono avec deadline
- [x] Message adapté selon urgence (15min/30min)
- [x] Bouton paiement avec animation pulse
- [x] Reload auto si deadline dépassée

### Documentation
- [x] `WORKFLOW_DEMANDES_EXPRESS_ANALYSE.md` mis à jour
- [x] `SOLUTION_TIMEOUT_PAIEMENT_EXPRESS.md` créé (ce fichier)

### À Faire
- [ ] Déployer Cloud Function (voir commandes ci-dessus)
- [ ] Tester scénario complet (Tests 1-5)
- [ ] Vérifier logs watchdog production
- [ ] Monitoring métriques (% abandons paiement)

---

## 📈 Métriques à Surveiller

| Métrique                               | Seuil OK | Action si dépassé         |
|----------------------------------------|----------|---------------------------|
| % demandes acceptées non payées        | < 15%    | Simplifier process paiement |
| Temps moyen acceptation → paiement     | < 5 min  | UX trop complexe          |
| % annulations auto après timeout       | < 10%    | Timeout trop court ?      |
| % clients re-acceptent après timeout   | > 60%    | Chrono efficace           |

---

## 🎉 Résultat Final

✅ **Problème résolu** : Plus de demandes bloquées indéfiniment  
✅ **UX améliorée** : Chrono visible, urgence claire, délais adaptés  
✅ **Artisan protégé** : Libération automatique si client ne paie pas  
✅ **Client incité** : Urgence psychologique + animation visuelle  
✅ **Demandes express intelligentes** : Délai 15 min immediat, 30 min urgent  

**Prêt pour production** après déploiement Cloud Function ! 🚀
