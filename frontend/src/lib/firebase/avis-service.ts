/**
 * Service Avis (Reviews)
 * Gestion des avis clients et artisans après fin d'intervention
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
import type { Avis } from '@/types/firestore';
import type { Devis } from '@/types/devis';
import { updateNotation } from './artisan-service';
import { updateNoteGlobale } from './artisan-stats-service';
import { createNotification } from './notification-service';

/**
 * Créer un nouvel avis après fin d'intervention
 */
export async function createAvis(data: {
  contratId: string;
  artisanId: string;
  clientId: string;
  note: number;
  commentaire: string;
  points_forts?: string[];
  points_amelioration?: string[];
  photos?: string[];
}): Promise<string> {
  try {
    // Validation
    if (data.note < 1 || data.note > 5) {
      throw new Error('La note doit être entre 1 et 5 étoiles');
    }

    if (!data.commentaire || data.commentaire.trim().length < 10) {
      throw new Error('Le commentaire doit contenir au moins 10 caractères');
    }

    // Vérifier qu'un avis n'existe pas déjà pour ce contrat
    const existingAvis = await getAvisByContratId(data.contratId);
    if (existingAvis) {
      throw new Error('Un avis a déjà été laissé pour cette intervention');
    }

    // Créer l'avis
    const avisRef = await addDoc(collection(db, 'avis'), {
      contratId: data.contratId,
      artisanId: data.artisanId,
      clientId: data.clientId,
      note: data.note,
      commentaire: data.commentaire.trim(),
      points_forts: data.points_forts || [],
      points_amelioration: data.points_amelioration || [],
      photos: data.photos || [],
      reponseArtisan: null,
      dateCreation: serverTimestamp(),
      modere: false,
      signale: false,
      visible: true,
    });

    // Mettre à jour la notation de l'artisan
    // ⚠️ Try/catch séparé : si la mise à jour notation échoue (règles Firestore),
    // l'avis est quand même créé - la notation sera recalculée à la prochaine occasion
    try {
      await updateNotation(data.artisanId, data.note);
    } catch (notationError) {
      console.warn('⚠️ Mise à jour notation artisan échouée (non bloquant):', notationError);
    }

    // Mettre à jour les stats de l'artisan
    try {
      await updateNoteGlobale(data.artisanId, data.note);
    } catch (statsError) {
      console.warn('⚠️ Mise à jour stats artisan échouée (non bloquant):', statsError);
    }

    console.log('✅ Avis créé avec succès:', avisRef.id);

    // Notifier l'artisan qu'il a reçu un nouvel avis
    try {
      await createNotification(data.artisanId, {
        type: 'nouvel_avis',
        titre: '⭐ Nouvel avis reçu',
        message: `Un client vous a laissé un avis ${data.note}/5 étoiles.`,
        lien: `/artisan/avis`,
      });
    } catch (notifError) {
      console.warn('⚠️ Notification avis artisan échouée (non bloquant):', notifError);
    }

    return avisRef.id;
  } catch (error) {
    console.error('❌ Erreur création avis:', error);
    throw error;
  }
}

/**
 * Récupérer tous les avis d'un artisan (visibles uniquement)
 * ⚠️ Tri côté client pour éviter index composite Firestore
 */
export async function getAvisByArtisanId(artisanId: string): Promise<Avis[]> {
  try {
    // ✅ Requête simple sans orderBy (évite index composite)
    const q = query(
      collection(db, 'avis'),
      where('artisanId', '==', artisanId),
      where('visible', '==', true)
    );

    const snapshot = await getDocs(q);
    const avisData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Avis));

    // ✅ Tri côté client en JavaScript
    return avisData.sort((a, b) => {
      const dateA = a.dateCreation?.toMillis() || 0;
      const dateB = b.dateCreation?.toMillis() || 0;
      return dateB - dateA; // Ordre décroissant (plus récents en premier)
    });
  } catch (error) {
    console.error('❌ Erreur récupération avis artisan:', error);
    return [];
  }
}

/**
 * Récupérer tous les avis donnés par un client
 * ⚠️ Tri côté client pour cohérence avec getAvisByArtisanId
 */
export async function getAvisByClientId(clientId: string): Promise<Avis[]> {
  try {
    // ✅ Requête simple sans orderBy (évite index composite)
    const q = query(
      collection(db, 'avis'),
      where('clientId', '==', clientId)
    );

    const snapshot = await getDocs(q);
    const avisData = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Avis));

    // ✅ Tri côté client en JavaScript
    return avisData.sort((a, b) => {
      const dateA = a.dateCreation?.toMillis() || 0;
      const dateB = b.dateCreation?.toMillis() || 0;
      return dateB - dateA; // Ordre décroissant (plus récents en premier)
    });
  } catch (error) {
    console.error('❌ Erreur récupération avis client:', error);
    return [];
  }
}

/**
 * Récupérer un avis par ID de contrat
 */
