/**
 * Service de synchronisation du statut emailVerified
 * Synchronise Firebase Auth vers Firestore pour permettre les requêtes
 */

import { auth } from './config';
import { updateUser } from './user-service';
import { updateArtisan } from './artisan-service';
import { onAuthStateChanged } from 'firebase/auth';

/**
 * Synchroniser le statut emailVerified de Auth vers Firestore
 * 
 * ⚠️ Cette fonction est appelée juste après la création de compte.
 * Les deux updateDoc sont protégés par try/catch pour ne jamais
 * bloquer le flux d'inscription (l'email sera synchro à la prochaine connexion).
 */
export async function syncEmailVerificationStatus(userId: string): Promise<void> {
  const currentUser = auth.currentUser;
  
  if (!currentUser || currentUser.uid !== userId) {
    return;
  }

  // Mettre à jour le statut emailVerified dans users
  // Protégé par try/catch : le document vient d'être créé,
  // une légère latence Firestore pourrait provoquer une erreur transitoire
  try {
    await updateUser(userId, {
      emailVerified: currentUser.emailVerified,
    });
  } catch (error) {
    // Ne pas bloquer l'inscription — sera synchronisé à la prochaine connexion
    console.warn('⚠️ syncEmailVerificationStatus (users) — sera retenté à la connexion:', error);
  }

  // Si artisan, mettre à jour aussi le profil artisan
  try {
    await updateArtisan(userId, {
      emailVerified: currentUser.emailVerified,
    });
  } catch (error) {
    // Pas un artisan, ou latence Firestore — ignoré
  }
}

/**
 * Observer les changements de statut d'email et synchroniser
 */
export function startEmailVerificationSync() {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Recharger l'utilisateur pour avoir les dernières données
      await user.reload();
      
      // Synchroniser le statut
      await syncEmailVerificationStatus(user.uid);
    }
  });
}
