/**
 * Service de gestion du wallet artisan
 * 
 * ⚠️ IMPORTANT : Le wallet est un SUIVI UNIQUEMENT
 * Les paiements sont gérés automatiquement par Stripe Connect :
 * 
 * 1. Client paie → Argent en séquestre Stripe
 * 2. Travaux terminés → Argent libéré automatiquement
 * 3. Stripe transfère vers compte bancaire artisan (automatique)
 * 
 * Le wallet affiche :
 * - Historique des transactions
 * - Montants en attente (séquestre)
 * - Montants transférés
 * - Statistiques globales
 */

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs,
  setDoc, 
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  increment,
  Timestamp
} from 'firebase/firestore';
import { db } from './config';
import type { 
  Wallet, 
  WalletTransaction, 
  WalletTransactionType,
  WalletTransactionStatut,
  VirementRequest,
  VirementRequestStatut
} from '@/types/firestore';

// ============================================
// CONSTANTES
// ============================================

/** Taux de commission plateforme : 8% prélevés sur chaque paiement libéré */
export const TAUX_COMMISSION = 0.08;

// ============================================
// GESTION WALLET
// ============================================

/**
 * Créer un wallet pour un artisan
 */
export async function createWallet(artisanId: string): Promise<Wallet> {
  const walletRef = doc(db, 'wallets', artisanId);
  
  const walletData: Wallet = {
    id: artisanId,
    artisanId,
    soldeDisponible: 0,
    soldeEnAttente: 0,   // Montant en séquestre Stripe
    soldeTotal: 0,
    totalEncaisse: 0,    // Total net artisan encaissé (après commission 8%)
    totalRetire: 0,      // Total transféré par Stripe vers compte bancaire
    totalCommission: 0,  // Total commissions plateforme prélevées (8%)
    stripeOnboardingStatus: 'not_started', // Onboarding pas encore commencé
    ibanVerified: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  
  await setDoc(walletRef, walletData);
  return walletData;
}

/**
 * Récupérer le wallet d'un artisan
 */
export async function getWalletByArtisanId(artisanId: string): Promise<Wallet | null> {
  try {
    const walletRef = doc(db, 'wallets', artisanId);
    const walletSnap = await getDoc(walletRef);
    
    if (!walletSnap.exists()) {
      // Créer un wallet si n'existe pas
      console.log('Wallet inexistant, création automatique pour:', artisanId);
      return await createWallet(artisanId);
    }
    
    return {
      id: walletSnap.id,
      ...walletSnap.data()
    } as Wallet;
  } catch (error) {
    console.error('Erreur récupération wallet:', error);
    return null;
  }
}

/**
 * Mettre à jour le Stripe Connect Account ID
 */
export async function updateWalletStripeAccount(
  artisanId: string, 
  stripeAccountId: string
): Promise<void> {
  const walletRef = doc(db, 'wallets', artisanId);
  await updateDoc(walletRef, {
    stripeAccountId,
    updatedAt: Timestamp.now()
  });
}

// ============================================
// TRANSACTIONS (Suivi uniquement)
// ============================================

/**
 * Enregistrer une transaction de paiement client
 * Appelé quand un client paie un devis (argent en séquestre)
 */
export async function recordPaiementClient(
  artisanId: string,
  contratId: string,
  devisId: string,
  montant: number,
  stripePaymentIntentId: string,
  clientNom?: string,
  devisNumero?: string
): Promise<WalletTransaction> {
  // Idempotence: eviter le double comptage si paiement traite par plusieurs chemins.
  const existingQ = query(
    collection(db, 'walletTransactions'),
    where('artisanId', '==', artisanId)
  );
  const existingSnap = await getDocs(existingQ);
  const existingPendingSequestre = existingSnap.docs
    .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as WalletTransaction))
    .find(tx =>
      tx.statut === 'pending' &&
      tx.metadata?.phase === 'sequestre' &&
      tx.devisId === devisId
    );

  if (existingPendingSequestre) {
    console.log(`ℹ️ Séquestre déjà enregistré pour devis ${devisId}, écriture ignorée.`);
    return existingPendingSequestre;
  }

  const walletRef = doc(db, 'wallets', artisanId);

  // setDoc avec merge=true : crée le wallet si inexistant, sinon incrémente
  // Evite toute lecture préalable (pas de permission read pour le client)
  await setDoc(walletRef, {
    artisanId,
    soldeEnAttente: increment(montant),
    soldeTotal: increment(montant),
    // Champs initiaux si document créé pour la première fois
    soldeDisponible: increment(0),
    totalEncaisse: increment(0),
    totalRetire: increment(0),
    totalCommission: increment(0),
    stripeOnboardingStatus: 'not_started',
    ibanVerified: false,
    updatedAt: Timestamp.now(),
    lastTransaction: Timestamp.now(),
  }, { merge: true });

  // Créer la transaction
  const transactionData: Omit<WalletTransaction, 'id'> = {
    artisanId,
    type: 'credit',
    montant,
    statut: 'pending', // En attente de validation travaux
    description: `Paiement reçu${clientNom ? ` — ${clientNom}` : ''}${devisNumero ? ` (${devisNumero})` : ''}`,
    contratId,
    devisId,
    stripePaymentIntentId,
    createdAt: Timestamp.now(),
    metadata: {
      phase: 'sequestre',
      clientNom: clientNom || null,
      devisNumero: devisNumero || null,
    }
  };
  
  const transactionRef = await addDoc(collection(db, 'walletTransactions'), transactionData);
  
  return {
    id: transactionRef.id,
    ...transactionData
  } as WalletTransaction;
}

