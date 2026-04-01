# Distinction : Demandes EXPRESS vs PUBLIQUES

**Date**: 1er avril 2026  
**Contexte**: Clarification des deux workflows indépendants de la plateforme

---

## 🎯 Vue d'ensemble

ArtisanDispo gère **DEUX types de demandes complètement distincts** :

### 1️⃣ **Demandes EXPRESS** (<150€)
- **Objectif** : Petits travaux rapides, intervention immédiate
- **Réponse artisan** : **PROPOSITION** (pas de devis formel)
- **Workflow** : Simplifié, paiement direct

### 2️⃣ **Demandes PUBLIQUES/CLASSIQUES**
- **Objectif** : Travaux standard marketplace
- **Réponse artisan** : **DEVIS** détaillé avec prestations
- **Workflow** : Complet avec contrat

---

## 📊 Comparaison Technique

| Aspect | **Demandes EXPRESS** | **Demandes PUBLIQUES** |
|--------|---------------------|------------------------|
| **Budget** | < 150€ TTC | Illimité |
| **Collection Firestore** | `demandes_express` | `demandes` |
| **Réponse Artisan** | `propositions_express` | `devis` |
| **Service Frontend** | `demande-express-service.ts` | `demande-service.ts` + `devis-service.ts` |
| **Création document** | `createDemandeExpress()` | `createDemande()` |
| **Réponse artisan** | `createPropositionExpress()` | `createDevis()` |
| **Format réponse** | Montant global TTC + description | Prestations détaillées (designation, quantité, prix HT, TVA) |
| **Négociation** | Oui (contre-propositions client/artisan) | Non (devis ferme) |
| **Acceptation** | `acceptPropositionExpress()` | `acceptDevis()` |
| **Paiement** | `markDemandePaid()` | Webhook Stripe `handlePaymentAuthorized()` |
| **Début travaux** | `markInterventionEnCours()` | `declarerDebutTravaux()` (devis-service) |
| **Fin travaux** | `markInterventionTerminee()` | `declarerFinTravaux()` (devis-service) |
| **Validation** | `markTravauxValides()` | `validerTravaux()` (devis-service) |
| **Document lié** | Aucun contrat formel | Collection `contrats` créée |
| **Urgence** | `immediat` (2h) / `urgent` (24h) | Non applicable |
| **Expiration** | Oui (1h-6h selon urgence) | Non (ou Phase 2) |

---

## 🔄 Workflows Détaillés

### 🚀 **Workflow EXPRESS**

```
1. CLIENT crée demande express
   └─> Collection: demandes_express
   └─> Statut: 'en_attente_proposition'
   └─> Urgence: 'immediat' (2h) ou 'urgent' (24h)
   └─> Budget max: 150€
   └─> Expiration: 1h-6h selon urgence

2. ARTISAN crée proposition
   └─> Collection: propositions_express
   └─> Statut: 'en_attente_acceptation'
   └─> Montant global TTC
   └─> Description travaux
   └─> Délai intervention

3. CLIENT accepte proposition (ou négocie)
   └─> demandes_express.statut → 'acceptee'
   └─> Deadline paiement: 15-30 min selon urgence
   └─> propositions_express.statut → 'acceptee'

4. CLIENT paie (Stripe)
   └─> Fonction: markDemandePaid(demandeId)
   └─> demandes_express.statut → 'payee'
   └─> Notification artisan: 'paiement_recu_express'
   └─> Séquestre: bloqué 24h-48h max

5. ARTISAN démarre intervention
   └─> Fonction: markInterventionEnCours(demandeId)
   └─> demandes_express.statut → 'en_cours'
   └─> Notification client: 'intervention_demarree'

6. ARTISAN termine intervention
   └─> Fonction: markInterventionTerminee(demandeId)
   └─> demandes_express.statut → 'travaux_termines'
   └─> Notification client: 'travaux_termines' (validation requise)
   └─> Auto-validation: 24h si client ne valide pas

7. CLIENT valide (ou auto-validation)
   └─> Fonction: markTravauxValides(demandeId)
   └─> demandes_express.statut → 'terminee'
   └─> Libération séquestre → wallet artisan
   └─> Notification artisan: 'paiement_libere'
```

