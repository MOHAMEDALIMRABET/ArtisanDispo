'use client';

import { useState } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import type { Categorie } from '@/types/firestore';

// Mapping ancien → nouveau
const METIERS_MIGRATION: Record<string, Categorie> = {
  'Plomberie': 'plomberie',
  'plomberie': 'plomberie',
  'Électricité': 'electricite',
  'électricité': 'electricite',
  'Electricité': 'electricite',
  'electricité': 'electricite',
  'electricite': 'electricite',
  'Menuiserie': 'menuiserie',
  'menuiserie': 'menuiserie',
  'Maçonnerie': 'maconnerie',
  'maçonnerie': 'maconnerie',
  'Maconnerie': 'maconnerie',
  'maconnerie': 'maconnerie',
  'Peinture': 'peinture',
  'peinture': 'peinture',
  'Carrelage': 'carrelage',
  'carrelage': 'carrelage',
  'Toiture': 'toiture',
  'toiture': 'toiture',
  'Chauffage': 'chauffage',
  'chauffage': 'chauffage',
  'Climatisation': 'climatisation',
  'climatisation': 'climatisation',
  'Isolation': 'isolation',
  'isolation': 'isolation',
  'Serrurerie': 'serrurerie',
  'serrurerie': 'serrurerie',
  'Autre': 'autre',
  'autre': 'autre'
};

export default function MigrateMetiersPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, message]);
    console.log(message);
  };

  async function runMigration() {
    setIsRunning(true);
    setLogs([]);
    setIsDone(false);

    addLog('🚀 Démarrage de la migration des métiers...\n');

    try {
      const artisansRef = collection(db, 'artisans');
      const snapshot = await getDocs(artisansRef);

      addLog(`📊 ${snapshot.size} artisan(s) trouvé(s)\n`);

      let migratedCount = 0;
      let skippedCount = 0;

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const artisanId = docSnap.id;
        const metiers = data.metiers;

        addLog(`\n👤 Artisan: ${data.raisonSociale || artisanId}`);
        addLog(`   Métiers actuels: ${JSON.stringify(metiers)}`);

        if (!metiers) {
          addLog(' ⚠️ Pas de métiers définis - ignoré');
          skippedCount++;
          continue;
        }

        let metiersArray: string[];
        if (Array.isArray(metiers)) {
          metiersArray = metiers;
        } else if (typeof metiers === 'object') {
          metiersArray = Object.values(metiers);
          addLog(`   🔄 Conversion objet → tableau: ${JSON.stringify(metiersArray)}`);
        } else {
          addLog(' ⚠️ Format métiers invalide - ignoré');
          skippedCount++;
          continue;
        }

        const normalizedMetiers = metiersArray
          .map(m => METIERS_MIGRATION[m] || m.toLowerCase())
          .filter((m, i, arr) => arr.indexOf(m) === i);

        const needsMigration = JSON.stringify(metiers) !== JSON.stringify(normalizedMetiers);

        if (needsMigration) {
          addLog(' ✅ Migration nécessaire');
          addLog(`   Avant: ${JSON.stringify(metiersArray)}`);
          addLog(`   Après: ${JSON.stringify(normalizedMetiers)}`);

          const artisanDoc = doc(db, 'artisans', artisanId);
          await updateDoc(artisanDoc, {
            metiers: normalizedMetiers
          });

          addLog('   💾 Sauvegardé dans Firestore');
          migratedCount++;
        } else {
          addLog('   ⏭️  Déjà normalisé - ignoré');
          skippedCount++;
        }
      }

      addLog('\n\n✨ Migration terminée !');
      addLog(` ✅ ${migratedCount} artisan(s) migré(s)`);
      addLog(`   ⏭️  ${skippedCount} artisan(s) ignoré(s)`);

      setIsDone(true);
      setIsRunning(false);

    } catch (error) {
      addLog(`\n❌ Erreur: ${error}`);
      setIsRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-navy-800 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-navy-800 mb-6">
            🔧 Migration des Métiers
          </h1>

          <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
            <p className="text-sm text-yellow-800">
              <strong>⚠️ Attention :</strong> Ce script va normaliser tous les métiers dans Firestore (enlever les accents, passer en minuscules).
            </p>
            <p className="text-sm text-yellow-800 mt-2">
              Exemples : "Électricité" → "electricite", "Plomberie" → "plomberie"
            </p>
          </div>

          <button
            onClick={runMigration}
            disabled={isRunning}
            className={`w-full py-3 px-6 rounded-lg font-bold text-white transition-all ${
              isRunning
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-brand-700 hover:bg-brand-800 shadow-lg hover:shadow-md'
            }`}
          >
            {isRunning ? '⏳ Migration en cours...' : '🚀 Lancer la Migration'}
          </button>

          {logs.length > 0 && (
            <div className="mt-6">
              <h2 className="text-xl font-bold text-navy-800 mb-3">📋 Logs</h2>
              <div className="bg-slate-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
                {logs.map((log, i) => (
                  <div key={i} className="whitespace-pre-wrap">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          {isDone && (
            <div className="mt-6 p-4 bg-green-50 border-l-4 border-green-500 rounded">
              <p className="text-green-800 font-bold">
                ✅ Migration terminée avec succès !
              </p>
              <p className="text-sm text-green-700 mt-2">
                Rechargez votre page profil pour voir les changements.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
