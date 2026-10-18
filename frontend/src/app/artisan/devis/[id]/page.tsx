'use client';

/**
 * Page de visualisation d'un devis
 * Affiche le détail complet d'un devis avec possibilité d'édition
 */

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { 
  dupliquerDevis
} from '@/lib/firebase/devis-service';
import { Logo } from '@/components/ui';
import { useLanguage } from '@/contexts/LanguageContext';
import type { Devis } from '@/types/devis';
import type { Demande } from '@/types/firestore';
import Head from 'next/head';

/**
 * Masque un numéro de téléphone en ne montrant que les 2 premiers chiffres
 * Ex: "0612345678" → "06 ** ** ** **"
 */
function masquerTelephone(telephone: string): string {
  if (!telephone) return '';
  
  // Nettoyer le numéro (enlever espaces, points, tirets)
  const clean = telephone.replace(/[\s.\-]/g, '');
  
  // Format français standard 10 chiffres
  if (clean.length === 10) {
    return `${clean.substring(0, 2)} ** ** ** **`;
  }
  
  // Format international +33
  if (clean.startsWith('+33') && clean.length === 12) {
    return `+33 ${clean.substring(3, 4)} ** ** ** **`;
  }
  
  // Format par défaut : afficher 2 premiers et masquer le reste
  return `${clean.substring(0, 2)}${'*'.repeat(Math.max(0, clean.length - 2))}`;
}

