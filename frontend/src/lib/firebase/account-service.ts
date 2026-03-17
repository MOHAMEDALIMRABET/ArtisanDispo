/**
 * Service de gestion des comptes utilisateurs (Admin)
 * ArtisanDispo - Gestion comptes artisans et clients
 */

import { doc, updateDoc, deleteDoc, setDoc, Timestamp, getDoc, collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import { db, auth } from './config';
import { deleteUser } from 'firebase/auth';
import { sendDeletionConfirmationEmail, sendSuspensionEmail, sendReactivationEmail } from './email-notification-service';

// ============================================
// TYPES
// ============================================

export interface AdminNote {
  id: string;
  adminId: string;
  adminName: string;
  note: string;
  createdAt: Timestamp;
}

export interface AccountAction {
  action: 'suspension' | 'reactivation' | 'deletion' | 'modification';
  adminId: string;
  adminName: string;
  reason?: string;
  timestamp: Timestamp;
}

// ============================================
// SUPPRESSION CASCADE COMPLÈTE
// ============================================

/**
 * SUPPRESSION COMPLÈTE avec cascade sur toutes les collections
 * Conforme RGPD + obligations légales françaises
 * Utilisé par DEUX workflows :
 * 1. Suppression immédiate (admin urgent ou demande utilisateur)
 * 2. Suppression programmée J+15 (via executePendingDeletions)
 */
async function deleteUserCompletely(
  userId: string,
  accountType: 'artisan' | 'client',
  adminId: string,
  adminName: string,
  reason: string,
  userEmail: string,
  userName: string
): Promise<{ success: boolean; error?: string; details?: string }> {
  try {
    const deletedCollections: string[] = [];
    const anonymizedCollections: string[] = [];

    console.log(`🗑️ Début suppression complète userId: ${userId} (${accountType})`);

    // ========================================
    // 0. PRÉ-VÉRIFICATION WALLET (artisan uniquement)
    // Bloquer si argent en séquestre Stripe — impossible de virer avant validation client
    // ========================================
    if (accountType === 'artisan') {
      const walletPreCheckRef = doc(db, 'wallets', userId);
      const walletPreCheckSnap = await getDoc(walletPreCheckRef);
      if (walletPreCheckSnap.exists()) {
        const walletData = walletPreCheckSnap.data();
        const soldeEnAttente = walletData.soldeEnAttente || 0;
        if (soldeEnAttente > 0) {
          return {
            success: false,
            error: `Suppression impossible : ${soldeEnAttente.toFixed(2)} € est actuellement en séquestre (paiement Stripe non libéré). Attendez que le client valide les travaux ou traitez le litige avant de supprimer ce compte.`
          };
        }
      }
    }

    // ========================================
    // 1. ANONYMISER (obligations légales 10 ans)
    // ========================================

    // Avis → Anonymiser auteur
    const avisSnapshot = await getDocs(
      query(collection(db, 'avis'), where('auteurId', '==', userId))
    );
    for (const avisDoc of avisSnapshot.docs) {
      await updateDoc(avisDoc.ref, {
        auteurNom: '[Compte supprimé]',
        auteurEmail: null,
        auteurId: null,
        anonymized: true,
        anonymizedAt: Timestamp.now()
      });
    }
    if (avisSnapshot.size > 0) {
      anonymizedCollections.push(`avis (${avisSnapshot.size})`);
    }

    // Devis → Anonymiser parties (conserver montants pour compta légale)
    const devisField = accountType === 'artisan' ? 'artisanId' : 'clientId';
    const devisSnapshot = await getDocs(
      query(collection(db, 'devis'), where(devisField, '==', userId))
    );
    for (const devisDoc of devisSnapshot.docs) {
      const updates: any = {
        anonymizedAt: Timestamp.now()
      };
      if (accountType === 'artisan') {
        updates['artisan.nom'] = '[Compte supprimé]';
        updates['artisan.email'] = null;
        updates['artisan.telephone'] = null;
        updates.anonymizedArtisan = true;
      } else {
        updates['client.nom'] = '[Compte supprimé]';
        updates['client.email'] = null;
        updates['client.telephone'] = null;
        updates.anonymizedClient = true;
      }
      await updateDoc(devisDoc.ref, updates);
    }
    if (devisSnapshot.size > 0) {
      anonymizedCollections.push(`devis (${devisSnapshot.size})`);
    }

    // Demandes → Anonymiser client (si client)
    if (accountType === 'client') {
      const demandesSnapshot = await getDocs(
        query(collection(db, 'demandes'), where('clientId', '==', userId))
      );
      for (const demandeDoc of demandesSnapshot.docs) {
        await updateDoc(demandeDoc.ref, {
          'client.nom': '[Compte supprimé]',
          'client.email': null,
          'client.telephone': null,
          anonymizedClient: true,
          anonymizedAt: Timestamp.now()
        });
      }
      if (demandesSnapshot.size > 0) {
        anonymizedCollections.push(`demandes (${demandesSnapshot.size})`);
      }
    }

    // Contrats → Anonymiser parties (conserver données financières)
    const contratsField = accountType === 'artisan' ? 'artisanId' : 'clientId';
    const contratsSnapshot = await getDocs(
      query(collection(db, 'contrats'), where(contratsField, '==', userId))
    );
    for (const contratDoc of contratsSnapshot.docs) {
      const updates: any = {
        anonymizedAt: Timestamp.now()
      };
      if (accountType === 'artisan') {
        updates.artisanNom = '[Compte supprimé]';
        updates.artisanEmail = null;
        updates.anonymizedArtisan = true;
      } else {
        updates.clientNom = '[Compte supprimé]';
        updates.clientEmail = null;
        updates.anonymizedClient = true;
      }
      await updateDoc(contratDoc.ref, updates);
    }
    if (contratsSnapshot.size > 0) {
      anonymizedCollections.push(`contrats (${contratsSnapshot.size})`);
    }

    // Conversations → Marquer participant comme supprimé
    const conversationsSnapshot = await getDocs(
      query(collection(db, 'conversations'), where('participants', 'array-contains', userId))
    );
    for (const convDoc of conversationsSnapshot.docs) {
      await updateDoc(convDoc.ref, {
        [`participantNames.${userId}`]: '[Compte supprimé]',
        participantDeleted: true,
        deletedParticipantId: userId,
        deletedAt: Timestamp.now()
      });
    }
    if (conversationsSnapshot.size > 0) {
      anonymizedCollections.push(`conversations (${conversationsSnapshot.size})`);
    }

    // Messages → Anonymiser expéditeur
    const messagesSnapshot = await getDocs(
      query(collection(db, 'messages'), where('senderId', '==', userId))
    );
    for (const messageDoc of messagesSnapshot.docs) {
      await updateDoc(messageDoc.ref, {
        senderName: '[Compte supprimé]',
        anonymizedSender: true,
        anonymizedAt: Timestamp.now()
      });
    }
    if (messagesSnapshot.size > 0) {
      anonymizedCollections.push(`messages (${messagesSnapshot.size})`);
    }

    // ========================================
    // 2. SUPPRIMER DÉFINITIVEMENT (RGPD)
    // ========================================

    // Notifications
    const notificationsSnapshot = await getDocs(
      query(collection(db, 'notifications'), where('recipientId', '==', userId))
    );
    for (const notifDoc of notificationsSnapshot.docs) {
      await deleteDoc(notifDoc.ref);
    }
    if (notificationsSnapshot.size > 0) {
      deletedCollections.push(`notifications (${notificationsSnapshot.size})`);
    }

    // Rappels
    const rappelsSnapshot = await getDocs(
      query(collection(db, 'rappels'), where('userId', '==', userId))
    );
    for (const rappelDoc of rappelsSnapshot.docs) {
      await deleteDoc(rappelDoc.ref);
    }
    if (rappelsSnapshot.size > 0) {
      deletedCollections.push(`rappels (${rappelsSnapshot.size})`);
    }

    // Disponibilités (artisan uniquement)
    if (accountType === 'artisan') {
      const disponibilitesSnapshot = await getDocs(
        query(collection(db, 'disponibilites'), where('artisanId', '==', userId))
      );
      for (const dispoDoc of disponibilitesSnapshot.docs) {
        await deleteDoc(dispoDoc.ref);
      }
      if (disponibilitesSnapshot.size > 0) {
        deletedCollections.push(`disponibilites (${disponibilitesSnapshot.size})`);
      }
    }

    // Litiges → Anonymiser les parties (données légales conservées)
    const litigesClientSnapshot = await getDocs(
      query(collection(db, 'litiges'), where('clientId', '==', userId))
    );
    const litigesArtisanSnapshot = await getDocs(
      query(collection(db, 'litiges'), where('artisanId', '==', userId))
    );
    const tousLesLitiges = [...litigesClientSnapshot.docs, ...litigesArtisanSnapshot.docs];
    for (const litigeDoc of tousLesLitiges) {
      const updates: any = { anonymizedAt: Timestamp.now() };
      if (accountType === 'artisan') {
        updates.artisanNom = '[Compte supprimé]';
        updates.artisanEmail = null;
        updates.anonymizedArtisan = true;
      } else {
        updates.clientNom = '[Compte supprimé]';
        updates.clientEmail = null;
        updates.anonymizedClient = true;
      }
      await updateDoc(litigeDoc.ref, updates);
    }
    if (tousLesLitiges.length > 0) {
      anonymizedCollections.push(`litiges (${tousLesLitiges.length})`);
    }

    // Support tickets → Supprimer
    const supportTicketsSnapshot = await getDocs(
      query(collection(db, 'support_tickets'), where('userId', '==', userId))
    );
    for (const ticketDoc of supportTicketsSnapshot.docs) {
      await deleteDoc(ticketDoc.ref);
    }
    if (supportTicketsSnapshot.size > 0) {
      deletedCollections.push(`support_tickets (${supportTicketsSnapshot.size})`);
    }

    // Wallet (artisan uniquement) → Supprimer
    if (accountType === 'artisan') {

      // ── virementRequests ───────────────────────────────────────────────
      // Traitement AVANT la suppression du wallet car les pending ont un
      // montant réservé (déjà déduit du soldeDisponible) qui doit être tracé.
      const virementRequestsSnapshot = await getDocs(
        query(collection(db, 'virementRequests'), where('artisanId', '==', userId))
      );
      let virementCancelled = 0;
      let virementAnonymized = 0;
      let virementDeleted = 0;
      let totalPendingVirementsCancelled = 0; // Montant total des virements pending annulés
      for (const vrDoc of virementRequestsSnapshot.docs) {
        const vr = vrDoc.data();
        if (vr.statut === 'pending') {
          // Argent réservé mais pas encore envoyé → annuler + tracer
          await updateDoc(vrDoc.ref, {
            statut: 'cancelled',
            cancelledAt: Timestamp.now(),
            cancelReason: `Compte artisan supprimé par admin — ${reason}`,
            accountDeleted: true,
          });
          // Marquer aussi la walletTransaction associée comme annulée
          if (vr.walletTransactionId) {
            const txRef = doc(db, 'walletTransactions', vr.walletTransactionId);
            await updateDoc(txRef, {
              statut: 'cancelled',
              cancelledAt: Timestamp.now(),
              cancelReason: 'Compte artisan supprimé',
            });
          }
          totalPendingVirementsCancelled += (vr.montant || 0);
          virementCancelled++;
        } else if (vr.statut === 'processing') {
          // Stripe peut avoir déjà initié le virement → anonymiser (obligation légale)
          await updateDoc(vrDoc.ref, {
            artisanNom: '[Compte supprimé]',
            ibanLast4: null,
            note: null,
            anonymizedArtisan: true,
            anonymizedAt: Timestamp.now(),
            accountDeleted: true,
          });
          virementAnonymized++;
        } else {
          // completed / failed / cancelled → plus d'utilité légale → supprimer
          await deleteDoc(vrDoc.ref);
          virementDeleted++;
        }
      }
      if (virementRequestsSnapshot.size > 0) {
        const parts = [];
        if (virementCancelled > 0) parts.push(`${virementCancelled} annulés`);
        if (virementAnonymized > 0) parts.push(`${virementAnonymized} anonymisés`);
        if (virementDeleted > 0) parts.push(`${virementDeleted} supprimés`);
        deletedCollections.push(`virementRequests (${parts.join(', ')})`);
      }
      // ──────────────────────────────────────────────────────────────────

      // ── Virement urgent avant suppression ────────────────────────────
      // Si l'artisan a un solde disponible ou des virements pending ont été
      // annulés, créer un virementRequest urgent qui survivra à la suppression
      // du compte pour que l'admin puisse le traiter manuellement.
      const walletRef = doc(db, 'wallets', userId);
      const walletSnap = await getDoc(walletRef);
      if (walletSnap.exists()) {
        const walletData = walletSnap.data();
        const soldeDisponible = walletData.soldeDisponible || 0;
        // Total dû = solde disponible actuel + montants des virements pending annulés
        // (ces montants avaient été déduits de soldeDisponible)
        const totalDu = soldeDisponible + totalPendingVirementsCancelled;
        if (totalDu > 0) {
          const urgentVirementData = {
            artisanId: userId,
            artisanNom: userName,
            montant: Math.round(totalDu * 100) / 100,
            statut: 'pending',
            ibanLast4: walletData.ibanLast4 || null,
            stripeAccountId: walletData.stripeConnectAccountId || null,
            note: `Virement automatique suite à suppression de compte — ${new Date().toLocaleDateString('fr-FR')} — Raison : ${reason}`,
            urgentDeletion: true,
            priority: 'urgent',
            accountDeletedAt: Timestamp.now(),
            accountDeletedReason: reason,
            createdAt: Timestamp.now(),
          };
          if (walletData.stripeConnectAccountId) {
            // Stripe configuré → créer la demande, admin peut traiter
            await addDoc(collection(db, 'virementRequests'), urgentVirementData);
            deletedCollections.push(`virementUrgentCréé (${totalDu.toFixed(2)} €)`);
            console.log(`💰 Virement urgent créé : ${totalDu.toFixed(2)} € pour artisan supprimé ${userId}`);
          } else {
            // Stripe non configuré → argent non récupérable, tracer dans l'archive
            deletedCollections.push(`⚠️ SOLDE_NON_VIRÉ (${totalDu.toFixed(2)} €) — Stripe non configuré`);
            console.warn(`⚠️ Artisan ${userId} avait ${totalDu.toFixed(2)} € mais aucun compte Stripe pour effectuer le virement.`);
          }
        }
        await deleteDoc(walletRef);
        deletedCollections.push('wallets (1)');
      }

      // Transactions wallet → Anonymiser (données financières légales)
      const walletTransactionsSnapshot = await getDocs(
        query(collection(db, 'walletTransactions'), where('artisanId', '==', userId))
      );
      for (const txDoc of walletTransactionsSnapshot.docs) {
        await updateDoc(txDoc.ref, {
          artisanNom: '[Compte supprimé]',
          artisanEmail: null,
          anonymizedArtisan: true,
          anonymizedAt: Timestamp.now()
        });
      }
      if (walletTransactionsSnapshot.size > 0) {
        anonymizedCollections.push(`walletTransactions (${walletTransactionsSnapshot.size})`);
      }
    }

    // Suppression programmée (si existe)
    const scheduledDeletionRef = doc(db, 'scheduled_deletions', userId);
    const scheduledDeletionSnap = await getDoc(scheduledDeletionRef);
    if (scheduledDeletionSnap.exists()) {
      await deleteDoc(scheduledDeletionRef);
      deletedCollections.push('scheduled_deletions (1)');
    }

    // ========================================
    // 3. CRÉER ARCHIVE ANONYMISÉE
    // ========================================

    const archiveRef = doc(collection(db, 'deleted_accounts'), userId);
    const archiveData: any = {
      type: accountType,
      deletedAt: Timestamp.now(),
      deletedBy: adminId,
      deletedByName: adminName,
      reason,
      deletedCollections,
      anonymizedCollections
    };

    // Statistiques anonymisées uniquement (pas de données perso)
    if (accountType === 'artisan') {
      const artisanSnap = await getDoc(doc(db, 'artisans', userId));
      if (artisanSnap.exists()) {
        const artisanData = artisanSnap.data();
        if (artisanData.siret) archiveData.siret = artisanData.siret;
        if (artisanData.metiers) archiveData.metiers = artisanData.metiers;
        if (artisanData.dateInscription) archiveData.dateInscription = artisanData.dateInscription;
      }
    }

    await setDoc(archiveRef, archiveData);

    // ========================================
    // 4. SUPPRIMER PROFILS PRINCIPAUX
    // ========================================

    if (accountType === 'artisan') {
      await deleteDoc(doc(db, 'artisans', userId));
      deletedCollections.push('artisans');
    }
    await deleteDoc(doc(db, 'users', userId));
    deletedCollections.push('users');

    // ========================================
    // 5. EMAIL CONFIRMATION
    // ========================================

    await sendDeletionConfirmationEmail(userEmail, userName, reason);

    // ========================================
    // 6. SUPPRIMER FIREBASE AUTH
    // ========================================

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

      // Récupérer le token de l'admin connecté pour authentifier la requête backend
      const { getAuth } = await import('firebase/auth');
      const currentAdmin = getAuth().currentUser;
      if (!currentAdmin) {
        throw new Error('Admin non authentifié');
      }
      const adminToken = await currentAdmin.getIdToken();

      const response = await fetch(`${apiUrl}/auth/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        console.log(`✅ Compte Firebase Auth supprimé pour ${userId}`);
      } else {
        // Remonter l'erreur — ne pas avaler silencieusement
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erreur HTTP ${response.status} lors de la suppression Firebase Auth`);
      }
    } catch (authError: any) {
      console.error('❌ Erreur suppression Firebase Auth:', authError);
      // Remonter l'erreur pour que l'admin sache que la suppression Auth a échoué
      throw new Error(`Firestore supprimé ✅ mais Firebase Auth non supprimé ❌ : ${authError.message}. Relancez ou supprimez manuellement dans Firebase Console.`);
    }

    const details = `
Supprimées: ${deletedCollections.join(', ')}
Anonymisées: ${anonymizedCollections.join(', ')}
    `.trim();

    console.log(`✅ Suppression complète terminée pour ${accountType} ${userId}`);
    console.log(details);

    return { success: true, details };
  } catch (error) {
    console.error('❌ Erreur suppression complète:', error);
    return { success: false, error: 'Erreur lors de la suppression complète' };
  }
}

