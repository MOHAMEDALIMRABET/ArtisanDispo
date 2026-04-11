import type { Timestamp } from 'firebase/firestore';

/**
 * Types de litiges possibles
 */
export type LitigeType = 
  | 'non_conformite'        // Travaux non conformes aux normes/devis
  | 'retard'                // Retard important dans l'exécution
  | 'abandon_chantier'      // Artisan abandonne le chantier
  | 'facture_excessive'     // Montant facturé anormalement élevé
  | 'malfacon'              // Défauts de construction/installation
  | 'non_respect_delais'    // Délais contractuels non respectés
  | 'autre';                // Autre motif

/**
 * Statuts du litige
 */
export type LitigeStatut = 
  | 'ouvert'                // Litige déclaré, en cours de discussion
  | 'en_mediation'          // Admin intervient comme médiateur
  | 'proposition_resolution' // Proposition de résolution en attente
  | 'resolu_accord'         // Résolu par accord mutuel
  | 'resolu_admin'          // Résolu par décision administrative
  | 'resolu'                // Résolu (ancien statut, compatibilité)
  | 'abandonne'             // Abandonné
  | 'clos_sans_suite'       // Fermé sans résolution (abandon)
  | 'escalade'              // Escaladé au niveau supérieur
  | 'escalade_juridique';   // Transmis au tribunal/avocat

/**
 * Alias pour LitigeStatut (compatibilité avec service)
 */
export type LitigeStatus = LitigeStatut;

/**
 * Priorités du litige
 */
export type LitigePriorite = 
  | 'basse'                 // Litige mineur
  | 'moyenne'               // Litige standard
  | 'haute'                 // Litige important
  | 'urgente';              // Litige critique (danger, abandon, etc.)

/**
 * Types de résolution
 */
export type ResolutionType = 
  | 'remboursement_partiel' // Remboursement d'une partie du montant
  | 'remboursement_total'   // Remboursement complet
  | 'travaux_supplementaires' // Artisan doit refaire/compléter
  | 'reduction_prix'        // Réduction du prix final
  | 'annulation_contrat'    // Annulation complète du contrat
  | 'penalite_retard'       // Pénalités pour retard
  | 'autre';                // Autre type de résolution

/**
 * Interface principale Litige
 */
export interface Litige {
  id: string;
  
  // === Source du litige (classique devis ou express) ===
  typeSource?: 'classique' | 'express'; // Type de source — 'classique' par défaut
  sourceId?: string;          // ID source : demandeExpressId (express) ou devisId (classique)

  // === Références ===
  devisId?: string;           // Devis concerné (classique uniquement — optionnel pour express)
  contratId?: string;         // Contrat si créé
  clientId: string;           // UID client
  artisanId: string;          // UID artisan
  
  // === Déclaration ===
  declarantId: string;       // UID de celui qui déclare le litige
  declarantRole: 'client' | 'artisan';  // Rôle du déclarant
  
  // === Informations litige ===
  type: LitigeType;
  motif: string;             // Titre/motif du litige
  objet?: string;            // Alias (compatibilité)
  description: string;       // Description détaillée du problème
  montantConteste?: number;  // Montant contesté (€)
  
  preuves?: {
    photos?: string[];       // URLs photos Firebase Storage
    documents?: string[];    // URLs documents (PDF, factures, etc.)
    messages?: string[];     // IDs messages concernés
  };
  
  piecesJointes?: LitigePieceJointe[];  // Pièces jointes
  
  // === Statut et priorité ===
  statut: LitigeStatut;
  priorite?: LitigePriorite;
  
  // === Parties prenantes ===
  ouvertPar?: 'client' | 'artisan';  // Qui a ouvert le litige (alias)
  assigneA?: string;                  // Admin UID si en médiation
  adminAssigne?: string | null;       // Alias (compatibilité)
  
  // === Résolution ===
  resolutionType?: ResolutionType;
  resolution?: string | null;         // Détails de la résolution (alias)
  resolutionDetails?: string;         // Détails de la résolution
  montantCompensation?: number;       // Montant remboursement/compensation (€)
  dateLimiteResolution?: Timestamp;   // Date limite pour résolution
  
  // === Dates ===
  createdAt: Timestamp;
  updatedAt: Timestamp;
  dateOuverture?: Timestamp;          // Date d'ouverture (alias)
  dateResolution?: Timestamp | null;  // Date de résolution
  resolvedAt?: Timestamp;             // Date de résolution (alias)
  closedAt?: Timestamp;               // Date de clôture définitive
  
  // === Timeline/Historique ===
  historique: HistoriqueAction[];
  
  // === Métadonnées ===
  versionSchema?: number;             // Pour schema versioning
  tags?: string[];                    // Tags catégorisation (ex: ["paiement", "qualité"])
}

/**
 * Types d'actions dans l'historique
 */
export type ActionType = 
  | 'creation'                   // Création du litige
  | 'message'                    // Nouveau message
  | 'commentaire'                // Commentaire (alias)
  | 'changement_statut'          // Changement de statut
  | 'ajout_preuve'               // Ajout photo/document
  | 'proposition_resolution'     // Proposition de solution
  | 'acceptation_resolution'     // Acceptation proposition
  | 'refus_resolution'           // Refus proposition
  | 'assignation'                // Admin prend en charge
  | 'assignation_admin'          // Admin prend en charge (alias)
  | 'commentaire_admin'          // Commentaire interne admin
  | 'escalade'                   // Escalade juridique
  | 'resolution'                 // Résolution finale
  | 'cloture';                   // Clôture du litige

/**
 * Alias pour ActionType (compatibilité avec service)
 */
export type LitigeActionType = ActionType;

/**
 * Action dans le timeline du litige
 */
export interface HistoriqueAction {
  id: string;                // UUID unique
  timestamp: Timestamp;      // Date/heure action
  acteur: string;            // UID utilisateur
  acteurRole: 'client' | 'artisan' | 'admin';
  acteurNom: string;         // Nom complet (cache pour affichage)
  
  type: ActionType;
  description: string;       // Description lisible humain
  
  // Données spécifiques selon type
  metadata?: {
    ancienStatut?: string;
    nouveauStatut?: string;
    messageId?: string;
    preuveUrl?: string;
    propositionId?: string;
    montant?: number;
    [key: string]: any;      // Flexibilité pour futurs champs
  };
}

/**
 * Proposition de résolution
 */
export interface PropositionResolution {
  id: string;                // UUID unique
  litigeId: string;
  proposantId: string;
  proposantRole: 'client' | 'artisan' | 'admin';
  
  type: ResolutionType;
  details: string;
  montantCompensation?: number;
  delaiJours?: number;       // Délai supplémentaire si travaux
  
  statut: 'en_attente' | 'acceptee' | 'refusee';
  acceptePar?: string;       // UID si acceptée
  refusePar?: string;        // UID si refusée
  motifRefus?: string;
  
  createdAt: Timestamp;
  respondedAt?: Timestamp;
}

/**
 * Statistiques litiges (dashboard admin)
 */
export interface LitigeStats {
  total: number;
  ouverts: number;
  enMediation: number;
  resolus: number;
  closSansSuite: number;
  escaladeJuridique: number;
  
  // Métriques qualité
  tauxResolutionAmiable: number;      // % résolus sans admin
  tempsResolutionMoyen: number;       // En jours
  montantCompensationTotal: number;   // Total € remboursés
  montantCompensationMoyen: number;   // Moyenne € par litige
  
  // Par type
  parType: Record<LitigeType, number>;
  
  // Par priorité
  parPriorite: Record<LitigePriorite, number>;
}

/**
 * Filtres recherche litiges
 */
export interface LitigeFilters {
  statut?: LitigeStatut | LitigeStatut[];
  priorite?: LitigePriorite | LitigePriorite[];
  type?: LitigeType | LitigeType[];
  assigneA?: string;
  dateDebut?: Date;
  dateFin?: Date;
  montantMin?: number;
  montantMax?: number;
  searchQuery?: string;      // Recherche texte objet/description
}

/**
 * Vue enrichie litige avec infos client/artisan
 */
export interface LitigeEnrichi extends Litige {
  clientNom: string;
  clientPrenom: string;
  clientEmail: string;
  
  artisanBusinessName: string;
  artisanEmail: string;
  
  devisMontantTTC: number;
  devisStatut: string;
  
  contratStatut?: string;
  contratDateDebut?: Timestamp;
  contratDateFin?: Timestamp;
}

/**
 * Message litige (dans timeline)
 */
export interface MessageLitige {
  id: string;
  litigeId: string;
  auteurId: string;
  auteurRole: 'client' | 'artisan' | 'admin';
  auteurNom: string;
  
  contenu: string;
  
  preuves?: {
    photos?: string[];
    documents?: string[];
  };
  
  isInterne?: boolean;       // Visible admin uniquement
  
  createdAt: Timestamp;
}

/**
 * Labels affichage UI
 */
export const LITIGE_TYPE_LABELS: Record<LitigeType, string> = {
  non_conformite: 'Non-conformité',
  retard: 'Retard',
  abandon_chantier: 'Abandon de chantier',
  facture_excessive: 'Facture excessive',
  malfacon: 'Malfaçon',
  non_respect_delais: 'Non-respect des délais',
  autre: 'Autre'
};

export const LITIGE_STATUT_LABELS: Record<LitigeStatut, string> = {
  ouvert: 'Ouvert',
  en_mediation: 'En médiation',
  proposition_resolution: 'Proposition en attente',
  resolu_accord: 'Résolu par accord',
  resolu_admin: 'Résolu par admin',
  resolu: 'Résolu',
  abandonne: 'Abandonné',
  clos_sans_suite: 'Clos sans suite',
  escalade: 'Escaladé',
  escalade_juridique: 'Escalade juridique'
};

export const LITIGE_PRIORITE_LABELS: Record<LitigePriorite, string> = {
  basse: 'Basse',
  moyenne: 'Moyenne',
  haute: 'Haute',
  urgente: 'Urgente'
};

export const RESOLUTION_TYPE_LABELS: Record<ResolutionType, string> = {
  remboursement_partiel: 'Remboursement partiel',
  remboursement_total: 'Remboursement total',
  travaux_supplementaires: 'Travaux supplémentaires',
  reduction_prix: 'Réduction de prix',
  annulation_contrat: 'Annulation du contrat',
  penalite_retard: 'Pénalité de retard',
  autre: 'Autre'
};

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  creation: 'Création',
  message: 'Message',
  commentaire: 'Commentaire',
  changement_statut: 'Changement de statut',
  ajout_preuve: 'Ajout de preuve',
  proposition_resolution: 'Proposition de résolution',
  acceptation_resolution: 'Acceptation',
  refus_resolution: 'Refus',
  assignation: 'Assignation',
  assignation_admin: 'Assignation admin',
  commentaire_admin: 'Commentaire admin',
  escalade: 'Escalade',
  resolution: 'Résolution',
  cloture: 'Clôture'
};

/**
 * Couleurs pour les statuts (TailwindCSS)
 */
export const LITIGE_STATUT_COLORS: Record<LitigeStatut, string> = {
  ouvert: 'bg-[#FFC107] text-white',                    // Jaune
  en_mediation: 'bg-[#FF6B00] text-white',              // Orange
  proposition_resolution: 'bg-[#17A2B8] text-white',    // Info
  resolu_accord: 'bg-[#28A745] text-white',             // Vert
  resolu_admin: 'bg-[#28A745] text-white',              // Vert
  resolu: 'bg-[#28A745] text-white',                    // Vert
  abandonne: 'bg-[#6C757D] text-white',                 // Gris
  clos_sans_suite: 'bg-[#6C757D] text-white',           // Gris
  escalade: 'bg-[#DC3545] text-white',                  // Rouge
  escalade_juridique: 'bg-[#DC3545] text-white'         // Rouge
};

export const LITIGE_PRIORITE_COLORS: Record<LitigePriorite, string> = {
  basse: 'bg-[#95A5A6] text-white',      // Gris clair
  moyenne: 'bg-[#FFC107] text-white',    // Jaune
  haute: 'bg-[#FF6B00] text-white',      // Orange
  urgente: 'bg-[#DC3545] text-white'     // Rouge
};
/**
 * Pièce jointe dans un litige
 */
export interface LitigePieceJointe {
  url: string;
  type: 'photo' | 'document' | 'facture' | 'autre';
  nom: string;
  taille?: number;
  uploadedAt: Timestamp;
  uploadedBy: string;
}

/**
 * Action dans l'historique d'un litige (alias pour HistoriqueAction)
 * Version simplifiée pour la création d'actions
 */
export interface LitigeAction {
  type: LitigeActionType;
  auteurId?: string;           // Alias pour acteur
  acteur?: string;             // UID utilisateur
  auteurRole?: 'client' | 'artisan' | 'admin';  // Alias pour acteurRole  
  acteurRole?: 'client' | 'artisan' | 'admin';
  description: string;
  details?: Record<string, any>;
  piecesJointes?: LitigePieceJointe[];
  date: Timestamp;
}

/**
 * Données pour créer un litige
 */
export interface CreateLitigeData {
  // === Source : devis classique OU demande express ===
  devisId?: string;              // Requis pour litiges classiques
  sourceId?: string;             // Requis pour litiges express (demandeExpressId)
  typeSource?: 'classique' | 'express'; // Défaut : 'classique'

  clientId: string;
  artisanId: string;
  declarantId: string;
  declarantRole: 'client' | 'artisan';
  type: LitigeType;
  motif: string;
  description: string;
  montantConteste?: number;
  piecesJointes?: LitigePieceJointe[];
}