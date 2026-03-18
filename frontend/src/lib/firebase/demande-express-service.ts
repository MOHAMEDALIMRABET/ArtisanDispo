/**
 * Service Firestore pour les demandes de travaux express (< 150€)
 * ArtisanDispo - Workflow simplifié sans devis formel
 */

import { db } from './config';
import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  Timestamp,
  QueryConstraint,
} from 'firebase/firestore';
import type {
  DemandeExpress,
  DemandeExpressStatut,
  PropositionExpress,
  Categorie,
} from '@/types/firestore';
import { createNotification } from './notification-service';

/**
 * Créer une demande de travaux express
 */
export async function createDemandeExpress(
  data: Omit<DemandeExpress, 'id' | 'statut' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  // Validation budget max 150€
  if (data.budgetPropose && data.budgetPropose > 150) {
    throw new Error('Le budget ne peut pas dépasser 150€ pour un travail express');
  }

  const demandeData = {
    ...data,
    typeProjet: 'express' as const,
    statut: 'en_attente_proposition' as const,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    // Auto-expiration selon l'urgence : immediat=2h, urgent=6h (intervention dans 24h → l'artisan doit avoir le temps d'intervenir)
    expiresAt: Timestamp.fromDate(new Date(Date.now() + (
      data.urgence === 'immediat' ? 2 * 60 * 60 * 1000 :
      6 * 60 * 60 * 1000
    ))),  
  };

  // Firestore refuse les valeurs undefined → les remplacer par null (récursif)
  function sanitizeForFirestore(obj: any): any {
    if (obj === undefined) return null;
    if (obj === null || typeof obj !== 'object' || obj instanceof Date) return obj;
    if ('toDate' in obj) return obj; // Timestamp Firestore
    if (Array.isArray(obj)) return obj.map(sanitizeForFirestore); // Préserver les tableaux
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, sanitizeForFirestore(v)])
    );
  }
  const sanitized = sanitizeForFirestore(demandeData);

  const docRef = await addDoc(collection(db, 'demandes_express'), sanitized);

  // Notifier artisan si demande directe
  if (data.artisanId) {
    await createNotification(data.artisanId, {
      type: 'nouvelle_demande_express',
      titre: 'Nouvelle demande express',
      message: `${data.description.slice(0, 80)}... - ${data.ville}`,
      lien: `/artisan/demandes-express/${docRef.id}`,
    });
  }

  return docRef.id;
}

/**
 * Récupérer une demande express par ID
 */
export async function getDemandeExpressById(demandeId: string): Promise<DemandeExpress | null> {
  const docSnap = await getDoc(doc(db, 'demandes_express', demandeId));
  
  if (!docSnap.exists()) {
    return null;
  }

  return {
    id: docSnap.id,
    ...docSnap.data(),
  } as DemandeExpress;
}

/**
 * Récupérer les demandes express d'un client
 */
export async function getDemandesExpressByClient(clientId: string): Promise<DemandeExpress[]> {
  // Pas d'orderBy → évite l'index composite Firestore, tri côté client
  const q = query(
    collection(db, 'demandes_express'),
    where('clientId', '==', clientId)
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as DemandeExpress))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

/**
 * Récupérer les demandes express pour un artisan
 */
export async function getDemandesExpressByArtisan(artisanId: string): Promise<DemandeExpress[]> {
  // Pas d'orderBy → évite l'index composite Firestore, tri côté client
  const q = query(
    collection(db, 'demandes_express'),
    where('artisanId', '==', artisanId)
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as DemandeExpress))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

/**
 * Créer une proposition pour une demande express
 */
export async function createPropositionExpress(
  data: Omit<PropositionExpress, 'id' | 'statut' | 'createdAt'>
): Promise<string> {
  // Validation montant max 150€
  if (data.montantPropose > 150) {
    throw new Error('Le montant ne peut pas dépasser 150€ pour un travail express');
  }

  // Vérifier que la demande existe et est en attente
  const demande = await getDemandeExpressById(data.demandeId);
  if (!demande) {
    throw new Error('Demande introuvable');
  }

  if (demande.statut !== 'en_attente_proposition') {
    throw new Error('Cette demande a déjà reçu une proposition ou est terminée');
  }

  const propositionData = {
    ...data,
    statut: 'en_attente_acceptation' as const,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, 'propositions_express'), propositionData);

  // Mettre à jour la demande
  await updateDoc(doc(db, 'demandes_express', data.demandeId), {
    statut: 'proposition_recue',
    updatedAt: Timestamp.now(),
  });

  // Notifier le client
  await createNotification(data.clientId, {
    type: 'proposition_express_recue',
    titre: 'Nouvelle proposition reçue',
    message: `L'artisan vous propose ${data.montantPropose}€ TTC`,
    lien: `/client/demandes-express/${data.demandeId}`,
  });

  return docRef.id;
}

