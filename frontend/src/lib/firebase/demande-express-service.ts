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
  NegociationRound,
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
    // Fenêtre pour que l'artisan réponde : immediat=1h (laisse 1h pour intervenir), urgent=6h
    expiresAt: Timestamp.fromDate(new Date(Date.now() + (
      data.urgence === 'immediat' ? 60 * 60 * 1000 :      // 1h — urgence totale
      6 * 60 * 60 * 1000                                 // 6h — intervention dans 24h
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

  // Mettre à jour la demande + nouvelle deadline de réponse pour le client
  await updateDoc(doc(db, 'demandes_express', data.demandeId), {
    statut: 'proposition_recue',
    updatedAt: Timestamp.now(),
    // Phase 2 : le client doit répondre rapidement (remplace l'ancienne fenêtre artisan)
    expiresAt: Timestamp.fromDate(new Date(Date.now() + (
      demande.urgence === 'immediat' ? 30 * 60 * 1000 :  // 30min — client urgent
      3 * 60 * 60 * 1000                                  // 3h — client non-urgent
    ))),
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

  if (proposition.statut !== 'en_attente_acceptation' && proposition.statut !== 'proposition_finale_artisan') {
    throw new Error('Cette proposition ne peut plus être acceptée');
  }

  // Récupérer la demande pour connaître l'urgence
  const demande = await getDemandeExpressById(proposition.demandeId);
  if (!demande) {
    throw new Error('Demande introuvable');
  }

  // Calculer deadline selon urgence :
  // - immediat (intervention 2h) → 15 minutes pour payer
  // - urgent (intervention 24h) → 30 minutes pour payer
  const delaiMinutes = demande.urgence === 'immediat' ? 15 : 30;
  const paymentDeadline = Timestamp.fromDate(new Date(Date.now() + delaiMinutes * 60 * 1000));

  // Mettre à jour la proposition
  await updateDoc(doc(db, 'propositions_express', propositionId), {
    statut: 'acceptee',
    acceptedAt: Timestamp.now(),
  });

  // Mettre à jour la demande avec deadline
  await updateDoc(doc(db, 'demandes_express', proposition.demandeId), {
    statut: 'acceptee',
    updatedAt: Timestamp.now(),
    paymentDeadline,
  });

  // Notifier l'artisan
  await createNotification(proposition.artisanId, {
    type: 'proposition_acceptee',
    titre: 'Proposition acceptée !',
    message: `Le client a accepté votre proposition. En attente du paiement (${delaiMinutes} min).`,
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

  if (proposition.statut !== 'en_attente_acceptation' && proposition.statut !== 'proposition_finale_artisan') {
    throw new Error('Cette proposition ne peut plus être refusée');
  }

  // Charger la demande pour recalculer la fenêtre d'expiration artisan
  const demandeForRefus = await getDemandeExpressById(proposition.demandeId);
  const expiresAtAfterRefus = Timestamp.fromDate(new Date(Date.now() + (
    demandeForRefus?.urgence === 'immediat' ? 60 * 60 * 1000 : 6 * 60 * 60 * 1000
  )));

  // Mettre à jour la proposition
  await updateDoc(doc(db, 'propositions_express', propositionId), {
    statut: 'refusee',
    refusedAt: Timestamp.now(),
    motifRefus: motifRefus || 'Non spécifié',
  });

  // Remettre la demande en attente avec une nouvelle fenêtre d'expiration fraîche
  await updateDoc(doc(db, 'demandes_express', proposition.demandeId), {
    statut: 'en_attente_proposition',
    updatedAt: Timestamp.now(),
    expiresAt: expiresAtAfterRefus,
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
 * Round 2 — Client envoie une contre-proposition (ne ferme pas la négociation)
 * La proposition passe en 'en_negociation' — l'artisan doit répondre.
 */
export async function sendContrePropositionExpress(
  propositionId: string,
  montantCounter: number,
  messageClient: string
): Promise<void> {
  const proposition = await getPropositionExpressById(propositionId);
  if (!proposition) throw new Error('Proposition introuvable');
  if (proposition.statut !== 'en_attente_acceptation') throw new Error('Cette proposition ne peut plus être négociée');

  const newRound: NegociationRound = {
    auteur: 'client',
    montant: montantCounter,
    message: messageClient,
    createdAt: Timestamp.now(),
  };
  const rounds = [...(proposition.rounds || []), newRound];

  await updateDoc(doc(db, 'propositions_express', propositionId), {
    statut: 'en_negociation',
    contrePropositionMontant: montantCounter,
    contrePropositionMessage: messageClient,
    montantCourant: montantCounter,
    rounds,
  });

  // La demande reste 'proposition_recue' — on négocie avec le même artisan

  await createNotification(proposition.artisanId, {
    type: 'contre_proposition_recue',
    titre: '💬 Contre-proposition reçue',
    message: `Le client propose ${montantCounter}€ au lieu de ${proposition.montantPropose}€ : ${messageClient.slice(0, 80)}`,
    lien: `/artisan/demandes-express/${proposition.demandeId}`,
  });
}

/**
 * Round 3 — Artisan répond à la contre-proposition du client.
 * action = 'accepter_prix_client' → l'artisan accepte le montant proposé par le client
 * action = 'refuser'              → négociation rompue, demande repart en attente
 * action = 'proposition_finale'   → artisan fait une DERNIERE offre (client accepte/refuse uniquement)
 */
export async function repondreArtisanNegociation(
  propositionId: string,
  action: 'accepter_prix_client' | 'refuser' | 'proposition_finale',
  montantFinal?: number,
  messageFinal?: string
): Promise<void> {
  const proposition = await getPropositionExpressById(propositionId);
  if (!proposition) throw new Error('Proposition introuvable');
  if (proposition.statut !== 'en_negociation') throw new Error('Cette proposition n\'est pas en négociation');

  // Charger la demande pour recalculer la fenêtre d'expiration si on revient en attente
  const demandeNego = await getDemandeExpressById(proposition.demandeId);
  const resetExpiresAt = Timestamp.fromDate(new Date(Date.now() + (
    demandeNego?.urgence === 'immediat' ? 60 * 60 * 1000 : 6 * 60 * 60 * 1000
  )));

  const now = Timestamp.now();

  if (action === 'refuser') {
    await updateDoc(doc(db, 'propositions_express', propositionId), {
      statut: 'refusee',
      refusedAt: now,
      motifRefus: 'Artisan a refusé la contre-proposition',
    });
    await updateDoc(doc(db, 'demandes_express', proposition.demandeId), {
      statut: 'en_attente_proposition',
      updatedAt: now,
      expiresAt: resetExpiresAt,  // Nouvelle fenêtre fraîche pour les autres artisans
    });
    await createNotification(proposition.clientId, {
      type: 'proposition_refusee',
      titre: 'Négociation rompue',
      message: 'L\'artisan n\'a pas pu s\'aligner sur votre budget. Votre demande est de nouveau visible.',
      lien: `/client/demandes-express/${proposition.demandeId}`,
    });
    return;
  }

  if (action === 'accepter_prix_client') {
    const montant = proposition.contrePropositionMontant ?? proposition.montantCourant ?? proposition.montantPropose;
    const round: NegociationRound = {
      auteur: 'artisan',
      montant,
      message: 'J\'accepte votre budget.',
      createdAt: now,
    };
    await updateDoc(doc(db, 'propositions_express', propositionId), {
      statut: 'en_attente_acceptation',
      montantPropose: montant,
      montantCourant: montant,
      rounds: [...(proposition.rounds || []), round],
    });
    await createNotification(proposition.clientId, {
      type: 'proposition_express_recue',
      titre: '✅ L\'artisan accepte votre budget',
      message: `L\'artisan accepte vos ${montant}€. Vous pouvez maintenant accepter et payer.`,
      lien: `/client/demandes-express/${proposition.demandeId}`,
    });
    return;
  }

  if (action === 'proposition_finale') {
    if (!montantFinal || !messageFinal) throw new Error('Montant et message requis pour la proposition finale');
    if (montantFinal > 150) throw new Error('Le montant ne peut pas dépasser 150€');
    const round: NegociationRound = {
      auteur: 'artisan',
      montant: montantFinal,
      message: messageFinal,
      createdAt: now,
    };
    await updateDoc(doc(db, 'propositions_express', propositionId), {
      statut: 'proposition_finale_artisan',
      propositionFinaleMontant: montantFinal,
      propositionFinaleMessage: messageFinal,
      montantCourant: montantFinal,
      rounds: [...(proposition.rounds || []), round],
    });
    await createNotification(proposition.clientId, {
      type: 'proposition_express_recue',
      titre: '🔔 Proposition finale reçue',
      message: `L\'artisan vous fait une offre finale à ${montantFinal}€. Acceptez ou refusez — c\'est la dernière offre.`,
      lien: `/client/demandes-express/${proposition.demandeId}`,
    });
  }
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
    statut: 'travaux_termines',
    travauxTerminesAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  // Notifier le client pour validation des travaux
  await createNotification(demande.clientId, {
    type: 'travaux_termines',
    titre: '🔔 Travaux terminés — Validation requise',
    message: "L'artisan a terminé les travaux. Validez pour libérer le paiement (auto-libération dans 24h).",
    lien: `/client/demandes-express/${demandeId}`,
  });
}

/**
 * Annuler une demande acceptée non payée (timeout dépassé)
 * Logique adaptée : demandes express = toujours directes (1 artisan)
 * → Libère l'artisan, permet au client de re-accepter ou chercher ailleurs
 */
export async function cancelAcceptedUnpaid(demandeId: string): Promise<void> {
  const demande = await getDemandeExpressById(demandeId);
  if (!demande) {
    throw new Error('Demande introuvable');
  }

  if (demande.statut !== 'acceptee') {
    throw new Error('Seules les demandes acceptées non payées peuvent être annulées');
  }

  // Récupérer la proposition acceptée
  const propositions = await getPropositionsByDemande(demandeId);
  const propositionAcceptee = propositions.find(p => p.statut === 'acceptee');

  if (!propositionAcceptee) {
    throw new Error('Aucune proposition acceptée trouvée');
  }

  // Remettre la proposition en attente (l'artisan peut toujours être choisi)
  await updateDoc(doc(db, 'propositions_express', propositionAcceptee.id), {
    statut: 'en_attente_acceptation',
    acceptedAt: null, // Supprimer date acceptation
  });

  // Remettre la demande avec la proposition (client peut re-accepter)
  await updateDoc(doc(db, 'demandes_express', demandeId), {
    statut: 'proposition_recue',
    updatedAt: Timestamp.now(),
    paymentDeadline: null, // Supprimer deadline
  });

  // Notifier le client
  await createNotification(demande.clientId, {
    type: 'paiement_expire',
    titre: '⏰ Délai de paiement dépassé',
    message: `Vous n'avez pas payé dans les délais (${demande.urgence === 'immediat' ? '15' : '30'} min). Vous pouvez accepter à nouveau la proposition.`,
    lien: `/client/demandes-express/${demandeId}`,
  });

  // Notifier l'artisan
  if (demande.artisanId) {
    await createNotification(demande.artisanId, {
      type: 'acceptation_expiree',
      titre: '⏰ Acceptation expirée',
      message: "Le client n'a pas payé dans les délais. Votre proposition reste active.",
      lien: `/artisan/demandes-express/${demandeId}`,
    });
  }
}

/**
 * Valider les travaux côté client — déclenche la libération du séquestre
 */
export async function markTravauxValides(demandeId: string): Promise<void> {
  const demande = await getDemandeExpressById(demandeId);
  if (!demande) {
    throw new Error('Demande introuvable');
  }

  await updateDoc(doc(db, 'demandes_express', demandeId), {
    statut: 'terminee',
    updatedAt: Timestamp.now(),
  });

  // Notifier l'artisan que le paiement est libéré
  if (demande.artisanId) {
    await createNotification(demande.artisanId, {
      type: 'paiement_libere',
      titre: '💰 Paiement libéré !',
      message: 'Le client a validé les travaux. Votre paiement a été versé.',
      lien: `/artisan/demandes-express/${demandeId}`,
    });
  }
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
