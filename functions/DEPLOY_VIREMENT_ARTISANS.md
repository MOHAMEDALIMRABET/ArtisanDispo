# 🚀 Déploiement Cloud Function - Traitement Automatique Virements Artisans

## 📋 Vue d'ensemble

Cette Cloud Function traite **automatiquement** les demandes de virement des artisans vers leur compte bancaire.

### Workflow complet :

```
1. Artisan clique "Transfert total" ou "Transfert partiel" dans /artisan/wallet
   ↓
2. Demande créée dans Firestore (collection: virementRequests, statut: 'pending')
   ↓
3. Cloud Function s'exécute toutes les 6 heures (0h, 6h, 12h, 18h)
   ↓
4. Détecte demandes 'pending' + vérifie compte Stripe artisan
   ↓
5. Appelle Stripe Transfer API (montant vers compte bancaire artisan)
   ↓
6. Met à jour statut → 'completed' ou 'rejected'
   ↓
7. Met à jour wallet.totalRetire (Bénéfice transféré)
   ↓
8. Envoie notification artisan (succès ou échec)
```

---

## 🎯 Fonctionnalités

### ✅ Traitement Automatique

- **Fréquence** : Toutes les 6 heures (0h, 6h, 12h, 18h Europe/Paris)
- **Détection** : Demandes `virementRequests` avec `statut: 'pending'`
- **Sécurité** : Vérification compte Stripe Connect artisan activé
- **Notifications** : Envoi automatique (succès ou échec)

### ✅ Gestion des Erreurs

Si erreur Stripe (compte non vérifié, solde insuffisant, etc.) :
- ❌ Demande marquée `statut: 'rejected'`
- 💰 Solde disponible **recrédité automatiquement**
- 🔔 Notification artisan avec raison de l'échec
- 📝 Log détaillé pour debugging

### ✅ Mode MVP (Mock Stripe)

⚠️ **IMPORTANT** : La fonction utilise actuellement un **MOCK** de Stripe Transfer.

**Pourquoi ?**
- Permet de tester tout le workflow sans Stripe configuré
- Pas de risque de vrais transferts pendant les tests
- Génère un ID de transfert simulé : `tr_mock_TIMESTAMP_REQUESTID`

**Logs mock :**
```
🎭 MOCK Stripe Transfer:
   Montant: 138 €
   Destination: acct_stripe_artisan123
   Transfer ID: tr_mock_1711544400000_virement1
   ⚠️ ATTENTION: Ceci est un MOCK. Aucun virement réel n'a été effectué.
```

---

## 📦 Déploiement

### 1. Prérequis

```bash
# Installation Firebase CLI (si pas déjà fait)
npm install -g firebase-tools

# Login Firebase
firebase login

# Vérifier projet actuel
firebase projects:list
firebase use artisandispo  # Remplacer par votre project ID
```

### 2. Installation dépendances

```bash
cd functions
npm install
```

### 3. Build TypeScript

```bash
npm run build
```

### 4. Déployer la fonction

**Option A : Déployer uniquement cette fonction** (Recommandé)
```bash
npm run deploy:virements
```

**Option B : Déployer toutes les Cloud Functions**
```bash
npm run deploy
```

### 5. Vérifier déploiement

```bash
# Voir logs en temps réel
npm run logs:virements

# Voir toutes les fonctions déployées
firebase functions:list
```

---

## 🧪 Tests

### Test 1 : Créer une demande de virement (Frontend)

1. **Se connecter comme artisan** avec solde disponible > 0
2. Aller sur `/artisan/wallet`
3. Cliquer **"Transfert total"** ou **"Transfert partiel"**
4. Remplir montant (min. 10 €) et confirmer

**Résultat attendu :**
- Section "Virements demandés" apparaît
- Statut : 🟡 "⏳ En attente"
- Solde disponible diminue immédiatement

### Test 2 : Déclencher traitement manuel (HTTP)

Attendre 6h n'est pas pratique ! Utilisez la version HTTP :

