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
    // Formats standards français
    /\b0[1-9][\s.\-\/\*#|]?\d{2}[\s.\-\/\*#|]?\d{2}[\s.\-\/\*#|]?\d{2}[\s.\-\/\*#|]?\d{2}\b/gi,
    /\b\+33[\s.\-]?[1-9][\s.\-]?\d{2}[\s.\-]?\d{2}[\s.\-]?\d{2}[\s.\-]?\d{2}\b/gi,
    /\b00[\s.\-]?33[\s.\-]?[1-9][\s.\-]?\d{2}[\s.\-]?\d{2}[\s.\-]?\d{2}[\s.\-]?\d{2}\b/gi,
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
    // Mots-clés téléphoniques
    /\bmon[\s\-]?num[eéè]ro\b/gi,
    /\bappell?e[\s\-]?moi\b/gi,
    /\btel[\s:.\-]?\s*\d/gi,
    /\bt[eéè]l[eéè]phone\b/gi,
    /\bportable\b/gi,
    /\bmobile\b/gi,
    /\bnum[eéè]ro[\s\-]?de[\s\-]?t[eéè]l/gi,
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
    /\b\d{5}\b/g,
    /\b\d{2}[\s.\-]?\d{3}\b/g,
    /\b\d[\s.\-]?\d[\s.\-]?\d[\s.\-]?\d[\s.\-]?\d\b/g,
    /\bcode[\s\-]?postal\b/gi,
    /\bcp[\s:.\-]?\s*\d/gi,
    /\b\d{1,4}[\s,]+(bis|ter|quater)?\s*(rue|avenue|boulevard|av\.?|bd\.?|impasse|place|chemin|allée|route|voie|passage|square|cour|villa|résidence|lotissement)\b/gi,
    /\b(rue|avenue|boulevard|impasse|place|chemin|allée|route)[\s\-]+[a-z]{3,}/gi,
    /\b(paris|lyon|marseille|toulouse|nice|nantes|strasbourg|montpellier|bordeaux|lille|rennes|reims|toulon|saint[\s\-]étienne|grenoble|dijon|angers|nîmes|villeurbanne|clermont[\s\-]ferrand|le\s+havre|aix[\s\-]en[\s\-]provence|brest|amiens|limoges|tours|metz|besançon|caen|orléans|mulhouse|rouen|valenciennes|perpignan|pau|cannes|antibes|ajaccio|fort[\s\-]de[\s\-]france|saint[\s\-]denis|pointe[\s\-]à[\s\-]pitre)\b/gi,
    /\bparis[\s\-]?\d{1,2}[eèém]?\b/gi,
    /\b75\d{3}\b/g,
    /\barrondissement\b/gi,
    /\badresse[\s:.\-]/gi,
    /\bdomicile\b/gi,
    /\bchez[\s\-]?moi\b/gi,
    /\bhabite[\s\-]?(au|à)\b/gi,
    /\bviens[\s\-]?(au|à|chez)\b/gi,
  ],

  social: [
    /\bfacebook\b/gi,
    /\binstagram\b/gi,
    /\bwhatsapp\b/gi,
    /\btelegram\b/gi,
    /\bsnapchat\b/gi,
    /\blinkedin\b/gi,
    /\btiktok\b/gi,
    /\bsignal\b/gi,
    /\bviber\b/gi,
    /\bdiscord\b/gi,
    /\bskype\b/gi,
    /\bwechat\b/gi,
    /\bline\b/gi,
    /\bimessage\b/gi,
    /\bfacetime\b/gi,
    /\b@[a-z0-9_.]{3,}\b/gi,
  ],

  autres: [
    /https?:\/\/[^\s]+/gi,
    /www\.[^\s]+\.[a-z]{2,}/gi,
    /\ben[\s\-]?dehors\b/gi,
    /\bhors[\s\-]?plateforme\b/gi,
    /\bsans[\s\-]?passer[\s\-]?par\b/gi,
    /\ben[\s\-]?priv[eé]\b/gi,
    /\bpar[\s\-]?ailleurs\b/gi,
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// L8 — LISTE BLANCHE CONTEXTUELLE
// Retire les séquences numériques bénignes avant détection
// ─────────────────────────────────────────────────────────────────────────────
function removeWhitelistedContexts(text: string): string {
  return text
    .replace(/\b\d[\d\s,.]*(€|euros?|eur)\b/gi, 'PRIX')
    .replace(/\b20[2-3]\d\b/g, 'ANNEE')
    .replace(/\b\d{1,2}h\d{0,2}\b/gi, 'HORAIRE')
    .replace(/\bDV[\-_]\d{4}[\-_]\d+\b/gi, 'REFDEVIS')
    .replace(/\b\d+\s*(jour|semaine|mois|heure|h|min|minute)s?\b/gi, 'DUREE')
    .replace(/\b\d+\s*(m[²2]?|cm|mm|ml|l|kg|g|t)\b/gi, 'QUANTITE')
    .replace(/^\d+\.\s/gm, 'ITEM ');
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
// L3b — COLLER LES LETTRES ESPACÉES (attaque "z e r o s i x...")
// "z e r o" → "zero", "t rente" → "trente", "deu x" → "deux"
// ─────────────────────────────────────────────────────────────────────────────
function collapseSpacedLetters(text: string): string {
  let result = text.toLowerCase();
  // 4 passes pour reconstituer des mots découpés caractère par caractère
  for (let i = 0; i < 4; i++) {
    result = result.replace(/([a-zéèêàâôùûîç]{1,6})\s+([a-zéèêàâôùûîç]{1,6})/g, '$1$2');
  }
  return result;
}

function detectPhoneInWordForm(text: string): boolean {
  // Tester aussi la version avec lettres espacées recollées
  const versions = [text, collapseSpacedLetters(text)];
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
function extractDigitRuns(rawText: string): string {
  const clean = removeWhitelistedContexts(rawText);
  const norm = normalizeAltSeparators(clean);
  const noHomo = normalizeHomoglyphsInMixedSegments(norm);
  // L3 cross-message : mots-chiffres normaux + version lettres espacées recollées
  const withWordDigits = convertNumberWords(noHomo);
  const withCollapsed = convertNumberWords(collapseSpacedLetters(noHomo));
  const d1 = (withWordDigits.match(/\d+/g) || []).join('');
  const d2 = (withCollapsed.match(/\d+/g) || []).join('');
  // Retourner la version avec le plus de chiffres détectés
  return d1.length >= d2.length ? d1 : d2;
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

  // L7 — RESET BUFFER
  // 4+ messages consécutifs sans aucun chiffre → l'accumulation repart à zéro
  const WINDOW = 6;
  const RESET_THRESHOLD = 4;
  const lastMsgs = recentSenderMsgs.slice(-WINDOW);
  // Un message avec mots-chiffres ("zero six...") n'est PAS sans chiffres
  const noDigitStreak = lastMsgs
    .slice(-RESET_THRESHOLD)
    .filter(m => extractDigitRuns(m).length === 0).length;
  if (noDigitStreak >= RESET_THRESHOLD) {
    return { isValid: true, blockedPatterns: [] };
  }

  // L6 — CUMUL CROSS-MESSAGES
  const historyCumulatedDigits = lastMsgs.map(extractDigitRuns).join('');
  const newContentDigits = extractDigitRuns(newContent);

  // Guard : si le nouveau message n'apporte aucun chiffre,
  // il ne peut PAS être la pièce manquante d'un numéro fragmenté → safe
  if (!newContentDigits) {
    return { isValid: true, blockedPatterns: [] };
  }

  const combinedDigits = historyCumulatedDigits + newContentDigits;

  // Fenêtre 10 : numéro français complet
  for (let i = 0; i <= combinedDigits.length - 10; i++) {
    if (/^0[1-9]\d{8}$/.test(combinedDigits.substring(i, i + 10))) return BLOCKED_PHONE;
  }
  // Fenêtre 9 : mobile quasi-complet 06/07XXXXXXX
  for (let i = 0; i <= combinedDigits.length - 9; i++) {
    if (/^0[67]\d{7}$/.test(combinedDigits.substring(i, i + 9))) return BLOCKED_PHONE;
  }
  // Fenêtre 11 : format +33 / 0033
  for (let i = 0; i <= combinedDigits.length - 11; i++) {
    if (/^33[1-9]\d{8}$/.test(combinedDigits.substring(i, i + 11))) return BLOCKED_PHONE;
  }

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
  for (const [category, patterns] of Object.entries(BLOCKED_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedHomoglyph)) {
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
  // L1 — standards
  "Appelle-moi au 06 12 34 56 78",
  "Mon numéro: 0612345678",
  "+33 6 12 34 56 78",
  "00 33 6 12 34 56 78",
  // L2 — homoglyphes
  "Mon tel: o6 12 34 56 78",
  "I am at 06I234567B",
  // L3 — mots-chiffres
  "zéro six douze trente-quatre cinquante-six soixante-dix-huit",
  "zero six vingt-cinq trente-deux quarante sept",
  // L4 — séparateurs alternatifs
  "06*12*34*56*78",
  "06/12/34/56/78",
  // L5 — renversé
  "87654321 60",
  // Emails
  "Mon email: test@gmail.com",
  "gmail.com",
  "protonmail",
  // Réseaux
  "Retrouve-moi sur WhatsApp",
  "Contacte-moi sur Signal",
  "Mon Discord: user#1234",
  // DOM-TOM
  "Mon numéro Réunion: 0262123456",
];

export const VALID_EXAMPLES = [
  "Bonjour, je suis disponible demain matin",
  "Le devis sera de 1500€",
  "Je peux intervenir en 2 heures",
  "Pouvez-vous préciser le type de travaux ?",
  "Merci pour votre confiance",
  "Réf devis: DV-2026-00012",
  "Rendez-vous lundi à 9h30",
  "Durée estimée: 3 jours",
  "Surface: 25 m²",
  "Chantier prévu en 2026",
];
