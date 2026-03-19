# Plan de Tests - Système d'Expiration Demandes Express

## ✅ Déploiement Effectué

```bash
# Cloud Functions déployées:
✅ checkPaymentDeadlines           # Watchdog toutes les 5 minutes
✅ checkPaymentDeadlinesManual     # Version test HTTP (manuel)
✅ cleanupExpiredDemandesExpress   # Cleanup quotidien à 4h
✅ cleanupExpiredDemandesExpressManual  # Version test HTTP (manuel)
```

---

## 🧪 Scénarios de Test

### Test 1: Expiration Automatique (Watchdog)

**Objectif**: Vérifier que les demandes acceptées non payées expirent après 15/30min

**Étapes**:
1. Créer demande express (urgence: "immediat")
2. Artisan envoie proposition
3. Client ACCEPTE la proposition
4. ⏱️ NE PAS PAYER (attendre 15 minutes)
5. Vérifier statut après 15min → `expiree`
6. Vérifier notification client "Demande expirée - suppression dans 24h"
7. Vérifier UI client affiche countdown

**Résultat attendu**:
```javascript
// Après 15 minutes (immediat) ou 30 minutes (urgent)
demande.statut === 'expiree'
demande.expireeAt !== null  // Timestamp d'expiration
notification.type === 'demande_expiree_definitif'
```

**Test manuel immédiat** (sans attendre):
```bash
# URL Cloud Function Manual
curl -X POST \
  https://europe-west1-artisandispo-4e56a.cloudfunctions.net/checkPaymentDeadlinesManual \
  -H "Content-Type: application/json"

# Déclenche expiration immédiate pour toutes demandes acceptées non payées
```

---

### Test 2: Suppression Automatique 24h (Cleanup)

**Objectif**: Vérifier suppression définitive après 24h

**Étapes**:
1. Utiliser demande du Test 1 (statut: `expiree`)
2. Vérifier que expireeAt est défini
3. ⏱️ Attendre 24 heures (ou utiliser test manuel)
4. Vérifier demande SUPPRIMÉE de Firestore
5. Vérifier propositions SUPPRIMÉES
6. Vérifier notifications timeout SUPPRIMÉES
7. Vérifier messages CONSERVÉS (archivage légal)

**Résultat attendu**:
```javascript
// Après 24h
demandes_express.doc(demandeId) === null  // Supprimée
propositions_express.where('demandeId', '==', demandeId).empty === true
conversations.messages → CONSERVÉES (archivage)
```

**Test manuel immédiat** (sans attendre 24h):
```bash
# Modifier manuellement expireeAt pour simuler 24h passées
firebase firestore:update demandes_express/{ID} \
  expireeAt="2026-03-18T00:00:00Z"

# Puis déclencher cleanup manuel
curl -X POST \
  https://europe-west1-artisandispo-4e56a.cloudfunctions.net/cleanupExpiredDemandesExpressManual \
  -H "Content-Type: application/json"
```

---

### Test 3: UI Client - Countdown Suppression

**Objectif**: Vérifier affichage countdown dans l'interface client

**Étapes**:
1. Client se connecte
2. Aller sur demande expirée (`/client/demandes-express/[id]`)
3. Vérifier section "Demande Expirée"
4. Vérifier countdown "Suppression dans Xh Ymin"
5. Vérifier bouton "Créer nouvelle demande" présent
6. Vérifier impossible de réactiver/modifier demande

**Résultat attendu**:
```javascript
// UI affiche
Section rouge: "⏰ Demande Expirée Définitivement"
Countdown: "Suppression automatique dans 23h 45min"
Message: "Cette demande sera supprimée automatiquement..."
Bouton: "Créer une nouvelle demande"
Boutons désactivés: Accepter, Modifier, Contact artisan
```

---

### Test 4: Protection Artisan (Non Re-acceptation)

**Objectif**: Vérifier qu'artisan est libéré immédiatement

**Étapes**:
1. Demande expirée (statut: `expiree`)
2. Artisan se connecte
3. Vérifier proposition toujours visible (historique)
4. Vérifier statut proposition: `expiree`
5. Vérifier artisan peut créer NOUVELLE proposition ailleurs
6. Vérifier client NE PEUT PAS re-accepter

**Résultat attendu**:
```javascript
// Artisan
proposition.statut === 'expiree'  // Historique visible
artisan.disponibilite → LIBRE (non bloqué)

// Client
bouton_accepter.disabled === true
message: "Cette proposition a expiré définitivement"
```

---

### Test 5: Notifications Complètes

**Objectif**: Vérifier toutes notifications envoyées

**Étapes**:
1. Expiration watchdog (15/30min)
   - ✅ Notification client: "Demande expirée - délai paiement dépassé"
   - ✅ Notification artisan: "Client n'a pas payé - vous êtes libéré"

2. Suppression 24h (cleanup)
   - ✅ PAS de nouvelle notification (demande déjà supprimée)

**Résultat attendu**:
```javascript
// Après expiration (watchdog)
notifications.where('type', '==', 'demande_expiree_definitif').size === 2
// 1 pour client + 1 pour artisan

// Après cleanup (24h)
// Pas de notification (demande n'existe plus)
```

---

