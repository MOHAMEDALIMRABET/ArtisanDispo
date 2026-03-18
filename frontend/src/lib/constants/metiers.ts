import type { Categorie } from '@/types/firestore';

/**
 * Liste complète des métiers disponibles sur la plateforme
 */
export const METIERS_DISPONIBLES: Categorie[] = [
  'plomberie',
  'electricite',
  'peinture',
  'menuiserie',
  'maconnerie',
  'carrelage',
  'chauffage',
  'climatisation',
  'toiture',
  'isolation',
  'serrurerie',
  'exterieur-jardin',
  'renovation'
];

/**
 * Mapping métiers : valeur technique -> label d'affichage
 */
export const METIERS_MAP: Record<Categorie, string> = {
  'plomberie': 'Plomberie',
  'electricite': 'Électricité',
  'peinture': 'Peinture',
  'menuiserie': 'Menuiserie',
  'maconnerie': 'Maçonnerie',
  'carrelage': 'Carrelage',
  'chauffage': 'Chauffage',
  'climatisation': 'Climatisation',
  'toiture': 'Toiture',
  'isolation': 'Isolation',
  'serrurerie': 'Serrurerie',
  'exterieur-jardin': 'Extérieur et jardin',
  'renovation': 'Rénovation'
};

/**
 * Liste des métiers avec leurs icônes pour l'affichage
 */
export const METIERS_AVEC_ICONES: { value: Categorie; label: string; icon: string }[] = [
  { value: 'plomberie', label: 'Plomberie', icon: '🔧' },
  { value: 'electricite', label: 'Électricité', icon: '💡' },
  { value: 'peinture', label: 'Peinture', icon: '🎨' },
  { value: 'menuiserie', label: 'Menuiserie', icon: '🔨' },
  { value: 'maconnerie', label: 'Maçonnerie', icon: '🧱' },
  { value: 'carrelage', label: 'Carrelage', icon: '⬜' },
  { value: 'chauffage', label: 'Chauffage', icon: '🔥' },
  { value: 'climatisation', label: 'Climatisation', icon: '❄️' },
  { value: 'toiture', label: 'Toiture', icon: '🏠' },
  { value: 'isolation', label: 'Isolation', icon: '🧤' },
  { value: 'serrurerie', label: 'Serrurerie', icon: '🔐' },
  { value: 'exterieur-jardin', label: 'Extérieur et jardin', icon: '🌳' },
  { value: 'renovation', label: 'Rénovation', icon: '🏗️' },
];
