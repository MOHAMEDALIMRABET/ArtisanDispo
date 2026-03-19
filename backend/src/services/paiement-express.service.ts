import admin from '../config/firebase-admin';

const db = admin.firestore();
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Service backend pour les paiements express
 * Gère les transactions Stripe et la collection paiements_express
 */

// ====================================
// Types
// ====================================

export interface PaiementExpress {
  id: string;
  demandeId: string;
  propositionId: string;
  clientId: string;
  artisanId: string;
  stripePaymentIntentId: string;
  montant: number;
  commission: number;
  montantArtisan: number;
  statut: 'paye' | 'libere' | 'rembourse';
  createdAt: any;
  paidAt?: any;
  releasedAt?: any;
  refundedAt?: any;
  walletTransactionId?: string;
}

interface CreatePaiementExpressData {
  demandeId: string;
  propositionId: string;
  clientId: string;
  artisanId: string;
  stripePaymentIntentId: string;
  montant: number;
  commission: number;
  montantArtisan: number;
  statut: 'paye';
}

// ====================================
// Création paiement
// ====================================

export async function createPaiementExpress(data: CreatePaiementExpressData) {
  try {
    // Pré-générer les IDs pour l'opération atomique
    const paiementRef = db.collection('paiements_express').doc();
    const walletTxRef = db.collection('walletTransactions').doc();
    const walletRef   = db.collection('wallets').doc(data.artisanId);

    const batch = db.batch();

    // 1. Document paiements_express (avec référence vers la walletTransaction)
    batch.set(paiementRef, {
      ...data,
      walletTransactionId: walletTxRef.id,
      createdAt: FieldValue.serverTimestamp(),
      paidAt: FieldValue.serverTimestamp(),
    });

    // 2. WalletTransaction — séquestre en attente de libération
    batch.set(walletTxRef, {
      artisanId: data.artisanId,
      type: 'credit',
      montant: data.montant,
      statut: 'pending',
      description: 'Paiement express reçu en séquestre',
      demandeId: data.demandeId,
      stripePaymentIntentId: data.stripePaymentIntentId,
      createdAt: FieldValue.serverTimestamp(),
      metadata: {
        phase: 'sequestre',
        type: 'express',
        commission: data.commission,
        montantArtisan: data.montantArtisan,
      },
    });

    // 3. Wallet artisan — incrémenter soldeEnAttente (upsert)
    const walletDoc = await walletRef.get();
    if (walletDoc.exists) {
      const w = walletDoc.data()!;
      batch.update(walletRef, {
        soldeEnAttente: (w.soldeEnAttente || 0) + data.montant,
        soldeTotal:     (w.soldeTotal     || 0) + data.montant,
        updatedAt:       FieldValue.serverTimestamp(),
        lastTransaction: FieldValue.serverTimestamp(),
      });
    } else {
      batch.set(walletRef, {
        artisanId:              data.artisanId,
        soldeDisponible:        0,
        soldeEnAttente:         data.montant,
        soldeTotal:             data.montant,
        totalEncaisse:          0,
        totalRetire:            0,
        totalCommission:        0,
        stripeOnboardingStatus: 'not_started',
        ibanVerified:           false,
        createdAt:              FieldValue.serverTimestamp(),
        updatedAt:              FieldValue.serverTimestamp(),
        lastTransaction:        FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    console.log(`💳 Paiement express créé: ${paiementRef.id}`);
    console.log(`   - Montant total:    ${data.montant}€`);
    console.log(`   - Commission (10%): ${data.commission}€`);
    console.log(`   - Montant artisan:  ${data.montantArtisan}€`);
    console.log(`   - Wallet séquestre: +${data.montant}€`);

    return paiementRef.id;
  } catch (error) {
    console.error('Erreur createPaiementExpress:', error);
    throw error;
  }
}

// ====================================
// Récupération paiement
// ====================================

export async function getPaiementByDemandeId(demandeId: string): Promise<PaiementExpress | null> {
  try {
    const snapshot = await db.collection('paiements_express')
      .where('demandeId', '==', demandeId)
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return null;
    }
    
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as PaiementExpress;
  } catch (error) {
    console.error('Erreur getPaiementByDemandeId:', error);
    throw error;
  }
}

export async function getPaiementByPropositionId(propositionId: string): Promise<PaiementExpress | null> {
  try {
    const snapshot = await db.collection('paiements_express')
      .where('propositionId', '==', propositionId)
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return null;
    }
    
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as PaiementExpress;
  } catch (error) {
    console.error('Erreur getPaiementByPropositionId:', error);
    throw error;
  }
}

// ====================================
// Mise à jour statut paiement
// ====================================

export async function updatePaiementStatut(
  paiementId: string,
  statut: 'libere' | 'rembourse',
  additionalData?: any
) {
  try {
    const updateData: any = {
      statut,
      updatedAt: FieldValue.serverTimestamp(),
      ...additionalData,
    };

    await db.collection('paiements_express').doc(paiementId).update(updateData);
    
    console.log(`✅ Paiement ${paiementId} → statut: ${statut}`);
    
    return true;
  } catch (error) {
    console.error('Erreur updatePaiementStatut:', error);
    throw error;
  }
}

// ====================================
// Capture paiement (libérer escrow)
// ====================================

export async function markPaiementLibere(paiementId: string, stripeChargeId: string) {
  try {
    // Récupérer le paiement pour accéder aux données wallet
    const paiementDoc = await db.collection('paiements_express').doc(paiementId).get();
    if (!paiementDoc.exists) throw new Error(`Paiement ${paiementId} introuvable`);
    const paiement = paiementDoc.data() as PaiementExpress;

    const batch = db.batch();

    // 1. Mettre à jour paiements_express
    batch.update(db.collection('paiements_express').doc(paiementId), {
      statut: 'libere',
      stripeChargeId,
      releasedAt: FieldValue.serverTimestamp(),
      updatedAt:  FieldValue.serverTimestamp(),
    });

    // 2. WalletTransaction séquestre → completed
    if (paiement.walletTransactionId) {
      batch.update(db.collection('walletTransactions').doc(paiement.walletTransactionId), {
        statut:      'completed',
        completedAt: FieldValue.serverTimestamp(),
      });
    }

    // 3. Transaction commission plateforme (10%)
    const commissionTxRef = db.collection('walletTransactions').doc();
    batch.set(commissionTxRef, {
      artisanId:             paiement.artisanId,
      type:                  'commission',
      montant:               paiement.commission,
      statut:                'completed',
      description:           'Commission plateforme express (10%)',
      demandeId:             paiement.demandeId,
      stripePaymentIntentId: paiement.stripePaymentIntentId,
      createdAt:             FieldValue.serverTimestamp(),
      completedAt:           FieldValue.serverTimestamp(),
      metadata:              { type: 'express', taux: 0.10 },
    });

    // 4. Wallet artisan : soldeEnAttente → soldeDisponible (net après commission)
    const walletRef = db.collection('wallets').doc(paiement.artisanId);
    const walletDoc = await walletRef.get();
    if (walletDoc.exists) {
      const w = walletDoc.data()!;
      batch.update(walletRef, {
        soldeEnAttente:  Math.max(0, (w.soldeEnAttente  || 0) - paiement.montant),
        soldeDisponible: (w.soldeDisponible || 0) + paiement.montantArtisan,
        // soldeTotal perd la commission (déduite de la plateforme)
        soldeTotal:      Math.max(0, (w.soldeTotal || 0) - paiement.commission),
        totalEncaisse:   (w.totalEncaisse   || 0) + paiement.montantArtisan,
        totalCommission: (w.totalCommission || 0) + paiement.commission,
        updatedAt:       FieldValue.serverTimestamp(),
        lastTransaction: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    console.log(`💰 Paiement ${paiementId} libéré (charge: ${stripeChargeId})`);
    console.log(`   - Montant artisan → soldeDisponible: +${paiement.montantArtisan}€`);
    console.log(`   - Commission retenue: ${paiement.commission}€`);
  } catch (error) {
    console.error('Erreur markPaiementLibere:', error);
    throw error;
  }
}

// ====================================
// Remboursement
// ====================================

export async function markPaiementRembourse(paiementId: string) {
  try {
    // Récupérer le paiement pour accéder aux données wallet
    const paiementDoc = await db.collection('paiements_express').doc(paiementId).get();
    if (!paiementDoc.exists) throw new Error(`Paiement ${paiementId} introuvable`);
    const paiement = paiementDoc.data() as PaiementExpress;

    const batch = db.batch();

    // 1. Mettre à jour paiements_express
    batch.update(db.collection('paiements_express').doc(paiementId), {
      statut:     'rembourse',
      refundedAt: FieldValue.serverTimestamp(),
      updatedAt:  FieldValue.serverTimestamp(),
    });

    // 2. WalletTransaction séquestre → cancelled
    if (paiement.walletTransactionId) {
      batch.update(db.collection('walletTransactions').doc(paiement.walletTransactionId), {
        statut:      'cancelled',
        completedAt: FieldValue.serverTimestamp(),
      });
    }

    // 3. Transaction remboursement
    const remboursementTxRef = db.collection('walletTransactions').doc();
    batch.set(remboursementTxRef, {
      artisanId:             paiement.artisanId,
      type:                  'remboursement',
      montant:               paiement.montant,
      statut:                'completed',
      description:           'Remboursement client — paiement express annulé',
      demandeId:             paiement.demandeId,
      stripePaymentIntentId: paiement.stripePaymentIntentId,
      createdAt:             FieldValue.serverTimestamp(),
      completedAt:           FieldValue.serverTimestamp(),
      metadata:              { type: 'express' },
    });

    // 4. Wallet artisan : décrémenter soldeEnAttente
    const walletRef = db.collection('wallets').doc(paiement.artisanId);
    const walletDoc = await walletRef.get();
    if (walletDoc.exists) {
      const w = walletDoc.data()!;
      batch.update(walletRef, {
        soldeEnAttente: Math.max(0, (w.soldeEnAttente || 0) - paiement.montant),
        soldeTotal:     Math.max(0, (w.soldeTotal     || 0) - paiement.montant),
        updatedAt:       FieldValue.serverTimestamp(),
        lastTransaction: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();

    console.log(`💸 Paiement ${paiementId} remboursé`);
    console.log(`   - Wallet séquestre: -${paiement.montant}€`);
  } catch (error) {
    console.error('Erreur markPaiementRembourse:', error);
    throw error;
  }
}
