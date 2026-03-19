/**
 * Cloud Function: Watchdog paiements demandes express
 * 
 * Vérifie toutes les 5 minutes les demandes acceptées non payées
 * Expire automatiquement et définitivement si deadline dépassée
 * 
 * Logique adaptée:
 * - Demandes express = toujours directes (1 artisan spécifique)
 * - Délais selon urgence:
 *   - immediat (intervention 2h) → 15 minutes pour payer
 *   - urgent (intervention 24h) → 30 minutes pour payer
 * - Timeout → Expiration définitive:
 *   - Demande passe à statut 'expiree' + champ expireeAt
 *   - Proposition passe à statut 'expiree'
 *   - Client NE PEUT PAS re-accepter (doit créer nouvelle demande)
 *   - Artisan libéré définitivement
 *   - Suppression automatique après 24h (voir cleanupExpiredDemandesExpress)
 * 
 * Déclencheur: Cron toutes les 5 minutes
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Watchdog: Vérifier toutes les 5 minutes les demandes acceptées non payées
 * Annule automatiquement si paymentDeadline dépassée
 */
export const checkPaymentDeadlines = functions
  .region('europe-west1')
  .pubsub
  .schedule('every 5 minutes')
  .timeZone('Europe/Paris')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();

    console.log('🔍 Watchdog paiements express - Début vérification...');

    try {
      // Requête: demandes acceptées + deadline dépassée
      const snapshot = await admin.firestore()
        .collection('demandes_express')
        .where('statut', '==', 'acceptee')
        .where('paymentDeadline', '<', now) // Deadline dépassée
        .get();

      console.log(`📊 ${snapshot.size} demande(s) acceptée(s) avec deadline dépassée`);

      if (snapshot.empty) {
        console.log('✅ Aucune demande expirée - Watchdog terminé');
        return null;
      }

      // Traiter chaque demande expirée
      const promises = snapshot.docs.map(async (doc) => {
        const demandeId = doc.id;
        const demande = doc.data();

        try {
          console.log(`⏰ Traitement demande ${demandeId} (urgence: ${demande.urgence})`);

          // Récupérer proposition acceptée
          const propositionsSnap = await admin.firestore()
            .collection('propositions_express')
            .where('demandeId', '==', demandeId)
            .where('statut', '==', 'acceptee')
            .get();

          if (propositionsSnap.empty) {
            console.warn(`⚠️ Demande ${demandeId} acceptée mais aucune proposition acceptée trouvée`);
            // Nettoyer la demande pour éviter incohérence - expirer définitivement
            await doc.ref.update({
              statut: 'expiree',
              expireeAt: admin.firestore.FieldValue.serverTimestamp(),
              paymentDeadline: null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return;
          }

          const propositionDoc = propositionsSnap.docs[0];

          // Mise à jour batch (atomique)
          const batch = admin.firestore().batch();

          // 1. Expirer la proposition définitivement
          batch.update(propositionDoc.ref, {
            statut: 'expiree',
            expiredAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // 2. Expirer la demande définitivement (pas de réactivation)
          batch.update(doc.ref, {
            statut: 'expiree',
            expireeAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            paymentDeadline: null,
          });

          // 3. Notification client (demande expirée définitivement)
          const delaiMinutes = demande.urgence === 'immediat' ? 15 : 30;
          batch.set(admin.firestore().collection('notifications').doc(), {
            recipientId: demande.clientId,
            type: 'paiement_expire',
            titre: '❌ Demande expirée',
            message: `Vous n'avez pas payé dans les délais (${delaiMinutes} min). La demande est expirée et sera supprimée automatiquement dans 24h. Créez une nouvelle demande si besoin.`,
            lien: `/client/demandes-express/${demandeId}`,
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // 4. Notification artisan (demande expirée, artisan libéré)
          if (demande.artisanId) {
            batch.set(admin.firestore().collection('notifications').doc(), {
              recipientId: demande.artisanId,
              type: 'acceptation_expiree',
              titre: '✅ Demande expirée - Vous êtes libéré',
              message: "Le client n'a pas payé dans les délais. La demande est expirée et sera supprimée automatiquement. Vous êtes libre pour d'autres interventions.",
              lien: `/artisan/demandes-express/${demandeId}`,
              isRead: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          // Commit batch
          await batch.commit();

          console.log(`✅ Demande ${demandeId} expirée définitivement (sera supprimée dans 24h)`);

        } catch (error) {
          console.error(`❌ Erreur traitement demande ${demandeId}:`, error);
        }
      });

      await Promise.all(promises);

      console.log(`✅ Watchdog terminé: ${promises.length} demande(s) traitée(s)`);
      return null;

    } catch (error) {
      console.error('❌ Erreur watchdog paiements express:', error);
      throw error;
    }
  });

/**
 * Version HTTP pour tests manuels
 * URL: https://europe-west1-{PROJECT_ID}.cloudfunctions.net/checkPaymentDeadlinesManual
 */
export const checkPaymentDeadlinesManual = functions
  .region('europe-west1')
  .https
  .onRequest(async (req, res) => {
    console.log('🧪 Mode test manuel - Watchdog paiements express');

    try {
      const now = admin.firestore.Timestamp.now();

      const snapshot = await admin.firestore()
        .collection('demandes_express')
        .where('statut', '==', 'acceptee')
        .where('paymentDeadline', '<', now)
        .get();

      if (snapshot.empty) {
        res.status(200).json({
          success: true,
          message: 'Aucune demande expirée trouvée',
          count: 0,
        });
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      const details: any[] = [];

      for (const doc of snapshot.docs) {
        const demandeId = doc.id;
        const demande = doc.data();

        try {
          // Récupérer proposition acceptée
          const propositionsSnap = await admin.firestore()
            .collection('propositions_express')
            .where('demandeId', '==', demandeId)
            .where('statut', '==', 'acceptee')
            .get();

          if (propositionsSnap.empty) {
            // Nettoyer incohérence - expirer définitivement
            await doc.ref.update({
              statut: 'expiree',
              expireeAt: admin.firestore.FieldValue.serverTimestamp(),
              paymentDeadline: null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            errorCount++;
            details.push({
              demandeId,
              status: 'error',
              reason: 'Proposition acceptée introuvable',
            });
            continue;
          }

          const propositionDoc = propositionsSnap.docs[0];
          const batch = admin.firestore().batch();

          // Mise à jour - expirer définitivement
          batch.update(propositionDoc.ref, {
            statut: 'expiree',
            expiredAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          batch.update(doc.ref, {
            statut: 'expiree',
            expireeAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            paymentDeadline: null,
          });

          // Notifications
          const delaiMinutes = demande.urgence === 'immediat' ? 15 : 30;
          batch.set(admin.firestore().collection('notifications').doc(), {
            recipientId: demande.clientId,
            type: 'paiement_expire',
            titre: '❌ Demande expirée',
            message: `Vous n'avez pas payé dans les délais (${delaiMinutes} min). La demande est expirée et sera supprimée automatiquement dans 24h. Créez une nouvelle demande si besoin.`,
            lien: `/client/demandes-express/${demandeId}`,
            isRead: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          if (demande.artisanId) {
            batch.set(admin.firestore().collection('notifications').doc(), {
              recipientId: demande.artisanId,
              type: 'acceptation_expiree',
              titre: '✅ Demande expirée - Vous êtes libéré',
              message: "Le client n'a pas payé dans les délais. La demande est expirée et sera supprimée automatiquement. Vous êtes libre pour d'autres interventions.",
              lien: `/artisan/demandes-express/${demandeId}`,
              isRead: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          await batch.commit();
          successCount++;
          details.push({
            demandeId,
            status: 'success',
            urgence: demande.urgence,
            delaiMinutes,
          });

        } catch (error: any) {
          errorCount++;
          details.push({
            demandeId,
            status: 'error',
            error: error.message,
          });
        }
      }

      res.status(200).json({
        success: true,
        message: 'Watchdog manuel exécuté',
        total: snapshot.size,
        successCount,
        errorCount,
        details,
      });

    } catch (error: any) {
      console.error('❌ Erreur watchdog manuel:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });
