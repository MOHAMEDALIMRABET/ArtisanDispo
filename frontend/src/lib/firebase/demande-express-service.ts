/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SERVICE : DEMANDES EXPRESS (<150€)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ⚠️  Ce service gère UNIQUEMENT les demandes EXPRESS (petits travaux)
 * 
 * Collection Firestore : 'demandes_express'
 * Réponse artisan    : PROPOSITION (collection 'propositions_express')
 * Workflow           : Demande → Proposition → Paiement Direct → Intervention
 * Budget max         : 150€ TTC
 * Urgence           : immediat (2h) / urgent (24h)
 * 
 * ❌ NE PAS UTILISER pour les demandes publiques marketplace
 *    → Voir : demande-service.ts + devis-service.ts
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { db } from './config';

/**
 * Supprime récursivement les clés dont la valeur est `undefined`.
 * Firestore rejette les valeurs undefined dans addDoc/updateDoc.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function removeUndefined(obj: any): any {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, removeUndefined(v)])
  );
}
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
import { createNotification, notifyArtisansDemandeExpressPublique } from './notification-service';
import {
  getExpressArtisanWindowMs,
  getExpressPaymentWindowMinutes,
} from '@/lib/express-work-taxonomy';

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
    // Fenetre artisan selon stratégie:
    // - depannage-urgence: 1h
    // - petits-travaux-maintenance: 2h
    // (fallback legacy: immediat=1h, urgent=6h)
    expiresAt: Timestamp.fromDate(new Date(Date.now() + (
      getExpressArtisanWindowMs(data)
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

  // Notifier artisan si demande directe (avec artisanId cible)
  if (data.artisanId) {
    await createNotification(data.artisanId, {
      type: 'nouvelle_demande_express',
      titre: '⚡ Nouvelle demande express',
      message: `${data.description.slice(0, 80)}${data.description.length > 80 ? '...' : ''} — ${data.ville}`,
      lien: `/artisan/demandes-express/${docRef.id}`,
    });
  } else {
    // Demande express PUBLIQUE : notifier tous les artisans du même métier/zone
    // (fire-and-forget — ne bloque pas la création)
    notifyArtisansDemandeExpressPublique(
      docRef.id,
      data.categorie,
      data.categorieLabel ?? data.categorie,
      data.ville,
      data.description,
      data.coordonneesGPS
        ? { latitude: data.coordonneesGPS.latitude, longitude: data.coordonneesGPS.longitude }
        : undefined
    ).catch(err =>
      console.error('⚠️ notifyArtisansDemandeExpressPublique échoué (non bloquant):', err)
    );
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
/**
 * Récupérer le montant exact payé par le client depuis la collection paiements_express.
 * Cette collection est alimentée par le webhook Stripe → montant = exact débit carte.
 */
