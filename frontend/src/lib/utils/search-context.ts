/**
 * Gestion du contexte de recherche pour le parcours utilisateur
 * Permet de mémoriser l'intention de l'utilisateur avant inscription/connexion
 * et de pré-remplir le formulaire de demande après authentification
 */

import type { Categorie } from '@/types/firestore';

export interface SearchContext {
  categorie: Categorie;
  type?: string;
  materiau?: string;
  sousCategorie?: string;
  timestamp: number;
  source: 'petits-travaux-express' | 'homepage' | 'direct';
  titre?: string; // Titre généré automatiquement
  // Champs spécifiques au flux express
  typeProjet?: 'express' | 'publique';
  artisanId?: string;   // Artisan ciblé (demande directe)
  ville?: string;
  codePostal?: string;
  typeTravaux?: string;
  categorieExpress?: string; // Catégorie fine express (ex: 'serrurerie')
}

const STORAGE_KEY = 'artisan_search_context';
const EXPIRY_DURATION = 30 * 60 * 1000; // 30 minutes

/**
 * Sauvegarde le contexte de recherche dans sessionStorage
 */
export function saveSearchContext(context: Omit<SearchContext, 'timestamp'>): void {
  if (typeof window === 'undefined') return;
  
  const fullContext: SearchContext = {
    ...context,
    timestamp: Date.now(),
  };
  
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fullContext));
}

/**
 * Récupère le contexte de recherche depuis sessionStorage
 * Retourne null si expiré ou inexistant
 */
export function getSearchContext(): SearchContext | null {
  if (typeof window === 'undefined') return null;
  
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  
  try {
    const context: SearchContext = JSON.parse(stored);
    
    // Vérifier expiration (30 minutes)
    if (Date.now() - context.timestamp > EXPIRY_DURATION) {
      clearSearchContext();
      return null;
    }
    
    return context;
  } catch (error) {
    console.error('Erreur parsing search context:', error);
    return null;
  }
}

/**
 * Supprime le contexte de recherche
 */
export function clearSearchContext(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}

/**
 * Génère un titre de demande basé sur le contexte
 */
export function generateDemandeTitle(context: SearchContext): string {
  const parts: string[] = [];
  
  // Type de travaux
  if (context.materiau && context.type) {
    parts.push(formatLabel(context.type));
    parts.push('en');
    parts.push(formatLabel(context.materiau));
  } else if (context.type) {
    parts.push(formatLabel(context.type));
  } else {
    parts.push(formatLabel(context.categorie));
  }
  
  return parts.join(' ');
}

/**
 * Génère une description pré-remplie basée sur le contexte
 */
export function generateDemandeDescription(context: SearchContext): string {
  const parts: string[] = [];
  
  parts.push(`Je recherche un professionnel pour des travaux de ${formatLabel(context.categorie)}.`);
  
  if (context.materiau && context.type) {
    parts.push(`Plus précisément : ${formatLabel(context.type)} en ${formatLabel(context.materiau)}.`);
  } else if (context.type) {
    parts.push(`Type de travaux : ${formatLabel(context.type)}.`);
  }
  
  parts.push('\n\n[Merci de compléter avec plus de détails sur votre projet]');
  
  return parts.join(' ');
}

/**
 * Formate un label technique en texte lisible
 */
function formatLabel(value: string): string {
  const labels: Record<string, string> = {
    // Catégories
    menuiserie: 'Menuiserie',
    plomberie: 'Plomberie',
    electricite: 'Électricité',
    peinture: 'Peinture',
    
    // Types
    fenetres: 'Fenêtre',
    portes: 'Porte',
    'volets-stores': 'Volets/Stores',
    portails: 'Portail',
    
    // Matériaux
    pvc: 'PVC',
    bois: 'Bois',
    aluminium: 'Aluminium',
    velux: 'Vélux (toit)',
    
    // Types de portes
    entree: "Porte d'entrée",
    interieure: 'Porte intérieure',
    garage: 'Porte de garage',
    blindee: 'Porte blindée',
    coulissante: 'Porte coulissante',
    
    // Électricité
    domotique: 'Domotique',
    'petits-travaux': 'Petits travaux électriques',
    'prises-interrupteurs': 'Installation prises/interrupteurs',
    eclairage: 'Éclairage',
    
    // Plomberie
    depannage: 'Dépannage',
    robinetterie: 'Robinetterie',
    fuite: "Fuite d'eau",
    'wc-lavabo': 'WC/Lavabo',
    
    // Peinture
    'peinture-interieure': 'Peinture intérieure',
    'peinture-exterieure': 'Peinture extérieure',
    'papier-peint': 'Papier peint',
    enduit: 'Enduit décoratif',
  };
  
  return labels[value] || value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Crée un contexte depuis les query params de l'URL
 */
export function createContextFromParams(searchParams: URLSearchParams): SearchContext | null {
  const categorie = searchParams.get('categorie') as Categorie;
  if (!categorie) return null;
  
  const context: SearchContext = {
    categorie,
    type: searchParams.get('type') || undefined,
    materiau: searchParams.get('materiau') || undefined,
    timestamp: Date.now(),
    source: 'petits-travaux-express',
  };
  
  // Générer titre automatiquement
  context.titre = generateDemandeTitle(context);
  
  return context;
}
