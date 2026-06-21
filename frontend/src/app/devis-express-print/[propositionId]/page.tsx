'use client';

/**
 * Page d'impression du devis express
 * Fonctionne comme la page de devis classique : rendu HTML + window.print()
 * Accessible par l'artisan et le client via un nouvel onglet.
 *
 * URL : /devis-express-print/[propositionId]
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Logo } from '@/components/ui';
import {
  getPropositionExpressById,
  getDemandeExpressById,
} from '@/lib/firebase/demande-express-service';
import { getUserById } from '@/lib/firebase/user-service';
import { getArtisanByUserId } from '@/lib/firebase/artisan-service';
import type { PropositionExpress, DemandeExpress, User, Artisan } from '@/types/firestore';

export default function DevisExpressPrintPage() {
  const params = useParams();
  const propositionId = params.propositionId as string;

  const [proposition, setProposition] = useState<PropositionExpress | null>(null);
  const [demande, setDemande] = useState<DemandeExpress | null>(null);
  const [client, setClient] = useState<User | null>(null);
  const [artisan, setArtisan] = useState<Artisan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        // Charger la proposition
        const prop = await getPropositionExpressById(propositionId);
        if (!prop || !prop.devisJoint) {
          setError('Devis introuvable ou aucun devis joint à cette proposition.');
          return;
        }
        setProposition(prop);

        // Charger les données associées en parallèle
        const [demandeData, clientData, artisanData] = await Promise.all([
          getDemandeExpressById(prop.demandeId),
          getUserById(prop.clientId),
          getArtisanByUserId(prop.artisanId),
        ]);

        setDemande(demandeData);
        setClient(clientData);
        setArtisan(artisanData);
      } catch (err) {
        console.error('Erreur chargement devis express:', err);
        setError('Erreur lors du chargement du devis.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [propositionId]);

  // Déclencher l'impression automatiquement après le rendu
  useEffect(() => {
    if (!loading && !error && proposition) {
      // Petit délai pour laisser le DOM se rendre complètement (signatures, etc.)
      const timer = setTimeout(() => window.print(), 600);
      return () => clearTimeout(timer);
    }
  }, [loading, error, proposition]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00] mx-auto mb-4"></div>
          <p className="text-[#6C757D]">Préparation du devis pour impression...</p>
        </div>
      </div>
    );
  }

  if (error || !proposition?.devisJoint) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-red-600 font-semibold">{error ?? 'Devis introuvable.'}</p>
      </div>
    );
  }

  const devis = proposition.devisJoint;
  const artisanNom = artisan?.raisonSociale ?? `${client?.prenom ?? ''} ${client?.nom ?? ''}`.trim() ?? 'Artisan';
  const clientNom = client ? `${client.prenom} ${client.nom}` : 'Client';
  const categorieLabel = demande?.categorieLabel ?? demande?.categorie ?? '';
  const ville = demande?.ville ?? '';
  const dateDevis = proposition.createdAt?.toDate().toLocaleDateString('fr-FR') ?? '—';
  const numeroRef = propositionId.slice(0, 8).toUpperCase();

  return (
    <>
      {/* ── Styles d'impression ─────────────────────────────── */}
      <style jsx global>{`
        @media print {
          @page {
            margin: 0.5cm;
            size: A4 portrait;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          /* N'imprimer que la zone print */
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          /* Masquer éléments no-print */
          .no-print { display: none !important; }
          /* Espacements compacts */
          .mb-6 { margin-bottom: 0.5rem !important; }
          .mb-8 { margin-bottom: 0.75rem !important; }
          /* Tableaux compacts */
          table { font-size: 10px !important; }
          table th, table td { padding: 0.25rem 0.5rem !important; }
          /* Éviter coupure dans sections importantes */
          .no-break { page-break-inside: avoid; }
        }
      `}</style>

      {/* ── Bouton impression (masqué à l'impression) ─────── */}
      <div className="no-print flex items-center justify-between bg-[#2C3E50] text-white px-6 py-4">
        <span className="font-semibold">Devis Express — {categorieLabel} · {ville}</span>
        <button
          onClick={() => window.print()}
          className="bg-[#FF6B00] hover:bg-[#E56100] text-white px-5 py-2 rounded-lg font-semibold"
        >
          🖨️ Imprimer / Enregistrer en PDF
        </button>
      </div>

      {/* ── Zone imprimable ────────────────────────────────── */}
      <div className="print-area min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-6 py-8">

          {/* En-tête */}
          <div className="border-b-2 border-[#FF6B00] pb-6 mb-6 no-break flex justify-between items-start">
            <div className="flex-shrink-0">
              <Logo size="sm" variant="full" />
            </div>
            <div className="text-center flex-1">
              <h2 className="text-3xl font-bold text-[#2C3E50] mb-1">DEVIS EXPRESS</h2>
              <p className="text-gray-600 text-sm">Réf. {numeroRef}</p>
              <p className="text-gray-500 text-sm">Date : {dateDevis}</p>
            </div>
            <div className="text-right text-sm text-gray-500">
              <p className="font-semibold text-[#FF6B00]">⚡ Travaux express</p>
              <p>{categorieLabel}</p>
              <p>{ville}</p>
            </div>
          </div>

          {/* Artisan / Client */}
          <div className="grid grid-cols-2 gap-8 mb-8 no-break">
            {/* Artisan */}
            <div>
              <h3 className="font-bold text-[#2C3E50] mb-3 border-b border-[#E9ECEF] pb-1">Artisan</h3>
              {artisan?.raisonSociale && (
                <p className="font-semibold">{artisan.raisonSociale}</p>
              )}
              {artisan?.siret && (
                <p className="text-sm text-gray-600">SIRET : {artisan.siret}</p>
              )}
              {artisan?.zonesIntervention?.[0]?.adresse && (
                <p className="text-sm text-gray-600 mt-1">
                  📍 {artisan.zonesIntervention[0].adresse},&nbsp;
                  {artisan.zonesIntervention[0].codePostal}&nbsp;
                  {artisan.zonesIntervention[0].ville}
                </p>
              )}
            </div>

            {/* Client */}
            <div>
              <h3 className="font-bold text-[#2C3E50] mb-3 border-b border-[#E9ECEF] pb-1">Client</h3>
              <p className="font-semibold">{clientNom}</p>
              <p className="text-sm text-gray-600">📍 {ville}</p>
            </div>
          </div>

          {/* Description de la prestation */}
          {proposition.description && (
            <div className="mb-6 bg-[#F8F9FA] rounded-lg p-4 border-l-4 border-[#FF6B00]">
              <p className="text-sm font-semibold text-[#2C3E50] mb-1">Objet de l'intervention</p>
              <p className="text-sm text-gray-700">{proposition.description}</p>
            </div>
          )}

          {/* Tableau des prestations */}
          <div className="mb-8">
            <h3 className="font-bold text-[#2C3E50] mb-4">Détail des prestations</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border border-gray-300 px-4 py-2 text-left w-[40%]">Désignation</th>
                    <th className="border border-gray-300 px-4 py-2 text-center w-[12%]">Quantité</th>
                    <th className="border border-gray-300 px-4 py-2 text-right w-[16%]">PU HT</th>
                    <th className="border border-gray-300 px-4 py-2 text-center w-[12%]">TVA</th>
                    <th className="border border-gray-300 px-4 py-2 text-right w-[20%]">Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Main d'œuvre */}
                  {devis.mainOeuvre && devis.mainOeuvre.prixHT > 0 && (
                    <tr className="bg-orange-50">
                      <td className="border border-gray-300 px-4 py-2 font-semibold text-[#FF6B00]">
                        ⚡ Main d'œuvre
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-center">
                        {devis.mainOeuvre.quantite} {devis.mainOeuvre.unite || 'h'}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        {devis.mainOeuvre.prixHT.toFixed(2)} €
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-center">
                        {devis.mainOeuvre.tauxTVA}%
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                        {(devis.mainOeuvre.quantite * devis.mainOeuvre.prixHT).toFixed(2)} €
                      </td>
                    </tr>
                  )}

                  {/* Matières premières */}
                  {devis.matierePremiere && devis.matierePremiere.prixHT > 0 && (
                    <tr className="bg-gray-50">
                      <td className="border border-gray-300 px-4 py-2 font-semibold text-[#2C3E50]">
                        🛠️ Matières premières
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-center">
                        {devis.matierePremiere.quantite} {devis.matierePremiere.unite || 'forfait'}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">
                        {devis.matierePremiere.prixHT.toFixed(2)} €
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-center">
                        {devis.matierePremiere.tauxTVA}%
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                        {(devis.matierePremiere.quantite * devis.matierePremiere.prixHT).toFixed(2)} €
                      </td>
                    </tr>
                  )}

                  {/* Lignes supplémentaires */}
                  {devis.lignes
                    .filter(l => l.description?.trim() || l.prixUnitaireHT > 0)
                    .map((ligne, i) => (
                      <tr key={ligne.id ?? i}>
                        <td className="border border-gray-300 px-4 py-2">{ligne.description}</td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {ligne.quantite} {ligne.unite}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {ligne.prixUnitaireHT.toFixed(2)} €
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {ligne.tauxTVA}%
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                          {ligne.totalHT.toFixed(2)} €
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totaux */}
          <div className="flex justify-end mb-8 no-break">
            <div className="w-72 bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="flex justify-between mb-2 text-sm">
                <span className="text-gray-600">Total HT :</span>
                <span className="font-semibold">{devis.totaux.totalHT.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between mb-2 text-sm">
                <span className="text-gray-600">TVA :</span>
                <span className="font-semibold">{devis.totaux.totalTVAGlobal.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-xl font-bold text-[#FF6B00] pt-2 border-t-2 border-[#FF6B00]">
                <span>Total TTC :</span>
                <span>{devis.totaux.totalTTC.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          {/* Conditions / Délai */}
          {(devis.delaiRealisation || devis.dateDebutPrevue || devis.conditions) && (
            <div className="mb-8 space-y-2 text-sm border-t border-[#E9ECEF] pt-4 no-break">
              {devis.delaiRealisation && (
                <div className="flex gap-2">
                  <span className="font-semibold text-[#6C757D] min-w-36">Délai de réalisation :</span>
                  <span>{devis.delaiRealisation}</span>
                </div>
              )}
              {devis.dateDebutPrevue && (
                <div className="flex gap-2">
                  <span className="font-semibold text-[#6C757D] min-w-36">Date de début :</span>
                  <span>{devis.dateDebutPrevue}</span>
                </div>
              )}
              {devis.conditions && (
                <div className="flex gap-2">
                  <span className="font-semibold text-[#6C757D] min-w-36">Conditions :</span>
                  <span className="whitespace-pre-wrap">{devis.conditions}</span>
                </div>
              )}
            </div>
          )}

          {/* Signatures */}
          <div className="mt-8 pt-6 border-t-2 border-gray-300 no-break">
            <div className="flex justify-between items-end gap-8">

              {/* Signature client */}
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-700 mb-2">Signature du client :</p>
                {devis.signatureClient?.dataURL ? (
                  <>
                    <div className="border-2 border-green-400 rounded p-2 inline-block bg-white">
                      <img
                        src={devis.signatureClient.dataURL}
                        alt="Signature client"
                        className="h-16 w-auto"
                      />
                    </div>
                    <p className="text-xs text-gray-600 mt-1 font-medium">{clientNom}</p>
                    {devis.signatureClient.date && (
                      <p className="text-xs text-gray-500">
                        Signé le {(devis.signatureClient.date as any).toDate?.()?.toLocaleDateString('fr-FR') ?? '—'}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="border-2 border-dashed border-gray-300 rounded p-4 w-48 h-20 flex items-center justify-center bg-gray-50">
                    <p className="text-xs text-gray-400 text-center">
                      En attente<br />de la signature client
                    </p>
                  </div>
                )}
              </div>

              {/* Signature artisan */}
              <div className="flex-1 text-right">
                <p className="text-xs font-semibold text-gray-700 mb-2">Signature de l'artisan :</p>
                {devis.signatureArtisan?.dataURL ? (
                  <>
                    <div className="border-2 border-[#FF6B00] rounded p-2 inline-block bg-white">
                      <img
                        src={devis.signatureArtisan.dataURL}
                        alt="Signature artisan"
                        className="h-16 w-auto"
                      />
                    </div>
                    <p className="text-xs text-gray-600 mt-1 font-medium">{artisanNom}</p>
                    {devis.signatureArtisan.date && (
                      <p className="text-xs text-gray-500">
                        Signé le {(devis.signatureArtisan.date as any).toDate?.()?.toLocaleDateString('fr-FR') ?? '—'}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="border-2 border-dashed border-gray-300 rounded p-4 w-48 h-20 flex items-center justify-center bg-gray-50 ml-auto">
                    <p className="text-xs text-gray-400 text-center">
                      Espace réservé<br />au cachet
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Pied de page */}
          <div className="mt-10 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
            <p>Devis généré via ArtisanDispo — plateforme de mise en relation artisans/clients</p>
          </div>

        </div>
      </div>
    </>
  );
}