export async function getPaiementExpressByDemande(demandeId: string): Promise<{ montant: number } | null> {
  const q = query(
    collection(db, 'paiements_express'),
    where('demandeId', '==', demandeId)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const data = snap.docs[0].data();
  return { montant: data.montant as number };
}

export async function getDemandesExpressByClient(clientId: string): Promise<DemandeExpress[]> {
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

function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const earthRadiusKm = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

/**
 * Récupérer les demandes express publiques proches d'un artisan (0-30 km)
 */
export async function getDemandesExpressPubliquesByArtisan(options: {
  artisanMetiers: Categorie[];
  artisanCity?: string;
  artisanCoordinates?: { latitude: number; longitude: number };
  maxDistanceKm?: number;
}): Promise<DemandeExpress[]> {
  const maxDistanceKm = options.maxDistanceKm ?? 30;

  // Requête simple pour éviter les index composites:
  // - demandes express
  // - non attribuées
  // - encore ouvertes
  const qAttente = query(
    collection(db, 'demandes_express'),
    where('typeProjet', '==', 'express'),
    where('artisanId', '==', null),
    where('statut', '==', 'en_attente_proposition')
  );

  const qPropositionRecue = query(
    collection(db, 'demandes_express'),
    where('typeProjet', '==', 'express'),
    where('artisanId', '==', null),
    where('statut', '==', 'proposition_recue')
  );

  const [snapAttente, snapPropositionRecue] = await Promise.all([
    getDocs(qAttente),
    getDocs(qPropositionRecue),
  ]);
  const allDocs = [...snapAttente.docs, ...snapPropositionRecue.docs];
  const nowMs = Date.now();

  return allDocs
    .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as DemandeExpress))
    .filter((demande) => {
      if (!options.artisanMetiers.includes(demande.categorie)) return false;

      if (demande.expiresAt && demande.expiresAt.toDate().getTime() <= nowMs) {
        return false;
      }

      const demandeCoords = demande.coordonneesGPS;
      if (options.artisanCoordinates && demandeCoords) {
        const distance = calculateDistanceKm(
          options.artisanCoordinates.latitude,
          options.artisanCoordinates.longitude,
          demandeCoords.latitude,
          demandeCoords.longitude
        );
        return distance <= maxDistanceKm;
      }

      // Fallback: si coords manquantes, on garde seulement la même ville
      if (options.artisanCity && demande.ville) {
        return demande.ville.trim().toLowerCase() === options.artisanCity.trim().toLowerCase();
      }

      return false;
    })
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

/**
 * Créer une proposition pour une demande express
 * 
 * Règle montant :
 *  - montantPropose ≤ 150€  → proposition simple, pas de devis requis
 *  - montantPropose > 150€  → devisJoint obligatoire (signé par l'artisan)
 */
export async function createPropositionExpress(
  data: Omit<PropositionExpress, 'id' | 'statut' | 'createdAt'>
): Promise<string> {
  // Validation : si montant > 150€ un devis signé est OBLIGATOIRE
  if (data.montantPropose > 150) {
    if (!data.devisJoint) {
      throw new Error('Un devis signé est obligatoire pour une proposition supérieure à 150€');
    }
    if (!data.devisJoint.signatureArtisan?.dataURL) {
      throw new Error('Le devis doit être signé par l\'artisan avant envoi');
    }
    if (!data.devisJoint.lignes || data.devisJoint.lignes.length === 0) {
      throw new Error('Le devis doit contenir au moins une ligne de prestation');
    }
  }

  // Vérifier que la demande existe et est en attente
  const demande = await getDemandeExpressById(data.demandeId);
  if (!demande) {
    throw new Error('Demande introuvable');
  }

  const isPublished = !demande.artisanId;
  const canCreateOnPublished = isPublished && ['en_attente_proposition', 'proposition_recue'].includes(demande.statut);
  const canCreateOnDirect = !isPublished && demande.statut === 'en_attente_proposition';

  if (!canCreateOnPublished && !canCreateOnDirect) {
    throw new Error('Cette demande a déjà reçu une proposition ou est terminée');
  }

  // Empêcher qu'un artisan envoie plusieurs propositions actives sur la même demande.
  const existingProps = await getPropositionsByDemande(data.demandeId);
  const myActiveProp = existingProps.find(
    p =>
      p.artisanId === data.artisanId &&
      ['en_attente_acceptation', 'en_negociation', 'proposition_finale_artisan', 'acceptee'].includes(p.statut)
  );
  if (myActiveProp) {
    throw new Error('Vous avez déjà une proposition active sur cette demande');
  }

  // Nettoyer tous les champs undefined avant envoi Firestore
  // (Firestore rejette les valeurs undefined — delaiRealisation, matierePremiere, etc.)
  const propositionData = removeUndefined({
    ...data,
    statut: 'en_attente_acceptation' as const,
    createdAt: Timestamp.now(),
  });

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
    message: data.montantPropose > 150
      ? `L'artisan vous propose ${data.montantPropose}€ TTC — Un devis signé est joint, votre signature est requise pour accepter.`
      : `L'artisan vous propose ${data.montantPropose}€ TTC`,
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
 * Récupérer toutes les propositions soumises par un artisan
 * Utilisé sur la page liste artisan pour afficher le bouton "Voir le devis"
 * sur les cartes où l'artisan a joint un devis (montant > 150€)
 */
export async function getPropositionsByArtisanId(artisanId: string): Promise<PropositionExpress[]> {
  // Requête simple → pas d'index composite (pas d'orderBy)
  const q = query(
    collection(db, 'propositions_express'),
    where('artisanId', '==', artisanId)
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as PropositionExpress))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

/**
 * Accepter une proposition (avant paiement)
 * 
 * Si la proposition a un devisJoint (montant > 150€),
 * la signature client est obligatoire dans le payload.
 */
export async function acceptPropositionExpress(
  propositionId: string,
  signatureClientDataURL?: string  // Obligatoire si proposition.devisJoint présent
): Promise<void> {
  const proposition = await getPropositionExpressById(propositionId);
  if (!proposition) {
    throw new Error('Proposition introuvable');
  }

  if (proposition.statut !== 'en_attente_acceptation' && proposition.statut !== 'proposition_finale_artisan') {
    throw new Error('Cette proposition ne peut plus être acceptée');
  }

  // Si devis joint (montant > 150€) : signature client OBLIGATOIRE
  if (proposition.devisJoint) {
    if (!signatureClientDataURL) {
      throw new Error('Vous devez signer le devis avant d\'accepter cette proposition');
    }
    // Enregistrer la signature client dans le devis joint
    await updateDoc(doc(db, 'propositions_express', propositionId), {
      'devisJoint.signatureClient': {
        dataURL: signatureClientDataURL,
        date: Timestamp.now(),
      },
    });
  }

  // Récupérer la demande pour connaître l'urgence
  const demande = await getDemandeExpressById(proposition.demandeId);
  if (!demande) {
    throw new Error('Demande introuvable');
  }

  // Calculer deadline paiement selon stratégie:
  // - depannage-urgence: 60 minutes
  // - petits-travaux-maintenance: 120 minutes
  // (fallback legacy: immediat=15, urgent=30)
  const delaiMinutes = getExpressPaymentWindowMinutes(demande);
  const paymentDeadline = Timestamp.fromDate(new Date(Date.now() + delaiMinutes * 60 * 1000));

  // Mettre à jour la proposition
  await updateDoc(doc(db, 'propositions_express', propositionId), {
    statut: 'acceptee',
    acceptedAt: Timestamp.now(),
  });

  const isPublished = !demande.artisanId;

  // Mettre à jour la demande avec deadline
  await updateDoc(doc(db, 'demandes_express', proposition.demandeId), {
    statut: 'acceptee',
    artisanId: isPublished ? proposition.artisanId : demande.artisanId,
    updatedAt: Timestamp.now(),
    paymentDeadline,
  });

  // Si demande publiée: fermer les autres propositions concurrentes.
  if (isPublished) {
    const allPropositions = await getPropositionsByDemande(proposition.demandeId);
    const concurrentes = allPropositions.filter(
      p =>
        p.id !== proposition.id &&
        ['en_attente_acceptation', 'en_negociation', 'proposition_finale_artisan'].includes(p.statut)
    );

    await Promise.all(
      concurrentes.map(async (p) => {
        await updateDoc(doc(db, 'propositions_express', p.id), {
          statut: 'refusee',
          refusedAt: Timestamp.now(),
          motifRefus: 'Demande attribuée à un autre artisan',
        });

        await createNotification(p.artisanId, {
          type: 'proposition_refusee',
          titre: 'Demande attribuée à un autre artisan',
          message: 'Le client a retenu une autre proposition pour cette demande express publiée.',
          lien: `/artisan/demandes`,
        });
      })
    );
  }

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
    getExpressArtisanWindowMs(demandeForRefus || {})
  )));

  // Mettre à jour la proposition
  await updateDoc(doc(db, 'propositions_express', propositionId), {
    statut: 'refusee',
    refusedAt: Timestamp.now(),
    motifRefus: motifRefus || 'Non spécifié',
  });

  // Demande publiée: si d'autres propositions actives existent, rester en proposition_recue.
  // Sinon revenir en attente.
  const isPublished = !demandeForRefus?.artisanId;
  if (isPublished) {
    const allPropositions = await getPropositionsByDemande(proposition.demandeId);
    const hasOtherActive = allPropositions.some(
      p =>
        p.id !== proposition.id &&
        ['en_attente_acceptation', 'en_negociation', 'proposition_finale_artisan'].includes(p.statut)
    );

    await updateDoc(doc(db, 'demandes_express', proposition.demandeId), {
      statut: hasOtherActive ? 'proposition_recue' : 'en_attente_proposition',
      updatedAt: Timestamp.now(),
      expiresAt: hasOtherActive
        ? Timestamp.fromDate(new Date(Date.now() + 30 * 60 * 1000))
        : expiresAtAfterRefus,
    });
  } else {
    // Demande directe: on revient en attente.
    await updateDoc(doc(db, 'demandes_express', proposition.demandeId), {
      statut: 'en_attente_proposition',
      updatedAt: Timestamp.now(),
      expiresAt: expiresAtAfterRefus,
    });
  }

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
    getExpressArtisanWindowMs(demandeNego || {})
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
 * Marquer une demande EXPRESS comme payée (demandes EXPRESS uniquement)
 * 
 * ⚠️  IMPORTANT : Cette fonction est UNIQUEMENT pour demandes EXPRESS (<150€)
 * 
 * Appelé après confirmation Stripe du paiement
 * Collection : 'demandes_express' (pas 'devis')
 * 
 * Actions :
 * 1. Mise à jour demandes_express.statut → 'payee'
 * 2. Notification artisan : 'paiement_recu_express'
 * 
 * ❌ NE PAS UTILISER pour demandes PUBLIQUES
 *    → Demandes publiques : Webhook handlePaymentAuthorized() dans webhooks.routes.ts
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
 * Marquer une intervention EXPRESS comme en cours (demandes EXPRESS uniquement)
 * 
 * ⚠️  IMPORTANT : Cette fonction est UNIQUEMENT pour demandes EXPRESS (<150€)
 * 
 * Collection : 'demandes_express' (pas 'devis')
 * 
 * Actions :
 * 1. Mise à jour demandes_express.statut → 'en_cours'
 * 2. Notification client : 'intervention_demarree'
 * 
 * ❌ NE PAS UTILISER pour demandes PUBLIQUES
 *    → Demandes publiques : declarerDebutTravaux() dans devis-service.ts
 */
