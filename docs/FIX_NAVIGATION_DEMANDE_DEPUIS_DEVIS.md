# 🔧 Fix : Navigation vers demande spécifique depuis page devis

## 🐛 Problème rencontré

**Symptôme** :
Quand le client clique sur "📋 Voir demande associée" depuis `/client/devis`, la plateforme redirige bien vers `/client/demandes?demandeId=xxx` mais affiche :
```
❌ Aucune demande dans cette catégorie
Essayez une autre catégorie
```

**Logs d'erreur** :
```
✅ Utilisateur connecté: UXLAsuOeJqcQLvTSoMrgSFEBMig1
🔍 IDs artisans à récupérer: ['oVUETQNwG4ZKbFsPUAn6vGfRjTI3']
👷 Artisans récupérés: [{…}]
❌ Erreur récupération avis par devisId: FirebaseError: Missing or insufficient permissions.
⚠️ Demande non trouvée dans la catégorie affichée
```

---

## 🔍 Analyse de la cause

### Timing de chargement des données

Le `useEffect` qui gère la navigation vers une demande spécifique s'exécutait **AVANT** que toutes les données soient chargées :

```typescript
// ❌ AVANT (BUGUÉ)
useEffect(() => {
  if (highlightedDemandeId && !loading) {  // ⚠️ loading=false trop tôt
    const demande = demandes.find(d => d.id === highlightedDemandeId);
    const devisListe = devisMap.get(demande.id) || [];  // ⚠️ devisMap vide !
```

**Problème** :
1. `loading` passe à `false` à la fin de `loadDemandes()`
2. Mais `devisMap` peut encore être vide à ce moment
3. La logique qui détermine la section/filtre se base sur `devisMap`
4. Résultat : mauvaise section sélectionnée → demande filtrée → "Aucune demande"

### Ordre de chargement dans `loadDemandes()`

```typescript
async function loadDemandes() {
  // 1️⃣ Charger demandes
  const userDemandes = await getDemandesByClient(user.uid);
  setDemandes(userDemandes);  // ✅ demandes peuplé
  
  // 2️⃣ Charger artisans
  const artisans = await getArtisansByIds(...);
  setArtisansMap(map);
  
  // 3️⃣ Charger devis pour chaque demande
  for (const demande of userDemandes) {
    const devisForDemande = await getDevisByDemande(demande.id);
    devisMapTemp.set(demande.id, devisForDemande);
  }
  setDevisMap(devisMapTemp);  // ✅ devisMap peuplé
  setDemandesAvecDevisPayeIds(demandesAvecDevisPayeSet);
  
  // 4️⃣ Charger avis
  for (const [demandeId, devisList] of devisMapTemp) {
    // ...
  }
  setAvisMap(avisMapTemp);
  
  setLoading(false);  // ⚠️ loading=false ICI
}
```

**Timing critique** :
- `useEffect([highlightedDemandeId, loading, demandes, devisMap])` se déclenche dès que `loading=false`
- Mais à ce moment, `devisMap` vient juste d'être set
- React peut réafficher avant que `devisMap` soit pris en compte

---

## ✅ Solution implémentée

### 1. Attendre que TOUTES les données soient chargées

```typescript
// ✅ APRÈS (CORRIGÉ)
useEffect(() => {
  // Attendre que TOUTES les données soient chargées
  if (highlightedDemandeId && !loading && demandes.length > 0 && devisMap.size > 0) {
    //                                     ^^^^^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^
    //                                     Vérifier que les Maps sont peuplées
    
    const demande = demandes.find(d => d.id === highlightedDemandeId);
    
    if (demande) {
      console.log('🎯 Navigation vers demande:', demande.id, 'Statut:', demande.statut);
      const devisListe = devisMap.get(demande.id) || [];
      console.log('📋 Devis pour cette demande:', devisListe.map(d => ({ id: d.id, statut: d.statut })));
      
      // ... logique de filtrage
    }
  }
}, [highlightedDemandeId, loading, demandes, devisMap]);
```

**Conditions ajoutées** :
- `demandes.length > 0` : S'assurer que les demandes sont chargées
- `devisMap.size > 0` : S'assurer que la Map des devis est peuplée

### 2. Logs de debug

Ajout de logs détaillés pour comprendre le flux :