---

### 🏗️ **Workflow PUBLIQUE/CLASSIQUE**

```
1. CLIENT crée demande publique
   └─> Collection: demandes
   └─> Statut: 'publiee'
   └─> Type: 'publique' (marketplace)
   └─> Visible par tous artisans qualifiés

2. ARTISAN(S) créent devis
   └─> Collection: devis
   └─> Statut: 'envoye'
   └─> Prestations détaillées (designation, qte, prix HT, TVA)
   └─> Délai réalisation
   └─> Validité devis
   └─> demandes.devisRecus++

3. CLIENT choisit et accepte UN devis
   └─> devis.statut → 'accepte'
   └─> demandes.statut → 'attribuee'
   └─> Notification artisan: 'devis_accepte'
   └─> Autres devis → statut 'refuse'

4. CLIENT paie (Stripe)
   └─> Webhook: handlePaymentAuthorized(paymentIntent)
   └─> Metadata: devisId, clientId, artisanId
   └─> devis.statut → 'paye'
   └─> devis.paiement.statut → 'bloque'
   └─> Notification artisan: 'devis_paye' (niveau devis)
   └─> 🆕 Notification artisan: 'demande_paye' (niveau demande)
   └─> Création contrat (collection: contrats)

5. ARTISAN démarre travaux
   └─> Fonction: declarerDebutTravaux(devisId, artisanId)
   └─> devis.statut → 'en_cours'
   └─> devis.travaux.dateDebut → Timestamp.now()
   └─> 🆕 demandes.statut → 'en_cours' (synchronisation)
   └─> Notification client: 'travaux_demarres' (niveau devis)
   └─> 🆕 Notification client: 'travaux_demarres_demande' (niveau demande)

6. ARTISAN termine travaux
   └─> Fonction: declarerFinTravaux(devisId, artisanId)
   └─> devis.statut → 'travaux_termines'
   └─> devis.travaux.dateFin → Timestamp.now()
   └─> 🆕 demandes.statut → 'travaux_termines' (synchronisation)
   └─> Validation deadline: +7 jours
   └─> Notification client: 'travaux_termines' (niveau devis)
   └─> 🆕 Notification client: 'travaux_termines_demande' (niveau demande)

7. CLIENT valide (ou auto-validation 7j)
   └─> Fonction: validerTravaux(devisId, clientId)
   └─> devis.statut → 'termine_valide' ou 'termine_auto_valide'
   └─> devis.paiement.statut → 'libere'
   └─> Libération séquestre → wallet artisan
   └─> demandes.statut → 'terminee'
   └─> Notification artisan: 'paiement_libere'
   └─> Demande avis client (optionnel)
```

---

## ⚠️ **Points Critiques à Retenir**

### 1️⃣ **Ne JAMAIS confondre les deux workflows**

```typescript
// ❌ ERREUR - Appeler fonction devis sur demande express
await declarerDebutTravaux(propositionId, artisanId);  // FAUX

// ✅ CORRECT - Fonction spécifique express
await markInterventionEnCours(demandeExpressId);  // BON
```

### 2️⃣ **Webhooks Stripe séparés**

```typescript
// DEVIS PUBLIQUES → Webhook backend
async function handlePaymentAuthorized(paymentIntent: Stripe.PaymentIntent) {
  const devisId = paymentIntent.metadata.devisId;  // ← DEVIS uniquement
  await db.collection('devis').doc(devisId).update({ statut: 'paye' });
}

// PROPOSITIONS EXPRESS → Fonction frontend
export async function markDemandePaid(demandeId: string) {
  await updateDoc(doc(db, 'demandes_express', demandeId), {  // ← EXPRESS uniquement
    statut: 'payee',
  });
}
```

### 3️⃣ **Synchronisation Devis ↔ Demande (PUBLIQUES UNIQUEMENT)**

Les modifications du commit `057900e` synchronisent **uniquement** les demandes publiques :

```typescript
// Dans declarerDebutTravaux() - devis-service.ts
if (devis.demandeId) {  // ← Concerne collection 'demandes', PAS 'demandes_express'
  await updateDoc(demandeRef, {
    statut: 'en_cours',  // Synchronise demande publique avec devis
  });
}
```