export async function markInterventionEnCours(demandeId: string): Promise<void> {
  const demande = await getDemandeExpressById(demandeId);
  if (!demande) {
    throw new Error('Demande introuvable');
  }

  await updateDoc(doc(db, 'demandes_express', demandeId), {
    statut: 'en_cours',
    travauxDebutAt: Timestamp.now(),  // Date et heure de début réelle des travaux
    updatedAt: Timestamp.now(),
  });

  // 🆕 Notifier le client que l'intervention a démarré
  await createNotification(demande.clientId, {
    type: 'intervention_demarree',
    titre: '🚧 Intervention démarrée',
    message: 'L\'artisan a commencé votre intervention.',
    lien: `/client/demandes-express/${demandeId}`,
  });
}

/**
 * Marquer une intervention EXPRESS comme terminée (demandes EXPRESS uniquement)
 * 
 * ⚠️  IMPORTANT : Cette fonction est UNIQUEMENT pour demandes EXPRESS (<150€)
 * 
 * Collection : 'demandes_express' (pas 'devis')
 * Auto-validation : 24h (vs 7 jours pour demandes publiques)
 * 
 * Actions :
 * 1. Mise à jour demandes_express.statut → 'travaux_termines'
 * 2. Notification client : 'travaux_termines' (validation requise)
 * 3. Auto-libération séquestre : 24h
 * 
 * ❌ NE PAS UTILISER pour demandes PUBLIQUES
 *    → Demandes publiques : declarerFinTravaux() dans devis-service.ts (7 jours)
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

  // Notifier le client pour validation des travaux (type express pour badge Demandes)
  await createNotification(demande.clientId, {
    type: 'travaux_termines_express',
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

  // EXPIRATION DÉFINITIVE : La proposition et la demande deviennent expirées (pas de réactivation)
  await updateDoc(doc(db, 'propositions_express', propositionAcceptee.id), {
    statut: 'expiree',
    expiredAt: Timestamp.now(), // Date d'expiration
  });

  // Expirer définitivement la demande → Suppression automatique après 24h
  await updateDoc(doc(db, 'demandes_express', demandeId), {
    statut: 'expiree',
    expireeAt: Timestamp.now(), // Date d'expiration pour cleanup 24h
    updatedAt: Timestamp.now(),
    paymentDeadline: null, // Supprimer deadline
  });

  // Notifier le client - expiration définitive
  await createNotification(demande.clientId, {
    type: 'paiement_expire',
    titre: '⏰ Demande expirée définitivement',
    message: `Vous n'avez pas payé dans les délais (${getExpressPaymentWindowMinutes(demande)} min). La demande sera supprimée automatiquement dans 24h. Vous pouvez créer une nouvelle demande si nécessaire.`,
    lien: `/client/demandes-express/${demandeId}`,
  });

  // Notifier l'artisan - protection renforcée
  if (demande.artisanId) {
    await createNotification(demande.artisanId, {
      type: 'acceptation_expiree',
      titre: '⏰ Demande expirée définitivement',
      message: "Le client n'a pas payé dans les délais. La demande sera automatiquement supprimée sous 24h.",
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

  // Notifier l'artisan que le paiement est libéré (type express pour badge Express)
  if (demande.artisanId) {
    await createNotification(demande.artisanId, {
      type: 'paiement_libere_express',
      titre: '💰 Paiement libéré !',
      message: 'Le client a validé les travaux. Votre paiement a été versé.',
      lien: `/artisan/demandes-express/${demandeId}`,
    });
  }
}

/**
 * Client signale un problème sur travaux express
 * Statut: travaux_termines/en_cours/payee → litige
 * Crée un document dans la collection `litiges` (parité avec les litiges classiques)
 * Bloque le paiement en attente de médiation admin (priorité haute)
 */
