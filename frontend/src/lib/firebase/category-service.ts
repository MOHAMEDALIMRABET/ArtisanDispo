import { getDocs, collection } from 'firebase/firestore';
import { db } from './config'; // Correct import for Firestore instance
import type { Categorie } from '@/types/firestore';
import { METIERS_ICONS } from '@/lib/constants/metiers';

/**
 * Fetches categories and subcategories for "Dépannage en urgence" and "Petits travaux & maintenance".
 * @returns {Promise<{ urgence: Array<{ icon: string; label: string; value: string }>, travaux: Array<{ icon: string; label: string; value: string }> }>}
 */
export async function fetchCategories() {
  try {
    const urgenceSnapshot = await getDocs(collection(db, 'categories_urgence'));
    const travauxSnapshot = await getDocs(collection(db, 'categories_travaux'));

    const urgence = urgenceSnapshot.docs.map((doc) => {
      // Priorité : icon stockée dans Firestore → lookup par doc.id → emoji par défaut
      const icons = METIERS_ICONS as Record<string, string>;
      return {
        ...doc.data(),
        value: doc.id,
        icon: (doc.data().icon as string) || icons[doc.id] || '🚨',
      };
    });

    const travaux = travauxSnapshot.docs.map((doc) => {
      // Priorité : icon stockée dans Firestore → lookup par doc.id → emoji par défaut
      const icons = METIERS_ICONS as Record<string, string>;
      return {
        ...doc.data(),
        value: doc.id,
        icon: (doc.data().icon as string) || icons[doc.id] || '🛠️',
      };
    });

    return { urgence, travaux };
  } catch (error) {
    console.error('Erreur lors de la récupération des catégories :', error);
    throw error;
  }
}