/**
 * Récupérer une proposition express par ID
 */
export async function getPropositionExpressById(propositionId: string): Promise<PropositionExpress | null> {
  const docSnap = await getDoc(doc(db, 'propositions_express', propositionId));
  
  if (!docSnap.exists()) {
    return null;
  }

  return {
    id: docSnap.id,
    ...docSnap.data(),
  } as PropositionExpress;
}

/**
 * Récupérer les propositions pour une demande
 */
export async function getPropositionsByDemande(demandeId: string): Promise<PropositionExpress[]> {
  // Pas d'orderBy → évite l'index composite Firestore, tri côté client
  const q = query(
    collection(db, 'propositions_express'),
    where('demandeId', '==', demandeId)
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as PropositionExpress))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

/**
 * Accepter une proposition (avant paiement)
 */
export async function acceptPropositionExpress(propositionId: string): Promise<void> {
  const proposition = await getPropositionExpressById(propositionId);
  if (!proposition) {
    throw new Error('Proposition introuvable');
  }

  if (proposition.statut !== 'en_attente_acceptation') {
    throw new Error('Cette proposition ne peut plus être acceptée');
  }

  // Mettre à jour la proposition
  await updateDoc(doc(db, 'propositions_express', propositionId), {
    statut: 'acceptee',
    acceptedAt: Timestamp.now(),
  });

  // Mettre à jour la demande
  await updateDoc(doc(db, 'demandes_express', proposition.demandeId), {
    statut: 'acceptee',
    updatedAt: Timestamp.now(),
  });

  // Notifier l'artisan
  await createNotification(proposition.artisanId, {
    type: 'proposition_acceptee',
    titre: 'Proposition acceptée !',
    message: 'Le client a accepté votre proposition. En attente du paiement.',
    lien: `/artisan/demandes-express/${proposition.demandeId}`,
  });
}

/**
 * Refuser une proposition
 */
export async function refusePropositionExpress(
  propositionId: string,
  motifRefus?: string
): Promise<void> {
  const proposition = await getPropositionExpressById(propositionId);
  if (!proposition) {
    throw new Error('Proposition introuvable');
  }

  if (proposition.statut !== 'en_attente_acceptation') {
    throw new Error('Cette proposition ne peut plus être refusée');
  }

  // Mettre à jour la proposition
  await updateDoc(doc(db, 'propositions_express', propositionId), {
    statut: 'refusee',
    refusedAt: Timestamp.now(),
    motifRefus: motifRefus || 'Non spécifié',
  });

  // Remettre la demande en attente
  await updateDoc(doc(db, 'demandes_express', proposition.demandeId), {
    statut: 'en_attente_proposition',
    updatedAt: Timestamp.now(),
  });

  // Notifier l'artisan
  await createNotification(proposition.artisanId, {
    type: 'proposition_refusee',
    titre: 'Proposition refusée',
    message: motifRefus || 'Le client a refusé votre proposition',
    lien: `/artisan/demandes-express/${proposition.demandeId}`,
  });
}

/**
 * Envoyer une contre-proposition au lieu de simplement refuser
 * Le client propose un montant différent et un message à l'artisan
 */
export async function sendContrePropositionExpress(
  propositionId: string,
  montantCounter: number,
  messageClient: string
): Promise<void> {
  const proposition = await getPropositionExpressById(propositionId);
  if (!proposition) {
    throw new Error('Proposition introuvable');
  }

  if (proposition.statut !== 'en_attente_acceptation') {
    throw new Error('Cette proposition ne peut plus être négociée');
  }

  // Marquer la proposition comme refusée avec le détail de la contre-prop
  const motif = `[CONTRE-PROPOSITION] Budget souhaité : ${montantCounter}€\nMessage : ${messageClient}`;

  await updateDoc(doc(db, 'propositions_express', propositionId), {
    statut: 'refusee',
    refusedAt: Timestamp.now(),
    motifRefus: motif,
    contrePropositionMontant: montantCounter,
    contrePropositionMessage: messageClient,
  });

  // Remettre la demande en attente de proposition
  await updateDoc(doc(db, 'demandes_express', proposition.demandeId), {
    statut: 'en_attente_proposition',
    updatedAt: Timestamp.now(),
  });

  // Notifier l'artisan avec les détails de la contre-proposition
  await createNotification(proposition.artisanId, {
    type: 'contre_proposition_recue',
    titre: '💬 Contre-proposition reçue',
    message: `Le client propose ${montantCounter}€ au lieu de ${proposition.montantPropose}€. Message : ${messageClient.slice(0, 80)}`,
    lien: `/artisan/demandes-express/${proposition.demandeId}`,
  });
}

