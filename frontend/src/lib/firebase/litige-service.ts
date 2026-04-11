/**
 * Service de gestion des litiges
 * 
 * Fonctionnalités :
 * - Déclaration litige par client/artisan
 * - Historique complet des actions
 * - Médiation admin
 * - Suivi statuts
 * - Notifications automatiques
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import {
  Litige,
  LitigeStatus,
  LitigeAction,
  LitigePieceJointe,
  LitigeActionType,
  CreateLitigeData,
  LitigeStatut,
  LitigeType,
  LitigePriorite,
} from '@/types/litige';
import { createNotification } from './notification-service';
import { getDevisById, getDevisByDemande } from './devis-service';
import { getDemandeById } from './demande-service';
import type { Demande } from '@/types/firestore';
import type { Devis, DevisStatut } from '@/types/devis'; // Utiliser le type de devis.ts car c'est celui retourné par devis-service

/**
 * Collection Firestore
 */
const LITIGES_COLLECTION = 'litiges';

/**
 * Créer un litige (classique devis OU demande express)
 *
 * Pour les litiges classiques : fournir `devisId`
 * Pour les litiges express    : fournir `sourceId` (demandeExpressId) + `typeSource: 'express'`
 */
export async function createLitige(data: CreateLitigeData): Promise<string> {
  try {
    // Détecter le type de source (défaut : classique)
    const typeSource = data.typeSource ?? 'classique';

    // === Branche CLASSIQUE : validation devis ===
    let contratId: string | undefined = undefined;
    if (typeSource === 'classique') {
      if (!data.devisId) {
        throw new Error('devisId requis pour un litige classique');
      }

      // Vérifier que le devis existe
      const devis = await getDevisById(data.devisId);
      if (!devis) {
        throw new Error('Devis introuvable');
      }

      // Vérifier que le devis est dans un statut permettant l'ouverture d'un litige
      const statutsAutorises: DevisStatut[] = [
        'paye',                  // Contrat signé et payé (problème avant/pendant travaux)
        'en_cours',              // Travaux en cours (abandon, retard, malfaçon)
        'travaux_termines',      // Fin déclarée par artisan (client conteste)
        'termine_valide',        // Validé par client (découverte malfaçon après validation)
        'termine_auto_valide',   // Auto-validé (découverte malfaçon après 7 jours)
      ];

      if (!statutsAutorises.includes(devis.statut)) {
        throw new Error(
          `Impossible d'ouvrir un litige pour un devis en statut "${devis.statut}". ` +
          `Un litige ne peut être ouvert que pour un devis payé ou en cours d'exécution.`
        );
      }

      // Récupérer le contrat lié au devis (si existe)
      const contratsQuery = query(
        collection(db, 'contrats'),
        where('devisId', '==', data.devisId)
      );
      const contratsSnap = await getDocs(contratsQuery);
      contratId = !contratsSnap.empty ? contratsSnap.docs[0].id : undefined;
    }

    // === Branche EXPRESS : validation demande ===
    if (typeSource === 'express' && !data.sourceId) {
      throw new Error('sourceId (demandeExpressId) requis pour un litige express');
    }

    // Calculer priorité automatique selon type et montant
    const priorite = calculatePriorite(data.type, data.montantConteste);

    // Identifiant de la source : devisId pour classique, sourceId pour express
    const sourceId = typeSource === 'express' ? data.sourceId : data.devisId;

    // Créer le document litige dans la collection unifiée
    const litige: Omit<Litige, 'id'> = {
      typeSource,                        // 'classique' | 'express'
      sourceId,                          // ID source unifié
      devisId: data.devisId,             // Conservé pour litiges classiques (retro-compat)
      contratId,
      clientId: data.clientId,
      artisanId: data.artisanId,
      declarantId: data.declarantId,
      declarantRole: data.declarantRole,
      type: data.type,
      statut: 'ouvert',
      priorite,
      motif: data.motif,
      description: data.description,
      montantConteste: data.montantConteste || 0,
      piecesJointes: data.piecesJointes || [],
      historique: [],
      adminAssigne: null,
      dateOuverture: serverTimestamp() as Timestamp,
      dateResolution: null,
      resolution: null,
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
      versionSchema: 1,
    };

    const docRef = await addDoc(collection(db, LITIGES_COLLECTION), litige);

    // Créer première action d'historique
    await addLitigeAction(docRef.id, {
      type: 'creation',
      auteurId: data.declarantId,
      auteurRole: data.declarantRole,
      description: `Litige créé : ${data.motif}`,
      details: {
        type: data.type,
        montantConteste: data.montantConteste,
        typeSource,
      },
    });

    // === Mettre à jour le document source selon le type ===
    if (typeSource === 'classique' && data.devisId) {
      // Classique : mettre à jour le statut du devis
      const { updateDevisStatus } = await import('./devis-service');
      await updateDevisStatus(data.devisId, 'litige');
    } else if (typeSource === 'express' && data.sourceId) {
      // Express : mettre à jour le statut de la demande express
      // (le document embed 'litige' reste pour la migration progressive)
      await updateDoc(doc(db, 'demandes_express', data.sourceId), {
        statut: 'litige',
        litigeId: docRef.id,   // Référence vers le document litige dans la collection
        updatedAt: serverTimestamp(),
      });
    }

    // Notifier la partie adverse
    const recipientId = data.declarantRole === 'client' ? data.artisanId : data.clientId;
    // Lien vers la page litige unifiée
    const lienLitige = `/litiges/${docRef.id}`;

    await createNotification(recipientId, {
      type: 'litige_ouvert',
      titre: 'Litige déclaré',
      message: typeSource === 'express'
        ? `Un litige a été ouvert concernant la demande express #${(data.sourceId ?? '').slice(0, 8)}`
        : `Un litige a été ouvert concernant le devis #${(data.devisId ?? '').slice(0, 8)}`,
      lien: lienLitige,
    });

    // Notifier les admins
    await notifyAdminsNewLitige(docRef.id, data);

    return docRef.id;
  } catch (error) {
    console.error('Erreur lors de la création du litige:', error);
    throw error;
  }
}