export async function signalerProblemeExpress(
  demandeId: string,
  clientId: string,
  motif: string,
  photos?: string[]
): Promise<void> {
  const demande = await getDemandeExpressById(demandeId);
  if (!demande) {
    throw new Error('Demande introuvable');
  }

  // Vérifications
  if (demande.clientId !== clientId) {
    throw new Error('Non autorisé');
  }

  const statutsAutorisesLitige: DemandeExpressStatut[] = ['payee', 'en_cours', 'travaux_termines'];
  if (!statutsAutorisesLitige.includes(demande.statut)) {
    throw new Error(`Impossible de signaler un problème (statut actuel: ${demande.statut}). Le litige est possible uniquement après paiement.`);
  }

  // Construire les pièces jointes si des photos sont fournies
  const piecesJointes = photos && photos.length > 0
    ? photos.map((url, index) => ({
        url,
        type: 'photo' as const,
        nom: `Photo ${index + 1}`,
        uploadedAt: Timestamp.now(),
        uploadedBy: clientId,  // Client est l'auteur des photos
      }))
    : [];

  // Créer le litige dans la collection unifiée `litiges`
  const { createLitigeExpress } = await import('./litige-service');
  const litigeId = await createLitigeExpress({
    demandeExpressId: demandeId,
    clientId: demande.clientId,
    artisanId: demande.artisanId ?? '',
    motif,
    description: motif,
    piecesJointes,
  });

  // Note : createLitigeExpress met déjà à jour demandes_express.statut → 'litige'
  // et stocke litigeId dans le document pour navigation rapide.
  // On mémorise aussi le statut avant litige pour pouvoir le restaurer si abandon.
  await updateDoc(doc(db, 'demandes_express', demandeId), {
    statutAvantLitige: demande.statut,
  });

  // Notification artisan déjà envoyée par createLitigeExpress → createLitige
  // On laisse donc la notification artisan gérée par le service central.
  console.log(`✅ Litige express créé : ${litigeId} pour demande ${demandeId}`);
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
    lien: `/client/demandes-express/${demandeId}`,
  });
}
