# 📅 CLARIFICATION : Délais de Paiement Artisan

**Date** : 2026-03-27  
**Objectif** : Expliquer clairement le workflow complet de paiement pour les artisans ET les clients

---

## 🎯 PROBLÈMES IDENTIFIÉS ET CORRIGÉS

### ❌ Problème 1 : Incohérence des délais

**Avant** :
- Page devis artisan : "Vous recevrez le paiement sous **24-48 heures** par virement bancaire"
- Cloud Function : Délai SEPA de **1-3 jours**
- Page wallet : **AUCUNE mention** des délais

**Impact** :
- 🔴 L'artisan pense qu'il recevra l'argent sur son compte bancaire en 24-48h
- 🔴 Le client pense que c'est immédiat après validation
- 🔴 Incompréhension et frustration quand le virement prend 3 jours

---

### ❌ Problème 2 : Workflow incomplet

**Avant** :
- Client : "L'artisan reçoit le paiement sous 24-48h"
- Artisan : Ne sait pas qu'il doit demander un virement après validation
- Personne ne comprend qu'il y a 2 étapes distinctes

**Impact** :
- 🔴 Confusion sur les étapes
- 🔴 Artisan ne sait pas qu'il peut cumuler les paiements
- 🔴 Pas d'explication sur le "Chiffre d'affaires"

---

## ✅ CORRECTIONS APPLIQUÉES

### 1️⃣ **Page Wallet Artisan** (`/artisan/wallet`)

**Ajoutée** : Explication claire des délais

```tsx
// Section "Comment ça marche ?"
• Le montant net (92%) est transféré dans votre Chiffre d'affaires (immédiatement)
• Vous pouvez demander un virement vers votre compte bancaire quand vous le souhaitez
• ⏱️ Délai virement bancaire : 1 à 3 jours ouvrés (SEPA standard)
```

**Ajoutée** : Indication du délai sous les boutons de transfert

```tsx
// Si compte configuré ET solde > 0
⏱️ Virement SEPA : 1-3 jours ouvrés après demande
```

---

### 2️⃣ **Page Devis Artisan** (`/artisan/devis/[id]`)

**Remplacé** : "24-48 heures" par workflow complet

**AVANT** :
```tsx
ℹ️ Vous recevrez le paiement sous 24-48 heures par virement bancaire.
```

**APRÈS** :
```tsx
💰 Vos paiements en 2 étapes :

1️⃣ Immédiat : L'argent est transféré dans votre Chiffre d'affaires (portefeuille ArtisanDispo)
2️⃣ Sur demande : Vous demandez un virement vers votre compte bancaire → Délai 1-3 jours ouvrés (SEPA)

💡 Vous pouvez cumuler plusieurs paiements avant de demander un virement groupé
```

**Ajoutée** : Explication après déclaration fin travaux

```tsx
💡 Après déclaration de fin :
• Le client a 7 jours pour valider ou signaler un problème
• Si aucune action : validation automatique
• À la validation : argent transféré immédiatement dans votre Chiffre d'affaires
• Vous pouvez ensuite demander un virement bancaire (1-3 jours SEPA)
```

---

### 3️⃣ **Page Devis Client** (`/client/devis/[id]`)

**Remplacé** : Message simplifié par workflow détaillé

**AVANT** :
```tsx
💡 Que se passe-t-il ensuite ?
• Si vous validez : l'artisan reçoit le paiement sous 24-48h
• Si vous signalez un problème : notre équipe intervient comme médiateur
• Si aucune action : validation automatique après 7 jours
```

**APRÈS** :
```tsx
💡 Que se passe-t-il ensuite ?

✅ Si vous validez : L'argent est libéré immédiatement dans le portefeuille de l'artisan. 
   Il pourra ensuite demander un virement vers son compte bancaire (1-3 jours ouvrés).

⚖️ Si vous signalez un problème : Notre équipe intervient comme médiateur. 
   Votre argent reste bloqué en sécurité jusqu'à résolution.

⏱️ Si aucune action sous 7 jours : Validation automatique pour protéger l'artisan. 
   L'argent sera libéré automatiquement.

🔒 Votre argent reste sécurisé jusqu'à ce que vous validiez ou que le délai expire
```

---

## 🔄 WORKFLOW COMPLET (Version Finale)

### **Pour l'ARTISAN** :

```
1️⃣ Fin des travaux déclarée
   ↓
2️⃣ Attente validation client (7 jours max)
   ↓
3️⃣ Validation client OU validation automatique
   ↓
4️⃣ ✅ Argent libéré IMMÉDIATEMENT dans "Chiffre d'affaires" (portefeuille interne)
   💰 Montant net = Montant TTC × 92% (commission 8% plateforme)
   ↓
5️⃣ Vous consultez votre wallet /artisan/wallet
   → Vous voyez le solde disponible dans "Chiffre d'affaires"
   ↓
6️⃣ Vous demandez un virement (total ou partiel) vers votre compte bancaire
   → Boutons : "Transfert total" ou "Transfert partiel"
   ↓
7️⃣ Cloud Function traite votre demande (automatique, 0-6h)
   ↓
8️⃣ Virement SEPA initié par Stripe
   ⏱️ Délai : 1-3 jours ouvrés
   ↓
9️⃣ 💰 Argent arrive sur votre compte bancaire
```

**Opportunité** : Vous pouvez cumuler plusieurs paiements avant de demander un seul virement groupé.

---