// ============================================
// SUSPENSION / RÉACTIVATION
// ============================================

/**
 * Suspendre un compte artisan
 */
export async function suspendArtisan(
  userId: string,
  reason: string,
  adminId: string,
  adminName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const artisanRef = doc(db, 'artisans', userId);
    
    // Récupérer les infos utilisateur pour l'email
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    await updateDoc(artisanRef, {
      suspended: true,
      suspendedAt: Timestamp.now(),
      suspendedBy: adminId,
      suspensionReason: reason,
      'accountHistory': {
        action: 'suspension',
        adminId,
        adminName,
        reason,
        timestamp: Timestamp.now()
      }
    });

    // Envoyer email de notification
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const userName = `${userData.prenom} ${userData.nom}`;
      await sendSuspensionEmail(userData.email, userName, reason);
    }

    return { success: true };
  } catch (error) {
    console.error('Erreur suspension artisan:', error);
    return { success: false, error: 'Erreur lors de la suspension' };
  }
}

/**
 * Réactiver un compte artisan suspendu
 */
export async function reactivateArtisan(
  userId: string,
  adminId: string,
  adminName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const artisanRef = doc(db, 'artisans', userId);
    
    // Récupérer les infos utilisateur pour l'email
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    await updateDoc(artisanRef, {
      suspended: false,
      suspendedAt: null,
      suspendedBy: null,
      suspensionReason: null,
      reactivatedAt: Timestamp.now(),
      reactivatedBy: adminId,
      'accountHistory': {
        action: 'reactivation',
        adminId,
        adminName,
        timestamp: Timestamp.now()
      }
    });

    // Envoyer email de notification
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const userName = `${userData.prenom} ${userData.nom}`;
      await sendReactivationEmail(userData.email, userName);
    }

    return { success: true };
  } catch (error) {
    console.error('Erreur réactivation artisan:', error);
    return { success: false, error: 'Erreur lors de la réactivation' };
  }
}