```bash
# Déclencher traitement manuellement
curl -X POST https://REGION-PROJECT_ID.cloudfunctions.net/processVirementRequestsManual \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Remplacer** :
- `REGION` : `europe-west1` (ou votre région)
- `PROJECT_ID` : ID de votre projet Firebase

**Exemple URL :**
```
https://europe-west1-artisandispo.cloudfunctions.net/processVirementRequestsManual
```

**Réponse attendue :**
```json
{
  "success": true,
  "message": "Traitement terminé",
  "processedCount": 1,
  "failedCount": 0,
  "timestamp": "2026-03-27T14:30:00.000Z"
}
```

### Test 3 : Vérifier résultat (Frontend)

1. Rafraîchir `/artisan/wallet`
2. Vérifier changements :
   - **Virements demandés** : Statut passe à 🟢 "✅ Effectué"
   - **Bénéfice transféré** : Augmente du montant du virement
   - **Notification** : "✅ Virement effectué" dans la cloche

### Test 4 : Vérifier logs Cloud Function

```bash
npm run logs:virements

# Logs attendus :
# 🚀 Démarrage traitement virements automatiques...
# 📊 1 demande(s) de virement à traiter
# 💰 Traitement virement virement123:
#    Artisan: artisan-uid-123
#    Montant: 138 €
# 🎭 MOCK Stripe Transfer:
#    Montant: 138 €
#    Destination: acct_stripe_artisan123
#    Transfer ID: tr_mock_1711544400000_virement1
# ✅ Transfert Stripe effectué: tr_mock_1711544400000_virement1
# ✅ Virement virement123 traité avec succès
# ✨ Traitement terminé:
#    ✅ 1 virement(s) effectué(s)
#    ❌ 0 virement(s) échoué(s)
```

---

## 🔧 Activer Stripe Réel (Production)

### 1. Installer Stripe SDK

```bash
cd functions
npm install stripe
```

### 2. Configurer Stripe Secret Key

```bash
firebase functions:config:set stripe.secret_key="sk_live_YOUR_SECRET_KEY"
```

### 3. Modifier le code (processVirementRequests.ts)

**Remplacer ligne 218-267** (mockStripeTransfer) par :

```typescript
import Stripe from 'stripe';

// Initialiser Stripe avec la clé secrète
const stripe = new Stripe(functions.config().stripe.secret_key, {
  apiVersion: '2024-11-20.acacia'
});

async function realStripeTransfer(params: {
  amount: number;
  destination: string;
  artisanId: string;
  requestId: string;
}): Promise<{ transferId: string }> {
  
  const transfer = await stripe.transfers.create({
    amount: Math.round(params.amount * 100), // Convertir € en centimes
    currency: 'eur',
    destination: params.destination, // Stripe Connect Account ID artisan
    metadata: {
      artisanId: params.artisanId,
      virementRequestId: params.requestId
    },
    description: `Virement artisan - Demande ${params.requestId}`
  });

  console.log(`✅ Véritable transfert Stripe effectué: ${transfer.id}`);
  
  return { transferId: transfer.id };
}
```

**Et remplacer ligne 87** :
```typescript
// AVANT (MVP)
const transferResult = await mockStripeTransfer({ ... });

// APRÈS (Production)
const transferResult = await realStripeTransfer({ ... });
```

### 4. Redéployer

```bash
npm run deploy:virements
```

---

## 📊 Monitoring

### Logs en temps réel

```bash
# Voir tous les logs
npm run logs:virements

# Filtrer par fonction
firebase functions:log --only processVirementRequests