/**
 * Enregistrer la libération d'un paiement
 * Appelé quand les travaux sont validés (Stripe transfère automatiquement)
 * 
 * 💰 COMMISSION PLATEFORME (8%) :
 *   - Phase MVP  : Suivi comptable uniquement dans Firestore
 *   - Phase 2    : Vraie commission via Stripe Connect Transfer
 * 
 * Le montant TTC est divisé en :
 *   - 8%  → Commission plateforme (reste sur compte ArtisanDispo)
 *   - 92% → Net artisan (transféré vers compte bancaire artisan)
 * 
 * 📊 Impacts Wallet :
 *   soldeEnAttente   -= montantBrut (retire du séquestre)
 *   soldeDisponible  += montantArtisan (92%)
 *   soldeTotal       -= commission (8% quitte le système)
 *   totalEncaisse    += montantArtisan (CHIFFRE D'AFFAIRES)
 *   totalCommission  += commission (cumul commissions prélevées)
 * 
 * 🔄 TODO Phase 2 Stripe Connect :
 *   1. Appeler /api/v1/payments/release-escrow depuis validerTravaux()
 *   2. Le backend fera : capture PaymentIntent + Transfer 92% vers artisan
 *   3. Les 8% resteront automatiquement dans le compte plateforme Stripe
 */
export async function recordPaiementLibere(
  artisanId: string,
  contratId: string,
  montantBrut: number, // Montant TTC brut (avant commission)
  stripeTransferId: string
): Promise<WalletTransaction> {
  const walletRef = doc(db, 'wallets', artisanId);
  
  // ✅ FIX PERMISSIONS : Utiliser increment() au lieu de lire le wallet
  // Permet au client de mettre à jour sans avoir besoin de lire d'abord
  
  // Calcul de la commission plateforme (8%)
  const commission = Math.round(montantBrut * TAUX_COMMISSION * 100) / 100;
  const montantArtisan = Math.round((montantBrut - commission) * 100) / 100;

  // Rechercher les transactions séquestre pending liées à ce contrat/devis
  const pendingQ = query(
    collection(db, 'walletTransactions'),
    where('artisanId', '==', artisanId)
  );
  const pendingSnap = await getDocs(pendingQ);
  const pendingSequestreTx = pendingSnap.docs
    .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as WalletTransaction))
    .filter(tx =>
      tx.statut === 'pending' &&
      tx.metadata?.phase === 'sequestre' &&
      (tx.contratId === contratId || tx.devisId === contratId)
    );

  const montantPendingTotal = pendingSequestreTx.reduce((sum, tx) => sum + (tx.montant || 0), 0);
  const montantSequestreADeduire = montantPendingTotal > 0 ? montantPendingTotal : montantBrut;
  
  console.log(`💰 Libération paiement: ${montantBrut}€ TTC → ${montantArtisan}€ net artisan + ${commission}€ commission plateforme`);

  // Mettre à jour le wallet :
  //   - Retirer le montant brut du séquestre
  //   - Ajouter le montant NET (après commission) au disponible et au total encaissé
  //   - soldeTotal diminue de la commission (quitte le système vers la plateforme)
  //   - Incrémenter le cumul de commissions
  await updateDoc(walletRef, {
    soldeEnAttente: increment(-montantSequestreADeduire),
    soldeDisponible: increment(montantArtisan),
    soldeTotal: increment(-commission),
    totalEncaisse: increment(montantArtisan),
    totalCommission: increment(commission),
    updatedAt: Timestamp.now(),
    lastTransaction: Timestamp.now(),
  });

  // Fermer les transactions séquestre liées pour garder une vue cohérente.
  await Promise.all(
    pendingSequestreTx.map(tx =>
      updateDoc(doc(db, 'walletTransactions', tx.id), {
        statut: 'completed' as WalletTransactionStatut,
        completedAt: Timestamp.now(),
        metadata: {
          ...(tx.metadata || {}),
          phase: 'libere',
          releasedBy: 'client_validation',
        },
      })
    )
  );

  // Transaction commission (débit invisible pour la plateforme)
  await addDoc(collection(db, 'walletTransactions'), {
    artisanId,
    type: 'commission' as WalletTransactionType,
    montant: commission,
    statut: 'completed' as WalletTransactionStatut,
    description: `Commission plateforme 8% — ${montantBrut.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € TTC`,
    contratId,
    createdAt: Timestamp.now(),
    completedAt: Timestamp.now(),
    metadata: {
      taux: TAUX_COMMISSION,
      montantBrut,
      montantArtisan,
    },
  });

  // Transaction principale : crédit NET artisan
  const transactionData: Omit<WalletTransaction, 'id'> = {
    artisanId,
    type: 'credit',
    montant: montantArtisan,
    statut: 'completed',
    description: `Paiement libéré — net après commission 8% (${montantBrut.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € TTC)`,
    contratId,
    stripeTransferId,
    createdAt: Timestamp.now(),
    completedAt: Timestamp.now(),
    metadata: {
      phase: 'libere',
      transferAutoStripe: true,
      montantBrut,
      commission,
      taux: TAUX_COMMISSION,
    },
  };

  const transactionRef = await addDoc(collection(db, 'walletTransactions'), transactionData);

  return {
    id: transactionRef.id,
    ...transactionData,
  } as WalletTransaction;
}