/**
 * Suspendre un compte client
 */
export async function suspendClient(
  userId: string,
  reason: string,
  adminId: string,
  adminName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    await updateDoc(userRef, {
      suspended: true,
      suspendedAt: Timestamp.now(),
      suspendedBy: adminId,
      suspensionReason: reason,
      'accountHistory': {
        action: 'suspension',
        adminId,
        adminName,
        reason,
        timestamp: Timestamp.now()
      }
    });

    // Envoyer email de notification
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const userName = `${userData.prenom} ${userData.nom}`;
      await sendSuspensionEmail(userData.email, userName, reason);
    }

    return { success: true };
  } catch (error) {
    console.error('Erreur suspension client:', error);
    return { success: false, error: 'Erreur lors de la suspension' };
  }
}

/**
 * Réactiver un compte client suspendu
 */
export async function reactivateClient(
  userId: string,
  adminId: string,
  adminName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    await updateDoc(userRef, {
      suspended: false,
      suspendedAt: null,
      suspendedBy: null,
      suspensionReason: null,
      reactivatedAt: Timestamp.now(),
      reactivatedBy: adminId,
      'accountHistory': {
        action: 'reactivation',
        adminId,
        adminName,
        timestamp: Timestamp.now()
      }
    });

    // Envoyer email de notification
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const userName = `${userData.prenom} ${userData.nom}`;
      await sendReactivationEmail(userData.email, userName);
    }

    return { success: true };
  } catch (error) {
    console.error('Erreur réactivation client:', error);
    return { success: false, error: 'Erreur lors de la réactivation' };
  }
}