# Logs avec timestamp
firebase functions:log --only processVirementRequests --limit 100
```

### Métriques Firebase Console

1. Aller sur [Firebase Console](https://console.firebase.google.com)
2. Sélectionner projet **ArtisanDispo**
3. **Functions** → **Health**
4. Vérifier :
   - ✅ Invocations : Nombre d'exécutions (4/jour normalement)
   - ✅ Errors : Doit être proche de 0%
   - ✅ Execution time : < 5 secondes normalement

---

## ⚠️ Sécurité

### Firestore Rules (déjà configuré)

```javascript
// Collection: virementRequests
match /virementRequests/{requestId} {
  allow create: if isAuthenticated() && isArtisan() &&
                   request.auth.uid == request.resource.data.artisanId &&
                   request.resource.data.statut == 'pending' &&
                   request.resource.data.montant >= 10;
  
  allow update: if isAdmin() ||
                   (isAuthenticated() && request.auth.uid == resource.data.artisanId &&
                    resource.data.statut == 'pending' &&
                    request.resource.data.statut == 'cancelled');
}
```

### Vérifications Cloud Function

- ✅ Compte Stripe Connect artisan **activé** (`stripeOnboardingStatus === 'active'`)
- ✅ Stripe Account ID artisan **présent** (`wallet.stripeAccountId`)
- ✅ IBAN vérifié (warning si non vérifié, mais pas bloquant)
- ✅ Montant minimum 10 € (validé frontend + Firestore rules)

---

## 🔄 Annulation manuelle virement (Artisan)

L'artisan peut **annuler** une demande tant qu'elle est `status: 'pending'` :

1. Section "Virements demandés" → Cliquer **"Annuler"**
2. Demande passe à `status: 'cancelled'`
3. Solde disponible **recrédité automatiquement**
4. Cloud Function ignore les demandes `cancelled`

---

## 📝 Collections Firestore Impactées

| Collection | Action | Champs mis à jour |
|-----------|--------|-------------------|
| `virementRequests` | **Update** | `statut`, `stripeTransferId`, `completedAt`, `processedBy` |
| `wallets` | **Update** | `totalRetire` +montant (succès) OU `soldeDisponible` +montant (erreur) |
| `walletTransactions` | **Update** | `statut`, `completedAt`, `stripeTransferId` |
| `notifications` | **Create** | Nouvelle notification succès ou échec |

---

## ❓ FAQ

### Q1 : Pourquoi toutes les 6 heures et pas instantané ?

**Réponse** : Raisons de sécurité et performance :
- ✅ Permet validation manuelle admin si besoin (fenêtre 0-6h)
- ✅ Batch processing = moins d'appels Stripe = coûts réduits
- ✅ Évite surcharge si beaucoup de demandes simultanées
- ✅ Retry automatique en cas d'erreur temporaire Stripe

**Pour un traitement plus rapide** : Modifier le schedule dans `processVirementRequests.ts` :
```typescript
// Toutes les heures
.schedule('every 1 hours')

// Toutes les 30 minutes
.schedule('every 30 minutes')
```

### Q2 : Que se passe-t-il si l'artisan n'a pas configuré Stripe ?

**Réponse** : La demande est **rejetée** automatiquement :
- ❌ `statut: 'rejected'`
- 💰 Solde disponible recrédité
- 🔔 Notification : "Compte bancaire non configuré"

### Q3 : Les virements sont-ils instantanés ?

**Réponse** : Non, délai bancaire standard :
- **Cloud Function** : Traitement instantané (< 5 secondes)
- **Stripe Transfer** : Envoi immédiat
- **Arrivée sur compte bancaire artisan** : **1 à 3 jours ouvrés**

### Q4 : Que se passe-t-il si Stripe échoue ?

**Réponse** : Gestion d'erreur complète :
1. Demande → `statut: 'rejected'`
2. `rejectionReason` stocke l'erreur détaillée
3. Solde disponible recrédité
4. Notification artisan avec raison exacte
5. Log Firebase Functions pour debugging

---

## 🎉 Résultat Final

Une fois déployée, la Cloud Function gère **100% automatiquement** :
- ✅ Détection demandes pending
- ✅ Appels Stripe Transfer API
- ✅ Mise à jour statuts + soldes
- ✅ Notifications artisans
- ✅ Gestion erreurs + recréditation
- ✅ Logs détaillés monitoring

**L'artisan voit simplement** :
1. Clique "Transfert total" → Demande envoyée
2. Attend 0-6h (moyenne 3h)
3. Reçoit notification "✅ Virement effectué"
4. Bénéfice transféré augmente
5. Argent arrive sur compte bancaire 1-3 jours plus tard

---

## 📞 Support

**Logs** : `npm run logs:virements`  
**Erreurs** : Vérifier Firebase Console > Functions > Health  
**Questions** : Voir documentation Stripe Connect Transfers

---

**Créé le** : 27 mars 2026  
**Version** : 1.0.0 (MVP avec Mock Stripe)  
**Prochaine étape** : Activer Stripe réel en production