**Demandes express** : Pas de synchronisation car proposition = document unique (pas de séparation demande/proposition comme demande/devis)

---

## 📁 **Organisation des Fichiers**

### **Frontend**

```
frontend/src/lib/firebase/
├── demande-express-service.ts      # ← EXPRESS UNIQUEMENT
│   ├── createDemandeExpress()
│   ├── createPropositionExpress()
│   ├── acceptPropositionExpress()
│   ├── markDemandePaid()
│   ├── markInterventionEnCours()
│   └── markInterventionTerminee()
│
├── demande-service.ts              # ← PUBLIQUES UNIQUEMENT
│   ├── createDemande()
│   └── getDemandesForArtisan()
│
└── devis-service.ts                # ← PUBLIQUES UNIQUEMENT
    ├── createDevis()
    ├── acceptDevis()
    ├── declarerDebutTravaux()     # ← Synchronise avec demande publique
    └── declarerFinTravaux()       # ← Synchronise avec demande publique
```

### **Backend**

```
backend/src/routes/
└── webhooks.routes.ts
    └── handlePaymentAuthorized()   # ← DEVIS PUBLIQUES UNIQUEMENT
        ├── Update: collection('devis').doc(devisId)
        └── Notification: type='devis_paye' + type='demande_paye'
```

---

## 🧪 **Tests pour Vérifier la Séparation**

```typescript
// Test 1 : Paiement express ne crée PAS de devis
test('demande express payée ne crée pas de devis', async () => {
  const demandeId = await markDemandePaid(demandeExpressId);
  const devisSnapshot = await getDocs(collection(db, 'devis'));
  expect(devisSnapshot.empty).toBe(true);  // ✅ Aucun devis créé
});

// Test 2 : Paiement devis ne modifie PAS demandes_express
test('paiement devis ne touche pas demandes_express', async () => {
  await handlePaymentAuthorized(paymentIntent);
  const expressSnapshot = await getDocs(collection(db, 'demandes_express'));
  expect(expressSnapshot.docs).toHaveLength(0);  // ✅ Aucune demande express modifiée
});

// Test 3 : Synchronisation devis → demande (publiques uniquement)
test('début travaux synchronise demande publique', async () => {
  await declarerDebutTravaux(devisId, artisanId);
  const demande = await getDoc(doc(db, 'demandes', demandeId));
  expect(demande.data().statut).toBe('en_cours');  // ✅ Synchronisé
});
```

---

## 📊 **Statistiques Projet**

| Métrique | Demandes EXPRESS | Demandes PUBLIQUES |
|----------|-----------------|-------------------|
| **Lignes de code** | 600+ (demande-express-service.ts) | 1200+ (demande + devis services) |
| **Collections Firestore** | 2 (`demandes_express`, `propositions_express`) | 3 (`demandes`, `devis`, `contrats`) |
| **Fonctions principales** | 15+ | 25+ |
| **Notifications types** | 10+ | 15+ |
| **Délai séquestre** | 24-48h max | 7 jours (auto-validation) |

---

## 🚀 **Prochaines Étapes**

### Phase 1 : Tests (Priorité HAUTE)
- [ ] Tester workflow express complet
- [ ] Tester workflow publique complet
- [ ] Vérifier isolation des deux systèmes

### Phase 2 : Documentation UI
- [ ] Ajouter badges visuels "EXPRESS" vs "PUBLIQUE"
- [ ] Clarifier terminologie dans l'interface
- [ ] Documentation utilisateur (artisans + clients)

### Phase 3 : Optimisations
- [ ] Factoriser code commun (validation, paiement)
- [ ] Unifier système de notifications
- [ ] Performance monitoring

---

## 📚 **Références**

- **Services Express** : `frontend/src/lib/firebase/demande-express-service.ts`
- **Services Publiques** : `frontend/src/lib/firebase/demande-service.ts`, `devis-service.ts`
- **Webhooks** : `backend/src/routes/webhooks.routes.ts`
- **Types** : `frontend/src/types/firestore.ts`
- **Commit récent** : `057900e` - Synchronisation devis ↔ demande publique

---

**Auteur** : ArtisanDispo Team  
**Dernière mise à jour** : 1er avril 2026