```typescript
if (demande) {
  console.log('🎯 Navigation vers demande:', demande.id, 'Statut:', demande.statut);
  const devisListe = devisMap.get(demande.id) || [];
  console.log('📋 Devis pour cette demande:', devisListe.map(d => ({ id: d.id, statut: d.statut })));
  
  const devisPaye = devisListe.find(d => 
    ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'].includes(d.statut)
  );
  
  if (devisPaye) {
    console.log('✅ Demande avec devis payé détecté, statut:', devisPaye.statut);
    setFiltreSection('traitees');
    
    if (['termine_valide', 'termine_auto_valide'].includes(devisPaye.statut)) {
      setSousFiltreTraitees('termines');
      console.log('→ Sous-filtre: termines');
    } else if (devisPaye.statut === 'travaux_termines') {
      setSousFiltreTraitees('travaux_en_cours');
      console.log('→ Sous-filtre: travaux_en_cours');
    }
    // ...
  }
} else {
  console.warn('⚠️ Demande non trouvée avec ID:', highlightedDemandeId);
}
```

**Logs attendus en console** (si tout fonctionne) :
```
🎯 Navigation vers demande: kemVsinnU4AeUmaLI4oe Statut: publiee
📋 Devis pour cette demande: [{id: "abc123", statut: "paye"}]
✅ Demande avec devis payé détecté, statut: paye
→ Sous-filtre: devis_signes
```

---

## 🧪 Test du fix

### Scénario de test

1. **Contexte** : Client a une demande avec un devis payé
2. **Action** : Depuis `/client/devis`, cliquer sur "📋 Voir demande associée"
3. **Résultat attendu** :
   - ✅ Redirection vers `/client/demandes?demandeId=xxx`
   - ✅ Section "Traitées" automatiquement sélectionnée
   - ✅ Sous-filtre "Devis signés" activé
   - ✅ Demande étendue et visible
   - ✅ Scroll automatique vers la demande
   - ✅ Animation de surbrillance orange pendant 3 secondes

### Vérification visuelle

**Page `/client/demandes?demandeId=kemVsinnU4AeUmaLI4oe`** :

```
╔════════════════════════════════════════╗
║  🔵 Toutes  📬 Envoyées  📢 Publiées   ║
║  ⏳ En traitement  ✅ TRAITÉES (actif) ║
╠════════════════════════════════════════╣
║  Sous-filtres :                        ║
║  ✅ Devis signés (actif)               ║
║  🚧 Travaux en cours                   ║
║  🏁 Terminés                           ║
╠════════════════════════════════════════╣
║                                        ║
║  ╭────────────────────────────────╮  ║
║  │ [Carte demande ÉTENDUE]       │  ║  ← Animation orange
║  │ ID: kemVsinnU4AeUmaLI4oe      │  ║
║  │ Statut: Devis signé           │  ║
║  │ ...                            │  ║
║  ╰────────────────────────────────╯  ║
║                                        ║
╚════════════════════════════════════════╝
```

---

## ⚙️ Logique de détermination de la section

### Priorité 1 : Devis payé détecté

```typescript
const devisPaye = devisListe.find(d => 
  ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'].includes(d.statut)
);

if (devisPaye) {
  setFiltreSection('traitees');  // → Section "Traitées"
  
  // Déterminer le sous-filtre selon statut exact
  switch (devisPaye.statut) {
    case 'paye':
      setSousFiltreTraitees('devis_signes');
      break;
    case 'en_cours':
      setSousFiltreTraitees('travaux_en_cours');
      break;
    case 'travaux_termines':
      setSousFiltreTraitees('travaux_en_cours');  // Même catégorie
      break;
    case 'termine_valide':
    case 'termine_auto_valide':
      setSousFiltreTraitees('termines');
      break;
    case 'litige':
      setSousFiltreTraitees('litiges');
      break;
  }
}
```

### Priorité 2 : Demande avec devis reçus (pas payé)

```typescript
else if (demande.devisRecus && demande.devisRecus > 0) {
  setFiltreSection('en_traitement');
}
```

### Priorité 3 : Demande publiée sans devis

```typescript
else if (demande.statut === 'publiee') {
  setFiltreSection('publiees');
}
```

### Fallback : Toutes