export async function getAvisByContratId(contratId: string): Promise<Avis | null> {
  try {
    const q = query(
      collection(db, 'avis'),
      where('contratId', '==', contratId)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
    } as Avis;
  } catch (error) {
    console.error('❌ Erreur récupération avis par contratId:', error);
    return null;
  }
}

/**
 * Récupérer un avis par ID
 */
export async function getAvisById(avisId: string): Promise<Avis | null> {
  try {
    const docSnap = await getDoc(doc(db, 'avis', avisId));
    if (!docSnap.exists()) {
      return null;
    }

    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as Avis;
  } catch (error) {
    console.error('❌ Erreur récupération avis:', error);
    return null;
  }
}

/**
 * Ajouter une réponse artisan à un avis
 */
export async function addReponseArtisan(
  avisId: string,
  artisanId: string,
  reponse: string
): Promise<void> {
  try {
    // Vérifier que l'avis existe et appartient à cet artisan
    const avis = await getAvisById(avisId);
    if (!avis) {
      throw new Error('Avis introuvable');
    }

    if (avis.artisanId !== artisanId) {
      throw new Error('Vous ne pouvez répondre qu\'aux avis vous concernant');
    }

    if (avis.reponseArtisan) {
      throw new Error('Vous avez déjà répondu à cet avis');
    }

    if (!reponse || reponse.trim().length < 10) {
      throw new Error('La réponse doit contenir au moins 10 caractères');
    }

    // Ajouter la réponse
    await updateDoc(doc(db, 'avis', avisId), {
      reponseArtisan: {
        contenu: reponse.trim(),
        date: serverTimestamp(),
      },
    });

    // Notifier le client de la réponse de l'artisan
    try {
      await createNotification(avis.clientId, {
        type: 'reponse_avis',
        titre: '💬 L\'artisan a répondu à votre avis',
        message: `L'artisan a publié une réponse à votre commentaire.`,
        lien: `/client/avis`,
      });
    } catch (notifError) {
      console.warn('⚠️ Notification réponse avis client échouée (non bloquant):', notifError);
    }

    console.log('✅ Réponse artisan ajoutée avec succès');
  } catch (error) {
    console.error('❌ Erreur ajout réponse artisan:', error);
    throw error;
  }
}

/**
 * Signaler un avis abusif (modération)
 */
export async function signalerAvis(avisId: string, userId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'avis', avisId), {
      signale: true,
      signalePar: userId,
      dateSignalement: serverTimestamp(),
    });

    console.log('✅ Avis signalé pour modération');
  } catch (error) {
    console.error('❌ Erreur signalement avis:', error);
    throw error;
  }
}

/**
 * Calculer la note moyenne d'un artisan
 */
export async function calculateAverageRating(artisanId: string): Promise<{
  moyenne: number;
  total: number;
}> {
  try {
    const avis = await getAvisByArtisanId(artisanId);

    if (avis.length === 0) {
      return { moyenne: 0, total: 0 };
    }

    const sommeNotes = avis.reduce((acc, curr) => acc + curr.note, 0);
    const moyenne = sommeNotes / avis.length;

    return {
      moyenne: Math.round(moyenne * 10) / 10, // Arrondi à 1 décimale
      total: avis.length,
    };
  } catch (error) {
    console.error('❌ Erreur calcul moyenne:', error);
    return { moyenne: 0, total: 0 };
  }
}

/**
 * Récupérer les contrats terminés sans avis pour un client
 * (pour afficher les invitations à laisser un avis)
 * Limite : 30 jours après validation (évite avis obsolètes)
 */
export async function getContratsTerminesSansAvis(clientId: string): Promise<Devis[]> {
  try {
    // 1. Récupérer les devis terminés et validés
    const devisRef = collection(db, 'devis');
    const q = query(
      devisRef,
      where('clientId', '==', clientId),
      where('statut', 'in', ['termine_valide', 'termine_auto_valide'])
    );
    const snapshot = await getDocs(q);
    const contrats = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Devis));

    if (contrats.length === 0) return [];

    // 2. Récupérer TOUS les avis du client en une seule requête
    // where('clientId', '==', clientId) suffit pour passer les règles Firestore
    const avisSnapshot = await getDocs(
      query(collection(db, 'avis'), where('clientId', '==', clientId))
    );
    // Construire un Set des contratId déjà notés
    const contratIdsAvecAvis = new Set(
      avisSnapshot.docs.map(d => d.data().contratId as string)
    );

    // 3. Filtrer : pas d'avis ET dans les 30 jours
    const DELAI_MAX_AVIS = 30 * 24 * 60 * 60 * 1000;
    return contrats.filter(contrat => {
      if (contratIdsAvecAvis.has(contrat.id)) return false;
      const dateValidation = contrat.travaux?.dateValidationClient?.toMillis() || 0;
      return (Date.now() - dateValidation) <= DELAI_MAX_AVIS;
    });
  } catch (error) {
    console.error('❌ Erreur récupération contrats sans avis:', error);
    return [];
  }
}