// ============================================
// SUPPRESSION RGPD - WORKFLOW IMMÉDIAT
// ============================================

/**
 * Supprimer définitivement un compte artisan IMMÉDIATEMENT
 * ⚠️ WORKFLOW 1 : Suppression immédiate (fraude, demande utilisateur, tests)
 * Pour suppression programmée (15j), utiliser scheduleAccountDeletion()
 */
export async function deleteArtisanAccount(
  userId: string,
  adminId: string,
  adminName: string,
  reason: string
): Promise<{ success: boolean; error?: string; details?: string }> {
  try {
    // 1. Récupérer les données avant suppression
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return { success: false, error: 'Utilisateur non trouvé' };
    }

    const userData = userSnap.data();
    const userEmail = userData.email;
    const userName = `${userData.prenom} ${userData.nom}`;

    const artisanRef = doc(db, 'artisans', userId);
    const artisanSnap = await getDoc(artisanRef);
    
    if (!artisanSnap.exists()) {
      return { success: false, error: 'Artisan non trouvé' };
    }

    // 2. Appeler la suppression complète (toutes collections)
    return await deleteUserCompletely(
      userId,
      'artisan',
      adminId,
      adminName,
      reason,
      userEmail,
      userName
    );
  } catch (error) {
    console.error('Erreur suppression artisan:', error);
    return { success: false, error: 'Erreur lors de la suppression' };
  }
}

