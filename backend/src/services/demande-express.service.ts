import admin from '../config/firebase-admin';

const db = admin.firestore();
import { Timestamp } from 'firebase-admin/firestore';

/**
 * Service backend pour les demandes express
 * Utilisé par les routes Stripe et Cloud Functions
 */

// ====================================
// Types
// ====================================

export interface PropositionExpress {
  id: string;
  demandeId: string;
  artisanId: string;
  clientId: string;
  montantPropose: number;
  delaiRealisation: string;
  message?: string;
  statut: 'envoyee' | 'acceptee' | 'refusee';
  createdAt: any;
}

export interface DemandeExpress {
  id: string;
  clientId: string;
  categorie: string;
  description: string;
  ville: string;
  codePostal: string;
  statut: string;
  createdAt: any;
}

// ====================================
// Récupération données
// ====================================

export async function getPropositionExpressById(id: string): Promise<PropositionExpress | null> {
  try {
    const doc = await db.collection('propositions_express').doc(id).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() } as PropositionExpress;
  } catch (error) {
    console.error('Erreur getPropositionExpressById:', error);
    throw error;
  }
}

export async function getDemandeExpressById(id: string): Promise<DemandeExpress | null> {
  try {
    const doc = await db.collection('demandes_express').doc(id).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() } as DemandeExpress;
  } catch (error) {
    console.error('Erreur getDemandeExpressById:', error);
    throw error;
  }
}

// ====================================
// Mise à jour statuts
// ====================================

export async function markDemandePaid(demandeId: string) {
  try {
    // Récupérer la demande pour obtenir artisanId et le montant
    const demandeDoc = await db.collection('demandes_express').doc(demandeId).get();
    const demande = demandeDoc.exists ? (demandeDoc.data() as any) : null;

    // Marquer la demande comme payée
    await db.collection('demandes_express').doc(demandeId).update({
      statut: 'payee',
      updatedAt: Timestamp.now(),
    });

    // Envoyer une notification à l'artisan pour l'informer que le paiement est confirmé
    if (demande?.artisanId) {
      const montant = demande.montantPropose ?? demande.montantAccepte ?? null;
      const montantStr = montant ? ` (${montant}€ sécurisé)` : '';

      await db.collection('notifications').add({
        userId: demande.artisanId,
        type: 'paiement_recu_express',
        titre: '💰 Paiement client confirmé',
        message: `Le client a effectué le paiement${montantStr}. Vous pouvez démarrer l'intervention.`,
        lien: `/artisan/demandes-express/${demandeId}`,
        lue: false,
        dateCreation: Timestamp.now(),
      });
      console.log(`🔔 Notification envoyée à l'artisan ${demande.artisanId}`);
    }

    console.log(`✅ Demande ${demandeId} marquée comme payée`);
  } catch (error) {
    console.error('Erreur markDemandePaid:', error);
    throw error;
  }
}

export async function updateDemandeStatut(demandeId: string, statut: string) {
  try {
    await db.collection('demandes_express').doc(demandeId).update({
      statut,
      updatedAt: Timestamp.now(),
    });
    console.log(`✅ Demande ${demandeId} → statut: ${statut}`);
  } catch (error) {
    console.error('Erreur updateDemandeStatut:', error);
    throw error;
  }
}
