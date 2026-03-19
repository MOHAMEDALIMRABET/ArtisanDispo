/**
 * Cloud Function schedulée : Nettoyage automatique des demandes expirées
 * 
 * OBJECTIF :
 * Supprimer définitivement les demandes expirées (timeout paiement) après 24h
 * Nettoyage base de données + protection artisan contre abandons
 * 
 * WORKFLOW :
 * 1. Demande acceptée → Client ne paie pas dans délai (15/30 min) → statut='expiree'
 * 2. Après 24h → Cette fonction supprime demande + proposition + notifications
 * 3. Préservation messages (archivage légal)
 * 
 * SCHEDULE : Tous les jours à 4h du matin (heure creuse)
 * 
 * CREATED: 2026-03-19
 * AUTHOR: ArtisanSafe Team
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Fonction schedulée : Suppression automatique demandes expirées > 24h
 * 
 * Cron: Tous les jours à 4h00 (Europe/Paris)
 * Query: demandes_express où statut='expiree' ET expireeAt < (now - 24h)
 * Actions:
 *  - Supprime document demande_express
 *  - Supprime proposition(s) associée(s)
 *  - Supprime notifications liées (timeout uniquement)
 *  - PRÉSERVE messages (archivage légal conversations)
 */
export const cleanupExpiredDemandesExpress = functions
  .region('europe-west1')
  .pubsub.schedule('every day 04:00')
  .timeZone('Europe/Paris')
  .onRun(async (context) => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const cutoffDate = new admin.firestore.Timestamp(
      now.seconds - (24 * 60 * 60), // 24 heures en secondes
      now.nanoseconds
    );

    console.log('🧹 Démarrage nettoyage demandes expirées');
    console.log(`⏰ Cutoff date: ${cutoffDate.toDate().toISOString()}`);

    try {
      // Trouver toutes les demandes expirées depuis > 24h
      const expiredDemandesSnapshot = await db
        .collection('demandes_express')
        .where('statut', '==', 'expiree')
        .where('expireeAt', '<', cutoffDate) // Expirées il y a plus de 24h
        .get();

      if (expiredDemandesSnapshot.empty) {
        console.log('✅ Aucune demande expirée à nettoyer');
        return null;
      }

      console.log(`📊 ${expiredDemandesSnapshot.size} demande(s) à supprimer`);

      let deletedDemandes = 0;
      let deletedPropositions = 0;
      let deletedNotifications = 0;

      // Traiter chaque demande expirée
      for (const demandeDoc of expiredDemandesSnapshot.docs) {
        const demandeId = demandeDoc.id;
        const demandeData = demandeDoc.data();

        console.log(`\n🗑️ Suppression demande: ${demandeId}`);
        console.log(`   Client: ${demandeData.clientId}`);
        console.log(`   Artisan: ${demandeData.artisanId}`);
        console.log(`   Expirée le: ${demandeData.expireeAt?.toDate()?.toISOString()}`);

        try {
          // Créer batch pour opérations atomiques
          const batch = db.batch();

          // 1. Supprimer la demande principale
          batch.delete(demandeDoc.ref);
          deletedDemandes++;

          // 2. Supprimer toutes les propositions associées
          const propositionsSnapshot = await db
            .collection('propositions_express')
            .where('demandeId', '==', demandeId)
            .get();

          propositionsSnapshot.docs.forEach((propDoc) => {
            batch.delete(propDoc.ref);
            deletedPropositions++;
            console.log(`   ✓ Suppression proposition: ${propDoc.id}`);
          });

          // 3. Supprimer notifications de timeout uniquement (pas toutes)
          const notificationsSnapshot = await db
            .collection('notifications')
            .where('relatedId', '==', demandeId)
            .where('type', 'in', ['paiement_expire', 'acceptation_expiree'])
            .get();

          notificationsSnapshot.docs.forEach((notifDoc) => {
            batch.delete(notifDoc.ref);
            deletedNotifications++;
            console.log(`   ✓ Suppression notification: ${notifDoc.id}`);
          });

          // 4. PRÉSERVER les messages (archivage légal)
          // 💡 Les messages restent accessibles pour l'historique
          // Ils ne sont PAS supprimés lors du cleanup

          // Exécuter batch
          await batch.commit();

          console.log(`   ✅ Demande ${demandeId} supprimée avec succès`);

        } catch (error) {
          console.error(`   ❌ Erreur suppression demande ${demandeId}:`, error);
          // Continuer avec les autres demandes malgré l'erreur
        }
      }

      // Résumé final
      console.log('\n📊 RÉSUMÉ NETTOYAGE:');
      console.log(`   ✓ ${deletedDemandes} demande(s) supprimée(s)`);
      console.log(`   ✓ ${deletedPropositions} proposition(s) supprimée(s)`);
      console.log(`   ✓ ${deletedNotifications} notification(s) supprimée(s)`);
      console.log('   💬 Messages préservés (archivage légal)');
      console.log('✅ Nettoyage terminé avec succès\n');

      return {
        success: true,
        deletedDemandes,
        deletedPropositions,
        deletedNotifications,
        processedAt: now.toDate().toISOString(),
      };

    } catch (error) {
      console.error('❌ Erreur lors du nettoyage:', error);
      throw error;
    }
  });