/**
 * Supprimer définitivement un compte client IMMÉDIATEMENT
 * ⚠️ WORKFLOW 1 : Suppression immédiate (fraude, demande utilisateur, tests)
 * Pour suppression programmée (15j), utiliser scheduleAccountDeletion()
 */
export async function deleteClientAccount(
  userId: string,
  adminId: string,
  adminName: string,
  reason: string
): Promise<{ success: boolean; error?: string; details?: string }> {
  try {
    // 1. Récupérer les données avant suppression
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return { success: false, error: 'Client non trouvé' };
    }

    const userData = userSnap.data();
    const userEmail = userData.email;
    const userName = `${userData.prenom} ${userData.nom}`;

    // 2. Appeler la suppression complète (toutes collections)
    return await deleteUserCompletely(
      userId,
      'client',
      adminId,
      adminName,
      reason,
      userEmail,
      userName
    );
  } catch (error) {
    console.error('Erreur suppression client:', error);
    return { success: false, error: 'Erreur lors de la suppression' };
  }
}

// ============================================
// SUPPRESSION PROGRAMMÉE (WORKFLOW AVEC PÉRIODE DE RECOURS)
// ============================================

/**
 * Programmer une suppression de compte avec période de recours (15 jours)
 * Utilisé pour respecter les obligations RGPD et donner un délai de contestation
 */
