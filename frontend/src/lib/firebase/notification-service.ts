import { db } from './config';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, getDoc, orderBy, limit, Timestamp } from 'firebase/firestore';
import type { Notification } from '@/types/firestore';
import { sendNouvelleDemandePubliqueEmail } from './email-notification-service';

/**
 * Crée une notification pour un utilisateur
 * @param userId ID de l'utilisateur destinataire
 * @param notificationData Données de la notification
 * @returns ID de la notification créée
 */
export async function createNotification(
  userId: string,
  notificationData: Omit<Notification, 'id' | 'userId' | 'dateCreation' | 'lue'>
): Promise<string> {
  console.log('💾 Création notification Firestore pour userId:', userId, 'type:', notificationData.type);
  const notificationsRef = collection(db, 'notifications');
  const docRef = await addDoc(notificationsRef, {
    userId,
    ...notificationData,
    lue: false,
    dateCreation: Timestamp.now(),
  });

  console.log('✅ Notification créée dans Firestore, ID:', docRef.id);
  return docRef.id;
}

/**
 * Récupère les notifications d'un utilisateur
 * @param userId ID de l'utilisateur
 * @param onlyUnread Si true, ne retourne que les non lues
 * @param maxResults Nombre max de résultats (défaut: 20)
 * @returns Liste de notifications
 */
