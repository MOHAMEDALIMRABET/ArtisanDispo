/**
 * Routes Webhooks Stripe
 * 
 * Reçoit et traite les événements Stripe pour sécuriser les paiements
 * CRITIQUE : Valide signature webhook pour éviter fraude
 * 
 * Événements gérés :
 * - payment_intent.amount_capturable_updated : Paiement autorisé (escrow bloqué)
 * - payment_intent.payment_failed : Paiement échoué
 * - charge.captured : Paiement capturé (escrow libéré)
 * - transfer.created : Transfert artisan effectué
 */

import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const router = Router();
const db = getFirestore();

// Initialiser Stripe seulement si configuré
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
let stripe: Stripe | null = null;

if (STRIPE_SECRET_KEY) {
  stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2026-01-28.clover',
  });
}

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

/**
 * POST /api/v1/webhooks/stripe
 * 
 * Endpoint webhook Stripe - Synchronisation paiements
 * 
 * IMPORTANT : Ce endpoint doit recevoir le raw body (pas de JSON parsing)
 * Configuration dans server.ts : express.raw({ type: 'application/json' })
 */
router.post('/stripe', async (req: Request, res: Response) => {
  // Vérifier que Stripe est configuré
  if (!stripe) {
    console.error('❌ Webhook: Stripe non configuré');
    return res.status(503).json({
      error: 'Service de paiement non configuré',
      details: 'STRIPE_SECRET_KEY manquante'
    });
  }

  const sig = req.headers['stripe-signature'] as string;

  if (!sig) {
    console.error('❌ Webhook: Signature manquante');
    return res.status(400).send('Signature manquante');
  }

  let event: Stripe.Event;

  try {
    // ✅ Vérifier signature webhook (SÉCURITÉ CRITIQUE)
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err: any) {
    console.error('❌ Webhook signature invalide:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`📨 Webhook reçu: ${event.type} - ${event.id}`);

  // Traiter événements selon type
  try {
    switch (event.type) {
      case 'payment_intent.amount_capturable_updated':
        // Paiement autorisé (escrow bloqué)
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentAuthorized(paymentIntent);
        break;

      case 'payment_intent.payment_failed':
        // Paiement échoué
        const failedIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentFailed(failedIntent);
        break;

      case 'charge.captured':
        // Paiement capturé (escrow libéré)
        const charge = event.data.object as Stripe.Charge;
        await handlePaymentCaptured(charge);
        break;

      case 'transfer.created':
        // Transfert artisan effectué
        const transfer = event.data.object as Stripe.Transfer;
        await handleTransferCreated(transfer);
        break;

      case 'payment_intent.canceled':
        // PaymentIntent annulé
        const canceledIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentCanceled(canceledIntent);
        break;

      default:
        console.log(`ℹ️ Événement non géré: ${event.type}`);
    }

    res.status(200).json({ received: true });

  } catch (error: any) {
    console.error(`❌ Erreur traitement webhook ${event.type}:`, error);
    res.status(500).json({ error: 'Erreur traitement webhook' });
  }
});

/**
 * Paiement autorisé (escrow bloqué)
 * 
 * Appelé quand le client paie avec succès
 * L'argent est BLOQUÉ (pas encore capturé)
 */
async function handlePaymentAuthorized(paymentIntent: Stripe.PaymentIntent) {
  const devisId = paymentIntent.metadata.devisId;
  const clientId = paymentIntent.metadata.clientId;
  const artisanId = paymentIntent.metadata.artisanId;
  const montant = paymentIntent.amount / 100;

  if (!devisId) {
    console.error('❌ Webhook: devisId manquant dans metadata');
    return;
  }

  console.log(`✅ Paiement autorisé (webhook): ${paymentIntent.id} - Devis: ${devisId} - ${montant}€`);

  try {
    // Récupérer infos devis pour enrichir la transaction wallet
    const devisDoc = await db.collection('devis').doc(devisId).get();
    const devisData = devisDoc.data();
    const numeroDevis = devisData?.numeroDevis || devisId;
    const clientNom = devisData?.client
      ? `${devisData.client.prenom || ''} ${devisData.client.nom || ''}`.trim()
      : '';

    // Mettre à jour devis (SÉCURISÉ côté serveur)
    await db.collection('devis').doc(devisId).update({
      statut: 'paye',
      datePaiement: Timestamp.now(),
      'paiement.statut': 'bloque',
      'paiement.stripe.paymentIntentId': paymentIntent.id,
      'paiement.montant': montant,
      'paiement.dateBlocage': Timestamp.now()
    });

    // ✅ Mettre à jour le wallet artisan (solde en séquestre)
    await updateWalletSequestre(artisanId, devisId, montant, paymentIntent.id, clientNom, numeroDevis);

    // Créer notification artisan
    await db.collection('notifications').add({
      recipientId: artisanId,
      type: 'devis_paye',
      title: '💰 Devis payé',
      message: `Le client a payé le devis ${numeroDevis}. ${montant.toFixed(2)}€ sont bloqués en séquestre.`,
      relatedId: devisId,
      isRead: false,
      createdAt: Timestamp.now()
    });

    console.log(`✅ Devis ${devisId} mis à jour: statut=paye | Wallet séquestre +${montant}€`);

  } catch (error) {
    console.error('❌ Erreur mise à jour devis:', error);
  }
}

/**
 * Mise à jour wallet séquestre lors d'un paiement client
 * Incrémente soldeEnAttente + crée une WalletTransaction pending
 */
async function updateWalletSequestre(
  artisanId: string,
  devisId: string,
  montant: number,
  paymentIntentId: string,
  clientNom?: string,
  numeroDevis?: string
) {
  const walletRef = db.collection('wallets').doc(artisanId);
  const walletDoc = await walletRef.get();

  if (!walletDoc.exists) {
    // Créer wallet si inexistant (premier paiement de l'artisan)
    await walletRef.set({
      artisanId,
      soldeDisponible: 0,
      soldeEnAttente: montant,
      soldeTotal: montant,
      totalEncaisse: 0,
      totalRetire: 0,
      totalCommission: 0,
      stripeOnboardingStatus: 'not_started',
      ibanVerified: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      lastTransaction: Timestamp.now(),
    });
    console.log(`✅ Wallet créé pour artisan ${artisanId} avec séquestre de ${montant}€`);
  } else {
    const wallet = walletDoc.data()!;
    await walletRef.update({
      soldeEnAttente: (wallet.soldeEnAttente || 0) + montant,
      soldeTotal: (wallet.soldeTotal || 0) + montant,
      updatedAt: Timestamp.now(),
      lastTransaction: Timestamp.now(),
    });
    console.log(`✅ Wallet artisan ${artisanId} mis à jour: séquestre +${montant}€`);
  }

  // Créer la transaction wallet (pending = en attente de libération)
  const description = [
    'Paiement reçu en séquestre',
    clientNom ? `— ${clientNom}` : '',
    numeroDevis ? `(${numeroDevis})` : '',
  ].filter(Boolean).join(' ');

  await db.collection('walletTransactions').add({
    artisanId,
    type: 'credit',
    montant,
    statut: 'pending',
    description,
    devisId,
    stripePaymentIntentId: paymentIntentId,
    createdAt: Timestamp.now(),
    metadata: {
      phase: 'sequestre',
      clientNom: clientNom || null,
      devisNumero: numeroDevis || null,
    }
  });
  console.log(`✅ WalletTransaction créée: ${montant}€ en séquestre pour devis ${devisId}`);
}

/**
 * Paiement échoué
 * 
 * Appelé quand le paiement échoue (carte refusée, fonds insuffisants, etc.)
 */
async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const devisId = paymentIntent.metadata.devisId;
  const clientId = paymentIntent.metadata.clientId;

  if (!devisId) return;

  console.log(`❌ Paiement échoué (webhook): ${paymentIntent.id} - Devis: ${devisId}`);

  try {
    // Mettre à jour devis
    await db.collection('devis').doc(devisId).update({
      'paiement.statut': 'echec',
      'paiement.erreur': paymentIntent.last_payment_error?.message || 'Paiement échoué',
      'paiement.dateEchec': Timestamp.now()
    });

    // Créer notification client
    await db.collection('notifications').add({
      recipientId: clientId,
      type: 'paiement_echec',
      title: '❌ Paiement échoué',
      message: `Le paiement a échoué. Veuillez réessayer avec une autre carte.`,
      relatedId: devisId,
      isRead: false,
      createdAt: Timestamp.now()
    });

    console.log(`✅ Devis ${devisId} mis à jour: paiement échoué`);

  } catch (error) {
    console.error('❌ Erreur notification échec paiement:', error);
  }
}

/**
 * Paiement capturé (escrow libéré)
 * 
 * Appelé quand le paiement est capturé (après validation travaux)
 * L'argent est maintenant CAPTURE (transaction finalisée)
 */
async function handlePaymentCaptured(charge: Stripe.Charge) {
  const paymentIntentId = charge.payment_intent as string;

  console.log(`💰 Paiement capturé (webhook): ${charge.id} - PaymentIntent: ${paymentIntentId}`);

  try {
    // Rechercher contrat par paymentIntentId
    const contratsSnapshot = await db.collection('contrats')
      .where('paiement.stripe.paymentIntentId', '==', paymentIntentId)
      .limit(1)
      .get();

    if (contratsSnapshot.empty) {
      console.log(`ℹ️ Aucun contrat trouvé pour PaymentIntent: ${paymentIntentId}`);
      return;
    }

    const contratDoc = contratsSnapshot.docs[0];
    const contratId = contratDoc.id;

    // Confirmer capture dans Firestore
    await db.collection('contrats').doc(contratId).update({
      'paiement.stripe.chargeId': charge.id,
      'paiement.stripe.captureDate': Timestamp.now(),
      'paiement.statut': 'libere',
      'paiement.dateLiberation': Timestamp.now()
    });

    console.log(`✅ Contrat ${contratId} mis à jour: paiement capturé`);

  } catch (error) {
    console.error('❌ Erreur mise à jour capture:', error);
  }
}

/**
 * Transfert artisan créé
 * 
 * Appelé quand l'argent est transféré au compte Stripe Connect de l'artisan
 */
async function handleTransferCreated(transfer: Stripe.Transfer) {
  const contratId = transfer.metadata.contratId;
  const artisanId = transfer.metadata.artisanId;
  const montant = transfer.amount / 100;

  if (!contratId) {
    console.log('ℹ️ Transfer sans contratId dans metadata');
    return;
  }

  console.log(`💸 Transfert artisan créé (webhook): ${transfer.id} - Contrat: ${contratId} - ${montant}€`);

  try {
    // Mettre à jour contrat
    await db.collection('contrats').doc(contratId).update({
      'paiement.stripe.transferId': transfer.id,
      'paiement.dateVirement': Timestamp.now(),
      'paiement.montantTransfere': montant
    });

    // ✅ Wallet : déplacer soldeDisponible → totalRetire (Stripe a bien viré l'argent sur compte bancaire)
    if (artisanId) {
      const walletRef = db.collection('wallets').doc(artisanId);
      const walletDoc = await walletRef.get();
      if (walletDoc.exists) {
        const wallet = walletDoc.data()!;
        const soldeDisponible = wallet.soldeDisponible || 0;
        const deduction = Math.min(soldeDisponible, montant); // Ne pas descendre sous 0
        await walletRef.update({
          soldeDisponible: Math.max(0, soldeDisponible - deduction),
          soldeTotal: Math.max(0, (wallet.soldeTotal || 0) - deduction),
          totalRetire: (wallet.totalRetire || 0) + deduction,
          updatedAt: Timestamp.now(),
          lastTransaction: Timestamp.now(),
        });
        // Créer transaction de type debit
        await db.collection('walletTransactions').add({
          artisanId,
          type: 'debit',
          montant: deduction,
          statut: 'completed',
          description: `Virement Stripe vers compte bancaire`,
          stripeTransferId: transfer.id,
          createdAt: Timestamp.now(),
          completedAt: Timestamp.now(),
          metadata: { automatic: true, transferStripe: true, contratId },
        });
        console.log(`✅ Wallet artisan ${artisanId} : soldeDisponible -${deduction}€ → totalRetire`);
      }
    }

    // Créer notification artisan
    await db.collection('notifications').add({
      recipientId: artisanId,
      type: 'paiement_recu',
      title: '💸 Paiement reçu',
      message: `Votre paiement de ${montant.toFixed(2)}€ a été transféré. Il apparaîtra sous 1-2 jours ouvrés sur votre compte bancaire.`,
      relatedId: contratId,
      isRead: false,
      createdAt: Timestamp.now()
    });

    console.log(`✅ Transfert ${transfer.id} enregistré pour contrat ${contratId}`);

  } catch (error) {
    console.error('❌ Erreur mise à jour transfert:', error);
  }
}

/**
 * PaymentIntent annulé
 * 
 * Appelé quand le paiement est annulé (timeout 24h ou annulation manuelle)
 */
async function handlePaymentCanceled(paymentIntent: Stripe.PaymentIntent) {
  const devisId = paymentIntent.metadata.devisId;

  if (!devisId) return;

  console.log(`🔙 Paiement annulé (webhook): ${paymentIntent.id} - Devis: ${devisId}`);

  try {
    // Mettre à jour devis
    await db.collection('devis').doc(devisId).update({
      statut: 'annule',
      'paiement.statut': 'annule',
      'paiement.dateAnnulation': Timestamp.now()
    });

    console.log(`✅ Devis ${devisId} mis à jour: paiement annulé`);

  } catch (error) {
    console.error('❌ Erreur mise à jour annulation:', error);
  }
}

export default router;
