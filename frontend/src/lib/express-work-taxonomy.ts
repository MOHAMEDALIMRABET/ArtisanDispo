import type { Categorie } from '@/types/firestore';

export type TypeTravauxExpress = 'depannage-urgence' | 'petits-travaux-maintenance';

export interface ExpressSousCategorieOption {
  value: string;
  label: string;
  prix?: string; // Information tarifaire affichée au survol
}

export interface ExpressCategorieOption {
  value: string;
  label: string;
  metier: Categorie;
  sousCategories: ExpressSousCategorieOption[];
}

interface ExpressTypeConfig {
  label: string;
  urgenceLabel: string;
  urgenceValue: 'immediat' | 'urgent';
  categories: ExpressCategorieOption[];
}

export const EXPRESS_WORK_TAXONOMY: Record<TypeTravauxExpress, ExpressTypeConfig> = {
  'depannage-urgence': {
    label: 'Depannage en urgence',
    urgenceLabel: 'Urgent (30 min et 1h)',
    urgenceValue: 'immediat',
    categories: [
      {
        value: 'serrurerie',
        label: 'Serrurerie',
        metier: 'serrurerie',
        sousCategories: [
          { value: 'ouverture-porte-claquee', label: 'Ouverture porte simple claquée', prix: '110€ - 135€' },
          { value: 'cle-cassee-serrure', label: 'Clé cassée dans la serrure', prix: 'À partir de 120€' },
          { value: 'degrippage-serrure', label: 'Dégrippage de serrure', prix: '100€ - 180€' },
          { value: 'installation-cylindre-europeen', label: 'Installation cylindre simple européen', prix: '110€ — 150€' },
          { value: 'installation-serrure-blindee', label: 'Installation serrure blindée 3 points', prix: '390€ - sur devis' },
          { value: 'grille-tarifaire-serrurerie', label: 'Grille tarifaire des interventions en serrurerie' },
        ],
      },
      {
        value: 'plomberie',
        label: 'Plomberie',
        metier: 'plomberie',
        sousCategories: [
          { value: 'debouchage-canalisation', label: 'Débouchage canalisation', prix: '290€ - 390€' },
          { value: 'fuite-eau', label: 'Fuite d\'eau', prix: '149€ - 199€' },
          { value: 'debouchage-wc', label: 'Débouchage de WC', prix: '130€ - 200€' },
          { value: 'reparation-chasse-eau', label: 'Réparation chasse d\'eau', prix: '150€ — 250€' },
          { value: 'recherche-fuite', label: 'Recherche de fuite', prix: '120€ - 380€' },
          { value: 'grille-tarifaire-plomberie', label: 'Grille tarifaire des interventions en plomberie' },
        ],
      },
      {
        value: 'chauffage',
        label: 'Chauffage',
        metier: 'chauffage',
        sousCategories: [
          { value: 'reparation-chaudiere', label: 'Réparation de chaudière', prix: '150€ — 350€' },
          { value: 'reparation-chauffage', label: 'Réparation du chauffage', prix: '200€ — 300€' },
          { value: 'entretien-chaudiere', label: 'Entretien de chaudière', prix: '90€ — 250€' },
          { value: 'fuite-chaudiere', label: 'Fuite chaudière', prix: '149€ - 200€' },
          { value: 'reparation-ballon-eau-chaude', label: 'Réparation ballon d\'eau chaude', prix: '150€ — 350€' },
          { value: 'grille-tarifaire-chauffage', label: 'Grille tarifaire des interventions de chauffage' },
        ],
      },
      {
        value: 'electricite',
        label: 'Électricité',
        metier: 'electricite',
        sousCategories: [
          { value: 'recherche-panne-electrique', label: 'Recherche de panne électrique', prix: '110€ — 135€ TTC' },
          { value: 'reparation-tableau-electrique', label: 'Réparation tableau électrique', prix: '150€ — 250€ TTC' },
          { value: 'reparation-prises-electriques', label: 'Réparation de prises électriques', prix: '110€ — 150€ TTC' },
          { value: 'mise-aux-normes', label: 'Mise aux normes', prix: 'Devis sur-mesure' },
          { value: 'reparation-radiateur-electrique', label: 'Réparation d\'un radiateur électrique', prix: '200€ — 250€ TTC' },
        ],
      },
      {
        value: 'vitrerie',
        label: 'Vitrerie',
        metier: 'renovation',
        sousCategories: [
          { value: 'changement-vitre-double-vitrage', label: 'Changement de vitre cassée double vitrage', prix: '250€ — 500€ TTC' },
          { value: 'installation-cremone-fenetre', label: 'Installation d\'une crémone de fenêtre', prix: '150€ — 250€ TTC' },
          { value: 'reparation-fenetre', label: 'Réparation fenêtre', prix: '120€ - 210€' },
          { value: 'changement-vitrine-magasin', label: 'Changement de vitrine de magasin', prix: 'Devis sur-mesure (à partir de 2 900€ TTC)' },
          { value: 'installation-fenetre-bois', label: 'Installation d\'une fenêtre en bois', prix: '650€ — 1 000€ TTC' },
        ],
      },
    ],
  },
  'petits-travaux-maintenance': {
    label: 'Petits travaux & maintenance',
    urgenceLabel: 'Immediat (2h)',
    urgenceValue: 'immediat',
    categories: [
      {
        value: 'reglage-reparation',
        label: 'Reglage & reparation',
        metier: 'menuiserie',
        sousCategories: [
          { value: 'ajustement-portes', label: 'Ajustement de portes (qui frottent / ferment mal)' },
          { value: 'reglage-fenetres', label: 'Reglage de fenetres / baies vitrees' },
          { value: 'reparation-volets', label: 'Reparation de volets (manuels ou roulants simples)' },
          { value: 'poignees-charnieres', label: 'Remplacement de poignees, charnieres' },
          { value: 'placards-tiroirs', label: 'Reparation de placards / tiroirs' },
          { value: 'retouches-bois', label: 'Rebouchage / retouches bois' },
        ],
      },
      {
        value: 'installation-simple',
        label: 'Installation simple',
        metier: 'menuiserie',
        sousCategories: [
          { value: 'pose-etageres', label: 'Pose d\'etageres' },
          { value: 'tringles-rideaux', label: 'Installation de tringles a rideaux' },
          { value: 'tv-murale', label: 'Fixation de TV murale' },
          { value: 'montage-meubles', label: 'Montage de meubles (IKEA, etc.)' },
          { value: 'meubles-suspendus', label: 'Pose de petits meubles suspendus' },
          { value: 'installation-miroirs', label: 'Installation de miroirs' },
        ],
      },
      {
        value: 'amelioration-optimisation',
        label: 'Amelioration & optimisation',
        metier: 'renovation',
        sousCategories: [
          { value: 'rangements-simples', label: 'Creation de rangements simples' },
          { value: 'placards-existants', label: 'Amenagement de placards existants' },
          { value: 'portes-placard-coulissantes', label: 'Pose de portes de placard coulissantes' },
          { value: 'etageres-mesure', label: 'Ajout d\'etageres sur mesure simples' },
          { value: 'optimisation-espaces', label: 'Optimisation petits espaces' },
        ],
      },
      {
        value: 'petits-travaux-bois',
        label: 'Petits travaux bois / menuiserie legere',
        metier: 'menuiserie',
        sousCategories: [
          { value: 'decoupe-plan-travail', label: 'Decoupe et ajustement de plans de travail' },
          { value: 'reparation-meubles-bois', label: 'Reparation de meubles bois' },
          { value: 'pose-plinthes', label: 'Pose de plinthes' },
          { value: 'ajustement-parquet', label: 'Ajustement de parquet (petites zones)' },
          { value: 'elements-bois-simples', label: 'Creation d\'elements bois simples' },
        ],
      },
      {
        value: 'maintenance-preventive',
        label: 'Maintenance preventive',
        metier: 'renovation',
        sousCategories: [
          { value: 'verification-ouvrants', label: 'Verification des ouvrants (portes/fenetres)' },
          { value: 'entretien-volets', label: 'Entretien des volets' },
          { value: 'controle-fixations', label: 'Resserrage / controle fixations' },
          { value: 'inspection-logement', label: 'Inspection generale logement' },
        ],
      },
    ],
  },
};