/**
 * Helper dédié : créer un litige depuis une demande express
 * Remplace l'ancien embed dans `demandes_express.litige`
 */
export async function createLitigeExpress(params: {
  demandeExpressId: string;
  clientId: string;
  artisanId: string;
  motif: string;
  description?: string;
  piecesJointes?: import('@/types/litige').LitigePieceJointe[];
  montantConteste?: number;
}): Promise<string> {
  return createLitige({
    typeSource: 'express',
    sourceId: params.demandeExpressId,
    clientId: params.clientId,
    artisanId: params.artisanId,
    declarantId: params.clientId, // Le client initie toujours le litige express
    declarantRole: 'client',
    type: 'autre',               // Le type précis peut être affiné plus tard par l'admin
    motif: params.motif,
    description: params.description ?? params.motif,
    montantConteste: params.montantConteste,
    piecesJointes: params.piecesJointes,
  });
}

/**
 * Récupérer un litige par ID
 */
export async function getLitigeById(litigeId: string): Promise<Litige | null> {
  try {
    const docSnap = await getDoc(doc(db, LITIGES_COLLECTION, litigeId));
    
    if (!docSnap.exists()) {
      return null;
    }

    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as Litige;
  } catch (error) {
    console.error('Erreur lors de la récupération du litige:', error);
    throw error;
  }
}

/**
 * Récupérer litiges d'un utilisateur (client ou artisan)
 */