export default function VoirDevisPage() {
  const router = useRouter();
  const params = useParams();
  const devisId = params?.id as string;
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [devis, setDevis] = useState<Devis | null>(null);
  const [demande, setDemande] = useState<Demande | null>(null);
  const [loading, setLoading] = useState(true);
  const [duplicationEnCours, setDuplicationEnCours] = useState(false);

  const loadDevis = async () => {
    if (!devisId) return;

    try {
      const docRef = doc(db, 'devis', devisId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const devisData = {
          id: docSnap.id,
          ...docSnap.data(),
        } as Devis;
        setDevis(devisData);

        // Charger la demande associée si elle existe
        if (devisData.demandeId) {
          try {
            const demandeRef = doc(db, 'demandes', devisData.demandeId);
            const demandeSnap = await getDoc(demandeRef);
            if (demandeSnap.exists()) {
              setDemande({
                id: demandeSnap.id,
                ...demandeSnap.data(),
              } as Demande);
            }
          } catch (demandeError) {
            // L'artisan n'a pas (ou plus) accès à la demande (changement de statut)
            // On continue sans bloquer le chargement du devis
            console.warn('⚠️ Impossible de charger la demande associée (permissions):', demandeError);
          }
        }
      } else {
        alert(t('alerts.devis.notFound'));
        router.push('/artisan/devis');
      }
    } catch (error) {
      console.error('Erreur chargement devis:', error);
      alert(t('alerts.devis.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !devisId) return;
    loadDevis();
  }, [user, devisId]);

  // Modifier le titre de la page pour l'impression
  useEffect(() => {
    if (devis) {
      document.title = `Devis ${devis.numeroDevis}`;
    }
    return () => {
      document.title = 'ArtisanDispo - Trouvez des artisans qualifiés';
    };
  }, [devis]);

  const handleDupliquerDevis = async () => {
    if (!devis) return;

    if (!confirm('Voulez-vous créer un nouveau devis basé sur ce devis refusé ?')) {
      return;
    }

    try {
      setDuplicationEnCours(true);
      const nouveauDevisId = await dupliquerDevis(devis.id);
      alert(t('alerts.devis.createSuccess'));
      router.push(`/artisan/devis/nouveau?demandeId=${devis.demandeId}&editId=${nouveauDevisId}`);
    } catch (error) {
      console.error('Erreur duplication devis:', error);
      alert(t('alerts.devis.createError'));
    } finally {
      setDuplicationEnCours(false);
    }
  };

  // Fonctions de masquage des coordonnées (similaires au client)
  const masquerEmail = (email: string, shouldMask: boolean = true): string => {
    if (!email || !shouldMask) return email;
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const maskedLocal = local.length > 2 ? `${local[0]}${'•'.repeat(local.length - 1)}` : local;
    return `${maskedLocal}@${domain}`;
  };

  const masquerTelephoneComplet = (telephone: string, shouldMask: boolean = true): string => {
    if (!telephone || !shouldMask) return telephone;
    const chiffres = telephone.replace(/\D/g, '');
    if (chiffres.length >= 4) {
      return `${chiffres.slice(0, 2)}••••${chiffres.slice(-2)}`;
    }
    return telephone;
  };

  const masquerAdresse = (adresse: string, shouldMask: boolean = true): string => {
    if (!adresse || !shouldMask) return adresse;
    return '•'.repeat(Math.min(adresse.length, 20));
  };

  const getStatutBadge = (statut: string) => {
    const styles: { [key: string]: string } = {
      genere: 'bg-slate-100 text-slate-800',
      envoye: 'bg-purple-100 text-purple-700',
      en_attente_paiement: 'bg-yellow-100 text-yellow-800',
      paye: 'bg-green-100 text-green-800',
      en_cours: 'bg-amber-100 text-amber-800',
      travaux_termines: 'bg-orange-100 text-orange-800',
      termine_valide: 'bg-emerald-100 text-emerald-800',
      termine_auto_valide: 'bg-emerald-100 text-emerald-800',
      litige: 'bg-red-100 text-red-800',
      accepte: 'bg-green-100 text-green-800',
      refuse: 'bg-red-100 text-red-800',
      expire: 'bg-orange-100 text-orange-800',
    };

    const labels: { [key: string]: string } = {
      genere: '📝 Généré',
      envoye: '📤 Envoyé',
      en_attente_paiement: '⏳ En attente de paiement',
      paye: '💰 Payé - Devis signé',
      en_cours: '🔨 Travaux en cours',
      travaux_termines: '✅ Travaux terminés',
      termine_valide: '🎉 Travaux validés par le client',
      termine_auto_valide: '🎉 Validé automatiquement',
      litige: '⚠️ Litige en cours',
      accepte: '✅ Accepté',
      refuse: '❌ Refusé',
      expire: '⏰ Expiré',
    };

    return (
      <span className={`px-4 py-2 rounded-full text-sm font-semibold ${styles[statut] || 'bg-slate-100 text-slate-800'}`}>
        {labels[statut] || statut}
      </span>
    );
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto"></div>
          <p className="mt-4 text-slate-500">Chargement du devis...</p>
        </div>
      </div>
    );
  }

  if (!user || !devis) {
    return null;
  }

  return (
    <>
      {/* Styles d'impression optimisés pour tenir sur 1 page */}
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

          /* N'imprimer que la zone du devis */
          body * {
            visibility: hidden;
          }

          .print-area,
          .print-area * {
            visibility: visible;
          }

          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }

          /* IMPORTANT: Masquer les sections no-print MÊME dans print-area (doit être APRÈS .print-area *) */
          .print-area .no-print,
          .print-area .print\\:hidden,
          .no-print,
          .print\\:hidden {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            height: 0 !important;
            overflow: hidden !important;
          }
          
          /* Réduire espacements */
          .print-container {
            padding: 0.5rem !important;
            margin: 0 !important;
          }
          
          .print-container > div {
            margin-bottom: 0.5rem !important;
          }
          
          /* Réduire marges des sections */
          .mb-6 {
            margin-bottom: 0.5rem !important;
          }
          
          .mb-8 {
            margin-bottom: 0.75rem !important;
          }
          
          .pb-6 {
            padding-bottom: 0.5rem !important;
          }
          
          .pt-6 {
            padding-top: 0.5rem !important;
          }
          
          /* Tableaux plus compacts */
          table {
            font-size: 10px !important;
          }
          
          table th,
          table td {
            padding: 0.25rem 0.5rem !important;
          }
          
          /* Logo plus petit - UN SEUL en haut */
          .logo-container img {
            max-height: 40px !important;
          }
          
          /* Titres plus compacts */
          h2 {
            font-size: 1.5rem !important;
            margin-bottom: 0.25rem !important;
          }
          
          h3 {
            font-size: 1rem !important;
            margin-bottom: 0.5rem !important;
          }
          
          /* Signature compacte */
          .signature-section img {
            max-height: 50px !important;
          }
          
          /* Éviter coupure de page dans sections importantes */
          .no-break {
            page-break-inside: avoid;
          }

          /* Forcer Artisan/Client côte à côte à l'impression */
          .print-two-cols {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            column-gap: 2rem !important;
          }
        }
      `}</style>
      
      <div className="min-h-screen bg-slate-50 print:bg-white print-area">
        {/* Header */}
        <div className="bg-navy-800 text-white py-6 print:hidden">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => router.push('/artisan/devis')}
              className="flex items-center gap-2 text-white hover:text-brand-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Retour à mes devis
            </button>
            {devis.demandeId && (
              <>
                <span className="text-slate-400">|</span>
                <button
                  onClick={() => router.push(`/artisan/demandes?demandeId=${devis.demandeId}`)}
                  className="flex items-center gap-2 text-white hover:text-brand-300"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Voir la demande associée
                </button>
              </>
            )}
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold">Devis {devis.numeroDevis}</h1>
              <p className="text-slate-300 mt-1 whitespace-normal break-all leading-snug">{devis.titre}</p>
            </div>
            {getStatutBadge(devis.statut)}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 print:py-0">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-4xl mx-auto print:shadow-none print-container">
          {/* En-tête du devis */}
          <div className="border-b-2 border-brand-500 pb-6 mb-6 no-break">
            <div className="flex justify-between items-start">
              {/* Logo à gauche */}
              <div className="flex-shrink-0 logo-container">
                <Logo size="sm" variant="full" />
              </div>

              {/* Titre DEVIS au centre */}
              <div className="flex-1 text-center">
                <h2 className="text-3xl font-bold text-navy-800 mb-2">DEVIS</h2>
                <p className="text-slate-600">N° {devis.numeroDevis}</p>
                <p className="text-sm text-slate-500">
                  Date : {devis.dateCreation?.toDate().toLocaleDateString('fr-FR')}
                </p>
              </div>
            </div>
          </div>

          {/* Informations artisan et client */}
          <div className="grid md:grid-cols-2 gap-8 mb-8 print-two-cols">
            {/* Artisan */}
            <div>
              <h3 className="font-bold text-navy-800 mb-3">Artisan</h3>
              {devis.artisan.raisonSociale && (
                <p className="font-semibold">{devis.artisan.raisonSociale}</p>
              )}
              {devis.artisan.siret && <p className="text-sm text-slate-600">SIRET: {devis.artisan.siret}</p>}
              {devis.artisan.adresse && (
                <p className="text-sm text-slate-600 mt-1">
                  📍 {typeof devis.artisan.adresse === 'string'
                    ? devis.artisan.adresse
                    : [(devis.artisan.adresse as any).rue, (devis.artisan.adresse as any).codePostal, (devis.artisan.adresse as any).ville].filter(Boolean).join(', ')}
                </p>
              )}
              {devis.artisan.telephone && (
                <p className="text-sm">
                  📞 {devis.artisan.telephone}
                </p>
              )}
              {devis.artisan.email && (
                <p className="text-sm">
                  📧 {devis.artisan.email}
                </p>
              )}
            </div>

            {/* Client */}
            <div>
              <h3 className="font-bold text-navy-800 mb-3">Client</h3>
              <p className="font-semibold">{devis.client.prenom} {devis.client.nom}</p>
              {devis.client.email && (
                <p className="text-sm">
                  📧 {masquerEmail(
                    devis.client.email,
                    !['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(devis.statut)
                  )}
                </p>
              )}
              {devis.client.telephone && (
                <p className="text-sm">
                  📞 {masquerTelephoneComplet(
                    devis.client.telephone,
                    !['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(devis.statut)
                  )}
                </p>
              )}
              {devis.client.adresse && (
                <p className="text-sm text-slate-600 mt-1">
                  {devis.client.adresse.rue}<br />
                  {devis.client.adresse.codePostal} {devis.client.adresse.ville}
                </p>
              )}
            </div>
          </div>

          {/* Titre du devis */}
          <div className="mb-6">
            <h3 className="text-xl font-bold text-navy-800 mb-2 whitespace-normal break-all leading-snug">{devis.titre}</h3>
          </div>

          {/* Date de début prévue */}
          {devis.dateDebutPrevue && (
            <div className="mb-8 bg-slate-50 border-l-4 border-navy-800 p-4 rounded">
              <p className="text-navy-800 font-semibold">
                📅 Date de début des travaux prévue : {devis.dateDebutPrevue.toDate().toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
          )}

          {/* Date de fin des travaux prévue */}
          {devis.dateDebutPrevue && devis.delaiRealisation && (
            <div className="mb-8 bg-slate-50 border-l-4 border-brand-500 p-4 rounded">
              <p className="text-navy-800 font-semibold">
                📅 Date de fin des travaux prévue : {(() => {
                  const debut = devis.dateDebutPrevue.toDate();
                  debut.setDate(debut.getDate() + Number(devis.delaiRealisation));
                  return debut.toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  });
                })()}
              </p>
            </div>
          )}

          {/* Motif de refus ou demande de révision */}
          {devis.statut === 'refuse' && devis.motifRefus && (
            <div className={`mb-8 p-4 border-l-4 rounded ${
              devis.typeRefus === 'revision' 
                ? 'bg-yellow-50 border-yellow-400' 
                : 'bg-red-50 border-red-500'
            }`}>
              <div className="flex items-start gap-3">
                <svg className={`w-6 h-6 flex-shrink-0 mt-0.5 ${
                  devis.typeRefus === 'revision' ? 'text-yellow-600' : 'text-red-600'
                }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h3 className={`font-bold mb-2 ${
                    devis.typeRefus === 'revision' ? 'text-yellow-900' : 'text-red-900'
                  }`}>
                    {devis.typeRefus === 'revision' ? '🔄 Le client demande une révision :' : '❌ Motif du refus :'}
                  </h3>
                  <p className={`text-sm whitespace-pre-wrap ${
                    devis.typeRefus === 'revision' ? 'text-yellow-800' : 'text-red-800'
                  }`}>
                    "{devis.motifRefus}"
                  </p>
                  {devis.dateRefus && (
                    <p className={`text-xs mt-2 ${
                      devis.typeRefus === 'revision' ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {devis.typeRefus === 'revision' ? 'Demande formulée' : 'Refusé'} le {devis.dateRefus.toDate().toLocaleDateString('fr-FR')} à {devis.dateRefus.toDate().toLocaleTimeString('fr-FR')}
                    </p>
                  )}
                  {devis.typeRefus === 'revision' && devis.demandeId && (
                    <button
                      onClick={() => router.push(`/artisan/devis/nouveau?demandeId=${devis.demandeId}`)}
                      className="mt-3 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-semibold flex items-center gap-2"
                    >
                      📝 Créer un nouveau devis (variante)
                    </button>
                  )}
                  {devis.typeRefus === 'definitif' && (
                    <div className="mt-3 p-3 bg-slate-100 border-l-4 border-slate-400 rounded">
                      <p className="text-xs font-semibold text-slate-700 mb-1">⛔ Refus définitif</p>
                      <p className="text-xs text-slate-600">
                        Le client ne souhaite pas recevoir d'autres propositions pour cette demande. 
                        Cette décision est finale et doit être respectée.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Détail des prestations */}
          <div className="mb-8">
            <h3 className="font-bold text-navy-800 mb-4">Détail des prestations</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse table-fixed">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border border-slate-300 px-4 py-2 text-left w-[40%]">Désignation</th>
                    <th className="border border-slate-300 px-4 py-2 text-center w-[12%]">Quantité</th>
                    <th className="border border-slate-300 px-4 py-2 text-right w-[15%]">Prix unitaire HT</th>
                    <th className="border border-slate-300 px-4 py-2 text-center w-[13%]">TVA</th>
                    <th className="border border-slate-300 px-4 py-2 text-right w-[20%]">Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Main d'œuvre (champ obligatoire) */}
                  {devis.mainOeuvre && (
                    <tr className="bg-orange-50">
                      <td className="border border-slate-300 px-4 py-2 break-words">
                        <span className="font-semibold text-brand-700">⚡ Main d'œuvre</span>
                      </td>
                      <td className="border border-slate-300 px-4 py-2 text-center whitespace-nowrap">
                        {devis.mainOeuvre.quantite} {devis.mainOeuvre.unite || 'jours'}
                      </td>
                      <td className="border border-slate-300 px-4 py-2 text-right whitespace-nowrap">
                        {devis.mainOeuvre.prixHT.toFixed(2)} €
                      </td>
                      <td className="border border-slate-300 px-4 py-2 text-center whitespace-nowrap">
                        {devis.mainOeuvre.tauxTVA}%
                      </td>
                      <td className="border border-slate-300 px-4 py-2 text-right font-semibold whitespace-nowrap">
                        {(devis.mainOeuvre.quantite * devis.mainOeuvre.prixHT).toFixed(2)} €
                      </td>
                    </tr>
                  )}

                  {/* Matière première (champ optionnel) */}
                  {devis.matierePremiere && (
                    <tr className="bg-slate-50">
                      <td className="border border-slate-300 px-4 py-2 break-words">
                        <span className="font-semibold text-navy-800">🛠️ Matière première</span>
                      </td>
                      <td className="border border-slate-300 px-4 py-2 text-center whitespace-nowrap">
                        {devis.matierePremiere.quantite} {devis.matierePremiere.unite || 'forfait'}
                      </td>
                      <td className="border border-slate-300 px-4 py-2 text-right whitespace-nowrap">
                        {devis.matierePremiere.prixHT.toFixed(2)} €
                      </td>
                      <td className="border border-slate-300 px-4 py-2 text-center whitespace-nowrap">
                        {devis.matierePremiere.tauxTVA}%
                      </td>
                      <td className="border border-slate-300 px-4 py-2 text-right font-semibold whitespace-nowrap">
                        {(devis.matierePremiere.quantite * devis.matierePremiere.prixHT).toFixed(2)} €
                      </td>
                    </tr>
                  )}

                  {/* Lignes supplémentaires */}
                  {devis.lignes.filter(ligne => ligne.description?.trim() || ligne.prixUnitaireHT > 0).map((ligne, index) => (
                    <tr key={ligne.id || index}>
                      <td className="border border-slate-300 px-4 py-2 break-words">{ligne.description}</td>
                      <td className="border border-slate-300 px-4 py-2 text-center whitespace-nowrap">{ligne.quantite} {ligne.unite}</td>
                      <td className="border border-slate-300 px-4 py-2 text-right whitespace-nowrap">{ligne.prixUnitaireHT.toFixed(2)} €</td>
                      <td className="border border-slate-300 px-4 py-2 text-center whitespace-nowrap">{ligne.tauxTVA}%</td>
                      <td className="border border-slate-300 px-4 py-2 text-right font-semibold whitespace-nowrap">{ligne.totalHT.toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totaux */}
          <div className="flex justify-end mb-8">
            <div className="w-80 bg-slate-50 p-4 rounded-lg">
              <div className="flex justify-between mb-2">
                <span className="text-slate-700">Total HT:</span>
                <span className="font-semibold">{devis.totaux.totalHT.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-slate-700">TVA:</span>
                <span className="font-semibold">{devis.totaux.totalTVAGlobal.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-xl font-bold text-brand-700 pt-2 border-t-2 border-brand-500">
                <span>Total TTC:</span>
                <span>{devis.totaux.totalTTC.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          {/* Informations complémentaires */}
          {devis.conditions && (
            <div className="pt-6 space-y-4">
              <div>
                <h3 className="font-bold text-navy-800 mb-2">Conditions :</h3>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{devis.conditions}</p>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════
              SECTION SIGNATURES — visible dès l'envoi
              Artisan signe avant d'envoyer, client signe au paiement.
          ═══════════════════════════════════════════════ */}
          {!['genere', 'brouillon', 'refuse', 'expire', 'annule', 'remplace'].includes(devis.statut) && (
            <div className={`mt-8 pt-6 border-t-2 signature-section no-break ${
              ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'].includes(devis.statut)
                ? 'border-green-500' : 'border-slate-300'
            }`}>
              <div className="text-center mb-4">
                {['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'].includes(devis.statut) && devis.signatureClient?.url ? (
                  <>
                    <p className="text-sm font-semibold text-green-800">✅ Devis signé et payé</p>
                    {devis.paiement?.date && (
                      <p className="text-xs text-green-700">
                        Paiement effectué le {devis.paiement.date.toDate().toLocaleDateString('fr-FR')}
                        {devis.paiement?.stripe?.paymentIntentId && (
                          <> - Réf : {devis.paiement.stripe.paymentIntentId.substring(0, 20)}...</>
                        )}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    🖊️ Zone de signatures — le client signera lors du paiement
                  </p>
                )}
              </div>

              <div className="flex justify-between items-end gap-4">
                {/* ── GAUCHE : Signature CLIENT ── */}
                <div className="flex-1 text-left">
                  <p className="text-xs font-semibold text-slate-700 mb-2">Signature du client :</p>
                  {devis.signatureClient?.url ? (
                    <>
                      <div className="border-2 border-green-400 rounded p-2 inline-block bg-white">
                        <img
                          src={devis.signatureClient.url}
                          alt="Signature client"
                          className="h-16 w-auto"
                        />
                      </div>
                      <p className="text-xs text-slate-600 mt-1 font-medium">
                        {devis.client.prenom} {devis.client.nom}
                      </p>
                      <p className="text-xs text-slate-500">
                        Signée le {devis.signatureClient.date?.toDate().toLocaleDateString('fr-FR')} à{' '}
                        {devis.signatureClient.date?.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </>
                  ) : (
                    <div className="border-2 border-dashed border-slate-300 rounded p-4 w-48 h-24 flex items-center justify-center bg-slate-50">
                      <p className="text-xs text-slate-400 text-center">En attente<br/>de la signature client</p>
                    </div>
                  )}
                </div>

                {/* ── DROITE : Signature ARTISAN ── */}
                <div className="flex-1 text-right">
                  <p className="text-xs font-semibold text-slate-700 mb-2">Votre signature (artisan) :</p>
                  {devis.signatureArtisan?.url ? (
                    <>
                      <div className="border-2 border-brand-500 rounded-lg bg-white p-2 inline-block">
                        <img
                          src={devis.signatureArtisan.url}
                          alt="Signature artisan"
                          className="h-16 w-auto"
                        />
                      </div>
                      <p className="text-xs text-slate-600 mt-1 font-medium">
                        {devis.artisan.raisonSociale}
                      </p>
                      <p className="text-xs text-slate-500">
                        Signée le {devis.signatureArtisan.date?.toDate().toLocaleDateString('fr-FR')}
                      </p>
                    </>
                  ) : (
                    <div className="border-2 border-dashed border-slate-300 rounded p-4 w-48 h-24 flex items-center justify-center bg-slate-50 ml-auto">
                      <p className="text-xs text-slate-400 text-center">Espace réservé<br/>au cachet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sections interactives - EN DEHORS du print-container */}
      <div className="container mx-auto px-4 pb-8">
        <div className="max-w-4xl mx-auto">
          {/* ========================================= */}
          {/* SECTION GESTION TRAVAUX (selon statut) */}
          {/* ========================================= */}

          {/* Statut: paye - Information uniquement (actions dans /artisan/demandes) */}
          {devis.statut === 'paye' && (
            <div className="bg-green-50 border-2 border-green-500 rounded-lg p-6 mb-6 print:hidden">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">✅</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-green-800">Devis payé - Prêt à démarrer</h3>
                  <p className="text-sm text-green-700">Le client a signé et payé.</p>
                </div>
              </div>
              
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  {devis.demandeId ? (
                    <>💡 Pour déclarer le début des travaux, <a href={`/artisan/demandes?demandeId=${devis.demandeId}`} className="font-semibold underline hover:text-blue-900">accédez à la demande</a></>
                  ) : (
                    <>💡 Pour déclarer le début des travaux, gérez cette action depuis la page "Mes Demandes"</>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Statut: en_cours - Information uniquement (actions dans /artisan/demandes) */}
          {devis.statut === 'en_cours' && (
            <div className="bg-amber-50 border-2 border-amber-500 rounded-lg p-6 mb-6 print:hidden">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">⚙️</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-navy-800">Travaux en cours</h3>
                  <p className="text-sm text-navy-800">
                    Démarré le : {devis.travaux?.dateDebut?.toDate().toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              </div>
              
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-sm text-blue-800 mb-2">
                  {devis.demandeId ? (
                    <>💡 Pour déclarer la fin des travaux, <a href={`/artisan/demandes?demandeId=${devis.demandeId}`} className="font-semibold underline hover:text-blue-900">accédez à la demande</a></>
                  ) : (
                    <>💡 Pour déclarer la fin des travaux, gérez cette action depuis la page "Mes Demandes"</>
                  )}
                </p>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li>• Le client aura <strong>7 jours</strong> pour valider</li>
                  <li>• Si aucune action : <strong>validation automatique</strong></li>
                  <li>• Argent transféré dans votre Chiffre d&apos;affaires dès validation</li>
                </ul>
              </div>
            </div>
          )}

          {/* Statut: travaux_termines - En attente validation */}
          {devis.statut === 'travaux_termines' && (
            <div className="bg-orange-50 border-2 border-orange-500 rounded-lg p-6 mb-6 print:hidden">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">⏳</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-orange-800">En attente de validation client</h3>
                  <p className="text-sm text-orange-700">
                    Vous avez déclaré avoir terminé les travaux le {devis.travaux?.dateFin?.toDate().toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}.
                  </p>
                </div>
              </div>
              
              <div className="bg-white rounded-lg p-4 border border-orange-200">
                <h4 className="font-semibold text-slate-800 mb-2">⏱️ Délai de validation :</h4>
                <p className="text-sm text-slate-700">
                  Le client a <strong>7 jours</strong> pour valider ou signaler un problème.
                  <br />
                  Validation automatique le : {devis.travaux?.dateValidationAuto?.toDate().toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
                
                <div className="mt-3 p-3 bg-green-50 rounded border border-green-200">
                  <p className="text-sm text-green-800">
                    💰 <strong>Paiement</strong> : Vous recevrez <strong>{((devis.totaux?.totalTTC || 0) * 0.92).toFixed(2)}€</strong> après validation
                    <br />
                    <span className="text-xs text-green-700">(Commission plateforme : {((devis.totaux?.totalTTC || 0) * 0.08).toFixed(2)}€)</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Statut: termine_valide ou termine_auto_valide - Paiement libéré */}
          {['termine_valide', 'termine_auto_valide'].includes(devis.statut) && (
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-lg p-6 mb-6 print:hidden">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">🎉</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-emerald-800">
                    {devis.statut === 'termine_valide' ? '✅ Travaux validés par le client' : '✅ Travaux validés automatiquement'}
                  </h3>
                  <p className="text-sm text-emerald-700">
                    Validé le : {devis.travaux?.dateValidationClient?.toDate().toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              </div>
              
              <div className="bg-white rounded-lg p-4 border border-emerald-200">
                <h4 className="font-semibold text-slate-800 mb-2">💰 Paiement en cours</h4>
                <p className="text-sm text-slate-700 mb-3">
                  Montant net artisan : <strong className="text-emerald-700 text-lg">{((devis.totaux?.totalTTC || 0) * 0.92).toFixed(2)}€</strong>
                  <br />
                  <span className="text-xs text-slate-600">(Commission plateforme : {((devis.totaux?.totalTTC || 0) * 0.08).toFixed(2)}€)</span>
                </p>
                
                <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-2">
                  <p className="text-sm text-navy-800 font-semibold">
                    💰 Vos paiements en 2 étapes :
                  </p>
                  <ol className="text-sm text-navy-800 space-y-1.5 pl-4">
                    <li><strong>1️⃣ Immédiat</strong> : L&apos;argent est transféré dans votre <strong>Chiffre d&apos;affaires</strong> (portefeuille ArtisanDispo)</li>
                    <li><strong>2️⃣ Sur demande</strong> : Vous demandez un virement vers votre compte bancaire → Délai <strong>1-3 jours ouvrés</strong> (SEPA)</li>
                  </ol>
                  <p className="text-xs text-blue-700 bg-blue-50 rounded px-3 py-2">
                    💡 Vous pouvez cumuler plusieurs paiements avant de demander un virement groupé
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Statut: litige - Problème signalé */}
          {devis.statut === 'litige' && (
            <div className="bg-red-50 border-2 border-red-500 rounded-lg p-6 mb-6 print:hidden">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">⚠️</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-800">Litige en cours</h3>
                  <p className="text-sm text-red-700">
                    Le client a signalé un problème le {devis.travaux?.litige?.date?.toDate().toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              </div>
              
              <div className="bg-white rounded-lg p-4 border border-red-200">
                <h4 className="font-semibold text-slate-800 mb-2">Motif du litige :</h4>
                <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded border border-slate-200">
                  {devis.travaux?.litige?.motif || 'Non spécifié'}
                </p>
                
                <div className="mt-4 p-3 bg-yellow-50 rounded border border-yellow-200">
                  <p className="text-sm text-yellow-800">
                    ⏳ <strong>En attente de médiation</strong>
                    <br />
                    Un administrateur va examiner le litige et prendre contact avec vous sous 24-48h.
                    <br />
                    Le paiement reste bloqué jusqu'à résolution.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="print:hidden mt-8 flex gap-4 justify-end flex-wrap">
            <button
              onClick={() => router.push('/artisan/devis')}
              className="px-6 py-2 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
            >
              Fermer
            </button>

            {/* Bouton Contacter le client (devis refusé) */}
            {devis.statut === 'refuse' && (
              <button
                onClick={() => router.push(`/messages?userId=${devis.clientId}&devisId=${devis.id}&demandeId=${devis.demandeId || ''}`)}
                className="px-6 py-2 bg-brand-700 text-white rounded-lg hover:bg-brand-800 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                💬 Contacter le client
              </button>
            )}

            {/* Bouton Créer nouveau devis (devis refusé) */}
            {devis.statut === 'refuse' && (
              <button
                onClick={handleDupliquerDevis}
                disabled={duplicationEnCours}
                className="px-6 py-2 bg-brand-700 text-white rounded-lg hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {duplicationEnCours ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Création...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    � Créer un nouveau devis
                  </>
                )}
              </button>
            )}

            {/* Bouton Imprimer (tous les statuts) */}
            <button
              onClick={() => window.print()}
              className="px-6 py-2 bg-navy-800 text-white rounded-lg hover:bg-navy-900 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              🖨️ Imprimer
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