/**
 * Enregistrer un transfert Stripe vers compte bancaire
 * Appelé automatiquement par webhook Stripe quand le virement est effectué
 */
export async function recordTransfertStripe(
  artisanId: string,
  montant: number,
  stripeTransferId: string
): Promise<WalletTransaction> {
  const walletRef = doc(db, 'wallets', artisanId);
  const wallet = await getWalletByArtisanId(artisanId);
  
  if (!wallet) {
    throw new Error('Wallet introuvable');
  }
  
  // Mettre à jour le wallet : retirer du disponible, ajouter au total retiré
  await updateDoc(walletRef, {
    soldeDisponible: Math.max(0, wallet.soldeDisponible - montant),
    totalRetire: wallet.totalRetire + montant,
    soldeTotal: Math.max(0, wallet.soldeTotal - montant),
    updatedAt: Timestamp.now(),
    lastTransaction: Timestamp.now()
  });
  
  // Créer la transaction
  const transactionData: Omit<WalletTransaction, 'id'> = {
    artisanId,
    type: 'debit',
    montant,
    statut: 'completed',
    description: `Virement Stripe vers compte bancaire`,
    stripeTransferId,
    createdAt: Timestamp.now(),
    completedAt: Timestamp.now(),
    metadata: {
      automatic: true,
      transferStripe: true
    }
  };
  
  const transactionRef = await addDoc(collection(db, 'walletTransactions'), transactionData);
  
  return {
    id: transactionRef.id,
    ...transactionData
  } as WalletTransaction;
}

/**
 * Enregistrer un remboursement (litige)
 */
export async function recordRemboursement(
  artisanId: string,
  contratId: string,
  montant: number,
  stripeRefundId: string,
  raison: string
): Promise<WalletTransaction> {
  const walletRef = doc(db, 'wallets', artisanId);
  const wallet = await getWalletByArtisanId(artisanId);
  
  if (!wallet) {
    throw new Error('Wallet introuvable');
  }
  
  // Mettre à jour le wallet : retirer de l'attente ou du disponible
  const newSoldeEnAttente = Math.max(0, wallet.soldeEnAttente - montant);
  const resteARembourser = montant - (wallet.soldeEnAttente - newSoldeEnAttente);
  const newSoldeDisponible = Math.max(0, wallet.soldeDisponible - resteARembourser);
  
  await updateDoc(walletRef, {
    soldeEnAttente: newSoldeEnAttente,
    soldeDisponible: newSoldeDisponible,
    soldeTotal: wallet.soldeTotal - montant,
    updatedAt: Timestamp.now(),
    lastTransaction: Timestamp.now()
  });
  
  // Créer la transaction
  const transactionData: Omit<WalletTransaction, 'id'> = {
    artisanId,
    type: 'remboursement',
    montant,
    statut: 'completed',
    description: `Remboursement client : ${raison}`,
    contratId,
    stripePaymentIntentId: stripeRefundId,
    createdAt: Timestamp.now(),
    completedAt: Timestamp.now(),
    metadata: {
      raison
    }
  };
  
  const transactionRef = await addDoc(collection(db, 'walletTransactions'), transactionData);
  
  return {
    id: transactionRef.id,
    ...transactionData
  } as WalletTransaction;
}