```typescript
else {
  setFiltreSection('toutes');
}
```

---

## 🔍 Vérification Firestore

### Structure attendue d'une demande

```javascript
{
  id: "kemVsinnU4AeUmaLI4oe",
  clientId: "UXLAsuOeJqcQLvTSoMrgSFEBMig1",
  statut: "publiee",
  devisRecus: 1,  // ← Nombre de devis reçus
  // ...
}
```

### Structure attendue d'un devis

```javascript
{
  id: "abc123",
  demandeId: "kemVsinnU4AeUmaLI4oe",
  clientId: "UXLAsuOeJqcQLvTSoMrgSFEBMig1",
  artisanId: "oVUETQNwG4ZKbFsPUAn6vGfRjTI3",
  statut: "paye",  // ← Statut critique pour la navigation
  // ...
}
```

### Requête de vérification

```javascript
// 1. Vérifier la demande
const demandeDoc = await getDoc(doc(db, 'demandes', 'kemVsinnU4AeUmaLI4oe'));
console.log('Demande:', demandeDoc.data());

// 2. Vérifier les devis associés
const devisQuery = query(
  collection(db, 'devis'),
  where('demandeId', '==', 'kemVsinnU4AeUmaLI4oe')
);
const devisSnapshot = await getDocs(devisQuery);
devisSnapshot.forEach(doc => {
  console.log('Devis:', doc.id, doc.data().statut);
});
```

---

## 🚨 Erreur de permissions sur `getAvisByDevisId`

### Problème secondaire détecté

```
❌ Erreur récupération avis par devisId: FirebaseError: Missing or insufficient permissions.
```

**Cause** : Règles Firestore pour la collection `avis` trop restrictives.

### Règles actuelles (supposées)

```javascript
match /avis/{avisId} {
  allow read: if request.auth != null && request.auth.uid == resource.data.clientId;
  allow write: if request.auth != null && request.auth.uid == request.resource.data.clientId;
}
```

**Problème** : Le client essaie de lire tous les avis d'un devis, pas seulement les siens.

### Solution recommandée

```javascript
match /avis/{avisId} {
  // Lecture : L'auteur OU toute personne authentifiée (pour afficher les avis publics)
  allow read: if request.auth != null;
  
  // Écriture : Seulement l'auteur
  allow create: if request.auth != null && request.auth.uid == request.resource.data.clientId;
  allow update, delete: if request.auth != null && request.auth.uid == resource.data.clientId;
}
```

**Alternative** : Gérer l'erreur côté frontend

```typescript
try {
  const avis = await getAvisByDevisId(devis.id);
  avisMapTemp.set(devis.id, avis !== null);
} catch (error) {
  console.error(`Erreur chargement avis pour devis ${devis.id}:`, error);
  avisMapTemp.set(devis.id, false);  // ✅ Défaut à "pas d'avis"
}
```

**Note** : Cette erreur n'empêche PAS le fonctionnement de la navigation, elle est déjà gérée avec un try/catch.

---

## 📝 Checklist de validation

- [x] Ajout condition `demandes.length > 0` dans useEffect
- [x] Ajout condition `devisMap.size > 0` dans useEffect
- [x] Logs de debug ajoutés
- [x] Test manuel avec demande réelle
- [ ] Vérifier règles Firestore pour collection `avis`
- [ ] Supprimer logs de debug avant production
- [ ] Ajouter tests E2E pour ce scénario

---

## 🔗 Fichiers modifiés

- `frontend/src/app/client/demandes/page.tsx` (lignes 82-134)
  - Ajout conditions de chargement strictes
  - Ajout logs de debug
  - Amélioration logique de navigation

---

## 📚 Références

- [WORKFLOW_COMPLET_SIGNATURE_PAIEMENT_NOTIFICATIONS.md](./WORKFLOW_COMPLET_SIGNATURE_PAIEMENT_NOTIFICATIONS.md) - Documentation complète des notifications
- [FIREBASE.md](./FIREBASE.md) - Structure Firestore
- [FIX_VALIDATION_TELEPHONE_COLLE.md](./FIX_VALIDATION_TELEPHONE_COLLE.md) - Autre fix similaire

---

**Date du fix** : 1er avril 2026  
**Version** : 1.0  
**Statut** : ✅ Résolu
