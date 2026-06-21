/**
 * Script : Corrige la zone d'intervention de l'artisan de test
 * qui est enregistrée sur Paris au lieu de Grenoble/Fontaine.
 *
 * Utilisation :
 *   cd backend/scripts
 *   node fix-zone-intervention.js
 */

const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function fixZone() {
  // userId de l'artisan Mrabet Mohamed Ali
  const userId = 'oVUETQNwG4ZKbFsPUAn6vGfRjTI3';

  const artisanRef = db.collection('artisans').doc(userId);
  const snap = await artisanRef.get();

  if (!snap.exists) {
    console.error('❌ Artisan introuvable');
    return;
  }

  const data = snap.data();
  console.log('Zones actuelles :', JSON.stringify(data.zonesIntervention, null, 2));

  // Remplacer la première zone (Paris → Grenoble/Fontaine)
  const zonesCorrigees = [{
    adresse: '12 Rue de la République 38600 Fontaine',
    ville: 'Grenoble',
    codePostal: '38000',
    departements: ['38'],
    latitude: 45.1885,
    longitude: 5.7245,
    rayonKm: 30,
  }];

  await artisanRef.update({ zonesIntervention: zonesCorrigees });

  console.log('✅ Zone corrigée → Grenoble (38000), rayon 30km');
}

fixZone().catch(err => {
  console.error('❌ Erreur:', err);
  process.exit(1);
});