export async function scheduleAccountDeletion(
  userId: string,
  accountType: 'artisan' | 'client',
  reason: string,
  adminId: string,
  adminName: string,
  recoursPeriodDays: number = 15
): Promise<{ success: boolean; error?: string }> {
  try {
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + recoursPeriodDays);

    // 1. Récupérer les infos utilisateur
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return { success: false, error: 'Utilisateur non trouvé' };
    }

    const userData = userSnap.data();
    const userEmail = userData.email;
    const userName = `${userData.prenom} ${userData.nom}`;

    // 2. Créer un document de suppression programmée
    const scheduledDeletionRef = doc(collection(db, 'scheduled_deletions'), userId);
    await setDoc(scheduledDeletionRef, {
      userId,
      accountType,
      reason,
      adminId,
      adminName,
      scheduledAt: Timestamp.now(),
      deletionDate: Timestamp.fromDate(deletionDate),
      status: 'scheduled',
      userEmail,
      userName
    });

    // 3. Suspendre immédiatement le compte
    if (accountType === 'artisan') {
      await suspendArtisan(userId, `Compte programmé pour suppression le ${deletionDate.toLocaleDateString('fr-FR')}`, adminId, adminName);
    } else {
      await suspendClient(userId, `Compte programmé pour suppression le ${deletionDate.toLocaleDateString('fr-FR')}`, adminId, adminName);
    }

    // 4. Envoyer l'email d'avertissement (depuis email-notification-service)
    const { sendDeletionWarningEmail } = await import('./email-notification-service');
    await sendDeletionWarningEmail(userEmail, userName, reason, deletionDate);

    console.log(`✅ Suppression programmée pour ${userName} (${userEmail}) le ${deletionDate.toLocaleDateString('fr-FR')}`);

    return { success: true };
  } catch (error) {
    console.error('Erreur programmation suppression:', error);
    return { success: false, error: 'Erreur lors de la programmation de la suppression' };
  }
}