/**
 * Marquer une demande comme payée (appelé après confirmation Stripe)
 */
export async function markDemandePaid(demandeId: string): Promise<void> {
  const demande = await getDemandeExpressById(demandeId);
  if (!demande) {
    throw new Error('Demande introuvable');
  }

  await updateDoc(doc(db, 'demandes_express', demandeId), {
    statut: 'payee',
    updatedAt: Timestamp.now(),
  });

  // Notifier l'artisan que le paiement est reçu
  if (demande.artisanId) {
    await createNotification(demande.artisanId, {
      type: 'paiement_recu_express',
      titre: 'Intervention confirmée',
      message: 'Le client a payé. Vous pouvez intervenir.',
      lien: `/artisan/demandes-express/${demandeId}`,
    });
  }
}

/**
 * Marquer une intervention comme en cours
 */
export async function markInterventionEnCours(demandeId: string): Promise<void> {
  await updateDoc(doc(db, 'demandes_express', demandeId), {
    statut: 'en_cours',
    updatedAt: Timestamp.now(),
  });
}

/**
 * Marquer une intervention comme terminée
 */
export async function markInterventionTerminee(demandeId: string): Promise<void> {
  const demande = await getDemandeExpressById(demandeId);
  if (!demande) {
    throw new Error('Demande introuvable');
  }

  await updateDoc(doc(db, 'demandes_express', demandeId), {
    statut: 'terminee',
    updatedAt: Timestamp.now(),
  });

  // Notifier le client pour qu'il laisse un avis
  await createNotification(demande.clientId, {
    type: 'demande_avis_express',
    titre: 'Travaux terminés',
    message: 'Donnez votre avis sur cette intervention',
    lien: `/client/demandes-express/${demandeId}`,
  });
}

/**
 * Annuler une demande express
 */
export async function cancelDemandeExpress(demandeId: string, userId: string): Promise<void> {
  const demande = await getDemandeExpressById(demandeId);
  if (!demande) {
    throw new Error('Demande introuvable');
  }

  // Vérifier que l'utilisateur est bien le client ou l'artisan
  if (demande.clientId !== userId && demande.artisanId !== userId) {
    throw new Error('Vous n\'êtes pas autorisé à annuler cette demande');
  }

  // Ne pas annuler si déjà payée
  if (demande.statut === 'payee' || demande.statut === 'en_cours' || demande.statut === 'terminee') {
    throw new Error('Cette demande ne peut plus être annulée');
  }

  await updateDoc(doc(db, 'demandes_express', demandeId), {
    statut: 'annulee',
    updatedAt: Timestamp.now(),
  });

  // Notifier l'autre partie
  const recipientId = demande.clientId === userId ? demande.artisanId : demande.clientId;
  if (recipientId) {
    await createNotification(recipientId, {
      type: 'demande_annulee',
      titre: 'Demande annulée',
      message: 'La demande express a été annulée',
      lien: demande.clientId === userId ? `/artisan/demandes-express/${demandeId}` : `/client/demandes-express/${demandeId}`,
    });
  }
}

/**
 * Mettre à jour le statut d'une demande express
 */
export async function updateDemandeExpressStatut(
  demandeId: string,
  statut: DemandeExpressStatut
): Promise<void> {
  await updateDoc(doc(db, 'demandes_express', demandeId), {
    statut,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Supprimer définitivement une demande express (après expiration prolongée)
 */
export async function deleteDemandeExpress(demandeId: string): Promise<void> {
  await deleteDoc(doc(db, 'demandes_express', demandeId));
}

/**
 * Refuser une demande express côté artisan
 */
export async function refuserDemandeExpressParArtisan(demandeId: string, artisanId: string): Promise<void> {
  const demande = await getDemandeExpressById(demandeId);
  if (!demande) throw new Error('Demande introuvable');
  if (demande.artisanId && demande.artisanId !== artisanId) throw new Error('Non autorisé');
  if (demande.statut !== 'en_attente_proposition') throw new Error('Cette demande ne peut plus être refusée');

  await updateDoc(doc(db, 'demandes_express', demandeId), {
    statut: 'refusee_artisan',
    updatedAt: Timestamp.now(),
  });

  await createNotification(demande.clientId, {
    type: 'demande_refusee',
    titre: 'Demande refusée',
    message: 'Un artisan n\'est pas disponible pour votre demande express. Vous pouvez en contacter un autre.',
    lien: `/client/demandes-express`,
  });
}