export function getExpressCategories(typeTravaux: TypeTravauxExpress): ExpressCategorieOption[] {
  return EXPRESS_WORK_TAXONOMY[typeTravaux].categories;
}

export function getExpressCategorieOption(
  typeTravaux: TypeTravauxExpress,
  categorieValue: string
): ExpressCategorieOption | undefined {
  return getExpressCategories(typeTravaux).find((cat) => cat.value === categorieValue);
}

export function getExpressSousCategorieLabel(
  typeTravaux: TypeTravauxExpress,
  categorieValue: string,
  sousCategorieValue?: string
): string | null {
  if (!sousCategorieValue) return null;
  const categorie = getExpressCategorieOption(typeTravaux, categorieValue);
  if (!categorie) return null;
  const sousCategorie = categorie.sousCategories.find((sub) => sub.value === sousCategorieValue);
  return sousCategorie?.label || null;
}

interface ExpressTimingInput {
  typeTravauxExpress?: TypeTravauxExpress;
  urgence?: 'immediat' | 'urgent';
}

export function getExpressArtisanWindowMs(input: ExpressTimingInput): number {
  if (input.typeTravauxExpress === 'depannage-urgence') return 60 * 60 * 1000;
  if (input.typeTravauxExpress === 'petits-travaux-maintenance') return 2 * 60 * 60 * 1000;
  return input.urgence === 'immediat' ? 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
}

export function getExpressPaymentWindowMinutes(input: ExpressTimingInput): number {
  if (input.typeTravauxExpress === 'depannage-urgence') return 60;
  if (input.typeTravauxExpress === 'petits-travaux-maintenance') return 120;
  return input.urgence === 'immediat' ? 15 : 30;
}

export function getExpressArtisanWindowLabel(input: ExpressTimingInput): string {
  if (input.typeTravauxExpress === 'depannage-urgence') return '30 min - 1h';
  if (input.typeTravauxExpress === 'petits-travaux-maintenance') return '2h';
  return input.urgence === 'immediat' ? '1h' : '6h';
}