/**
 * Version HTTP pour testing manuel (non programmée)
 * 
 * URL de test (après déploiement):
 * https://europe-west1-<PROJECT_ID>.cloudfunctions.net/cleanupExpiredDemandesExpressManual
 * 
 * Exemple:
 * curl -X POST https://europe-west1-artisansafe-dev.cloudfunctions.net/cleanupExpiredDemandesExpressManual
 * 
 * SÉCURITÉ: À sécuriser avec Firebase Auth en production
 */
export const cleanupExpiredDemandesExpressManual = functions
  .region('europe-west1')
  .https.onRequest(async (req, res) => {
    // Vérifier méthode POST
    if (req.method !== 'POST') {
      res.status(405).send({ error: 'Méthode non autorisée. Utilisez POST.' });
      return;
    }

    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();
    const cutoffDate = new admin.firestore.Timestamp(
      now.seconds - (24 * 60 * 60),
      now.nanoseconds
    );

    console.log('🧹 [MANUEL] Démarrage nettoyage demandes expirées');

    try {
      const expiredDemandesSnapshot = await db
        .collection('demandes_express')
        .where('statut', '==', 'expiree')
        .where('expireeAt', '<', cutoffDate)
        .get();

      if (expiredDemandesSnapshot.empty) {
        const response = {
          success: true,
          message: 'Aucune demande expirée à nettoyer',
          deletedDemandes: 0,
          deletedPropositions: 0,
          deletedNotifications: 0,
        };
        console.log('✅ Aucune demande à nettoyer');
        res.status(200).json(response);
        return;
      }

      console.log(`📊 ${expiredDemandesSnapshot.size} demande(s) à supprimer`);

      let deletedDemandes = 0;
      let deletedPropositions = 0;
      let deletedNotifications = 0;

      for (const demandeDoc of expiredDemandesSnapshot.docs) {
        const demandeId = demandeDoc.id;

        console.log(`🗑️ Suppression demande: ${demandeId}`);

        try {
          const batch = db.batch();

          // Supprimer demande
          batch.delete(demandeDoc.ref);
          deletedDemandes++;

          // Supprimer propositions
          const propositionsSnapshot = await db
            .collection('propositions_express')
            .where('demandeId', '==', demandeId)
            .get();

          propositionsSnapshot.docs.forEach((propDoc) => {
            batch.delete(propDoc.ref);
            deletedPropositions++;
          });

          // Supprimer notifications timeout
          const notificationsSnapshot = await db
            .collection('notifications')
            .where('relatedId', '==', demandeId)
            .where('type', 'in', ['paiement_expire', 'acceptation_expiree'])
            .get();

          notificationsSnapshot.docs.forEach((notifDoc) => {
            batch.delete(notifDoc.ref);
            deletedNotifications++;
          });

          await batch.commit();
          console.log(`✅ Demande ${demandeId} supprimée`);

        } catch (error) {
          console.error(`❌ Erreur suppression ${demandeId}:`, error);
        }
      }

      const response = {
        success: true,
        message: 'Nettoyage terminé avec succès',
        deletedDemandes,
        deletedPropositions,
        deletedNotifications,
        processedAt: now.toDate().toISOString(),
      };

      console.log('✅ Nettoyage manuel terminé:', response);
      res.status(200).json(response);

    } catch (error) {
      console.error('❌ Erreur nettoyage manuel:', error);
      res.status(500).json({
        success: false,
        error: 'Erreur lors du nettoyage',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });
