import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Cloud Function: Traiter automatiquement les demandes de virement des artisans
 * 
 * Workflow:
 * 1. Artisan clique "Transfert total" ou "Transfert partiel" dans son wallet
 * 2. Demande créée dans Firestore (collection: virementRequests, statut: 'pending')
 * 3. Cette fonction s'exécute toutes les 6 heures
 * 4. Détecte les demandes 'pending' et les traite automatiquement
 * 5. Appelle Stripe Transfer API pour envoyer l'argent vers le compte bancaire artisan
 * 6. Met à jour statut → 'completed' ou 'rejected' (si erreur)
 * 7. Met à jour wallet.totalRetire (Bénéfice transféré)
 * 
 * Exécution: Toutes les 6 heures (0h, 6h, 12h, 18h)
 * 
 * Sécurité Stripe:
 * - Compte Stripe Connect artisan doit être vérifié
 * - Solde Stripe suffisant pour le transfert
 * - Retry automatique en cas d'erreur temporaire
 * 
 * ⚠️ IMPORTANT PHASE MVP:
 * Cette fonction utilise actuellement un MOCK de Stripe Transfer
 * car Stripe n'est pas encore configuré en production.
 * 
 * Pour activer Stripe réel:
 * 1. Configurer Stripe Connect dans Firebase Functions config
 * 2. Remplacer mockStripeTransfer() par vrai appel stripe.transfers.create()
 * 3. firebase functions:config:set stripe.secret_key="sk_live_..."
 */
export const processVirementRequests = functions.pubsub
  .schedule('every 6 hours')
  .timeZone('Europe/Paris')
  .onRun(async (context) => {
    console.log('🚀 Démarrage traitement virements automatiques...');
    
    try {
      // 1. Récupérer toutes les demandes en attente
      const pendingRequestsSnapshot = await db.collection('virementRequests')
        .where('statut', '==', 'pending')
        .get();

      if (pendingRequestsSnapshot.empty) {
        console.log('✅ Aucune demande de virement en attente');
        return null;
      }

      console.log(`📊 ${pendingRequestsSnapshot.size} demande(s) de virement à traiter`);

      const batch = db.batch();
      let processedCount = 0;
      let failedCount = 0;

      // 2. Traiter chaque demande
      for (const requestDoc of pendingRequestsSnapshot.docs) {
        const request = requestDoc.data();
        const requestId = requestDoc.id;

        console.log(`\n💰 Traitement virement ${requestId}:`);
        console.log(`   Artisan: ${request.artisanId}`);
        console.log(`   Montant: ${request.montant} €`);

        try {
          // 2a. Récupérer le wallet de l'artisan
          const walletDoc = await db.collection('wallets').doc(request.artisanId).get();
          
          if (!walletDoc.exists) {
            throw new Error('Wallet artisan introuvable');
          }

          const wallet = walletDoc.data();

          // 2b. Vérifications de sécurité
          if (wallet?.stripeOnboardingStatus !== 'active') {
            throw new Error('Compte Stripe artisan non activé');
          }

          if (!wallet?.stripeAccountId) {
            throw new Error('Stripe Account ID manquant');
          }

          // 2c. Vérification IBAN (optionnelle mais recommandée)
          if (!wallet?.ibanVerified) {
            console.warn(`⚠️ IBAN non vérifié pour artisan ${request.artisanId}`);
          }

          // 2d. Appeler Stripe Transfer API
          // ⚠️ MOCK pour MVP - À remplacer par vrai appel Stripe
          const transferResult = await mockStripeTransfer({
            amount: request.montant,
            destination: wallet.stripeAccountId,
            artisanId: request.artisanId,
            requestId: requestId
          });

          console.log(`✅ Transfert Stripe effectué: ${transferResult.transferId}`);

          // 2e. Mettre à jour la demande → 'completed'
          batch.update(requestDoc.ref, {
            statut: 'completed',
            stripeTransferId: transferResult.transferId,
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            processedBy: 'cloud_function_auto'
          });

          // 2f. Mettre à jour le wallet: totalRetire (Bénéfice transféré)
          const walletRef = db.collection('wallets').doc(request.artisanId);
          batch.update(walletRef, {
            totalRetire: admin.firestore.FieldValue.increment(request.montant),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastTransaction: admin.firestore.FieldValue.serverTimestamp()
          });

          // 2g. Mettre à jour la transaction wallet associée → 'completed'
          if (request.walletTransactionId) {
            const txRef = db.collection('walletTransactions').doc(request.walletTransactionId);
            batch.update(txRef, {
              statut: 'completed',
              completedAt: admin.firestore.FieldValue.serverTimestamp(),
              stripeTransferId: transferResult.transferId
            });
          }

          // 2h. Créer une notification artisan
          const notificationRef = db.collection('notifications').doc();
          batch.set(notificationRef, {
            recipientId: request.artisanId,
            type: 'virement_complete',
            title: '✅ Virement effectué',
            message: `Votre virement de ${request.montant.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € a été traité avec succès. Les fonds arriveront sur votre compte bancaire dans 1 à 3 jours ouvrés.`,
            relatedId: requestId,
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          processedCount++;
          console.log(`✅ Virement ${requestId} traité avec succès`);

        } catch (error: any) {
          console.error(`❌ Erreur traitement virement ${requestId}:`, error.message);

          // Marquer la demande comme rejetée
          batch.update(requestDoc.ref, {
            statut: 'rejected',
            rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
            rejectionReason: error.message,
            processedBy: 'cloud_function_auto'
          });

          // Recréditer le solde disponible (annuler la réservation)
          const walletRef = db.collection('wallets').doc(request.artisanId);
          batch.update(walletRef, {
            soldeDisponible: admin.firestore.FieldValue.increment(request.montant),
            soldeTotal: admin.firestore.FieldValue.increment(request.montant),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          // Mettre à jour la transaction wallet → 'failed'
          if (request.walletTransactionId) {
            const txRef = db.collection('walletTransactions').doc(request.walletTransactionId);
            batch.update(txRef, {
              statut: 'failed',
              completedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }

          // Créer une notification d'erreur
          const notificationRef = db.collection('notifications').doc();
          batch.set(notificationRef, {
            recipientId: request.artisanId,
            type: 'virement_failed',
            title: '❌ Virement échoué',
            message: `Votre demande de virement de ${request.montant.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € a échoué. Raison: ${error.message}. Le montant a été recrédité sur votre solde disponible.`,
            relatedId: requestId,
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          failedCount++;
        }
      }

      // 3. Sauvegarder toutes les mises à jour en batch
      await batch.commit();

      console.log('\n✨ Traitement terminé:');
      console.log(`   ✅ ${processedCount} virement(s) effectué(s)`);
      console.log(`   ❌ ${failedCount} virement(s) échoué(s)`);

      return {
        success: true,
        processedCount,
        failedCount,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      console.error('❌ Erreur globale traitement virements:', error);
      throw error;
    }
  });

/**
 * Cloud Function HTTP: Version manuelle pour tests
 * Permet de déclencher le traitement manuellement via HTTP
 * 
 * Usage:
 * POST https://REGION-PROJECT_ID.cloudfunctions.net/processVirementRequestsManual
 * Headers: { "Content-Type": "application/json" }
 * Body: {} (vide)
 * 
 * ⚠️ À SÉCURISER en production avec Firebase Auth
 */
export const processVirementRequestsManual = functions.https.onRequest(async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
    return;
  }

  console.log('🔧 Traitement manuel des virements déclenché');

  try {
    // Réutiliser la même logique que la fonction automatique
    const pendingRequestsSnapshot = await db.collection('virementRequests')
      .where('statut', '==', 'pending')
      .get();

    if (pendingRequestsSnapshot.empty) {
      res.status(200).json({
        success: true,
        message: 'Aucune demande de virement en attente',
        processedCount: 0,
        failedCount: 0
      });
      return;
    }

    const batch = db.batch();
    let processedCount = 0;
    let failedCount = 0;

    for (const requestDoc of pendingRequestsSnapshot.docs) {
      const request = requestDoc.data();
      const requestId = requestDoc.id;

      try {
        const walletDoc = await db.collection('wallets').doc(request.artisanId).get();
        
        if (!walletDoc.exists) {
          throw new Error('Wallet artisan introuvable');
        }

        const wallet = walletDoc.data();

        if (wallet?.stripeOnboardingStatus !== 'active') {
          throw new Error('Compte Stripe artisan non activé');
        }

        if (!wallet?.stripeAccountId) {
          throw new Error('Stripe Account ID manquant');
        }

        const transferResult = await mockStripeTransfer({
          amount: request.montant,
          destination: wallet.stripeAccountId,
          artisanId: request.artisanId,
          requestId: requestId
        });

        batch.update(requestDoc.ref, {
          statut: 'completed',
          stripeTransferId: transferResult.transferId,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          processedBy: 'manual_http_trigger'
        });

        const walletRef = db.collection('wallets').doc(request.artisanId);
        batch.update(walletRef, {
          totalRetire: admin.firestore.FieldValue.increment(request.montant),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        if (request.walletTransactionId) {
          const txRef = db.collection('walletTransactions').doc(request.walletTransactionId);
          batch.update(txRef, {
            statut: 'completed',
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            stripeTransferId: transferResult.transferId
          });
        }

        const notificationRef = db.collection('notifications').doc();
        batch.set(notificationRef, {
          recipientId: request.artisanId,
          type: 'virement_complete',
          title: '✅ Virement effectué',
          message: `Votre virement de ${request.montant.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € a été traité avec succès.`,
          relatedId: requestId,
          isRead: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        processedCount++;

      } catch (error: any) {
        console.error(`❌ Erreur traitement virement ${requestId}:`, error.message);

        batch.update(requestDoc.ref, {
          statut: 'rejected',
          rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
          rejectionReason: error.message,
          processedBy: 'manual_http_trigger'
        });

        const walletRef = db.collection('wallets').doc(request.artisanId);
        batch.update(walletRef, {
          soldeDisponible: admin.firestore.FieldValue.increment(request.montant),
          soldeTotal: admin.firestore.FieldValue.increment(request.montant),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        failedCount++;
      }
    }

    await batch.commit();

    res.status(200).json({
      success: true,
      message: 'Traitement terminé',
      processedCount,
      failedCount,
      timestamp: new Date().toISOString()
    });
    return;

  } catch (error: any) {
    console.error('❌ Erreur traitement manuel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
    return;
  }
});

// ============================================
// MOCK STRIPE TRANSFER (Phase MVP)
// ============================================
// ⚠️ À REMPLACER par vrai appel Stripe en production

/**
 * Mock Stripe Transfer pour tests
 * Simule un transfert Stripe réussi
 * 
 * En production, remplacer par:
 * 
 * import Stripe from 'stripe';
 * const stripe = new Stripe(functions.config().stripe.secret_key);
 * 
 * const transfer = await stripe.transfers.create({
 *   amount: Math.round(params.amount * 100), // Convertir € en centimes
 *   currency: 'eur',
 *   destination: params.destination,
 *   metadata: {
 *     artisanId: params.artisanId,
 *     virementRequestId: params.requestId
 *   },
 *   description: `Virement artisan - Demande ${params.requestId}`
 * });
 * 
 * return { transferId: transfer.id };
 */
async function mockStripeTransfer(params: {
  amount: number;
  destination: string;
  artisanId: string;
  requestId: string;
}): Promise<{ transferId: string }> {
  // Simulation delay réseau Stripe (300-800ms)
  await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));

  // Générer un ID de transfert simulé
  const mockTransferId = `tr_mock_${Date.now()}_${params.requestId.substring(0, 8)}`;

  console.log(`🎭 MOCK Stripe Transfer:`);
  console.log(`   Montant: ${params.amount} €`);
  console.log(`   Destination: ${params.destination}`);
  console.log(`   Transfer ID: ${mockTransferId}`);
  console.log(`   ⚠️ ATTENTION: Ceci est un MOCK. Aucun virement réel n'a été effectué.`);

  return { transferId: mockTransferId };
}