### **Pour le CLIENT** :

```
1️⃣ Artisan déclare fin des travaux
   ↓
2️⃣ Vous recevez notification : "Artisan a terminé les travaux"
   ↓
3️⃣ Vous avez 7 jours pour agir :
   
   Option A : Valider les travaux
   → L'argent est transféré immédiatement au portefeuille de l'artisan
   → L'artisan pourra ensuite demander un virement bancaire (1-3 jours)
   
   Option B : Signaler un problème
   → L'argent reste BLOQUÉ en séquestre
   → Médiation ArtisanSafe intervient
   → Résolution sous 48-72h
   
   Option C : Ne rien faire
   → Validation AUTOMATIQUE après 7 jours
   → Protection artisan contre clients absents
   → L'argent est libéré automatiquement
   ↓
4️⃣ Fin du processus
   → Vous pouvez laisser un avis
   → Contrat archivé dans "Mes travaux"
```

**Garantie** : Votre argent reste en sécurité jusqu'à validation (manuelle ou automatique).

---

## 📊 COMPARAISON AVANT/APRÈS

| Question | AVANT ❌ | APRÈS ✅ |
|----------|---------|---------|
| **Combien de temps pour virement bancaire artisan ?** | "24-48h" (FAUX) | "1-3 jours ouvrés SEPA" (VRAI) |
| **L'argent va où après validation ?** | Non expliqué | "Chiffre d'affaires" puis "Compte bancaire" |
| **L'artisan doit-il demander un virement ?** | Non mentionné | OUI, explication claire |
| **Le client sait-il que ce n'est pas instantané ?** | NON | OUI, workflow détaillé |
| **Peut-on cumuler les paiements ?** | Non mentionné | OUI, mention explicite |

---

## 🎯 MESSAGES CLÉS

### Pour l'ARTISAN :
✅ "L'argent arrive dans votre Chiffre d'affaires immédiatement après validation"  
✅ "Vous demandez un virement SEPA quand vous voulez (1-3 jours)"  
✅ "Vous pouvez grouper plusieurs paiements avant de virer vers votre banque"

### Pour le CLIENT :
✅ "Vous avez 7 jours pour valider après la fin des travaux"  
✅ "Si vous ne faites rien, validation automatique (protection artisan)"  
✅ "L'argent reste bloqué en sécurité jusqu'à votre validation"  
✅ "Après validation, l'artisan recevra l'argent progressivement (portefeuille puis banque)"

---

## 📁 FICHIERS MODIFIÉS

1. **frontend/src/app/artisan/wallet/page.tsx** :
   - Ligne ~584 : Ajout "Délai virement bancaire : 1 à 3 jours ouvrés (SEPA standard)"
   - Ligne ~424 : Ajout message "⏱️ Virement SEPA : 1-3 jours ouvrés après demande"

2. **frontend/src/app/artisan/devis/[id]/page.tsx** :
   - Ligne ~889 : Remplacement "24-48 heures" par workflow 2 étapes
   - Ligne ~809 : Ajout explication workflow après déclaration fin

3. **frontend/src/app/client/devis/[id]/page.tsx** :
   - Ligne ~1534 : Workflow détaillé avec 3 options (valider, signaler, rien faire)

---

## ✅ VALIDATION

### Tests à effectuer :

**Côté Artisan** :
1. [ ] Consulter `/artisan/wallet` → Voir délai "1-3 jours SEPA"
2. [ ] Cliquer "Comment ça marche ?" → Lire le workflow complet
3. [ ] Page devis terminé → Voir l'explication en 2 étapes
4. [ ] Déclarer fin travaux → Voir l'explication du délai 7 jours

**Côté Client** :
1. [ ] Page devis "travaux_termines" → Voir les 3 options détaillées
2. [ ] Comprendre que validation = libération au portefeuille (pas immédiat en banque)
3. [ ] Comprendre le délai de 7 jours pour validation automatique

---

## 📚 DOCUMENTATION LIÉE

- `CLOUD_FUNCTION_VIREMENTS_RESUME.md` - Détails techniques Cloud Function
- `functions/DEPLOY_VIREMENT_ARTISANS.md` - Déploiement automatique
- `WORKFLOW_POST_ACCEPTANCE_SEQUESTRE.md` - Workflow séquestre complet
- `GUIDE_IMPLEMENTATION_GESTION_TRAVAUX.md` - Gestion des travaux

---

## ⏭️ PROCHAINES AMÉLIORATIONS

### Phase 2 - Notifications enrichies :
- [ ] Email artisan après validation : "Votre paiement de X€ est maintenant dans votre Chiffre d'affaires. Demandez un virement depuis /wallet"
- [ ] Email après demande virement : "Votre virement de X€ a été initié. Délai : 1-3 jours ouvrés"
- [ ] Email après réception virement : "Virement de X€ arrivé sur votre compte IBAN ***1234"

### Phase 2 - FAQ intégrée :
- [ ] Section FAQ dans page wallet
- [ ] Aide contextuelle (tooltip) sur les délais
- [ ] Vidéo explicative du workflow

---

## 📞 SUPPORT

En cas de question sur les délais :
- **Artisan** : "Consultez votre wallet, section 'Comment ça marche ?'"
- **Client** : "Votre argent reste sécurisé jusqu'à validation des travaux (7 jours max)"

---

**Statut** : ✅ CORRIGÉ - Les délais sont maintenant clairs pour artisans ET clients