/**
 * Annuler une suppression programmée (en cas de contestation acceptée)
 */
export async function cancelScheduledDeletion(
  userId: string,
  adminId: string,
  adminName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Récupérer le document de suppression programmée
    const scheduledDeletionRef = doc(db, 'scheduled_deletions', userId);
    const scheduledDeletionSnap = await getDoc(scheduledDeletionRef);
    
    if (!scheduledDeletionSnap.exists()) {
      return { success: false, error: 'Aucune suppression programmée trouvée' };
    }

    const scheduledData = scheduledDeletionSnap.data();

    // 2. Marquer comme annulée
    await updateDoc(scheduledDeletionRef, {
      status: 'cancelled',
      cancelledAt: Timestamp.now(),
      cancelledBy: adminId,
      cancelledByName: adminName
    });

    // 3. Réactiver le compte
    if (scheduledData.accountType === 'artisan') {
      await reactivateArtisan(userId, adminId, adminName);
    } else {
      await reactivateClient(userId, adminId, adminName);
    }

    console.log(`✅ Suppression annulée pour userId ${userId}`);

    return { success: true };
  } catch (error) {
    console.error('Erreur annulation suppression:', error);
    return { success: false, error: 'Erreur lors de l\'annulation de la suppression' };
  }
}

/**
 * Exécuter les suppressions programmées arrivées à échéance
 * (À appeler via Cloud Function quotidiennement)
 */
