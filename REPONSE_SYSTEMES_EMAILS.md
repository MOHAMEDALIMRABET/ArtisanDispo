# ✅ RÉPONSE - Systèmes d'Envoi d'Emails ArtisanSafe

**Date** : 20 février 2026

---

## 🔍 Questions Posées

1. **Est-ce que tous les emails sont envoyés via Firebase Auth ?**
2. **Y a-t-il un autre cas d'envoi d'email (suppression de compte via Gmail) ?**

---

## 📧 RÉPONSE : 2 Systèmes Distincts

### ✅ NON, tous les emails ne passent PAS par Firebase Auth

ArtisanSafe utilise **2 systèmes d'envoi d'emails différents** :

---

## 🔥 Système 1 : Firebase Auth (Automatique)

**Technologie** : Firebase Authentication  
**Statut** : ✅ **ACTIF**

### Emails envoyés (3)

| # | Email | Destinataire | Fichier |
|---|-------|--------------|---------|
| 1 | Vérification email | Client | `auth-service.ts` → `signUpClient()` |
| 2 | Vérification email | Artisan | `auth-service.ts` → `signUpArtisan()` |
| 3 | Réinitialisation MDP | Tous | Page `/mot-de-passe-oublie` |

**Code exemple** :
```typescript
import { sendEmailVerification } from 'firebase/auth';

// Après création compte
await sendEmailVerification(user);
```

**Caractéristiques** :
- ✅ Automatique (Firebase gère tout)
- ⚠️ Templates **NON personnalisables** (Firebase default)
- ✅ Gratuit et illimité
- ✅ Très fiable (infrastructure Google)

---

## 📧 Système 2 : Nodemailer + Gmail SMTP (Transactionnel)

**Technologie** : Nodemailer + Gmail  
**Statut** : ✅ **ACTIF** (configuré avec `contact.artisandispo@gmail.com`)

### ✅ OUI, il y a envoi d'emails via Gmail pour la suppression de compte !

### Emails envoyés (4)

| # | Email | Destinataire | Déclencheur | Fichier |
|---|-------|--------------|-------------|---------|
| 4 | ⚠️ Avertissement suppression | Client/Artisan | Admin programme suppression (15j avant) | `email-notification-service.ts` |
| 5 | 🗑️ Confirmation suppression | Client/Artisan | Suppression définitive | `email-notification-service.ts` |
| 6 | 🔒 Suspension compte | Client/Artisan | Admin suspend | `email-notification-service.ts` |
| 7 | ✅ Réactivation compte | Client/Artisan | Admin réactive | `email-notification-service.ts` |

**Code exemple** :
```typescript
import { sendDeletionWarningEmail } from './email-notification-service';

// Admin programme suppression (15 jours avant)
await sendDeletionWarningEmail(
  user.email,              // contact.artisandispo@gmail.com (destinataire)
  'Mohamed Ali',           // Nom utilisateur
  'Non-respect CGU',       // Raison suppression
  new Date('2026-03-07')   // Date suppression définitive
);
```

**Architecture complète** :
```
┌─────────────────────────────────────────────────────┐
│ FRONTEND (email-notification-service.ts)           │
│                                                     │
│ sendDeletionWarningEmail(email, nom, raison, date) │
│          ↓                                          │
│ Crée document Firestore 'email_notifications'      │
│ {                                                   │
│   to: "user@example.com",                           │
│   subject: "⚠️ Avertissement suppression",        │
│   htmlContent: "<html>...</html>",                  │
│   textContent: "Texte brut...",                     │
│   type: "deletion_warning",                         │
│   status: "pending"  ← En attente d'envoi           │
│ }                                                   │
└─────────────────────────────────────────────────────┘
                       ↓
                       
┌─────────────────────────────────────────────────────┐
│ BACKEND (email-service.ts - Surveille toutes les 5 min) │
│                                                     │
│ startEmailWatcher() → Vérifie collection Firestore │
│          ↓                                          │
│ Récupère emails status='pending' (max 50)           │
│          ↓                                          │
│ Envoie via Nodemailer + Gmail SMTP                  │
│   - SMTP_HOST: smtp.gmail.com                       │
│   - SMTP_USER: contact.artisandispo@gmail.com        │
│   - SMTP_PASSWORD: rmhn dhal kpeh zypd              │
│          ↓                                          │
│ Marque status='sent' (succès) ou 'failed' (échec)  │
└─────────────────────────────────────────────────────┘
                       ↓
                       
             ✅ Email reçu par utilisateur
```