/**
 * Récupérer les transactions en séquestre (pending, phase=sequestre)
 * Enrichies avec clientNom et devisNumero depuis les metadata
 */
export async function getSequestreTransactions(artisanId: string): Promise<WalletTransaction[]> {
  try {
    // Un seul where() pour éviter l'index composite Firestore
    // Filtrage statut + phase côté client
    const q = query(
      collection(db, 'walletTransactions'),
      where('artisanId', '==', artisanId)
    );
    const snapshot = await getDocs(q);
    const transactions = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as WalletTransaction))
      .filter(t => t.statut === 'pending' && t.metadata?.phase === 'sequestre');

    // Tri côté client
    return transactions.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
  } catch (error) {
    console.error('Erreur récupération séquestre:', error);
    return [];
  }
}

/**
 * Récupérer les transactions d'un artisan
 */
export async function getWalletTransactions(
  artisanId: string,
  limitCount: number = 50
): Promise<WalletTransaction[]> {
  try {
    const q = query(
      collection(db, 'walletTransactions'),
      where('artisanId', '==', artisanId)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as WalletTransaction))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
      .slice(0, limitCount);
  } catch (error) {
    console.error('Erreur récupération transactions:', error);
    return [];
  }
}

/**
 * Récupérer une transaction spécifique
 */
export async function getWalletTransactionById(transactionId: string): Promise<WalletTransaction | null> {
  try {
    const transactionRef = doc(db, 'walletTransactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    
    if (!transactionSnap.exists()) {
      return null;
    }
    
    return {
      id: transactionSnap.id,
      ...transactionSnap.data()
    } as WalletTransaction;
  } catch (error) {
    console.error('Erreur récupération transaction:', error);
    return null;
  }
}

// ============================================
// VIREMENT MANUEL
// ============================================

const VIREMENT_MIN = 10; // Montant minimum en euros

/**
 * Créer une demande de virement manuel
 * L'artisan demande à transférer une partie de son solde disponible vers son compte bancaire.
 * Le montant est réservé immédiatement (déduit du soldeDisponible).
 */
export async function requestManualVirement(
  artisanId: string,
  montant: number,
  note?: string
): Promise<{ success: boolean; requestId?: string; error?: string }> {
  try {
    const wallet = await getWalletByArtisanId(artisanId);

    if (!wallet) {
      return { success: false, error: 'Wallet introuvable' };
    }
    if (wallet.stripeOnboardingStatus !== 'active') {
      return { success: false, error: 'Compte bancaire non configuré. Complétez votre onboarding Stripe.' };
    }
    if (montant < VIREMENT_MIN) {
      return { success: false, error: `Le montant minimum est de ${VIREMENT_MIN} €` };
    }
    if (montant > wallet.soldeDisponible) {
      return { success: false, error: 'Solde disponible insuffisant' };
    }

    // Réserver le montant : déduire du solde disponible
    const walletRef = doc(db, 'wallets', artisanId);
    await updateDoc(walletRef, {
      soldeDisponible: wallet.soldeDisponible - montant,
      soldeTotal: wallet.soldeTotal - montant,
      updatedAt: Timestamp.now(),
      lastTransaction: Timestamp.now(),
    });

    // Créer la transaction wallet (type: debit, statut: pending)
    const transactionData: Omit<WalletTransaction, 'id'> = {
      artisanId,
      type: 'debit',
      montant,
      statut: 'pending',
      description: `Virement manuel demandé${note ? ` — ${note}` : ''}`,
      createdAt: Timestamp.now(),
      metadata: { manualVirement: true, note: note || null },
    };
    const txRef = await addDoc(collection(db, 'walletTransactions'), transactionData);

    // Créer la demande de virement
    const requestData: Omit<VirementRequest, 'id'> = {
      artisanId,
      montant,
      statut: 'pending',
      ibanLast4: wallet.ibanLast4 || undefined,
      note: note || undefined,
      walletTransactionId: txRef.id,
      createdAt: Timestamp.now(),
    };
    const requestRef = await addDoc(collection(db, 'virementRequests'), requestData);

    return { success: true, requestId: requestRef.id };
  } catch (error) {
    console.error('Erreur demande virement:', error);
    return { success: false, error: 'Une erreur est survenue. Veuillez réessayer.' };
  }
}

/**
 * Annuler une demande de virement en attente
 * Recrédite le solde disponible.
 */
export async function cancelVirementRequest(
  artisanId: string,
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const requestRef = doc(db, 'virementRequests', requestId);
    const requestSnap = await getDoc(requestRef);

    if (!requestSnap.exists()) {
      return { success: false, error: 'Demande introuvable' };
    }

    const requestData = requestSnap.data() as VirementRequest;

    if (requestData.artisanId !== artisanId) {
      return { success: false, error: 'Non autorisé' };
    }
    if (requestData.statut !== 'pending') {
      return { success: false, error: 'Seules les demandes en attente peuvent être annulées' };
    }

    // Annuler la demande
    await updateDoc(requestRef, {
      statut: 'cancelled' as VirementRequestStatut,
      cancelledAt: Timestamp.now(),
    });

    // Recréditer le solde disponible
    const wallet = await getWalletByArtisanId(artisanId);
    if (wallet) {
      const walletRef = doc(db, 'wallets', artisanId);
      await updateDoc(walletRef, {
        soldeDisponible: wallet.soldeDisponible + requestData.montant,
        soldeTotal: wallet.soldeTotal + requestData.montant,
        updatedAt: Timestamp.now(),
      });
    }

    // Mettre à jour la transaction wallet associée
    if (requestData.walletTransactionId) {
      const txRef = doc(db, 'walletTransactions', requestData.walletTransactionId);
      await updateDoc(txRef, { statut: 'cancelled' as WalletTransactionStatut });
    }

    return { success: true };
  } catch (error) {
    console.error('Erreur annulation virement:', error);
    return { success: false, error: 'Une erreur est survenue. Veuillez réessayer.' };
  }
}