### Test 6: Scénario Complet End-to-End

**Timeline complète**:
```
T+0min    : Client crée demande (urgence: immediat)
T+2min    : Artisan envoie proposition (montant: 150€)
T+5min    : Client ACCEPTE proposition
            → paymentDeadline = T+20min (15min délai)
            → proposition.statut = 'en_attente_paiement'

T+10min   : ⏱️ Client ne paie PAS (délibérément)

T+20min   : ⚡ Watchdog s'exécute (toutes les 5min)
            → Détecte paymentDeadline dépassée
            → demande.statut = 'expiree'
            → demande.expireeAt = T+20min
            → Notification client + artisan
            → UI client affiche countdown "Suppression dans 23h 40min"

T+24h     : Client peut toujours CONSULTER (lecture seule)
            → Countdown affiche "Suppression dans 20min"

T+44h20min: 🗑️ Cleanup s'exécute (quotidien à 4h)
            → expireeAt < (now - 24h) ✓
            → Suppression définitive:
              - DELETE demande
              - DELETE proposition
              - DELETE notifications timeout
              - PRESERVE messages (archivage)

T+44h30min: Client essaie d'accéder → 404 Not Found
```

---

## 📊 Monitoring Production

### Logs Watchdog (Temps Réel)

```bash
# Voir exécutions watchdog
firebase functions:log --only checkPaymentDeadlines --tail

# Rechercher expirations
firebase functions:log --only checkPaymentDeadlines | grep "expirée"
```

### Logs Cleanup (Quotidien)

```bash
# Voir exécutions cleanup (après 4h du matin)
firebase functions:log --only cleanupExpiredDemandesExpress

# Statistiques suppression
firebase functions:log --only cleanupExpiredDemandesExpress | grep "Supprimées"
```

### Métriques à Surveiller

```javascript
// Firestore queries pour analyse
// 1. Taux d'expiration
const expirees = await db.collection('demandes_express')
  .where('statut', '==', 'expiree')
  .count().get();

// 2. Temps moyen avant expiration
const acceptees = await db.collection('demandes_express')
  .where('proposition.statut', '==', 'en_attente_paiement')
  .get();

// 3. Demandes en attente suppression
const enAttenteSuppression = await db.collection('demandes_express')
  .where('statut', '==', 'expiree')
  .where('expireeAt', '<', new Date())
  .count().get();
```

---

## 🐛 Troubleshooting

### Problème 1: Expiration ne se déclenche pas

**Symptômes**: Demande reste `en_attente_paiement` après 15/30min

**Vérifications**:
```bash
# Vérifier watchdog s'exécute
firebase functions:log --only checkPaymentDeadlines --limit 10

# Vérifier paymentDeadline est défini
firebase firestore:get demandes_express/{ID}
# Chercher: paymentDeadline: Timestamp(...)

# Déclencher manuellement
curl -X POST https://...checkPaymentDeadlinesManual
```

**Causes possibles**:
- paymentDeadline non défini lors de l'acceptation
- Watchdog non déployé/désactivé
- Timezone incorrecte (UTC vs Europe/Paris)

---

### Problème 2: Suppression ne se fait pas après 24h

**Symptômes**: Demandes `expiree` persistent > 24h

**Vérifications**:
```bash
# Vérifier cleanup s'exécute quotidiennement
firebase functions:log --only cleanupExpiredDemandesExpress --limit 5

# Vérifier expireeAt correct
firebase firestore:get demandes_express/{ID}
# expireeAt doit être < (now - 24h)

# Forcer cleanup manuel
curl -X POST https://...cleanupExpiredDemandesExpressManual
```

**Causes possibles**:
- expireeAt non défini lors expiration watchdog
- Cleanup non programmé (schedule Pub/Sub)
- Permissions Firestore insuffisantes

---

### Problème 3: Messages supprimés

**Symptômes**: Conversations disparaissent après cleanup

**Vérifications**:
```bash
# Vérifier code cleanup préserve messages
cat functions/src/scheduledJobs/cleanupExpiredDemandesExpress.ts | grep -A 5 "conversations"

# Doit contenir:
# "NE PAS supprimer messages (archivage légal)"
# PAS de batch.delete pour collection 'messages'
```

**Correction**: Messages doivent être préservés (RGPD + archivage légal)

---

## ✅ Checklist Déploiement

- [x] Code compilé sans erreurs TypeScript
- [x] Cloud Functions déployées (4 fonctions)
- [ ] Test manuel watchdog exécuté
- [ ] Test manuel cleanup exécuté
- [ ] Logs production vérifiés (24h)
- [ ] Métriques baseline enregistrées
- [ ] Documentation utilisateur mise à jour
- [ ] Alerte monitoring configurée (optionnel)

---

## 📚 Références

- Documentation complète: `docs/SOLUTION_TIMEOUT_PAIEMENT_EXPRESS.md`
- Code watchdog: `functions/src/scheduledJobs/checkPaymentDeadlines.ts`
- Code cleanup: `functions/src/scheduledJobs/cleanupExpiredDemandesExpress.ts`
- Service frontend: `frontend/src/lib/firebase/demande-express-service.ts`
- UI client: `frontend/src/app/client/demandes-express/[id]/page.tsx`