export async function getUserNotifications(
  userId: string,
  onlyUnread: boolean = false,
  maxResults: number = 20
): Promise<Notification[]> {
  const notificationsRef = collection(db, 'notifications');
  
  let q = query(
    notificationsRef,
    where('userId', '==', userId),
    orderBy('dateCreation', 'desc'),
    limit(maxResults)
  );

  if (onlyUnread) {
    q = query(
      notificationsRef,
      where('userId', '==', userId),
      where('lue', '==', false),
      orderBy('dateCreation', 'desc'),
      limit(maxResults)
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Notification[];
}

/**
 * Marque une notification comme lue
 * @param notificationId ID de la notification
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const notifRef = doc(db, 'notifications', notificationId);
  await updateDoc(notifRef, {
    lue: true,
  });
}

/**
 * Marque toutes les notifications d'un utilisateur comme lues
 * @param userId ID de l'utilisateur
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const notificationsRef = collection(db, 'notifications');
  const q = query(
    notificationsRef,
    where('userId', '==', userId),
    where('lue', '==', false)
  );

  const snapshot = await getDocs(q);
  const updates = snapshot.docs.map(doc =>
    updateDoc(doc.ref, { lue: true })
  );

  await Promise.all(updates);
}

/**
 * Marque les notifications d'un utilisateur par types comme lues
 * @param userId ID de l'utilisateur
 * @param types Types de notifications à marquer comme lues
 */
export async function markNotificationsByTypeAsRead(
  userId: string,
  types: string[]
): Promise<void> {
  const notificationsRef = collection(db, 'notifications');
  const q = query(
    notificationsRef,
    where('userId', '==', userId),
    where('lue', '==', false)
  );

  const snapshot = await getDocs(q);
  
  // Filtrer côté client pour les types spécifiques
  const updates = snapshot.docs
    .filter(doc => types.includes(doc.data().type))
    .map(doc => updateDoc(doc.ref, { lue: true }));

  await Promise.all(updates);
}

/**
 * Marque toutes les notifications non lues d'un utilisateur pour un lien donné comme lues
 * Utile pour marquer les notifications obsolètes (ex: travaux_demarres quand travaux_termines arrive)
 */
export async function markNotificationsByLienAsRead(userId: string, lien: string): Promise<void> {
  const notificationsRef = collection(db, 'notifications');
  const q = query(
    notificationsRef,
    where('userId', '==', userId),
    where('lue', '==', false)
  );

  const snapshot = await getDocs(q);
  const updates = snapshot.docs
    .filter(doc => doc.data().lien === lien)
    .map(doc => updateDoc(doc.ref, { lue: true }));

  await Promise.all(updates);
}

/**
 * Compte le nombre de notifications non lues
 * @param userId ID de l'utilisateur
 * @returns Nombre de notifications non lues
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const notificationsRef = collection(db, 'notifications');
  const q = query(
    notificationsRef,
    where('userId', '==', userId),
    where('lue', '==', false)
  );

  const snapshot = await getDocs(q);
  return snapshot.size;
}

/**
 * Envoie une notification à plusieurs utilisateurs
 * @param userIds Liste des IDs utilisateurs
 * @param notificationData Données communes de la notification
 */
export async function sendBulkNotifications(
  userIds: string[],
  notificationData: Omit<Notification, 'id' | 'userId' | 'dateCreation' | 'lue'>
): Promise<void> {
  const promises = userIds.map(userId =>
    createNotification(userId, notificationData)
  );

  await Promise.all(promises);
}

/**
 * Notifications spécifiques au métier
 */

// Nouvelle demande pour artisan
export async function notifyArtisanNouvelDemande(
  artisanId: string,
  demandeId: string,
  categorie: string,
  ville: string
): Promise<void> {
  await createNotification(artisanId, {
    type: 'nouvelle_demande',
    titre: `Nouvelle demande: ${categorie}`,
    message: `Un client recherche un artisan à ${ville}. Consultez la demande pour envoyer un devis.`,
    lien: `/artisan/demandes`,
  });
}

// Nouveau devis reçu pour client
export async function notifyClientNouveauDevis(
  clientId: string,
  devisId: string,
  artisanNom: string
): Promise<void> {
  await createNotification(clientId, {
    type: 'nouveau_devis',
    titre: 'Nouveau devis reçu',
    message: `${artisanNom} vous a envoyé un devis. Consultez-le maintenant.`,
    lien: `/client/devis/${devisId}`,
  });
}

// Devis accepté pour artisan
export async function notifyArtisanDevisAccepte(
  artisanId: string,
  devisId: string,
  clientNom: string,
  numeroDevis?: string
): Promise<void> {
  await createNotification(artisanId, {
    type: 'devis_accepte',
    titre: '✅ Devis accepté !',
    message: numeroDevis 
      ? `${clientNom} a accepté votre devis ${numeroDevis}. Un contrat a été généré.`
      : `${clientNom} a accepté votre devis. Un contrat a été généré.`,
    lien: `/artisan/devis?devisId=${devisId}`, // ← CORRECTION : utiliser query param pour highlight
  });
}

// Devis refusé pour artisan
export async function notifyArtisanDevisRefuse(
  artisanId: string,
  devisId: string,
  clientNom: string,
  numeroDevis?: string,
  motif?: string
): Promise<void> {
  const message = numeroDevis
    ? `${clientNom} a refusé votre devis ${numeroDevis}.${motif ? ` Motif : ${motif}` : ''}`
    : `${clientNom} a refusé votre devis.${motif ? ` Motif : ${motif}` : ''}`;

  await createNotification(artisanId, {
    type: 'devis_refuse',
    titre: '❌ Devis refusé',
    message,
    lien: `/artisan/devis?devisId=${devisId}`,
  });
}

// Demande de révision de devis
export async function notifyArtisanDevisRevision(
  artisanId: string,
  demandeId: string,
  clientNom: string,
  numeroDevis?: string,
  motif?: string
): Promise<void> {
  const message = numeroDevis
    ? `${clientNom} souhaite une révision du devis ${numeroDevis}.${motif ? ` Motif : ${motif}` : ''}`
    : `${clientNom} souhaite une révision de devis.${motif ? ` Motif : ${motif}` : ''}`;

  await createNotification(artisanId, {
    type: 'devis_revision',
    titre: '🔄 Demande de révision de devis',
    message,
    lien: `/artisan/devis/nouveau?demandeId=${demandeId}`,
  });
}

// Devis reçu pour client
export async function notifyClientDevisRecu(
  clientId: string,
  devisId: string,
  artisanNom: string,
  numeroDevis?: string
): Promise<void> {
  console.log('📨 Création notification devis_recu pour client:', clientId, 'devis:', numeroDevis);
  console.log('📨 Détails notification:', { clientId, devisId, artisanNom, numeroDevis });
  
  try {
    const notifId = await createNotification(clientId, {
      type: 'devis_recu',
      titre: '📄 Nouveau devis reçu',
      message: numeroDevis
        ? `${artisanNom} vous a envoyé le devis ${numeroDevis}.`
        : `${artisanNom} vous a envoyé un nouveau devis.`,
      lien: `/client/devis/${devisId}`,
    });
    console.log('✅ Notification devis_recu créée avec succès, ID:', notifId);
  } catch (error) {
    console.error('❌ Erreur lors de la création de la notification:', error);
    throw error;
  }
}


// Contrat signé
export async function notifyContratSigne(
  userId: string,
  contratId: string,
  isArtisan: boolean
): Promise<void> {
  await createNotification(userId, {
    type: 'contrat_signe',
    titre: 'Contrat signé',
    message: isArtisan
      ? 'Le contrat a été signé. Vous pouvez commencer les travaux.'
      : 'Le contrat a été signé. Les travaux vont commencer.',
    lien: isArtisan ? '/artisan/dashboard' : '/dashboard',
  });
}

// Paiement libéré
export async function notifyPaiementLibere(
  artisanId: string,
  contratId: string,
  montant: number
): Promise<void> {
  await createNotification(artisanId, {
    type: 'paiement_libere',
    titre: '💰 Paiement libéré',
    message: `Le paiement de ${montant.toFixed(2)}€ a été libéré sur votre compte.`,
    lien: '/artisan/dashboard',
  });
}

// Nouvel avis
export async function notifyNouvelAvis(
  artisanId: string,
  avisId: string,
  note: number
): Promise<void> {
  await createNotification(artisanId, {
    type: 'nouvel_avis',
    titre: `Nouvel avis : ${note}⭐`,
    message: 'Un client a laissé un avis sur votre profil.',
    lien: '/artisan/profil',
  });
}

// ============================================
// Notification nouvelle demande publique
// ============================================

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Notifie tous les artisans approués dont le métier + zone couvrent la demande publique.
 * Crée une notification in-app ET programme un email pour chacun.
 * @returns Liste des IDs artisans notifiés
 */
export async function notifyArtisansDemandePublique(
  demandeId: string,
  metier: string,
  ville: string,
  description: string,
  demandeCoords?: { latitude: number; longitude: number }
): Promise<string[]> {
  try {
    // 1. Récupérer artisans avec ce métier (single where, pas d'index composite)
    const artisansSnap = await getDocs(
      query(
        collection(db, 'artisans'),
        where('metiers', 'array-contains', metier)
      )
    );

    if (artisansSnap.empty) return [];

    const artisansNotifies: string[] = [];
    const villeNorm = ville.toLowerCase().trim();

    const promises = artisansSnap.docs.map(async (artisanDoc) => {
      const artisan = artisanDoc.data();
      const artisanId = artisanDoc.id;

      // Filtre : approué + email vérifié
      if (artisan.verificationStatus !== 'approved') return;
      if (!artisan.emailVerified) return;

      // Filtre : zone d'intervention couvre la demande
      const zones: any[] = artisan.zonesIntervention || [];
      
      // Fallback : si l'artisan n'a pas configuré ses zones,
      // on utilise sa ville principale (location.city OU location.ville — les deux noms coexistent)
      if (zones.length === 0) {
        const artisanVille = (
          artisan.location?.city ||
          artisan.location?.ville ||
          ''
        ).toLowerCase().trim();
        if (!artisanVille || artisanVille !== villeNorm) return;
      } else {
        const zoneMatch = zones.some((zone: any) => {
          // Comparaison GPS si dispo sur les deux
          if (demandeCoords && zone.latitude && zone.longitude) {
            const dist = haversineKm(demandeCoords.latitude, demandeCoords.longitude, zone.latitude, zone.longitude);
            return dist <= (zone.rayonKm || 50);
          }
          // Sinon : comparaison nom de ville
          return zone.ville?.toLowerCase().trim() === villeNorm;
        });
        if (!zoneMatch) return;
      }

      // 2a. Notification in-app
      await createNotification(artisanId, {
        type: 'nouvelle_demande_publique',
        titre: `🔔 Nouvelle demande : ${metier} à ${ville}`,
        message: description
          ? description.slice(0, 100) + (description.length > 100 ? '...' : '')
          : `Un client recherche un artisan en ${metier} à ${ville}.`,
        lien: `/artisan/demandes`,
      });

      // 2b. Email (fire-and-forget, ne bloque pas)
      try {
        const userSnap = await getDoc(doc(db, 'users', artisanId));
        if (userSnap.exists()) {
          const userData = userSnap.data();
          if (userData.email && userData.preferences?.notifications?.email !== false) {
            await sendNouvelleDemandePubliqueEmail(
              userData.email,
              userData.prenom || 'Artisan',
              metier,
              ville,
              description,
              demandeId
            );
          }
        }
      } catch (emailError) {
        console.error(`⚠️ Email non envoyé pour artisan ${artisanId}:`, emailError);
      }

      artisansNotifies.push(artisanId);
    });

    await Promise.all(promises);

    // 3. Mettre à jour la demande avec les artisans notifiés
    if (artisansNotifies.length > 0) {
      await updateDoc(doc(db, 'demandes', demandeId), {
        artisansNotifiesIds: artisansNotifies,
      });
      console.log(`✅ ${artisansNotifies.length} artisan(s) notifié(s) pour la demande ${demandeId}`);
    } else {
      console.log(`ℹ️ Aucun artisan à notifier pour la demande ${demandeId} (métier: ${metier}, ville: ${ville})`);
    }

    return artisansNotifies;
  } catch (error) {
    console.error('❌ Erreur notifyArtisansDemandePublique:', error);
    return [];
  }
}

// ============================================
// Notification nouvelle demande EXPRESS publique
// ============================================

/**
 * Notifie tous les artisans approuvés dont le métier + zone couvrent
 * une demande express PUBLIQUE (sans artisanId cible).
 *
 * Logique identique à notifyArtisansDemandePublique() mais :
 * - Porte sur le champ `categorie` (= métier Firestore) de la demande express
 * - Lien direct vers /artisan/demandes-express/[id]
 * - Type de notification : 'nouvelle_demande_express'
 *
 * @returns Liste des IDs artisans notifiés
 */
export async function notifyArtisansDemandeExpressPublique(
  demandeId: string,
  categorie: string,       // ex: 'serrurerie', 'plomberie', 'electricite'
  categorieLabel: string,  // ex: 'Serrurerie'
  ville: string,
  description: string,
  demandeCoords?: { latitude: number; longitude: number }
): Promise<string[]> {
  try {
    // 1. Récupérer artisans ayant ce métier dans leur tableau `metiers`
    const artisansSnap = await getDocs(
      query(
        collection(db, 'artisans'),
        where('metiers', 'array-contains', categorie)
      )
    );

    if (artisansSnap.empty) {
      console.log(`ℹ️ Aucun artisan avec le métier '${categorie}' pour demande express ${demandeId}`);
      return [];
    }

    const artisansNotifies: string[] = [];
    const villeNorm = ville.toLowerCase().trim();

    const promises = artisansSnap.docs.map(async (artisanDoc) => {
      const artisan = artisanDoc.data();
      const artisanId = artisanDoc.id;

      // Filtre : approuvé + email vérifié
      if (artisan.verificationStatus !== 'approved') return;
      if (!artisan.emailVerified) return;

      // Filtre : zone d'intervention couvre la demande
      const zones: any[] = artisan.zonesIntervention || [];

      if (zones.length === 0) {
        // Fallback : ville principale de l'artisan
        const artisanVille = (
          artisan.location?.city ||
          artisan.location?.ville ||
          ''
        ).toLowerCase().trim();
        if (!artisanVille || artisanVille !== villeNorm) return;
      } else {
        const zoneMatch = zones.some((zone: any) => {
          // Comparaison GPS si disponible
          if (demandeCoords && zone.latitude && zone.longitude) {
            const dist = haversineKm(
              demandeCoords.latitude, demandeCoords.longitude,
              zone.latitude, zone.longitude
            );
            return dist <= (zone.rayonKm || 50);
          }
          // Sinon : comparaison nom de ville
          return zone.ville?.toLowerCase().trim() === villeNorm;
        });
        if (!zoneMatch) return;
      }

      // Notification in-app : lien direct vers le détail de la demande
      await createNotification(artisanId, {
        type: 'nouvelle_demande_express',
        titre: `⚡ Nouvelle demande express : ${categorieLabel} à ${ville}`,
        message: description
          ? description.slice(0, 100) + (description.length > 100 ? '...' : '')
          : `Un client cherche un artisan en ${categorieLabel} à ${ville} (travaux express).`,
        lien: `/artisan/demandes-express/${demandeId}`,
      });

      artisansNotifies.push(artisanId);
    });

    await Promise.all(promises);

    console.log(
      artisansNotifies.length > 0
        ? `✅ ${artisansNotifies.length} artisan(s) notifié(s) pour demande express ${demandeId}`
        : `ℹ️ Aucun artisan à notifier pour demande express ${demandeId} (métier: ${categorie}, ville: ${ville})`
    );

    return artisansNotifies;
  } catch (error) {
    console.error('❌ Erreur notifyArtisansDemandeExpressPublique:', error);
    return [];
  }
}