/**
 * Récupérer les demandes de virement d'un artisan (triées par date desc)
 */
export async function getVirementRequests(
  artisanId: string,
  limitCount: number = 10
): Promise<VirementRequest[]> {
  try {
    const q = query(
      collection(db, 'virementRequests'),
      where('artisanId', '==', artisanId)
    );
    const snapshot = await getDocs(q);
    const requests = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
    } as VirementRequest));

    // Tri côté client (évite index composite Firestore)
    return requests
      .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
      .slice(0, limitCount);
  } catch (error) {
    console.error('Erreur récupération virements:', error);
    return [];
  }
}

// ============================================
// STATISTIQUES & UTILITAIRES
// ============================================

/**
 * Calculer les statistiques du wallet
 */
export async function getWalletStats(artisanId: string): Promise<{
  soldeDisponible: number;
  soldeEnAttente: number;
  totalEncaisse: number;
  totalRetire: number;
  totalCommission: number;
  nombreTransactions: number;
}> {
  const wallet = await getWalletByArtisanId(artisanId);
  
  if (!wallet) {
    return {
      soldeDisponible: 0,
      soldeEnAttente: 0,
      totalEncaisse: 0,
      totalRetire: 0,
      totalCommission: 0,
      nombreTransactions: 0,
    };
  }
  
  // Compter les transactions
  const q = query(
    collection(db, 'walletTransactions'),
    where('artisanId', '==', artisanId)
  );
  const snapshot = await getDocs(q);
  
  return {
    soldeDisponible: wallet.soldeDisponible,
    soldeEnAttente: wallet.soldeEnAttente,
    totalEncaisse: wallet.totalEncaisse,
    totalRetire: wallet.totalRetire,
    totalCommission: wallet.totalCommission || 0,
    nombreTransactions: snapshot.size,
  };
}

/**
 * Obtenir un résumé du wallet pour affichage
 */
export async function getWalletSummary(artisanId: string): Promise<{
  wallet: Wallet | null;
  stats: {
    soldeDisponible: number;
    soldeEnAttente: number;
    totalEncaisse: number;
    totalRetire: number;
    totalCommission: number;
    nombreTransactions: number;
  };
  recentTransactions: WalletTransaction[];
}> {
  const wallet = await getWalletByArtisanId(artisanId);
  const stats = await getWalletStats(artisanId);
  // Charger toutes les transactions (pas de limite) pour que les filtres
  // "Chiffre d'affaires" et "Séquestre" affichent l'historique complet.
  // getWalletTransactions lit déjà tous les docs Firestore avant de slicer en JS,
  // donc le coût réseau est identique quelle que soit la limite passée.
  const recentTransactions = await getWalletTransactions(artisanId, 10000);
  
  return {
    wallet,
    stats,
    recentTransactions
  };
}
