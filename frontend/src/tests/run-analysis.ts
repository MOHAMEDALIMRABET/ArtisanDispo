/**
 * Script d'analyse des faux positifs / faux négatifs du validateur anti-bypass.
 * Lance avec : npx tsx src/tests/run-analysis.ts
 */
import { validateMessage } from '../lib/antiBypassValidator';

const tests: [string, string, boolean][] = [
  // === FAUX POSITIFS POTENTIELS (devraient PASSER — isValid=true) ===
  ['FP01 - mon portable (laptop repair)',          'Je veux réparer mon portable',                                                     true],
  ['FP02 - PC portable',                           'Bonjour, mon PC portable ne démarre plus',                                         true],
  ['FP03 - six prises trois pièces (description)', 'Je veux installer six prises dans trois pièces, deux disjoncteurs et neuf interrupteurs', true],
  ['FP04 - département 06 (Alpes-Maritimes)',      'Je suis dans le département 06 près de Nice',                                      true],
  ['FP05 - six octobre (date)',                    'Je suis disponible le six octobre pour visiter',                                   true],
  ['FP06 - durée six heures',                      'Durée estimée: six heures de travail sur place',                                  true],
  ['FP07 - réparation portables (laptops)',        'Je répare les portables et tablettes en tout genre',                              true],
  ['FP08 - quatre-vingts euros (prix lettres)',    'Le devis est de quatre-vingts euros pour la réparation',                          true],
  ['FP09 - motif refus légitime',                  'Le tarif est trop élevé pour ce type de travaux simples',                         true],
  ['FP10 - contre-proposition légitime',           "Je peux aller jusqu'à 80€ car le travail est limité au robinet uniquement",       true],
  ['FP11 - description robinet fuite',             'Robinet qui fuit dans ma salle de bain, intervention urgente svp',                true],
  ['FP12 - artisan avec plusieurs nombres',        'Travaux: 3 radiateurs à changer, 2 vannes, environ 4 heures de travail',          true],
  ['FP13 - date avec chiffres',                    "L'artisan n'est pas disponible le 15 janvier, trop tard pour moi",                true],
  ['FP14 - six robinets (six commun)',              'Il faut changer six robinets et deux joints dans la cuisine',                    true],
  ['FP15 - vingt-deux m² (surface)',               'La surface est de vingt-deux mètres carrés à repeindre',                         true],
  ['FP16 - prix en euros',                         'Bonjour, je propose 85€ pour changer les deux robinets du lavabo',               true],
  ['FP17 - disponible 8h à 18h',                   'Je suis disponible entre 8h et 18h du lundi au vendredi',                        true],
  ['FP18 - prise de mesures avec cm',              "J'ai besoin d'une étagère de 80 cm de large et 40 cm de profondeur",             true],
  ['FP19 - référence commande',                    'Référence commande fournisseur: REF-2026-0034 pour le câble',                    true],
  ['FP20 - chantier avec nombre de pièces',        'Chantier de 5 pièces dans un appartement neuf du 7ème étage',                   true],
  ['FP21 - devis 1500€ description complète',      "Je travaille depuis 8h, le devis total sera 1500€ pour l'installation complète", true],
  ['FP22 - appartement neuf (neuf=new)',            'Mon appartement est neuf, livré en 2024, besoin de travaux de finition',         true],
  ['FP23 - six novembre (mois + chiffre-mot)',      'Intervention prévue le six novembre entre 9h et 11h',                           true],
  ['FP24 - description avec unités',               'Pose de 15 m² de carrelage et 3 m de faïence pour la salle de bain',            true],

  // === VRAIS BYPASS (doivent être BLOQUÉS — isValid=false) ===
  ['BP01 - numéro standard',                       'Appelle-moi au 06 12 34 56 78',                                                   false],
  ['BP02 - numéro collé à lettres',                'appelemoi0612345678',                                                             false],
  ['BP03 - whatsapp',                              'Contacte-moi sur WhatsApp svp',                                                   false],
  ['BP04 - email standard',                        'Envoie-moi un mail à test@gmail.com',                                             false],
  ['BP05 - adresse avec numéro de rue',            'Venez au 12 rue de la Paix pour voir les travaux',                               false],
  ['BP06 - numéro en mots (zéro six)',             "Mon numéro c'est zéro six douze trente-quatre cinquante-six soixante-dix-huit",  false],
  ['BP07 - +33',                                   'Mon tel: +33 6 12 34 56 78',                                                     false],
  ['BP08 - instagram',                             'Retrouve-moi sur instagram @plombier75',                                         false],
  ['BP09 - code postal Paris',                     "J'habite 75001 Paris, venez me voir",                                            false],
  ['BP10 - numéro partiel 8 chiffres',             'Appelle: 06 12 34 56',                                                           false],
  ['BP11 - mon portable + numéro',                 "Mon portable c'est 0612345678",                                                   false],
  ['BP12 - en dehors plateforme',                  'On peut discuter en dehors de la plateforme',                                     false],

  // === CAS SPÉCIFIQUES AUX MODALES REFUS / CONTRE-PROPOSITION ===
  ['MR01 - motif refus: prix trop élevé',          'Le montant proposé est vraiment trop élevé par rapport au marché local',         true],
  ['MR02 - motif refus: délai incompatible',       "Le délai d'intervention ne correspond pas à mon urgence",                        true],
  ['MR03 - motif refus: artisan non compétent',    "Je préfère un artisan spécialisé pour ce type de travaux spécifiques",           true],
  ['MC01 - contre-prop: budget serré',             "J'ai un budget limité à 70€ maximum pour cette intervention",                    true],
  ['MC02 - contre-prop: travaux partiels',         'Je voudrais que vous fassiez uniquement le joint, pas le remplacement complet',  true],
  ['MC03 - contre-prop avec deux prises',          'Seulement deux prises à changer, pas les six que vous avez comptées',            true],
];

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const [name, msg, expected] of tests) {
  const result = validateMessage(msg);
  const ok = result.isValid === expected;
  if (ok) {
    passed++;
    console.log('✅', name);
  } else {
    failed++;
    const detail = expected
      ? `FAUX POSITIF — bloqué alors que valide. Patterns: [${result.blockedPatterns.join(', ')}]`
      : `FAUX NÉGATIF — passé alors que contient un bypass`;
    console.log('❌', name);
    console.log('   →', detail);
    console.log('   Message:', JSON.stringify(msg));
    failures.push(`${name}: ${detail}`);
  }
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`Résultat: ${passed} ✅ OK  |  ${failed} ❌ ÉCHECS`);
if (failures.length > 0) {
  console.log('\nÉchecs détaillés:');
  failures.forEach(f => console.log(' •', f));
}