export async function getLitigesByUser(userId: string): Promise<Litige[]> {
  try {
    // Chercher où l'utilisateur est client OU artisan
    const qClient = query(
      collection(db, LITIGES_COLLECTION),
      where('clientId', '==', userId)
    );
    const qArtisan = query(
      collection(db, LITIGES_COLLECTION),
      where('artisanId', '==', userId)
    );

    const [clientSnap, artisanSnap] = await Promise.all([
      getDocs(qClient),
      getDocs(qArtisan),
    ]);

    const litiges: Litige[] = [];
    
    clientSnap.forEach((doc) => {
      litiges.push({ id: doc.id, ...doc.data() } as Litige);
    });
    
    artisanSnap.forEach((doc) => {
      litiges.push({ id: doc.id, ...doc.data() } as Litige);
    });

    // Dédupliquer et trier par date (plus récent d'abord)
    const uniqueLitiges = Array.from(
      new Map(litiges.map((l) => [l.id, l])).values()
    );

    return uniqueLitiges.sort((a, b) => {
      const dateA = a.dateOuverture?.toMillis() || 0;
      const dateB = b.dateOuverture?.toMillis() || 0;
      return dateB - dateA;
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des litiges:', error);
    throw error;
  }
}

/**
 * Récupérer TOUS les litiges (admin uniquement)
 */
export async function getAllLitiges(): Promise<Litige[]> {
  try {
    const q = query(collection(db, LITIGES_COLLECTION));
    const snapshot = await getDocs(q);
    
    const litiges = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Litige[];

    // Tri côté client par date (plus récent d'abord)
    return litiges.sort((a, b) => {
      const dateA = a.dateOuverture?.toMillis() || 0;
      const dateB = b.dateOuverture?.toMillis() || 0;
      return dateB - dateA;
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de tous les litiges:', error);
    throw error;
  }
}

/**
 * Récupérer litiges pour admin (avec filtres)
 */
export async function getAdminLitiges(filters?: {
  statut?: LitigeStatut;
  adminAssigne?: string;
}): Promise<Litige[]> {
  try {
    let q = query(collection(db, LITIGES_COLLECTION));

    if (filters?.statut) {
      q = query(q, where('statut', '==', filters.statut));
    }
    if (filters?.adminAssigne) {
      q = query(q, where('adminAssigne', '==', filters.adminAssigne));
    }

    const snapshot = await getDocs(q);
    const litiges = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Litige[];

    // Tri côté client (éviter index composite)
    return litiges.sort((a, b) => {
      const dateA = a.dateOuverture?.toMillis() || 0;
      const dateB = b.dateOuverture?.toMillis() || 0;
      return dateB - dateA;
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des litiges admin:', error);
    throw error;
  }
}

/**
 * Alias pour getAllLitiges() - Utilisé par l'interface admin
 */
export async function getLitigesByAdmin(): Promise<Litige[]> {
  return getAllLitiges();
}

/**
 * Ajouter une action à l'historique
 */
export async function addLitigeAction(
  litigeId: string,
  actionData: {
    type: LitigeActionType;
    auteurId: string;
    auteurRole: 'client' | 'artisan' | 'admin';
    description: string;
    details?: Record<string, any>;
    piecesJointes?: LitigePieceJointe[];
  }
): Promise<void> {
  try {
    const litige = await getLitigeById(litigeId);
    if (!litige) {
      throw new Error('Litige introuvable');
    }

    // Format HistoriqueAction (structure unifiée)
    const action: any = {
      id: crypto.randomUUID ? crypto.randomUUID() : `action_${Date.now()}`,
      timestamp: serverTimestamp(),
      acteur: actionData.auteurId,
      acteurRole: actionData.auteurRole,
      acteurNom: '', // À enrichir plus tard si besoin
      type: actionData.type,
      description: actionData.description,
      metadata: actionData.details,
    };

    await updateDoc(doc(db, LITIGES_COLLECTION, litigeId), {
      historique: [...litige.historique, action],
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Erreur lors de l\'ajout de l\'action:', error);
    throw error;
  }
}

/**
 * Ajouter un commentaire
 */
export async function addLitigeComment(
  litigeId: string,
  userId: string,
  userRole: 'client' | 'artisan' | 'admin',
  commentaire: string,
  piecesJointes?: LitigePieceJointe[]
): Promise<void> {
  try {
    await addLitigeAction(litigeId, {
      type: 'commentaire',
      auteurId: userId,
      auteurRole: userRole,
      description: commentaire,
      piecesJointes,
    });

    // Notifier les autres parties
    const litige = await getLitigeById(litigeId);
    if (!litige) return;

    const recipients: string[] = [];
    if (userId !== litige.clientId) recipients.push(litige.clientId);
    if (userId !== litige.artisanId) recipients.push(litige.artisanId);
    if (litige.adminAssigne && userId !== litige.adminAssigne) {
      recipients.push(litige.adminAssigne);
    }

    for (const recipientId of recipients) {
      await createNotification(recipientId, {
        type: 'litige_commentaire',
        titre: 'Nouveau commentaire sur le litige',
        message: commentaire.substring(0, 100),
        lien: `/litiges/${litigeId}`,
      });
    }
  } catch (error) {
    console.error('Erreur lors de l\'ajout du commentaire:', error);
    throw error;
  }
}

/**
 * Assigner un admin au litige
 */
export async function assignLitigeToAdmin(
  litigeId: string,
  adminId: string
): Promise<void> {
  try {
    await updateDoc(doc(db, LITIGES_COLLECTION, litigeId), {
      adminAssigne: adminId,
      statut: 'en_mediation',
      updatedAt: serverTimestamp(),
    });

    await addLitigeAction(litigeId, {
      type: 'assignation',
      auteurId: adminId,
      auteurRole: 'admin',
      description: 'Litige pris en charge par l\'équipe de médiation',
    });

    // Notifier client et artisan
    const litige = await getLitigeById(litigeId);
    if (!litige) return;

    for (const recipientId of [litige.clientId, litige.artisanId]) {
      await createNotification(recipientId, {
        type: 'litige_pris_en_charge',
        titre: 'Litige pris en charge',
        message: 'Un médiateur a été assigné à votre litige',
        lien: `/litiges/${litigeId}`,
      });
    }
  } catch (error) {
    console.error('Erreur lors de l\'assignation du litige:', error);
    throw error;
  }
}

/**
 * Proposer une résolution
 */
export async function proposeLitigeResolution(
  litigeId: string,
  adminId: string,
  proposition: string,
  montantClient?: number,
  montantArtisan?: number,
  piecesJointes?: LitigePieceJointe[]
): Promise<void> {
  try {
    await updateDoc(doc(db, LITIGES_COLLECTION, litigeId), {
      statut: 'proposition_resolution',
      updatedAt: serverTimestamp(),
    });

    await addLitigeAction(litigeId, {
      type: 'proposition_resolution',
      auteurId: adminId,
      auteurRole: 'admin',
      description: proposition,
      details: {
        montantClient,
        montantArtisan,
      },
      piecesJointes,
    });

    // Notifier client et artisan
    const litige = await getLitigeById(litigeId);
    if (!litige) return;

    for (const recipientId of [litige.clientId, litige.artisanId]) {
      await createNotification(recipientId, {
        type: 'litige_proposition',
        titre: 'Proposition de résolution',
        message: 'Le médiateur a proposé une solution pour résoudre le litige',
        lien: `/litiges/${litigeId}`,
      });
    }
  } catch (error) {
    console.error('Erreur lors de la proposition de résolution:', error);
    throw error;
  }
}

/**
 * Accepter la proposition de résolution
 */
export async function acceptLitigeResolution(
  litigeId: string,
  userId: string,
  userRole: 'client' | 'artisan'
): Promise<void> {
  try {
    const litige = await getLitigeById(litigeId);
    if (!litige) {
      throw new Error('Litige introuvable');
    }

    await addLitigeAction(litigeId, {
      type: 'acceptation_resolution',
      auteurId: userId,
      auteurRole: userRole,
      description: `${userRole === 'client' ? 'Le client' : 'L\'artisan'} a accepté la proposition de résolution`,
    });

    // Vérifier si l'autre partie a déjà accepté
    const autrePartieAccepte = litige.historique.some(
      (action) =>
        action.type === 'acceptation_resolution' &&
        action.acteurRole !== userRole
    );

    if (autrePartieAccepte) {
      // Les deux parties ont accepté → Résoudre le litige
      await resolveLitige(litigeId, 'resolu_accord');
    } else {
      // Notifier l'autre partie
      const recipientId = userRole === 'client' ? litige.artisanId : litige.clientId;
      await createNotification(recipientId, {
        type: 'litige_acceptation_partielle',
        titre: 'Acceptation de la proposition',
        message: `${userRole === 'client' ? 'Le client' : 'L\'artisan'} a accepté la proposition de résolution`,
        lien: `/litiges/${litigeId}`,
      });
    }
  } catch (error) {
    console.error('Erreur lors de l\'acceptation de la résolution:', error);
    throw error;
  }
}

/**
 * Refuser la proposition de résolution
 */
export async function rejectLitigeResolution(
  litigeId: string,
  userId: string,
  userRole: 'client' | 'artisan',
  motif: string
): Promise<void> {
  try {
    await addLitigeAction(litigeId, {
      type: 'refus_resolution',
      auteurId: userId,
      auteurRole: userRole,
      description: `${userRole === 'client' ? 'Le client' : 'L\'artisan'} a refusé la proposition`,
      details: { motif },
    });

    await updateDoc(doc(db, LITIGES_COLLECTION, litigeId), {
      statut: 'en_mediation',
      updatedAt: serverTimestamp(),
    });

    // Notifier l'admin et l'autre partie
    const litige = await getLitigeById(litigeId);
    if (!litige) return;

    const recipients = [litige.adminAssigne, userRole === 'client' ? litige.artisanId : litige.clientId].filter(Boolean) as string[];

    for (const recipientId of recipients) {
      await createNotification(recipientId, {
        type: 'litige_refus',
        titre: 'Proposition refusée',
        message: `${userRole === 'client' ? 'Le client' : 'L\'artisan'} a refusé la proposition de résolution`,
        lien: `/litiges/${litigeId}`,
      });
    }
  } catch (error) {
    console.error('Erreur lors du refus de la résolution:', error);
    throw error;
  }
}

/**
 * Résoudre un litige
 */
export async function resolveLitige(
  litigeId: string,
  statut: 'resolu_accord' | 'resolu_admin' | 'abandonne',
  resolution?: string
): Promise<void> {
  try {
    // Récupérer le litige AVANT la mise à jour pour connaître typeSource et sourceId
    const litige = await getLitigeById(litigeId);
    if (!litige) {
      throw new Error('Litige introuvable');
    }

    await updateDoc(doc(db, LITIGES_COLLECTION, litigeId), {
      statut,
      dateResolution: serverTimestamp(),
      resolution: resolution || null,
      updatedAt: serverTimestamp(),
    });

    await addLitigeAction(litigeId, {
      type: 'resolution',
      auteurId: 'system',
      auteurRole: 'admin',
      description: getResolutionMessage(statut),
      details: { resolution },
    });

    // Mettre à jour le statut du document source selon le type
    if (!litige) return;

    if (litige.typeSource === 'express' && litige.sourceId) {
      // === Branche EXPRESS : mettre à jour demandes_express ===
      let nouveauStatutExpress: string = 'terminee'; // résolu → travaux validés
      if (statut === 'abandonne') {
        // Restaurer le statut avant litige (mémorisé dans demandes_express.statutAvantLitige)
        const demandeSnap = await getDoc(doc(db, 'demandes_express', litige.sourceId));
        const demandeData = demandeSnap.data();
        nouveauStatutExpress = demandeData?.statutAvantLitige ?? 'travaux_termines';
      }

      await updateDoc(doc(db, 'demandes_express', litige.sourceId), {
        statut: nouveauStatutExpress,
        statutAvantLitige: null,       // Réinitialiser après clôture litige
        updatedAt: serverTimestamp(),
        ...(statut !== 'abandonne' && { dateValidation: serverTimestamp() }),
      });
    } else if (litige.devisId) {
      // === Branche CLASSIQUE : mettre à jour le devis ===
      // resolu_accord / resolu_admin → travaux validés définitivement
      // abandonne → litige retiré, on restaure le statut d'avant le litige
      let nouveauStatutDevis: import('@/types/devis').DevisStatut = 'termine_valide';
      if (statut === 'abandonne') {
        // Récupérer le devis pour connaître le statut d'origine
        const devisSnap = await getDoc(doc(db, 'devis', litige.devisId));
        const devisData = devisSnap.data();
        // Restaurer statutAvantLitige si présent, sinon fallback travaux_termines (anciens docs)
        nouveauStatutDevis = (devisData?.statutAvantLitige as import('@/types/devis').DevisStatut) || 'travaux_termines';
      }

      await updateDoc(doc(db, 'devis', litige.devisId), {
        statut: nouveauStatutDevis,
        statutAvantLitige: null, // Réinitialiser maintenant que le litige est clos
        dateModification: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(statut !== 'abandonne' && { dateValidation: serverTimestamp() }),
      });
    }

    // Notifier les parties
    const notifType = statut === 'abandonne' ? 'litige_abandonne' : 'litige_resolu';
    const notifTitre = statut === 'abandonne' ? 'Litige abandonné' : 'Litige résolu';

    for (const recipientId of [litige.clientId, litige.artisanId]) {
      await createNotification(recipientId, {
        type: notifType,
        titre: notifTitre,
        message: getResolutionMessage(statut),
        lien: `/litiges/${litigeId}`,
      });
    }
  } catch (error) {
    console.error('Erreur lors de la résolution du litige:', error);
    throw error;
  }
}

/**
 * Escalader un litige (niveau supérieur de médiation)
 */
export async function escalateLitige(
  litigeId: string,
  adminId: string,
  raison: string
): Promise<void> {
  try {
    await updateDoc(doc(db, LITIGES_COLLECTION, litigeId), {
      statut: 'escalade',
      updatedAt: serverTimestamp(),
    });

    await addLitigeAction(litigeId, {
      type: 'escalade',
      auteurId: adminId,
      auteurRole: 'admin',
      description: `Litige escaladé au niveau supérieur`,
      details: { raison },
    });

    // Notifier les parties
    const litige = await getLitigeById(litigeId);
    if (!litige) return;

    for (const recipientId of [litige.clientId, litige.artisanId]) {
      await createNotification(recipientId, {
        type: 'litige_escalade',
        titre: 'Litige escaladé',
        message: 'Votre litige a été transmis à un niveau supérieur de médiation',
        lien: `/litiges/${litigeId}`,
      });
    }
  } catch (error) {
    console.error('Erreur lors de l\'escalade du litige:', error);
    throw error;
  }
}

/**
 * Obtenir statistiques litiges (admin)
 */
export async function getLitigesStats(): Promise<{
  total: number;
  ouverts: number;
  enMediation: number;
  resolus: number;
  abandonnes: number;
  delaiMoyenResolution: number;
}> {
  try {
    const snapshot = await getDocs(collection(db, LITIGES_COLLECTION));
    const litiges = snapshot.docs.map((doc) => doc.data() as Litige);

    const stats = {
      total: litiges.length,
      ouverts: litiges.filter((l) => l.statut === 'ouvert').length,
      enMediation: litiges.filter((l) => l.statut === 'en_mediation').length,
      resolus: litiges.filter((l) => l.statut === 'resolu_accord' || l.statut === 'resolu_admin').length,
      abandonnes: litiges.filter((l) => l.statut === 'abandonne').length,
      delaiMoyenResolution: 0,
    };

    // Calculer délai moyen de résolution
    const litigesResolus = litiges.filter(
      (l) => (l.statut === 'resolu_accord' || l.statut === 'resolu_admin') && l.dateResolution
    );

    if (litigesResolus.length > 0) {
      const delaisTotal = litigesResolus.reduce((sum, l) => {
        const ouverture = l.dateOuverture?.toMillis() || 0;
        const resolution = l.dateResolution?.toMillis() || 0;
        return sum + (resolution - ouverture);
      }, 0);

      // Délai moyen en jours
      stats.delaiMoyenResolution = Math.round(
        delaisTotal / litigesResolus.length / (1000 * 60 * 60 * 24)
      );
    }

    return stats;
  } catch (error) {
    console.error('Erreur lors du calcul des statistiques:', error);
    throw error;
  }
}

/**
 * Helper - Notifier les admins d'un nouveau litige
 */
async function notifyAdminsNewLitige(
  litigeId: string,
  data: CreateLitigeData
): Promise<void> {
  try {
    // Récupérer tous les admins
    const adminsQuery = query(
      collection(db, 'users'),
      where('role', '==', 'admin')
    );
    const adminsSnap = await getDocs(adminsQuery);
    
    // Notifier chaque admin
    const notifications = adminsSnap.docs.map(async (adminDoc) => {
      return createNotification(adminDoc.id, {
        type: 'litige_ouvert',
        titre: '🚨 Nouveau litige à traiter',
        message: `Type: ${data.type} - Déclaré par: ${data.declarantRole}`,
        lien: `/admin/litiges/${litigeId}`,
      });
    });
    
    await Promise.all(notifications);
    console.log(`✅ ${adminsSnap.size} admin(s) notifié(s) du nouveau litige`);
  } catch (error) {
    console.error('Erreur notification admins:', error);
    // Ne pas bloquer la création du litige si notification échoue
  }
}

/**
 * Helper - Message de résolution selon le statut
 */
function getResolutionMessage(statut: string): string {
  switch (statut) {
    case 'resolu_accord':
      return 'Litige résolu par accord mutuel des parties';
    case 'resolu_admin':
      return 'Litige résolu par décision administrative';
    case 'abandonne':
      return 'Litige abandonné — le dossier a été clôturé. Vous pouvez finaliser la prestation normalement.';
    default:
      return 'Litige résolu';
  }
}

/**
 * Mettre à jour le statut d'un litige (fonction utilitaire)
 */
export async function updateLitigeStatus(
  litigeId: string,
  newStatut: LitigeStatut
): Promise<void> {
  try {
    await updateDoc(doc(db, LITIGES_COLLECTION, litigeId), {
      statut: newStatut,
      updatedAt: serverTimestamp(),
    });

    const litige = await getLitigeById(litigeId);
    if (!litige) return;

    // Ajouter action au historique
    await addLitigeAction(litigeId, {
      type: 'changement_statut',
      auteurId: 'admin',
      auteurRole: 'admin',
      description: `Statut changé vers: ${newStatut}`,
      details: { nouveauStatut: newStatut },
    });
  } catch (error) {
    console.error('Erreur updateLitigeStatus:', error);
    throw error;
  }
}

/**
 * Helper - Calculer priorité automatique selon type et montant
 */
function calculatePriorite(
  type: LitigeType,
  montantConteste?: number
): LitigePriorite {
  // Priorité URGENTE : abandon chantier
  if (type === 'abandon_chantier') {
    return 'urgente';
  }
  
  // Priorité HAUTE : malfaçon, facture excessive, montant > 5000€
  if (type === 'malfacon' || type === 'facture_excessive' || (montantConteste && montantConteste > 5000)) {
    return 'haute';
  }
  
  // Priorité MOYENNE : non-conformité, retard important, montant 1000-5000€
  if (type === 'non_conformite' || type === 'retard' || type === 'non_respect_delais' || (montantConteste && montantConteste > 1000)) {
    return 'moyenne';
  }
  
  // Priorité BASSE : autres cas
  return 'basse';
}

/**
 * Récupérer la demande associée à un litige (ADMIN)
 * Permet de voir le contexte initial de la demande
 */
export async function getDemandeFromLitige(litigeId: string): Promise<Demande | null> {
  try {
    const litige = await getLitigeById(litigeId);
    if (!litige) {
      console.error('Litige introuvable:', litigeId);
      return null;
    }

    // Pour les litiges express, la demande est directement accessible via sourceId
    if (litige.typeSource === 'express') {
      console.warn('getDemandeFromLitige: litige express - pas de demande classique associée');
      return null;
    }

    // Récupérer le devis pour obtenir le demandeId
    const devis = litige.devisId ? await getDevisById(litige.devisId) : null;
    if (!devis || !devis.demandeId) {
      console.error('Devis ou demandeId introuvable pour litige:', litigeId);
      return null;
    }

    // Récupérer la demande
    const demande = await getDemandeById(devis.demandeId);
    return demande;
  } catch (error) {
    console.error('Erreur lors de la récupération de la demande du litige:', error);
    throw error;
  }
}

/**
 * Récupérer l'historique complet des devis de la demande (ADMIN)
 * Permet de voir tous les devis qui ont été proposés, pas seulement celui du litige
 */
export async function getHistoriqueDevisFromLitige(litigeId: string): Promise<Devis[]> {
  try {
    const litige = await getLitigeById(litigeId);
    if (!litige) {
      console.error('Litige introuvable:', litigeId);
      return [];
    }

    // Les litiges express n'ont pas d'historique de devis
    if (litige.typeSource === 'express') {
      return [];
    }

    // Récupérer le devis pour obtenir le demandeId
    const devis = litige.devisId ? await getDevisById(litige.devisId) : null;
    if (!devis || !devis.demandeId) {
      console.error('Devis ou demandeId introuvable pour litige:', litigeId);
      return [];
    }

    // Récupérer tous les devis de cette demande
    const tousLesDevis = await getDevisByDemande(devis.demandeId);
    
    // Trier par date de création (plus ancien d'abord)
    return tousLesDevis.sort((a, b) => {
      const dateA = a.dateCreation?.toMillis() || 0;
      const dateB = b.dateCreation?.toMillis() || 0;
      return dateA - dateB;
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'historique des devis:', error);
    throw error;
  }
}

/**
 * Récupérer le contexte complet d'un litige pour l'admin
 * Combine: litige + demande + tous les devis + devis concerné
 */
export async function getContexteCompletLitige(litigeId: string): Promise<{
  litige: Litige | null;
  demande: Demande | null;
  devisConcerne: Devis | null;
  historiqueDevis: Devis[];
  statistiques: {
    totalDevis: number;
    devisAcceptes: number;
    devisRefuses: number;
    montantMoyenDevis: number;
  };
} | null> {
  try {
    // Récupérer le litige
    const litige = await getLitigeById(litigeId);
    if (!litige) {
      return null;
    }

    // Récupérer le devis concerné par le litige (classique uniquement)
    // Pour les litiges express, retourner un contexte sans devis
    const devisConcerne = litige.devisId ? await getDevisById(litige.devisId) : null;
    if (!devisConcerne && litige.typeSource !== 'express') {
      return null;
    }

    // Récupérer la demande initiale (via le devis si classique, null si express)
    const demande = devisConcerne?.demandeId 
      ? await getDemandeById(devisConcerne.demandeId)
      : null;

    // Récupérer l'historique complet des devis (vide pour express)
    const historiqueDevis = devisConcerne?.demandeId
      ? await getDevisByDemande(devisConcerne.demandeId)
      : [];

    // Calculer statistiques
    const statistiques = {
      totalDevis: historiqueDevis.length,
      devisAcceptes: historiqueDevis.filter(d => d.statut === 'en_attente_paiement' || d.statut === 'paye').length,
      devisRefuses: historiqueDevis.filter(d => d.statut === 'refuse').length,
      montantMoyenDevis: historiqueDevis.length > 0
        ? historiqueDevis.reduce((sum, d) => sum + (d.totaux?.totalTTC || 0), 0) / historiqueDevis.length
        : 0,
    };

    return {
      litige,
      demande,
      devisConcerne,
      historiqueDevis,
      statistiques,
    };
  } catch (error) {
    console.error('Erreur lors de la récupération du contexte complet du litige:', error);
    throw error;
  }
}
/**
 * Récupérer la conversation et les messages liés à une demande
 * Utilisé par l'admin pour voir l'historique complet des échanges client/artisan
 */
export async function getConversationFromDemande(demandeId: string): Promise<{
  conversation: any | null;
  messages: any[];
} | null> {
  try {
    // Récupérer la conversation liée à cette demande
    const conversationsQuery = query(
      collection(db, 'conversations'),
      where('demandeId', '==', demandeId)
    );
    const conversationsSnap = await getDocs(conversationsQuery);

    if (conversationsSnap.empty) {
      console.log('Aucune conversation trouvée pour cette demande');
      return { conversation: null, messages: [] };
    }

    // Prendre la première conversation (normalement il n'y en a qu'une par demande)
    const conversationDoc = conversationsSnap.docs[0];
    const conversation = {
      id: conversationDoc.id,
      ...conversationDoc.data(),
    };

    // Récupérer tous les messages de cette conversation
    const messagesQuery = query(
      collection(db, 'messages'),
      where('conversationId', '==', conversation.id),
      orderBy('dateEnvoi', 'asc')
    );
    const messagesSnap = await getDocs(messagesQuery);
    const messages = messagesSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return {
      conversation,
      messages,
    };
  } catch (error) {
    console.error('Erreur lors de la récupération de la conversation:', error);
    return null;
  }
}