// Helper pour la gestion de l'obligation décennale
// Utilisable côté artisan (profil/vérification) et côté client (recherche)
//
// ⚠️  PÉRIMÈTRE LÉGAL FRANCE :
// La garantie décennale (RC Décennale) est obligatoire UNIQUEMENT pour les travaux
// de construction affectant la solidité de l'ouvrage ou le rendant impropre à sa destination
// (art. L241-1 Code des assurances).
//
// ❌ NE nécessite PAS de décennale :
//   - Serrurerie (ouverture/dépannage) → service de dépannage
//   - Peinture décorative → finition non structurelle
//   - Extérieur/jardin (entretien) → entretien non structurel
//   - Rénovation légère / petits travaux de maintenance
//   - Plomberie courante (débouchage, remplacement robinet)
//   - Électricité courante (remplacement prise, ampoule)
//   - Carrelage (pose de carrelage existant)
//   - Climatisation (entretien/remplacement)
//   - Chauffage (entretien/remplacement radiateur)
//
// ✅ Nécessite la décennale (travaux de construction structurels) :
//   - Maçonnerie (gros œuvre, fondations, murs porteurs)
//   - Toiture (structure + étanchéité)
//   - Charpente (structure bois)
//   - Isolation thermique par l'extérieur (ITE) — travaux structurels
//   - Menuiserie extérieure posée (fenêtres, portes d'entrée — affecte l'étanchéité)

import type { Categorie } from '@/types/firestore';

// Métiers pour lesquels la décennale est OBLIGATOIRE (travaux structurels BTP)
export const metiersDecennale: Categorie[] = [
  'maconnerie',
  'toiture',
  'charpente',
  'isolation',
];

// Retourne la liste des métiers de l'artisan qui nécessitent la décennale
export function getMetiersNecessitantDecennale(metiers: Categorie[]): Categorie[] {
  return metiers.filter(metier => metiersDecennale.includes(metier));
}

// Vérifie si un artisan doit fournir la décennale (au moins un métier structurel)
export function artisanDoitDecennale(metiers: Categorie[]): boolean {
  return getMetiersNecessitantDecennale(metiers).length > 0;
}

// Vérifie si un artisan est "décennale vérifiée" (pour affichage client)
export function isDecennaleVerifiee(artisan: { verificationDocuments?: any; metiers: Categorie[] }): boolean {
  if (!artisanDoitDecennale(artisan.metiers)) return false;
  return artisan.verificationDocuments?.decennale?.verified === true;
}

// Vérifie si un métier spécifique nécessite la décennale
export function metierNecessiteDecennale(metier: Categorie): boolean {
  return metiersDecennale.includes(metier);
}

// Utilisation côté client (recherche)
// Exemple : filtrer les artisans avec décennale vérifiée
// artisans.filter(a => isDecennaleVerifiee(a));