export async function executePendingDeletions(): Promise<{ 
  success: boolean; 
  deletedCount: number; 
  errors: string[] 
}> {
  try {
    const now = Timestamp.now();
    const scheduledDeletionsRef = collection(db, 'scheduled_deletions');
    const q = query(
      scheduledDeletionsRef,
      where('status', '==', 'scheduled'),
      where('deletionDate', '<=', now)
    );

    const querySnapshot = await getDocs(q);
    const errors: string[] = [];
    let deletedCount = 0;

    for (const docSnap of querySnapshot.docs) {
      const scheduledData = docSnap.data();
      
      try {
        // Exécuter la suppression
        if (scheduledData.accountType === 'artisan') {
          await deleteArtisanAccount(
            scheduledData.userId,
            scheduledData.adminId,
            scheduledData.adminName,
            scheduledData.reason
          );
        } else {
          await deleteClientAccount(
            scheduledData.userId,
            scheduledData.adminId,
            scheduledData.adminName,
            scheduledData.reason
          );
        }

        // Marquer comme exécutée
        await updateDoc(docSnap.ref, {
          status: 'executed',
          executedAt: Timestamp.now()
        });

        deletedCount++;
      } catch (error) {
        errors.push(`Erreur suppression ${scheduledData.userId}: ${error}`);
        console.error(`Erreur suppression ${scheduledData.userId}:`, error);
      }
    }

    console.log(`✅ ${deletedCount} suppressions exécutées`);

    return { success: true, deletedCount, errors };
  } catch (error) {
    console.error('Erreur exécution suppressions programmées:', error);
    return { success: false, deletedCount: 0, errors: [String(error)] };
  }
}

// ============================================
// NOTES ADMIN PRIVÉES
// ============================================

/**
 * Ajouter une note admin privée sur un artisan
 */
export async function addAdminNoteArtisan(
  userId: string,
  note: string,
  adminId: string,
  adminName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const artisanRef = doc(db, 'artisans', userId);
    const artisanSnap = await getDoc(artisanRef);
    
    if (!artisanSnap.exists()) {
      return { success: false, error: 'Artisan non trouvé' };
    }

    const currentNotes = artisanSnap.data().adminNotes || [];
    
    const newNote: AdminNote = {
      id: `note_${Date.now()}`,
      adminId,
      adminName,
      note,
      createdAt: Timestamp.now()
    };

    await updateDoc(artisanRef, {
      adminNotes: [...currentNotes, newNote]
    });

    return { success: true };
  } catch (error) {
    console.error('Erreur ajout note:', error);
    return { success: false, error: 'Erreur lors de l\'ajout de la note' };
  }
}

/**
 * Ajouter une note admin privée sur un client
 */
export async function addAdminNoteClient(
  userId: string,
  note: string,
  adminId: string,
  adminName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return { success: false, error: 'Client non trouvé' };
    }

    const currentNotes = userSnap.data().adminNotes || [];
    
    const newNote: AdminNote = {
      id: `note_${Date.now()}`,
      adminId,
      adminName,
      note,
      createdAt: Timestamp.now()
    };

    await updateDoc(userRef, {
      adminNotes: [...currentNotes, newNote]
    });

    return { success: true };
  } catch (error) {
    console.error('Erreur ajout note:', error);
    return { success: false, error: 'Erreur lors de l\'ajout de la note' };
  }
}

// ============================================
// RÉCUPÉRATION LISTE CLIENTS
// ============================================

/**
 * Récupérer tous les clients pour l'admin
 */
export async function getAllClientsForAdmin() {
  try {
    const usersQuery = query(
      collection(db, 'users'),
      where('role', '==', 'client')
    );
    
    const snapshot = await getDocs(usersQuery);
    const clients = snapshot.docs.map(doc => ({
      userId: doc.id,
      ...doc.data()
    }));

    return clients;
  } catch (error) {
    console.error('Erreur récupération clients:', error);
    return [];
  }
}
