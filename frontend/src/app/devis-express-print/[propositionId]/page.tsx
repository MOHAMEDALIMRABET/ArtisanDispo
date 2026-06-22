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

/**
 * Convertit un timestamp Firestore (Timestamp, {seconds,nanoseconds} brut, ou Date)
 * en objet Date JavaScript. Évite l'erreur "toDate is not a function".
 */
function tsToDate(ts: unknown): Date {
  if (!ts) return new Date(0);
  if (ts instanceof Date) return ts;
  if (typeof (ts as { toDate?: unknown }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate();
  }
  if (typeof (ts as { seconds?: unknown }).seconds === 'number') {
    return new Date((ts as { seconds: number }).seconds * 1000);
  }
  return new Date(ts as string | number);
}

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
  const clientNom = client ? `${client.prenom} ${client.nom}` : 'Client';
  const categorieLabel = demande?.categorieLabel ?? demande?.categorie ?? '';
  const sousCategorieLabel = demande?.sousCategorieLabel ?? '';
  const ville = demande?.ville ?? '';
  const codePostal = demande?.codePostal ?? '';
  const adresseChantier = demande?.adresse
    ? `${demande.adresse}, ${codePostal} ${ville}`
    : `${codePostal} ${ville}`.trim();

  const dateDevis = proposition.createdAt
    ? tsToDate(proposition.createdAt).toLocaleDateString('fr-FR')
    : '—';
  // Validité 30 jours
  const dateValidite = proposition.createdAt
    ? new Date(tsToDate(proposition.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR')
    : '—';
  const numeroRef = `EXP-${propositionId.slice(0, 8).toUpperCase()}`;

  // Adresse complète de l'artisan (zone d'intervention principale)
  const artisanAdresse = (() => {
    const z = artisan?.zonesIntervention?.[0];
    if (!z) return artisan?.adresse ?? '';
    const parts = [z.adresse, z.codePostal, z.ville].filter(Boolean);
    return parts.join(', ');
  })();

  // Masquage partiel email (visible uniquement si payé)
  const masquerEmailPartiel = (email: string) => {
    const [local, domain] = email.split('@');
    if (!domain) return email;
    return `${local.slice(0, 2)}***@${domain}`;
  };

  return (
    <>
      {/* ── Styles d'impression ─────────────────────────────── */}
      <style jsx global>{`
        @media print {
          @page {
            margin: 1.5cm 1.5cm 2cm 1.5cm;
            size: A4 portrait;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print { display: none !important; }
          table { font-size: 10px !important; }
          table th, table td { padding: 0.3rem 0.5rem !important; }
          .no-break { page-break-inside: avoid; }
          .section-mb { margin-bottom: 1rem !important; }
        }
      `}</style>

      {/* ── Barre d'actions (masquée à l'impression) ─────── */}
      <div className="no-print flex items-center justify-between bg-[#2C3E50] text-white px-6 py-4">
        <div>
          <span className="font-semibold">Devis {numeroRef}</span>
          <span className="mx-2 text-gray-400">·</span>
          <span className="text-gray-300">{categorieLabel}{sousCategorieLabel ? ` — ${sousCategorieLabel}` : ''}</span>
          <span className="mx-2 text-gray-400">·</span>
          <span className="text-gray-300">{ville}</span>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-[#FF6B00] hover:bg-[#E56100] text-white px-5 py-2 rounded-lg font-semibold"
        >
          🖨️ Imprimer / Enregistrer en PDF
        </button>
      </div>

      {/* ── Zone imprimable ─────────────────────────────────── */}
      <div className="print-area min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-8 py-10">

          {/* ═══ 1. EN-TÊTE : Logo + titre DEVIS + références ═══ */}
          <div className="border-b-4 border-[#FF6B00] pb-6 mb-8 no-break">
            <div className="flex justify-between items-start gap-6">
              {/* Logo gauche */}
              <div className="flex-shrink-0">
                <Logo size="sm" variant="full" />
              </div>

              {/* Titre central */}
              <div className="text-center flex-1">
                <h1 className="text-4xl font-extrabold text-[#2C3E50] tracking-wider mb-1">DEVIS</h1>
                <p className="text-sm font-medium text-[#FF6B00]">⚡ Intervention express</p>
              </div>

              {/* Références droite */}
              <div className="text-right text-sm space-y-1 min-w-48">
                <p><span className="font-semibold text-[#2C3E50]">N° :</span> {numeroRef}</p>
                <p><span className="font-semibold text-[#2C3E50]">Date d'émission :</span> {dateDevis}</p>
                <p><span className="font-semibold text-[#2C3E50]">Valable jusqu'au :</span> {dateValidite}</p>
              </div>
            </div>
          </div>

          {/* ═══ 2. IDENTITÉS : Artisan (gauche) + Client (droite) ═══ */}
          <div className="grid grid-cols-2 gap-8 mb-8 no-break section-mb">

            {/* Artisan */}
            <div className="bg-[#F8F9FA] rounded-lg p-4 border-l-4 border-[#2C3E50]">
              <h3 className="text-xs font-bold text-[#6C757D] uppercase tracking-wider mb-3">
                Prestataire
              </h3>
              <p className="font-bold text-[#2C3E50] text-base">
                {artisan?.raisonSociale ?? 'Artisan'}
              </p>
              {artisan?.formeJuridique && (
                <p className="text-sm text-gray-600">{artisan.formeJuridique}</p>
              )}
              {artisan?.siret && (
                <p className="text-sm text-gray-600 mt-1">
                  SIRET : <span className="font-medium">{artisan.siret}</span>
                </p>
              )}
              {artisanAdresse && (
                <p className="text-sm text-gray-600 mt-1">📍 {artisanAdresse}</p>
              )}
              {artisan?.telephone && (
                <p className="text-sm text-gray-600">📞 {artisan.telephone}</p>
              )}
              {artisan?.email && (
                <p className="text-sm text-gray-600">📧 {artisan.email}</p>
              )}
            </div>

            {/* Client */}
            <div className="bg-[#F8F9FA] rounded-lg p-4 border-l-4 border-[#FF6B00]">
              <h3 className="text-xs font-bold text-[#6C757D] uppercase tracking-wider mb-3">
                Client
              </h3>
              <p className="font-bold text-[#2C3E50] text-base">{clientNom}</p>
              {client?.email && (
                <p className="text-sm text-gray-600">
                  📧 {masquerEmailPartiel(client.email)}
                </p>
              )}
              {client?.telephone && (
                <p className="text-sm text-gray-600">
                  📞 {client.telephone.slice(0, 4)}···{client.telephone.slice(-2)}
                </p>
              )}
              {/* Adresse du chantier */}
              <div className="mt-2">
                <p className="text-xs font-semibold text-gray-500 mb-0.5">Adresse du chantier :</p>
                <p className="text-sm text-gray-700">📍 {adresseChantier || ville}</p>
              </div>
            </div>
          </div>

          {/* ═══ 3. OBJET DE L'INTERVENTION ═══ */}
          <div className="mb-8 bg-orange-50 rounded-lg p-4 border border-[#FF6B00] no-break section-mb">
            <h3 className="text-sm font-bold text-[#2C3E50] mb-2 uppercase tracking-wide">
              Objet de l'intervention
            </h3>
            <p className="text-sm font-semibold text-[#FF6B00]">
              {categorieLabel}{sousCategorieLabel ? ` — ${sousCategorieLabel}` : ''}
            </p>
            {proposition.description && (
              <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{proposition.description}</p>
            )}
          </div>

          {/* ═══ 4. TABLEAU DES PRESTATIONS ═══ */}
          <div className="mb-8 section-mb">
            <h3 className="font-bold text-[#2C3E50] mb-4 text-sm uppercase tracking-wide">
              Détail des prestations
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-[#2C3E50] text-white">
                    <th className="border border-gray-300 px-4 py-2.5 text-left w-[38%]">Désignation</th>
                    <th className="border border-gray-300 px-4 py-2.5 text-center w-[13%]">Qté</th>
                    <th className="border border-gray-300 px-4 py-2.5 text-center w-[10%]">Unité</th>
                    <th className="border border-gray-300 px-4 py-2.5 text-right w-[14%]">PU HT</th>
                    <th className="border border-gray-300 px-4 py-2.5 text-center w-[10%]">TVA</th>
                    <th className="border border-gray-300 px-4 py-2.5 text-right w-[15%]">Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Main d'œuvre */}
                  {devis.mainOeuvre && devis.mainOeuvre.prixHT > 0 && (
                    <tr className="bg-orange-50">
                      <td className="border border-gray-300 px-4 py-2 font-semibold text-[#FF6B00]">
                        Main d'œuvre
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-center">
                        {devis.mainOeuvre.quantite}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-center text-gray-600">
                        {devis.mainOeuvre.unite || 'h'}
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

                  {/* Matières premières / fournitures */}
                  {devis.matierePremiere && devis.matierePremiere.prixHT > 0 && (
                    <tr className="bg-gray-50">
                      <td className="border border-gray-300 px-4 py-2 font-semibold text-[#2C3E50]">
                        Fournitures / matières premières
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-center">
                        {devis.matierePremiere.quantite}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-center text-gray-600">
                        {devis.matierePremiere.unite || 'forfait'}
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
                      <tr key={ligne.id ?? i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-300 px-4 py-2">{ligne.description}</td>
                        <td className="border border-gray-300 px-4 py-2 text-center">{ligne.quantite}</td>
                        <td className="border border-gray-300 px-4 py-2 text-center text-gray-600">{ligne.unite}</td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {ligne.prixUnitaireHT.toFixed(2)} €
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">{ligne.tauxTVA}%</td>
                        <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                          {ligne.totalHT.toFixed(2)} €
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ 5. TOTAUX ═══ */}
          <div className="flex justify-end mb-8 no-break section-mb">
            <div className="w-80 border border-gray-300 rounded-lg overflow-hidden">
              <div className="flex justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-sm">
                <span className="text-gray-600">Total HT :</span>
                <span className="font-semibold">{devis.totaux.totalHT.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-sm">
                <span className="text-gray-600">TVA :</span>
                <span className="font-semibold">{devis.totaux.totalTVAGlobal.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between px-4 py-3 bg-[#FF6B00] text-white text-lg font-bold">
                <span>Total TTC :</span>
                <span>{devis.totaux.totalTTC.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          {/* ═══ 6. DÉLAIS D'EXÉCUTION ═══ */}
          {(devis.delaiRealisation || devis.dateDebutPrevue) && (
            <div className="mb-8 bg-blue-50 rounded-lg p-4 border border-blue-200 no-break section-mb">
              <h3 className="text-sm font-bold text-[#2C3E50] mb-3 uppercase tracking-wide">
                ⚡ Délais d'exécution
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {devis.delaiRealisation && (
                  <div>
                    <span className="font-semibold text-gray-700">Délai d'intervention :</span>
                    <p className="text-gray-600 mt-0.5">{devis.delaiRealisation}</p>
                  </div>
                )}
                {devis.dateDebutPrevue && (
                  <div>
                    <span className="font-semibold text-gray-700">Date de début prévue :</span>
                    <p className="text-gray-600 mt-0.5">{devis.dateDebutPrevue}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ 7. CONDITIONS PARTICULIÈRES ═══ */}
          {devis.conditions && (
            <div className="mb-8 no-break section-mb">
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                <p className="font-semibold text-[#2C3E50] mb-1">Conditions particulières :</p>
                <p className="text-gray-700 whitespace-pre-wrap">{devis.conditions}</p>
              </div>
            </div>
          )}

          {/* ═══ 8. SIGNATURES ═══ */}
          <div className="mt-10 pt-6 border-t-2 border-gray-300 no-break">
            <div className="flex justify-between items-start gap-8">

              {/* ── Signature CLIENT (gauche) ── */}
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-700 mb-2">Signature du client :</p>
                {devis.signatureClient?.dataURL ? (
                  <>
                    <p className="text-xs font-bold text-gray-800 mb-1">Bon pour accord</p>
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
                        ✅ Signé le {tsToDate(devis.signatureClient.date).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="border-2 border-dashed border-gray-300 rounded p-4 w-full h-28 flex flex-col items-center justify-center bg-gray-50 gap-1">
                    <p className="text-xs font-bold text-gray-600">Bon pour accord</p>
                    <p className="text-xs text-gray-400 text-center">Signature + date du client</p>
                  </div>
                )}
              </div>

              {/* ── Signature ARTISAN (droite) ── */}
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-700 mb-2">
                  Signature de l'artisan / cachet :
                </p>
                {devis.signatureArtisan?.dataURL ? (
                  <>
                    <p className="text-xs font-bold text-gray-800 mb-1">Bon pour accord</p>
                    <div className="border-2 border-[#FF6B00] rounded p-2 inline-block bg-white">
                      <img
                        src={devis.signatureArtisan.dataURL}
                        alt="Signature artisan"
                        className="h-16 w-auto"
                      />
                    </div>
                    <p className="text-xs text-gray-600 mt-1 font-medium">
                      {artisan?.raisonSociale ?? ''}
                    </p>
                    {devis.signatureArtisan.date && (
                      <p className="text-xs text-gray-500">
                        ✅ Signé le {tsToDate(devis.signatureArtisan.date).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="border-2 border-dashed border-[#FF6B00] rounded p-4 w-full h-28 flex flex-col items-center justify-center bg-orange-50 gap-1">
                    <p className="text-xs font-bold text-gray-600">Bon pour accord</p>
                    <p className="text-xs text-gray-500 text-center">Signature / cachet de l'artisan</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══ 9. PIED DE PAGE ═══ */}
          <div className="mt-10 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
            <p>
              Devis généré via <strong>ArtisanDispo</strong> — Plateforme de mise en relation artisans / clients
              &nbsp;·&nbsp; Réf. {numeroRef} &nbsp;·&nbsp; Émis le {dateDevis}
            </p>
          </div>

        </div>
      </div>
    </>
  );
}
