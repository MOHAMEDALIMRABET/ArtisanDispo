/**
 * Système anti-bypass pour la messagerie — ArtisanDispo
 * -------------------------------------------------------
 * Inspiré des techniques BlaBlaCar, Airbnb, Fiverr & Leboncoin.
 * Empêche le partage de coordonnées personnelles avant acceptation du devis.
 *
 * NIVEAUX DE DÉFENSE :
 *   L1 — Patterns regex directs (formats standards)
 *   L2 — Normalisation homoglyphes (o→0, i→1…) avant détection
 *   L3 — Mots-chiffres français (zéro six douze…)
 *   L4 — Séparateurs alternatifs (*, /, #, |, espace unicode…)
 *   L5 — Numéros renversés (Ex: "87654321 60")
 *   L6 — Détection cross-messages avec fenêtres glissantes 9/10/11 digits
 *   L7 — Reset du buffer quand 4+ messages consécutifs sans chiffres
 *   L8 — Liste blanche contextuelle (prix €, années, horaires, numéros devis)
 */

export interface ValidationResult {
  isValid: boolean;
  blockedPatterns: string[];
  message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE D'ERREUR STANDARDISÉ
// ─────────────────────────────────────────────────────────────────────────────
const BLOCKED_MSG =
  "⚠️ Le partage de coordonnées personnelles (téléphone, email, adresse postale) est interdit avant l'acceptation du devis.";

const BLOCKED_PHONE: ValidationResult = {
  isValid: false,
  blockedPatterns: ['telephone'],
  message: BLOCKED_MSG,
};

// ─────────────────────────────────────────────────────────────────────────────
// L1 — PATTERNS REGEX DIRECTS
// ─────────────────────────────────────────────────────────────────────────────
const BLOCKED_PATTERNS = {
  telephone: [
    // Formats standards français (10 chiffres complets)
    /\b0[1-9][\s.\-\/\*#|]?\d{2}[\s.\-\/\*#|]?\d{2}[\s.\-\/\*#|]?\d{2}[\s.\-\/\*#|]?\d{2}\b/gi,
    /\b\+33[\s.\-]?[1-9][\s.\-]?\d{2}[\s.\-]?\d{2}[\s.\-]?\d{2}[\s.\-]?\d{2}\b/gi,
    /\b00[\s.\-]?33[\s.\-]?[1-9][\s.\-]?\d{2}[\s.\-]?\d{2}[\s.\-]?\d{2}[\s.\-]?\d{2}\b/gi,
    // Numéros mobiles partiels 06/07 — 8 chiffres (fragment délibéré : "06 63 21 23")
    // 0[67] + 3 paires = 8 digits. Bloqué même incomplet : l'intention est claire.
    /\b0[67][\s.\-\/\*#|]?\d{2}[\s.\-\/\*#|]?\d{2}[\s.\-\/\*#|]?\d{2}\b/gi,
    // Numéros fixes partiels 01-05/08/09 — 8 chiffres
    /\b0[1-5]{1}[\s.\-\/\*#|]?\d{2}[\s.\-\/\*#|]?\d{2}[\s.\-\/\*#|]?\d{2}\b/gi,
    // Numéros consécutifs
    /\b\d{10,}\b/g,
    // Numéros collés aux lettres
    /[a-z]\d{9,}/gi,
    /\d{9,}[a-z]/gi,
    // Partiel 9+ chiffres commençant par 0
    /\b0\d{8,}\b/g,
    // Fragment mobile/fixe/VoIP (6+ chiffres commençant par 0x)
    /\b0[1-9]\d{4,}\b/g,
    // International
    /\+\d{8,}/g,
    // DOM-TOM : Réunion, Martinique, Guadeloupe, Mayotte, Guyane, mobiles DOM
    /\b0(262|596|590|269|594|693|694|692|639)\d{6}\b/g,
    // Séparateurs alternatifs : 06*12*34*56*78 | 06/12/34/56/78 | 06#12...
    /\b0[1-9][\*\/\#\|\\]\d{2}[\*\/\#\|\\]\d{2}[\*\/\#\|\\]\d{2}[\*\/\#\|\\]\d{2}\b/gi,
    // Substitution lettre→chiffre évidente : o6 (o=0)
    /\b[o0O][67][\s.\-]?\d{2}[\s.\-]?\d{2}[\s.\-]?\d{2}[\s.\-]?\d{2}\b/gi,
    // Chiffres espacés façon dictée : "0 6 1 2 3 4 5 6 7 8"
    /\b0[\s.\-]{1,3}[1-9](?:[\s.\-]{1,3}\d){8}\b/gi,
    // Mots-clés téléphoniques (précis, sans faux positifs)
    /\bmon[\s\-]?num[eéè]ro\b/gi,
    /\bappell?e[\s\-]?moi\b/gi,
    /\brappelle[\s\-]?moi\b/gi,
    /\btel[\s:.\-]?\s*\d/gi,
    /\bt[eéè]l[eéè]phone\b/gi,
    /\bnum[eéè]ro[\s\-]?de[\s\-]?t[eéè]l/gi,
    /\bvoici[\s\-]?mon[\s\-]?num/gi,
    /\bmon[\s\-]?portable\b/gi,         // "mon portable" = téléphone
    /\bt[eéè]l[eéè]?[\s\-]?port[a]?ble\b/gi, // "téléphone portable"
    /\bnum[eéè]ro[\s\-]?mobile\b/gi,    // "numéro mobile"
    // NOTE: "portable" seul et "mobile" seul sont INTENTIONNELLEMENT absents
    // car trop présents dans les conversations artisans (PC portable, appli mobile)
  ],

  email: [
    /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/gi,
    /\barobase\b/gi,
    /\b[a-z0-9]+[\s\-]?@[\s\-]?[a-z0-9]+/gi,
    /\bgmail[\s.\-]?com\b/gi,
    /\byahoo[\s.\-]?(fr|com)\b/gi,
    /\bhotmail\b/gi,
    /\boutlook\b/gi,
    /\bprotonmail\b/gi,
    /\bicloud\b/gi,
    /\blaposte[\s.\-]?net\b/gi,
    /\bsfr[\s.\-]?fr\b/gi,
    /\bfree[\s.\-]?fr\b/gi,
    /\bmon[\s\-]?e[\s\-]?mail\b/gi,
    /\bcontact[\s@\-]?moi\b/gi,
    /\bemail[\s:.\-]\s*[a-z0-9]/gi,
    /\bcourriel\b/gi,
    /\b[a-z](?:[\s.\-][a-z]){3,}[\s.\-]?@/gi,
    /\b[a-z]+(?:[\s.\-][a-z]){2,}[\s.\-]?point[\s.\-]?com\b/gi,
  ],

  adresse: [
    // Code postal 5 chiffres — uniquement avec contexte adresse explicite
    // (le code postal seul comme "75001" reste bloqué via le pattern contextuel)
    /\bcode[\s\-]?postal\b/gi,
    // Street number + type de voie
    /\b\d{1,4}[\s,]+(bis|ter|quater)?\s*(rue|avenue|boulevard|av\.?|bd\.?|impasse|place|chemin|allée|route|voie|passage|square|cour|villa|résidence|lotissement)\b/gi,
    /\b(rue|avenue|boulevard|impasse|place|chemin|allée|route)[\s\-]+[a-z]{3,}/gi,
    // Codes postaux massifs des grandes agglomérations (non ambigus)
    /\b7[5-9]\d{3}\b/g,   // Paris + petite couronne
    /\b69\d{3}\b/g,        // Lyon
    /\b13\d{3}\b/g,        // Marseille/Bouches-du-Rhône
    /\b33\d{3}\b/g,        // Bordeaux
    /\b31\d{3}\b/g,        // Toulouse
    /\b06\d{3}\b/g,        // Alpes-Maritimes (Nice)
    // Code postal générique avec mot-clé explicite
    /\b(code postal|cp ?:)[\s:=]?\d{5}\b/gi,
    /\barrondissement\b/gi,
    // NOTE: noms de villes seuls supprimés → trop courants dans contexte artisan
    // ("intervention à Lyon", "chantier à Paris" etc.)
    // NOTE: "domicile" supprimé → "travaux à domicile" = cœur du métier
    // NOTE: "viens chez" supprimé → "viens au chantier" est normal
  ],

  social: [
    /\bfacebook\b/gi,
    /\binstagram\b/gi,
    /\binsta\b/gi,           // abréviation courante
    /\bwhatsapp\b/gi,
    /\btelegram\b/gi,
    /\bsnapchat\b/gi,
    /\bsnap\b/gi,            // abréviation courante
    /\blinkedin\b/gi,
    /\btiktok\b/gi,
    /\bviber\b/gi,
    /\bdiscord\b/gi,
    /\bskype\b/gi,
    /\bwechat\b/gi,
    /\bimessage\b/gi,
    /\bfacetime\b/gi,
    /\bsur\s+signal\b/gi,    // "sur Signal" (app) — mais pas "mauvais signal wifi"
    /\bappli?\s+signal\b/gi, // "appli Signal"
    /\b@[a-z0-9_.]{3,}\b/gi,
    // Abréviations réseaux
    /\b(fb|ig|wa|tg|sc)\s*:\s*[a-z0-9_.]{3,}/gi, // fb: user123
  ],

  autres: [
    /https?:\/\/[^\s]+/gi,
    /www\.[^\s]+\.[a-z]{2,}/gi,
    /\ben[\s\-]?dehors\b/gi,
    /\bhors[\s\-]?plateforme\b/gi,
    /\bsans[\s\-]?passer[\s\-]?par\b/gi,
    /\ben[\s\-]?priv[eé]\b/gi,
    /\bpar[\s\-]?ailleurs\b/gi,
    // IBAN (coordonnées bancaires)
    /\b[A-Z]{2}\d{2}[\s]?(?:\d{4}[\s]?){4,6}\d{1,4}\b/g,
    // Invitation à contacter en dehors
    /\bcontact(?:e|ez)[\s\-]?moi[\s\-]?(?:en[\s\-]dehors|directement|ailleurs)\b/gi,
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// L8 — LISTE BLANCHE CONTEXTUELLE
// Retire les séquences numériques bénignes avant détection
// ─────────────────────────────────────────────────────────────────────────────
function removeWhitelistedContexts(text: string): string {
  return text
    // Contextes financiers
    .replace(/\b\d[\d\s,.]*(€|euros?|eur)\b/gi, 'PRIX')
    // Années
    .replace(/\b20[2-3]\d\b/g, 'ANNEE')
    // Horaires
    .replace(/\b\d{1,2}h\d{0,2}\b/gi, 'HORAIRE')
    // Références devis
    .replace(/\bDV[\-_]\d{4}[\-_]\d+\b/gi, 'REFDEVIS')
    // Durées
    .replace(/\b\d+\s*(jour|semaine|mois|heure|h|min|minute)s?\b/gi, 'DUREE')
    // Quantités et mesures
    .replace(/\b\d+\s*(m[²2]?|cm|mm|ml|cl|l|kg|g|t)\b/gi, 'QUANTITE')
    // Listes numérotées
    .replace(/^\d+\.\s/gm, 'ITEM ')
    // Étages / niveaux ("3ème étage", "2e niveau")
    .replace(/\b\d{1,2}[eèém][rm]?e?[\s\-]?(étage|niveau|palier|porte)\b/gi, 'ETAGE')
    // Numéros de chantier / dossier / facture (contexte pro)
    .replace(/\b(chantier|dossier|facture|bon de commande|ref|réf)[\s.:\-]*n?°?[\s]?\d+\b/gi, 'REFDOC')
    // Percentages
    .replace(/\b\d{1,3}\s*%/g, 'POURCENTAGE')
    // Notes / scores ("4\/5", "8 sur 10")
    .replace(/\b\d{1}\s*(\/|sur)\s*\d{1,2}\b/gi, 'NOTE');
}

// ─────────────────────────────────────────────────────────────────────────────
// L2 — NORMALISATION HOMOGLYPHES
// Appliquée seulement sur les segments mixtes lettres+chiffres
// ─────────────────────────────────────────────────────────────────────────────
const HOMOGLYPH_MAP: Record<string, string> = {
  'o': '0', 'O': '0', 'Ο': '0', 'ο': '0', 'о': '0', 'О': '0',
  'l': '1', 'I': '1', 'ı': '1', '|': '1',
  'z': '2', 'Z': '2',
  'e': '3', 'E': '3',
  'a': '4', 'A': '4',
  's': '5', 'S': '5', '$': '5',
  'g': '6', 'G': '6',
  't': '7', 'T': '7',
  'x': '8', 'X': '8',
};

function normalizeHomoglyphsInMixedSegments(text: string): string {
  return text.replace(
    /[a-zA-ZοΟоОı|$]+\d[\d a-zA-ZοΟоОı|$]{4,}|\d[\d a-zA-ZοΟоОı|$]{4,}[a-zA-ZοΟоОı|$]+/g,
    (match) => match.split('').map(c => HOMOGLYPH_MAP[c] ?? c).join('')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// L3 — MOTS-CHIFFRES FRANÇAIS
// ─────────────────────────────────────────────────────────────────────────────
const WORD_DIGIT_MAP: [RegExp, string][] = [
  [/\bz[eé]ro\b/gi, '0'], [/\bun(e)?\b/gi, '1'], [/\bdeux\b/gi, '2'],
  [/\btrois\b/gi, '3'], [/\bquatre\b/gi, '4'], [/\bcinq\b/gi, '5'],
  [/\bsix\b/gi, '6'], [/\bsept\b/gi, '7'], [/\bhuit\b/gi, '8'], [/\bneuf\b/gi, '9'],
  [/\bonze\b/gi, '11'], [/\bdouze\b/gi, '12'], [/\btreize\b/gi, '13'],
  [/\bquatorze\b/gi, '14'], [/\bquinze\b/gi, '15'], [/\bseize\b/gi, '16'],
  [/\bvingt[\s\-]?huit\b/gi, '28'], [/\bvingt[\s\-]?sept\b/gi, '27'],
  [/\bvingt[\s\-]?six\b/gi, '26'], [/\bvingt[\s\-]?cinq\b/gi, '25'],
  [/\bvingt[\s\-]?quatre\b/gi, '24'], [/\bvingt[\s\-]?trois\b/gi, '23'],
  [/\bvingt[\s\-]?deux\b/gi, '22'], [/\bvingt[\s\-]?et[\s\-]?un\b/gi, '21'],
  [/\bvingt\b/gi, '20'],
  [/\btrente[\s\-]?neuf\b/gi, '39'], [/\btrente[\s\-]?huit\b/gi, '38'],
  [/\btrente[\s\-]?sept\b/gi, '37'], [/\btrente[\s\-]?six\b/gi, '36'],
  [/\btrente[\s\-]?cinq\b/gi, '35'], [/\btrente[\s\-]?quatre\b/gi, '34'],
  [/\btrente[\s\-]?trois\b/gi, '33'], [/\btrente[\s\-]?deux\b/gi, '32'],
  [/\btrente[\s\-]?et[\s\-]?un\b/gi, '31'], [/\btrente\b/gi, '30'],
  [/\bquarante[\s\-]?neuf\b/gi, '49'], [/\bquarante[\s\-]?huit\b/gi, '48'],
  [/\bquarante[\s\-]?sept\b/gi, '47'], [/\bquarante[\s\-]?six\b/gi, '46'],
  [/\bquarante[\s\-]?cinq\b/gi, '45'], [/\bquarante[\s\-]?quatre\b/gi, '44'],
  [/\bquarante[\s\-]?trois\b/gi, '43'], [/\bquarante[\s\-]?deux\b/gi, '42'],
  [/\bquarante[\s\-]?et[\s\-]?un\b/gi, '41'], [/\bquarante\b/gi, '40'],
  [/\bcinquante[\s\-]?neuf\b/gi, '59'], [/\bcinquante[\s\-]?huit\b/gi, '58'],
  [/\bcinquante[\s\-]?sept\b/gi, '57'], [/\bcinquante[\s\-]?six\b/gi, '56'],
  [/\bcinquante[\s\-]?cinq\b/gi, '55'], [/\bcinquante[\s\-]?quatre\b/gi, '54'],
  [/\bcinquante[\s\-]?trois\b/gi, '53'], [/\bcinquante[\s\-]?deux\b/gi, '52'],
  [/\bcinquante[\s\-]?et[\s\-]?un\b/gi, '51'], [/\bcinquante\b/gi, '50'],
  [/\bsoixante[\s\-]?dix[\s\-]?neuf\b/gi, '79'], [/\bsoixante[\s\-]?dix[\s\-]?huit\b/gi, '78'],
  [/\bsoixante[\s\-]?dix[\s\-]?sept\b/gi, '77'], [/\bsoixante[\s\-]?dix[\s\-]?six\b/gi, '76'],
  [/\bsoixante[\s\-]?dix[\s\-]?cinq\b/gi, '75'], [/\bsoixante[\s\-]?dix[\s\-]?quatre\b/gi, '74'],
  [/\bsoixante[\s\-]?dix[\s\-]?trois\b/gi, '73'], [/\bsoixante[\s\-]?dix[\s\-]?deux\b/gi, '72'],
  [/\bsoixante[\s\-]?et[\s\-]?onze\b/gi, '71'], [/\bsoixante[\s\-]?dix\b/gi, '70'],
  [/\bsoixante[\s\-]?neuf\b/gi, '69'], [/\bsoixante[\s\-]?huit\b/gi, '68'],
  [/\bsoixante[\s\-]?sept\b/gi, '67'], [/\bsoixante[\s\-]?six\b/gi, '66'],
  [/\bsoixante[\s\-]?cinq\b/gi, '65'], [/\bsoixante[\s\-]?quatre\b/gi, '64'],
  [/\bsoixante[\s\-]?trois\b/gi, '63'], [/\bsoixante[\s\-]?deux\b/gi, '62'],
  [/\bsoixante[\s\-]?et[\s\-]?un\b/gi, '61'], [/\bsoixante\b/gi, '60'],
  [/\bquatre[\s\-]?vingt[\s\-]?dix[\s\-]?neuf\b/gi, '99'],
  [/\bquatre[\s\-]?vingt[\s\-]?dix\b/gi, '90'],
  [/\bquatre[\s\-]?vingt[\s\-]?neuf\b/gi, '89'],
  [/\bquatre[\s\-]?vingt[\s\-]?huit\b/gi, '88'],
  [/\bquatre[\s\-]?vingts?\b/gi, '80'],
  [/\bdix\b/gi, '10'],
];

function convertNumberWords(text: string): string {
  let result = text.toLowerCase();
  for (const [pattern, replacement] of WORD_DIGIT_MAP) {
    result = result.replace(pattern, ` ${replacement} `);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// L3c — NORMALISATION TRONCATURES & VARIANTES ORTHOGRAPHIQUES
// "troi" → "trois", "ving" → "vingt", "quanrente" → "quarante", etc.
// ─────────────────────────────────────────────────────────────────────────────
function normalizeTruncatedNumberWords(text: string): string {
  return text
    // Chiffres de base tronqués
    .replace(/\bzer\b/gi, 'zéro')
    .replace(/\bdeu\b/gi, 'deux')
    .replace(/\btroi\b/gi, 'trois')
    .replace(/\bquatr\b/gi, 'quatre')
    .replace(/\bneu\b/gi, 'neuf')
    // vingt : "ving", "vint", "vingo"...
    .replace(/\bving[t]?\b/gi, 'vingt')
    .replace(/\bvint\b/gi, 'vingt')
    // trente : "trant", "tren", "trentre" (faute de frappe)
    .replace(/\btrant\b/gi, 'trente')
    .replace(/\btren\b/gi, 'trente')
    .replace(/\btrent\b/gi, 'trente')
    .replace(/\btrentr[e]?\b/gi, 'trente')
    // quarante : "quarant", "quanrente", "quarente", "quarrant", "quarante" (direct)
    .replace(/\bquarant\b/gi, 'quarante')
    .replace(/\bquanrente[^a-z]?/gi, (m) => 'quarante' + (m.slice(9) ? ' ' : ''))
    .replace(/\bquarente\b/gi, 'quarante')
    .replace(/\bquarrant\b/gi, 'quarante')
    // Fuzzy quarante : toute séquence commençant par qua/kan + ~ante/rante
    .replace(/\bqua[nrm][aeiou]?[rn]?[ae]nt[e]?\b/gi, 'quarante')
    // cinquante : "cinquant", "singkante"...
    .replace(/\bcinquant\b/gi, 'cinquante')
    .replace(/\bsinkant\b/gi, 'cinquante')
    // soixante : "soixant", "soixsant"
    .replace(/\bsoixant\b/gi, 'soixante')
    .replace(/\bsoixsant\b/gi, 'soixante')
    .replace(/\bswasant\b/gi, 'soixante')
    // quatre-vingt : variations
    .replace(/\bquatr[e]?[\s\-]?vingt\b/gi, 'quatre-vingt')
    // Nombres composés tronqués
    .replace(/\bonz\b/gi, 'onze')
    .replace(/\bdouz\b/gi, 'douze')
    .replace(/\btreiz\b/gi, 'treize')
    .replace(/\bquatorz\b/gi, 'quatorze')
    .replace(/\bquinz\b/gi, 'quinze')
    .replace(/\bseiz\b/gi, 'seize')
    // ─ Lettres répétées / attaque fragmentation cross-messages ─
    // "unn" → "un", "siix" → "six", "neuff" → "neuf"... (lettre finale doublée)
    .replace(/\bunn?e?\b/gi, 'un')
    .replace(/\bsiix\b/gi, 'six')
    .replace(/\bneuuf\b|\bneuff\b/gi, 'neuf')
    .replace(/\bdeuux\b|\bdeeux\b/gi, 'deux')
    .replace(/\bhuiit\b|\bhuitt\b/gi, 'huit')
    .replace(/\bseept\b|\bseppt\b/gi, 'sept')
    .replace(/\bcinqq\b/gi, 'cinq')
    // "quat" seul (sans "re" suivant) → "quatre" (backup si syllabe-joiner n'a pas agi)
    .replace(/\bquat\b/gi, 'quatre')
    // "quatr" tronqué
    .replace(/\bquatr\b/gi, 'quatre');
}

// ─────────────────────────────────────────────────────────────────────────────
// L3d — RECONSTRUCTION SYLLABES DÉCOUPÉES CROSS-MOTS
// Attaque : "si x" → "six", "qua tre" → "quatre", "sep t" → "sept"...
// Doit être appliqué AVANT collapseSpacedLetters dont le pairing greedy
// gauche-droite détruirait les syllabes (ex: "tre si" → "tresi", "x sep" → "xsep").
// ─────────────────────────────────────────────────────────────────────────────
function reconstructSpacedNumberSyllables(text: string): string {
  return text
    // ─ Nombres complètement épelés lettre par lettre (ex: "v i n g t", "q u a t r e") ─
    // Doit être fait EN PREMIER, avant les syllabes, car les syllabes peuvent
    // être créées après coup en deux mots déjà reconstitués.
    .replace(/\bz\s+[e\u00e9]\s+r\s+o\b/gi, 'z\u00e9ro')
    .replace(/\bu\s+n\b/gi, 'un')              // mais pas 'une' – 'd\u00e9j\u00e0 couvert'
    .replace(/\bd\s+e\s+u\s+x\b/gi, 'deux')
    .replace(/\bt\s+r\s+o\s+i\s+s?\b/gi, 'trois')
    .replace(/\bq\s+u\s+a\s+t\s+r\s+e\b/gi, 'quatre')
    .replace(/\bc\s+i\s+n\s+q\b/gi, 'cinq')
    .replace(/\bs\s+i\s+x\b/gi, 'six')
    .replace(/\bs\s+e\s+p\s+t\b/gi, 'sept')
    .replace(/\bh\s+u\s+i\s+t\b/gi, 'huit')
    .replace(/\bn\s+e\s+u\s+f\b/gi, 'neuf')
    .replace(/\bd\s+i\s+x\b/gi, 'dix')
    .replace(/\bo\s+n\s+z\s+e\b/gi, 'onze')
    .replace(/\bd\s+o\s+u\s+z\s+e\b/gi, 'douze')
    .replace(/\bv\s+i\s+n\s*g?\s+t\b/gi, 'vingt')
    .replace(/\bt\s+r\s+e\s+n\s+t\s+e\b/gi, 'trente')
    .replace(/\bq\s+u\s+a\s+r\s+a\s+n\s+t\s+e\b/gi, 'quarante')
    .replace(/\bc\s+i\s+n\s+q\s+u\s+a\s+n\s+t\s+e\b/gi, 'cinquante')
    .replace(/\bs\s+o\s+i\s+x\s+a\s+n\s+t\s+e\b/gi, 'soixante')
    // ─ Chiffres simples coupés en fin de consonne ─
    .replace(/\bsi\s+x\b/gi, 'six')
    .replace(/\bse\s+pt?\b|\bsep\s+t\b/gi, 'sept')
    .replace(/\bhu\s+it\b|\bhui\s+t\b/gi, 'huit')
    .replace(/\bne\s+uf?\b|\bneu\s+f\b/gi, 'neuf')
    .replace(/\bde\s+ux\b|\bdeu\s+x\b/gi, 'deux')
    .replace(/\btro\s+is?\b|\btroi\s+s\b/gi, 'trois')
    .replace(/\bci\s+nq\b|\bcin\s+q\b/gi, 'cinq')
    .replace(/\bzer?\s+o\b/gi, 'zéro')
    // Mots bi-syllabiques coupés
    .replace(/\bqua\s+tre\b|\bquat\s+re\b/gi, 'quatre')
    .replace(/\bon\s+ze\b/gi, 'onze')
    .replace(/\bdou\s+ze\b|\bdo\s+uze\b/gi, 'douze')
    .replace(/\btrei\s+ze\b/gi, 'treize')
    .replace(/\bqua\s+torz\b|\bqua\s+torze\b/gi, 'quatorze')
    .replace(/\bquin\s+ze\b/gi, 'quinze')
    .replace(/\bsei\s+ze\b/gi, 'seize')
    .replace(/\bvin\s+gt?\b|\bvint?\s+g?\b/gi, 'vingt')
    .replace(/\btren\s+te\b/gi, 'trente')
    .replace(/\bquar\s+ante\b|\bquaran\s+te\b|\bqua\s+rante\b/gi, 'quarante')
    .replace(/\bcin\s+quante\b|\bcinquan\s+te\b/gi, 'cinquante')
    .replace(/\bsoix\s+ante\b|\bsoixan\s+te\b/gi, 'soixante');
}

// ─────────────────────────────────────────────────────────────────────────────
// L3b — COLLER LES LETTRES ESPACÉES (attaque "z e r o s i x...")
// "z e r o" → "zero", "t rente" → "trente", "deu x" → "deux"
// ─────────────────────────────────────────────────────────────────────────────
function collapseSpacedLetters(text: string): string {
  let result = text.toLowerCase();
  // Étape 0 : supprimer les consonnes-bruit isolées qui précèdent une séquence
  // de lettres espacées (ex: "c z e r o" → " z e r o", évite "cz"+"er"+"o"="czero").
  // Condition : 1 consonne seule suivie de 3+ autres groupes "lettre espace"
  result = result.replace(/\b([b-df-hj-np-tv-xz])\s+(?=(?:[a-zéèêàâôùûîç]\s+){2}[a-zéèêàâôùûîç]\b)/g, ' ');
  // 4 passes pour reconstituer des mots découpés caractère par caractère
  for (let i = 0; i < 4; i++) {
    result = result.replace(/([a-zéèêàâôùûîç]{1,6})\s+([a-zéèêàâôùûîç]{1,6})/g, '$1$2');
  }
  return result;
}

function detectPhoneInWordForm(text: string): boolean {
  // Tester toutes les combinaisons : original, syllabes reconstruites, lettres recollées, troncatures
  const recon = reconstructSpacedNumberSyllables(text);
  const collapsed = collapseSpacedLetters(recon);
  const versions = [
    text,
    recon,
    collapsed,
    normalizeTruncatedNumberWords(text),
    normalizeTruncatedNumberWords(recon),
    normalizeTruncatedNumberWords(collapsed),
  ];
  for (const version of versions) {
    const converted = convertNumberWords(version);
    const digitsOnly = (converted.match(/\d+/g) || []).join('');
    for (let i = 0; i <= digitsOnly.length - 10; i++) {
      if (/^0[1-9]\d{8}$/.test(digitsOnly.substring(i, i + 10))) return true;
    }
    for (let i = 0; i <= digitsOnly.length - 11; i++) {
      if (/^33[1-9]\d{8}$/.test(digitsOnly.substring(i, i + 11))) return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// L4 — SÉPARATEURS ALTERNATIFS
// ─────────────────────────────────────────────────────────────────────────────
function normalizeAltSeparators(text: string): string {
  return text
    .replace(/[\*\/\#\|\\]/g, ' ')
    .replace(/[_]/g, ' ')            // éviterd \bquatre\b when "3_ 9" → "3 9"
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\u202F/g, ' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// L5 — NUMÉROS RENVERSÉS
// ─────────────────────────────────────────────────────────────────────────────
function detectReversedPhone(text: string): boolean {
  const allDigitSeqs = text.match(/\d{9,}/g) || [];
  for (const seq of allDigitSeqs) {
    const reversed = seq.split('').reverse().join('');
    if (/^0[1-9]\d{8}$/.test(reversed)) return true;
    if (/^33[1-9]\d{8}$/.test(reversed)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER EXTRACTION DIGITS (pour cross-messages)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Compte le nombre de mots-chiffres distincts trouvés dans un texte.
 * Ex: "j'ai eu une fois" → 1 ("une")
 *     "zero six soixante quarante neuf un trois" → 7
 */
/**
 * Compte les mots-chiffres SIGNIFICATIFS (hors "un/une" qui sont trop courants en français).
 * Utilisé pour le seuil d'intention : 3 mots significatifs = intention de dicter un numéro.
 */
function countSignificantNumberWords(text: string): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const [pattern] of WORD_DIGIT_MAP) {
    // Exclure "un" et "une" du décompte seuil (trop courants en français naturel)
    if (/^\\bun/.test(pattern.source)) continue;
    const re = new RegExp(pattern.source, 'gi');
    const hits = lower.match(re);
    if (hits) count += hits.length;
  }
  return count;
}

function countNumberWords(text: string): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const [pattern] of WORD_DIGIT_MAP) {
    const re = new RegExp(pattern.source, 'gi');
    const hits = lower.match(re);
    if (hits) count += hits.length;
  }
  return count;
}

function extractDigitRuns(rawText: string): string {
  const clean = removeWhitelistedContexts(rawText);
  const norm = normalizeAltSeparators(clean);
  const noHomo = normalizeHomoglyphsInMixedSegments(norm);

  // Toujours extraire les chiffres littéraux
  const literalDigits = (noHomo.match(/\d+/g) || []).join('');

  // Convertir les mots-chiffres UNIQUEMENT si le message contient 3+ mots significatifs
  // ("significatifs" = excluant "un/une" trop courants en français naturel)
  // → "j'ai eu une fois" (0 mots signif.) → pas de contribution
  // → "j'ai un devis avec deux options" (1 mot signif.) → pas de contribution
  // → "zero six soixante quarante ..." (4 mots signif.) → contribution
  const recon = reconstructSpacedNumberSyllables(noHomo);
  const collapsed = collapseSpacedLetters(recon);
  const truncNorm = normalizeTruncatedNumberWords(noHomo);
  const truncRecon = normalizeTruncatedNumberWords(recon);
  const truncCollapsed = normalizeTruncatedNumberWords(collapsed);

  const significantWordCount = Math.max(
    countSignificantNumberWords(noHomo),
    countSignificantNumberWords(recon),
    countSignificantNumberWords(collapsed),
    countSignificantNumberWords(truncNorm),
    countSignificantNumberWords(truncRecon),
    countSignificantNumberWords(truncCollapsed)
  );
  if (significantWordCount < 3) return literalDigits;

  const candidates = [
    (convertNumberWords(recon).match(/\d+/g) || []).join(''),
    (convertNumberWords(collapsed).match(/\d+/g) || []).join(''),
    (convertNumberWords(truncNorm).match(/\d+/g) || []).join(''),
    (convertNumberWords(truncRecon).match(/\d+/g) || []).join(''),
    (convertNumberWords(truncCollapsed).match(/\d+/g) || []).join(''),
  ];
  const best = candidates.reduce((a, b) => a.length >= b.length ? a : b, literalDigits);
  return best;
}

/**
 * Version sans seuil de `extractDigitRuns` : convertit les mots-chiffres
 * même si le message ne contient qu'un seul mot significatif.
 * Utilisée quand le total cumulatif de la fenêtre ≥ 3 mots significatifs.
 */
function extractDigitRunsAlways(rawText: string): string {
  const clean = removeWhitelistedContexts(rawText);
  const norm = normalizeAltSeparators(clean);
  const noHomo = normalizeHomoglyphsInMixedSegments(norm);

  const literalDigits = (noHomo.match(/\d+/g) || []).join('');

  // Reconstruction des syllabes découpées AVANT le collapse (évite le mauvais appariement greedy)
  const recon = reconstructSpacedNumberSyllables(noHomo);
  const collapsed = collapseSpacedLetters(recon);
  const truncNorm = normalizeTruncatedNumberWords(noHomo);
  const truncRecon = normalizeTruncatedNumberWords(recon);
  const truncCollapsed = normalizeTruncatedNumberWords(collapsed);

  const candidates = [
    (convertNumberWords(noHomo).match(/\d+/g) || []).join(''),
    (convertNumberWords(recon).match(/\d+/g) || []).join(''),
    (convertNumberWords(collapsed).match(/\d+/g) || []).join(''),
    (convertNumberWords(truncNorm).match(/\d+/g) || []).join(''),
    (convertNumberWords(truncRecon).match(/\d+/g) || []).join(''),
    (convertNumberWords(truncCollapsed).match(/\d+/g) || []).join(''),
  ];
  return candidates.reduce((a, b) => a.length >= b.length ? a : b, literalDigits);
}

// ─────────────────────────────────────────────────────────────────────────────
// ANCIENNE DÉTECTION FRAGMENTS PAR LETTRES (conservée)
// ─────────────────────────────────────────────────────────────────────────────
function detectFragmentedPhoneNumbers(text: string): boolean {
  const matches = text.match(/0[a-z0-9]{15,}/gi) || [];
  for (const match of matches) {
    const digitsOnly = match.replace(/\D/g, '');
    if (digitsOnly.length >= 10 && digitsOnly.startsWith('0')) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// L8b — DÉTECTION MESSAGES PUREMENT NUMÉRIQUES CONSÉCUTIFS
// Attaque : chaque message = un seul nombre espacé ("z e r o", "s i x", "N e u f"...)
// Dans une conversation normale, PERSONNE n'envoie un unique mot-chiffre isolé.
// Un message est "purement numérique" si, après toutes les normalisations,
// il ne contient rien d'autre qu'un (ou plusieurs) chiffre(s).
// ─────────────────────────────────────────────────────────────────────────────
function isMessagePureNumberWord(msg: string): boolean {
  const clean = removeWhitelistedContexts(msg).trim();
  if (!clean) return false;
  const norm = normalizeAltSeparators(clean).toLowerCase().trim();
  const recon = reconstructSpacedNumberSyllables(norm);
  const collapsed = collapseSpacedLetters(recon);
  const truncCollapsed = normalizeTruncatedNumberWords(collapsed);

  // Après conversion des mots → chiffres, retire les digits et la ponctuation
  // Si le résidu est vide (ou quasi vide ≤ 2 chars de ponctuation), c'est un message purement numérique
  const converted = convertNumberWords(truncCollapsed);
  const hasDigits = /\d/.test(converted);
  if (!hasDigits) return false;
  const residue = converted
    .replace(/\d+/g, '')      // retire les chiffres produits
    .replace(/[\s.,!?;:"'()\-–]/g, '') // retire la ponctuation courante
    .trim();
  return residue.length <= 2; // tolérance 2 chars (ex: "ok", "?", émoji simple)
}

// ─────────────────────────────────────────────────────────────────────────────
// L6 + L7 — VALIDATE WITH HISTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valide un message en tenant compte de l'historique de l'expéditeur.
 * Détecte les numéros fragmentés sur plusieurs messages (technique BlaBlaCar).
 *
 * @param newContent        Le nouveau message à envoyer
 * @param recentSenderMsgs  Les N derniers messages de cet expéditeur (ordre chronologique)
 * @param isPaid            Si true, bypass validation (devis payé)
 */
export function validateMessageWithHistory(
  newContent: string,
  recentSenderMsgs: string[],
  isPaid: boolean = false
): ValidationResult {
  if (isPaid) return { isValid: true, blockedPatterns: [] };

  // 1. Valider le message seul (L1–L5)
  const singleResult = validateMessage(newContent, isPaid);
  if (!singleResult.isValid) return singleResult;

  // L7 — RESET BUFFER + L6 CUMUL CROSS-MESSAGES
  // Fenêtre élargie à 10 : permet de couvrir 10 messages d'un seul chiffre chacun (= 10 digits)
  const WINDOW = 10;
  const RESET_THRESHOLD = 4;
  const lastMsgs = recentSenderMsgs.slice(-WINDOW);
  const allMsgs = [...lastMsgs, newContent];

  // L8b — SÉRIE DE MESSAGES PUREMENT NUMÉRIQUES
  // Si 3+ messages consécutifs récents (+ le nouveau) sont chacun uniquement un nombre,
  // c'est une tentative de fragmentation lettre-par-lettre ("z e r o" / "s i x" / "N e u f"...).
  // On bloque sans attendre d'avoir reconstitué les 10 digits complets.
  const PURE_STREAK_BLOCK = 3;
  const recentForStreak = [...lastMsgs.slice(-(PURE_STREAK_BLOCK - 1)), newContent];
  if (
    recentForStreak.length >= PURE_STREAK_BLOCK &&
    recentForStreak.every(isMessagePureNumberWord)
  ) {
    return BLOCKED_PHONE;
  }

  // Calcul cumulatif des mots-chiffres significatifs sur toute la fenêtre
  // (inclut le nouveau message). Permet de détecter la technique "1 mot par message".
  function sigWordsOf(m: string): number {
    const clean = removeWhitelistedContexts(m);
    const norm = normalizeAltSeparators(clean).toLowerCase();
    const recon = reconstructSpacedNumberSyllables(norm);
    const collapsed = collapseSpacedLetters(recon);
    const truncNorm = normalizeTruncatedNumberWords(norm);
    const truncRecon = normalizeTruncatedNumberWords(recon);
    const truncCollapsed = normalizeTruncatedNumberWords(collapsed);
    return Math.max(
      countSignificantNumberWords(norm),
      countSignificantNumberWords(recon),
      countSignificantNumberWords(collapsed),
      countSignificantNumberWords(truncNorm),
      countSignificantNumberWords(truncRecon),
      countSignificantNumberWords(truncCollapsed)
    );
  }
  const totalSigWords = allMsgs.reduce((sum, m) => sum + sigWordsOf(m), 0);

  // L6b — CONCAT FENÊTRE (attaque "mot découpé cross-messages")
  // Deux versions :
  //   allConcat      (" . " sep) : collapseSpacedLetters ne franchit pas les frontières → évite "troisun"
  //   allConcatPlain (" " sep)   : permet reconstructSpacedNumberSyllables cross-messages
  //                                → "quat re" entre msg N et N+1 → "quatre"
  const allConcat = allMsgs.join(' . ');
  const allConcatPlain = allMsgs.join(' ');
  const concatSigWords = Math.max(sigWordsOf(allConcat), sigWordsOf(allConcatPlain));
  const effectiveSigWords = Math.max(totalSigWords, concatSigWords);

  // Si le cumul effectif ≥ 3 mots significatifs, on utilise extractDigitRunsAlways
  // (sans seuil par message) pour ne pas rater les fragments éparpillés.
  const extractFn = effectiveSigWords >= 3 ? extractDigitRunsAlways : extractDigitRuns;

  // L7 — RESET : 4+ messages consécutifs sans aucun chiffre → accumulation repart à zéro
  const noDigitStreak = lastMsgs
    .slice(-RESET_THRESHOLD)
    .filter(m => extractFn(m).length === 0).length;
  if (noDigitStreak >= RESET_THRESHOLD) {
    return { isValid: true, blockedPatterns: [] };
  }

  // L6a — CUMUL SÉQUENTIEL (technique "1 nombre par message")
  const historyCumulatedDigits = lastMsgs.map(extractFn).join('');
  const newContentDigits = extractFn(newContent);

  // L6b — Digits par concaténation (technique "mot coupé cross-messages")
  // ⚠️ Calculé AVANT le guard de sortie anticipée pour détecter le cas :
  //    msg1 = "0667 52 52" (8 digits) + msg2 = "vingt" (mot = 20) → concat → "0667525220" = 10 digits valide
  //    Sans ce check précoce, la garde ci-dessous court-circuiterait la détection.
  const concatDigits = extractDigitRunsAlways(allConcat);
  if (checkPhoneInDigits(concatDigits)) return BLOCKED_PHONE;
  // L6b-plain : même vérification avec la jointure espace simple
  // Capture : msg1="06 63 21 23" + msg2="quat" + msg3="re" + msg4="unn"
  // → "06 63 21 23 quat re unn" → syllabe-joiner → "06 63 21 23 quatre un" → 0663212341 ✓
  const concatDigitsPlain = extractDigitRunsAlways(allConcatPlain);
  if (checkPhoneInDigits(concatDigitsPlain)) return BLOCKED_PHONE;

  // Guard : safe seulement si effectivement pas d'intention détectée
  if (!newContentDigits && effectiveSigWords < 3) {
    return { isValid: true, blockedPatterns: [] };
  }

  const combinedDigits = historyCumulatedDigits + newContentDigits;

  // Vérifier les deux sources : cumul séquentiel ET concat fenêtre
  function checkPhoneInDigits(digits: string): boolean {
    // 10 chiffres format complet
    for (let i = 0; i <= digits.length - 10; i++) {
      if (/^0[1-9]\d{8}$/.test(digits.substring(i, i + 10))) return true;
    }
    // 9 chiffres mobile 06/07 (sans le 0 initial format international)
    for (let i = 0; i <= digits.length - 9; i++) {
      if (/^0[67]\d{7}$/.test(digits.substring(i, i + 9))) return true;
    }
    // 8 chiffres mobile 06/07 — fragment partiel bloqué dès 8 digits
    for (let i = 0; i <= digits.length - 8; i++) {
      if (/^0[67]\d{6}$/.test(digits.substring(i, i + 8))) return true;
    }
    // Format international +33
    for (let i = 0; i <= digits.length - 11; i++) {
      if (/^33[1-9]\d{8}$/.test(digits.substring(i, i + 11))) return true;
    }
    return false;
  }

  if (checkPhoneInDigits(combinedDigits)) return BLOCKED_PHONE;
  if (checkPhoneInDigits(concatDigits)) return BLOCKED_PHONE;
  if (checkPhoneInDigits(concatDigitsPlain)) return BLOCKED_PHONE;

  return { isValid: true, blockedPatterns: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// FONCTION PRINCIPALE — VALIDER UN MESSAGE SEUL (L1–L5)
// ─────────────────────────────────────────────────────────────────────────────
export function validateMessage(content: string, isPaid: boolean = false): ValidationResult {
  if (isPaid) return { isValid: true, blockedPatterns: [] };

  const clean = removeWhitelistedContexts(content);
  const normalized = normalizeAltSeparators(clean).toLowerCase().trim();
  const normalizedHomoglyph = normalizeHomoglyphsInMixedSegments(normalized);

  const blockedPatterns: string[] = [];
  const addBlocked = (cat: string) => { if (!blockedPatterns.includes(cat)) blockedPatterns.push(cat); };

  // L2 : Fragments par lettres
  if (detectFragmentedPhoneNumbers(normalized)) addBlocked('telephone');
  // L3 : Mots-chiffres français
  if (detectPhoneInWordForm(normalized)) addBlocked('telephone');
  // L5 : Numéros renversés
  if (detectReversedPhone(normalizedHomoglyph)) addBlocked('telephone');

  // L1 : Patterns regex directs
  // ⚠️ Reset lastIndex avant chaque test : les patterns avec flag /g sont stateful
  // et conservent lastIndex entre appels, causant des faux négatifs.
  // On teste également la version collapsed pour attraper les mots-clés espacés
  // (ex: "w h a t s a p p" → collapsed → "whatsapp", "m o n  n u m" → "monnum")
  const reconL1 = reconstructSpacedNumberSyllables(normalizedHomoglyph);
  const collapsedL1 = collapseSpacedLetters(reconL1);
  for (const [category, patterns] of Object.entries(BLOCKED_PATTERNS)) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(normalizedHomoglyph) || (pattern.lastIndex = 0, pattern.test(collapsedL1))) {
        addBlocked(category);
        break;
      }
    }
  }

  if (blockedPatterns.length > 0) {
    return { isValid: false, blockedPatterns, message: BLOCKED_MSG };
  }
  return { isValid: true, blockedPatterns: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION TEMPS RÉEL
// ─────────────────────────────────────────────────────────────────────────────
export function validateMessageRealtime(content: string): {
  hasWarning: boolean;
  warningMessage?: string;
} {
  const result = validateMessage(content);
  if (!result.isValid) return { hasWarning: true, warningMessage: result.message };
  return { hasWarning: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// SANITIZE POUR LOGS
// ─────────────────────────────────────────────────────────────────────────────
export function sanitizeContent(content: string): string {
  return content
    .replace(/\b0[1-9][\s.\-]?\d{2}[\s.\-]?\d{2}[\s.\-]?\d{2}[\s.\-]?\d{2}\b/gi, '[TÉLÉPHONE MASQUÉ]')
    .replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/gi, '[EMAIL MASQUÉ]')
    .replace(/\b\d{5}\b/g, '[CODE POSTAL MASQUÉ]');
}

// ─────────────────────────────────────────────────────────────────────────────
// EXEMPLES (tests)
// ─────────────────────────────────────────────────────────────────────────────
export const BLOCKED_EXAMPLES = [
  // Numéros directs
  "Appelle-moi au 06 12 34 56 78",
  "Mon numéro: 0612345678",
  "+33 6 12 34 56 78",
  "00 33 6 12 34 56 78",
  // Mots-clés
  "rappelle-moi",
  "voici mon numéro",
  "mon portable c'est",
  // Homoglyphes
  "Mon tel: o6 12 34 56 78",
  // Mots-chiffres
  "zéro six douze trente-quatre cinquante-six soixante-dix-huit",
  "zero six ving trente quarante trois neuf",
  "z e r o s i x vingt cinq trente deux",
  // Cross-messages (détecté par validateMessageWithHistory)
  // msg1: "je suis zero six", msg2: "vingt trois quarante sept"
  // Emails
  "Mon email: test@gmail.com",
  "protonmail", "hotmail", "outlook",
  // Réseaux
  "Retrouve-moi sur WhatsApp",
  "mon snap: user123",
  "insta: @user",
  // Adresses
  "15 rue de la Paix",
  "75001", // code postal Paris
  // IBAN
  "FR76 1234 5678 9012 3456 7890 123",
];

export const VALID_EXAMPLES = [
  // Phrases normales artisan
  "Bonjour, je suis disponible demain matin",
  "Le devis sera de 1500€",
  "Je peux intervenir en 2 heures",
  "Merci pour votre confiance",
  "Réf devis: DV-2026-00012",
  "Rendez-vous lundi à 9h30",
  "Durée estimée: 3 jours",
  "Surface: 25 m²",
  "Chantier prévu en 2026",
  // Faux positifs corrigés
  "Je fais des travaux à domicile",      // "domicile" plus bloqué
  "Service à domicile disponible",        // idem
  "Consultez notre site en ligne",         // "en ligne" plus bloqué
  "Vérifiez la ligne électrique",          // "ligne" plus bloqué
  "Mon PC portable est à jour",            // "portable" seul plus bloqué
  "L'appli mobile est installée",          // "mobile" seul plus bloqué
  "Viens au chantier demain",              // "viens" plus bloqué
  "j'ai eu une fois le problème",         // "une" ne déclenche plus rien
  "Signal wifi correct sur le chantier",   // "signal" seul plus bloqué
  "Intervention à Lyon prévue jeudi",     // ville seule plus bloquée
  "Chantier réf. 42518",                  // numéro dossier
  "3ème étage, appartement B",            // étage
  "Taux TVA: 10%",                         // pourcentage
];
