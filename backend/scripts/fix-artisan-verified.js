/**
 * Script de correction : Active verified=true pour les artisans qui ont
 * leurs 3 documents obligatoires (KBIS + Pièce d'identité + RC Pro) validés
 * mais dont verified=false à cause de l'ancienne logique (décennale requise
 * ou contactVerification manquante).
 *
 * Utilisation :
 *   cd backend/scripts
 *   node fix-artisan-verified.js
 *
 * Option : passer un email pour cibler un artisan spécifique
 *   node fix-artisan-verified.js mohamedalimrabet22@gmail.com
 */

const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');

// Charger les variables d'environnement du backend
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Initialiser Firebase Admin SDK
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

/**
 * Corrige les artisans qui ont KBIS + ID + RC Pro validés mais verified=false
 */
async function fixArtisanVerified(targetEmail) {
  console.log('🔍 Recherche des artisans à corriger...\n');

  // Construire la requête : tous les artisans non vérifiés
  let snapshot;
  if (targetEmail) {
    // Cibler un artisan spécifique par email
    snapshot = await db.collection('artisans')
      .where('email', '==', targetEmail)
      .get();
    console.log(`🎯 Mode ciblé : email="${targetEmail}"`);
  } else {
    // Tous les artisans avec verified=false
    snapshot = await db.collection('artisans')
      .where('verified', '==', false)
      .get();
    console.log(`📋 Mode global : ${snapshot.size} artisan(s) avec verified=false`);
  }

  if (snapshot.empty) {
    console.log('✅ Aucun artisan à corriger.');
    return;
  }

  let correctedCount = 0;
  let skippedCount = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const id = docSnap.id;
    const nom = `${data.nom || ''} ${data.prenom || ''}`.trim() || data.raisonSociale || id;

    // Vérifier les 3 documents obligatoires
    const kbisOk = data.verificationDocuments?.kbis?.verified === true;
    const idCardOk = data.verificationDocuments?.idCard?.verified === true;
    const rcProOk = data.verificationDocuments?.rcPro?.verified === true;

    console.log(`\n👤 ${nom} (${data.email || 'email inconnu'})`);
    console.log(`   KBIS:  ${kbisOk ? '✅' : '❌'}`);
    console.log(`   ID:    ${idCardOk ? '✅' : '❌'}`);
    console.log(`   RCPro: ${rcProOk ? '✅' : '❌'}`);
    console.log(`   verified actuel: ${data.verified}`);

    if (kbisOk && idCardOk && rcProOk) {
      // Corriger l'artisan
      await db.collection('artisans').doc(id).update({
        verified: true,
        verificationStatus: 'approved',
        verificationDate: admin.firestore.Timestamp.now(),
        statut: 'actif',
      });

      // Corriger aussi le document users si userId disponible
      const userId = data.userId || id;
      const userRef = db.collection('users').doc(userId);
      const userSnap = await userRef.get();
      if (userSnap.exists) {
        await userRef.update({ statut: 'verifie' });
        console.log(`   💾 users/${userId}.statut → 'verifie'`);
      }

      console.log(`   ✅ CORRIGÉ : verified=true, statut='actif'`);
      correctedCount++;
    } else {
      console.log(`   ⏭️  Ignoré : documents manquants ou non validés`);
      skippedCount++;
    }
  }

  console.log(`\n🎉 Terminé : ${correctedCount} artisan(s) corrigé(s), ${skippedCount} ignoré(s)`);
}

// Récupérer l'email en argument (optionnel)
const targetEmail = process.argv[2] || null;

fixArtisanVerified(targetEmail).catch((err) => {
  console.error('❌ Erreur script:', err);
  process.exit(1);
});
