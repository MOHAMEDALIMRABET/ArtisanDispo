# ⚡ Démarrage Rapide - Cloud Function Virements Artisans

## 🚀 Installation en 3 étapes

### 1️⃣ Build + Déploiement (5 minutes)

```bash
# Dans le dossier racine du projet
cd functions

# Installer dépendances (si pas déjà fait)
npm install

# Build TypeScript
npm run build

# Déployer la fonction
npm run deploy:virements
```

**Résultat attendu :**
```
✔  functions[processVirementRequests(europe-west1)] Successful create operation.
✔  functions[processVirementRequestsManual(europe-west1)] Successful create operation.

Functions deploy had errors with the following functions:
   None

✨ Deploy complete!
```

---

### 2️⃣ Test avec déclenchement manuel (2 minutes)

**Créer une demande de virement :**
1. Frontend → Se connecter comme artisan
2. `/artisan/wallet` → Cliquer "Transfert total" (138 €)
3. Confirmer → Demande créée (statut: pending)

**Déclencher traitement immédiatement :**
```bash
# Remplacer europe-west1 et artisandispo par vos valeurs
curl -X POST https://europe-west1-artisandispo.cloudfunctions.net/processVirementRequestsManual

# Réponse attendue :
# {
#   "success": true,
#   "processedCount": 1,
#   "failedCount": 0
# }
```

**Vérifier résultat :**
1. Rafraîchir `/artisan/wallet`
2. ✅ Statut : "✅ Effectué"
3. 💼 Bénéfice transféré : +138 €

---

### 3️⃣ Vérifier logs (1 minute)

```bash
npm run logs:virements
```

**Logs attendus :**
```
🚀 Démarrage traitement virements automatiques...
📊 1 demande(s) de virement à traiter
💰 Traitement virement virement123:
   Artisan: artisan-uid-123
   Montant: 138 €
🎭 MOCK Stripe Transfer:
   Montant: 138 €
   Destination: acct_stripe_artisan123
   Transfer ID: tr_mock_1711544400000_virement1
   ⚠️ ATTENTION: Ceci est un MOCK. Aucun virement réel n'a été effectué.
✅ Virement virement123 traité avec succès
✨ Traitement terminé:
   ✅ 1 virement(s) effectué(s)
   ❌ 0 virement(s) échoué(s)
```

---

## ✅ C'est tout ! La fonction est déployée et fonctionne

### Exécution automatique :

La fonction s'exécute maintenant **automatiquement toutes les 6 heures** :
- 🕛 00:00 (minuit)
- 🕕 06:00 (matin)
- 🕛 12:00 (midi)
- 🕕 18:00 (soir)

### Pour tester sans attendre 6h :

Utilisez l'endpoint HTTP manuel :
```bash
curl -X POST https://REGION-PROJECT_ID.cloudfunctions.net/processVirementRequestsManual
```

---

## 📋 Prochaines étapes (Production)

### Phase 1 : MVP (ACTUEL) ✅
- ✅ Cloud Function déployée
- ✅ Traitement automatique toutes les 6h
- ✅ Mock Stripe (pas de vrais virements)
- ✅ Tests fonctionnels complets

### Phase 2 : Stripe Réel (TODO)
1. Installer SDK Stripe : `npm install stripe`
2. Configurer clé : `firebase functions:config:set stripe.secret_key="sk_live_..."`
3. Remplacer `mockStripeTransfer()` par `realStripeTransfer()`
4. Redéployer : `npm run deploy:virements`

👉 Voir détails complets dans [DEPLOY_VIREMENT_ARTISANS.md](DEPLOY_VIREMENT_ARTISANS.md)

---

## 🔍 Monitoring

**Temps réel :**
```bash
npm run logs:virements
```

**Firebase Console :**
1. [console.firebase.google.com](https://console.firebase.google.com)
2. Functions → processVirementRequests
3. Vérifier Health + Metrics

---

## ❓ Problèmes fréquents

### ❌ "Function not found"
**Solution** : Vérifier que la fonction est déployée :
```bash
firebase functions:list
```

### ❌ "Permission denied"
**Solution** : Vérifier Firebase login :
```bash
firebase login
firebase use artisandispo  # Remplacer par votre project ID
```

### ❌ "Build failed"
**Solution** : Vérifier TypeScript :
```bash
cd functions
npm install
npm run build
```

---

## 📞 Support

**Documentation complète** : [DEPLOY_VIREMENT_ARTISANS.md](DEPLOY_VIREMENT_ARTISANS.md)  
**Logs détaillés** : `npm run logs:virements`  
**Code source** : `functions/src/scheduledJobs/processVirementRequests.ts`

---

**Statut** : ✅ PRÊT À DÉPLOYER  
**Temps total** : ~8 minutes  
**Difficulté** : ⭐⭐☆☆☆ (Facile)