**Configuration** : `backend/.env`
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=contact.artisandispo@gmail.com
SMTP_PASSWORD=rmhn dhal kpeh zypd  # Mot de passe d'application Gmail
```

**Surveillance automatique** :
```typescript
// backend/src/server.ts
if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
  await startEmailWatcher();
  console.log('📧 Service email actif (Nodemailer + Gmail)');
}
```

**Logs typiques** :
```
📧 Surveillance des emails configurée (toutes les 5 minutes)
📧 1 emails à envoyer
✅ Email envoyé à user@example.com - ID: <abc123@gmail.com>
✅ Emails envoyés: 1, Échecs: 0
```

---

## 📊 Récapitulatif Final

### Emails Actuellement Envoyés : **7 au total**

**Firebase Auth (3 emails)** :
- ✅ Vérification email client
- ✅ Vérification email artisan
- ✅ Réinitialisation mot de passe

**Nodemailer + Gmail (4 emails)** :
- ✅ Avertissement suppression (15j avant)
- ✅ Confirmation suppression définitive
- ✅ Suspension de compte
- ✅ Réactivation de compte

---

## 🎯 Réponse Directe aux Questions

### 1. Est-ce que tous les emails sont envoyés via Firebase Auth ?

**❌ NON**
- Firebase Auth envoie **3 emails** (vérification + réinitialisation MDP)
- Nodemailer + Gmail envoie **4 emails** (suppression, suspension, réactivation)

### 2. Y a-t-il un système Gmail pour la suppression de compte ?

**✅ OUI, confirmé !**
- Système **ACTIF** depuis le début
- Configuré avec `contact.artisandispo@gmail.com`
- Envoie 4 types d'emails via Gmail SMTP :
  - Avertissement suppression (15 jours avant)
  - Confirmation suppression définitive
  - Suspension de compte
  - Réactivation de compte

---

## 📁 Fichiers Concernés

### Frontend
- `frontend/src/lib/firebase/email-notification-service.ts` (504 lignes)
  - `sendDeletionWarningEmail()` - Avertissement 15j avant
  - `sendDeletionConfirmationEmail()` - Confirmation suppression
  - `sendSuspensionEmail()` - Suspension compte
  - `sendReactivationEmail()` - Réactivation compte

- `frontend/src/lib/firebase/account-service.ts`
  - `scheduleAccountDeletion()` - Programme suppression + email avertissement
  - `deleteArtisanAccount()` - Suppression artisan + email confirmation
  - `deleteClientAccount()` - Suppression client + email confirmation
  - `suspendAccount()` - Suspension + email notification
  - `reactivateAccount()` - Réactivation + email notification

### Backend
- `backend/src/services/email-service.ts` (146 lignes)
  - `sendEmail()` - Envoie email via Nodemailer
  - `processPendingEmails()` - Traite emails en attente
  - `startEmailWatcher()` - Surveille toutes les 5 minutes

- `backend/src/server.ts`
  - Lance `startEmailWatcher()` au démarrage

- `backend/.env`
  - Configuration SMTP Gmail

---

## ✅ Vérifications Faites

1. ✅ Code source vérifié : `email-notification-service.ts` existe
2. ✅ Backend service vérifié : `email-service.ts` existe
3. ✅ Configuration SMTP vérifiée : `.env` contient credentials Gmail
4. ✅ Surveillance active : `startEmailWatcher()` lancé au démarrage
5. ✅ 4 templates email : Avertissement, Confirmation, Suspension, Réactivation

---

## 🔍 Tests Possibles

### Tester l'envoi manuel d'emails en attente

```bash
# Via API endpoint
curl -X POST http://localhost:5000/api/v1/emails/send-pending

# Réponse attendue
{
  "success": true,
  "message": "Emails envoyés avec succès",
  "results": {
    "success": 1,
    "failed": 0,
    "errors": []
  }
}
```

### Vérifier collection Firestore

Collection : `email_notifications`

Document exemple :
```typescript
{
  to: "user@example.com",
  subject: "⚠️ Avertissement : Suppression de votre compte ArtisanDispo",
  htmlContent: "<html>...</html>",
  textContent: "Texte brut...",
  type: "deletion_warning",
  metadata: {
    userName: "Mohamed Ali",
    reason: "Non-respect CGU",
    deletionDate: "2026-03-07T00:00:00.000Z"
  },
  createdAt: Timestamp,
  status: "sent",          // ← 'pending' → 'sent' ou 'failed'
  sentAt: Timestamp
}
```

---

## 💡 Recommandations

### Limites Gmail
- ⚠️ **Max 500 emails/jour** avec compte Gmail standard
- ✅ Suffisant pour MVP ArtisanSafe (< 50 emails/jour estimés)

### Migration Recommandée (Phase 2)
Si volume > 500 emails/jour :
- **SendGrid** : 100 emails/jour gratuits, puis 19.95$/mois jusqu'à 40k emails
- **Resend** : 100 emails/jour gratuits, templates React JSX
- **Mailgun** : 5000 emails/mois gratuits

---

**Document créé le** : 20 février 2026  
**Auteur** : GitHub Copilot  
**Fichiers analysés** : 
- `frontend/src/lib/firebase/email-notification-service.ts`
- `backend/src/services/email-service.ts`
- `backend/.env`
- `docs/ACCOUNT_DELETION_GUIDE.md`
