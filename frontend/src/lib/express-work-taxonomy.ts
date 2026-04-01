import type { Categorie } from '@/types/firestore';

export type TypeTravauxExpress = 'depannage-urgence' | 'petits-travaux-maintenance';

export interface ExpressSousCategorieOption {
  value: string;
  label: string;
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
    urgenceLabel: 'Urgence (30 min et 1H)',
    urgenceValue: 'immediat',
    categories: [
      {
        value: 'serrurerie',
        label: 'Serrurerie',
        metier: 'serrurerie',
        sousCategories: [
          { value: 'porte-claquee', label: 'Porte claquee' },
          { value: 'cle-cassee', label: 'Cle cassee' },
          { value: 'changement-serrure', label: 'Changement de serrure' },
        ],
      },
      {
        value: 'plomberie',
        label: 'Plomberie',
        metier: 'plomberie',
        sousCategories: [
          { value: 'fuite-eau', label: 'Fuite d\'eau' },
          { value: 'wc-bouche', label: 'WC bouche' },
          { value: 'chauffe-eau-panne', label: 'Chauffe-eau en panne' },
        ],
      },
      {
        value: 'electricite',
        label: 'Electricite',
        metier: 'electricite',
        sousCategories: [
          { value: 'panne-electrique', label: 'Panne' },
          { value: 'court-circuit', label: 'Court-circuit' },
          { value: 'tableau-electrique', label: 'Tableau electrique' },
        ],
      },
      {
        value: 'chauffage',
        label: 'Chauffage',
        metier: 'chauffage',
        sousCategories: [
          { value: 'chaudiere-panne', label: 'Chaudiere en panne' },
          { value: 'radiateur-hs', label: 'Radiateur HS' },
        ],
      },
      {
        value: 'vitrerie',
        label: 'Vitrerie',
        metier: 'renovation',
        sousCategories: [
          { value: 'vitre-cassee', label: 'Vitre cassee' },
        ],
      },
    ],
  },
  'petits-travaux-maintenance': {
    label: 'Petits travaux & maintenance',
    urgenceLabel: 'Immediate (2h)',
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
