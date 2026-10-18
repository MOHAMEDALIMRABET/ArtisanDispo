'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';

export default function PaiementSecurisePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero Section */}
      <div className=" bg-navy-800 text-white py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-block bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full mb-6">
              <span className="text-amber-500 text-4xl">🔒</span>
            </div>
            <h1 className="text-5xl font-bold mb-6">Paiement 100% sécurisé</h1>
            <p className="text-xl text-slate-200">
              Votre argent protégé jusqu'à la validation complète des travaux
            </p>
          </div>
        </div>
      </div>

      {/* Résumé 3 points clés */}
      <div className="container mx-auto px-4 -mt-10 relative z-10">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-lg p-6 text-center border-t-4 border-green-600">
            <div className="text-3xl mb-3">💰</div>
            <h3 className="font-bold text-navy-800 mb-2">Paiement bloqué</h3>
            <p className="text-sm text-slate-500">L'argent est conservé sur un compte séquestre sécurisé</p>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6 text-center border-t-4 border-brand-500">
            <div className="text-3xl mb-3">✅</div>
            <h3 className="font-bold text-navy-800 mb-2">Vous validez</h3>
            <p className="text-sm text-slate-500">Déblocage uniquement après votre validation des travaux</p>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6 text-center border-t-4 border-sky-600">
            <div className="text-3xl mb-3">⏱️</div>
            <h3 className="font-bold text-navy-800 mb-2">Automatique</h3>
            <p className="text-sm text-slate-500">Validation automatique après 7 jours si aucun litige</p>
          </div>
        </div>
      </div>

      {/* Schéma du processus */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-navy-800 mb-12">
            Comment fonctionne le paiement sécurisé ?
          </h2>

          <div className="relative">
            {/* Timeline */}
            <div className="space-y-8">
              {/* Étape 1 */}
              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-brand-700 text-white rounded-full flex items-center justify-center font-bold text-lg">
                    1
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex-1">
                  <h3 className="text-xl font-bold text-navy-800 mb-2">Signature du devis</h3>
                  <p className="text-slate-500 mb-3">
                    Vous signez électroniquement le devis de l'artisan après négociation.
                  </p>
                  <div className="bg-brand-50 border-l-4 border-brand-500 p-3 rounded">
                    <p className="text-sm text-navy-800">
                      📋 Le devis devient un <strong>contrat juridiquement valable</strong>
                    </p>
                  </div>
                </div>
              </div>

              {/* Étape 2 */}
              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-brand-700 text-white rounded-full flex items-center justify-center font-bold text-lg">
                    2
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex-1">
                  <h3 className="text-xl font-bold text-navy-800 mb-2">Paiement sécurisé</h3>
                  <p className="text-slate-500 mb-3">
                    Vous payez le montant du devis via Stripe (carte bancaire ou virement).
                  </p>
                  <div className="bg-green-50 border-l-4 border-green-600 p-3 rounded">
                    <p className="text-sm text-navy-800">
                      🔒 L'argent est <strong>immédiatement bloqué</strong> sur un compte séquestre Stripe
                    </p>
                  </div>
                </div>
              </div>

              {/* Étape 3 */}
              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-brand-700 text-white rounded-full flex items-center justify-center font-bold text-lg">
                    3
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex-1">
                  <h3 className="text-xl font-bold text-navy-800 mb-2">Réalisation des travaux</h3>
                  <p className="text-slate-500 mb-3">
                    L'artisan réalise les travaux selon les modalités du devis signé.
                  </p>
                  <div className="bg-blue-50 border-l-4 border-sky-600 p-3 rounded">
                    <p className="text-sm text-navy-800">
                      ⚙️ L'artisan sait que le paiement est garanti, il travaille sereinement
                    </p>
                  </div>
                </div>
              </div>

              {/* Étape 4 */}
              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-brand-700 text-white rounded-full flex items-center justify-center font-bold text-lg">
                    4
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex-1">
                  <h3 className="text-xl font-bold text-navy-800 mb-2">Validation des travaux</h3>
                  <p className="text-slate-500 mb-3">
                    L'artisan déclare les travaux terminés. Vous avez <strong>7 jours</strong> pour valider ou signaler un problème.
                  </p>
                  <div className="grid md:grid-cols-2 gap-4 mt-4">
                    <div className="bg-green-50 border border-green-600 p-3 rounded">
                      <p className="text-sm font-semibold text-green-700 mb-1">✅ Validation manuelle</p>
                      <p className="text-xs text-slate-500">Vous validez → Déblocage immédiat</p>
                    </div>
                    <div className="bg-red-50 border border-red-600 p-3 rounded">
                      <p className="text-sm font-semibold text-red-700 mb-1">⚠️ Signalement litige</p>
                      <p className="text-xs text-slate-500">Problème → Médiation ArtisanDispo</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Étape 5 */}
              <div className="flex gap-6 items-start">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-green-700 text-white rounded-full flex items-center justify-center font-bold text-lg">
                    5
                  </div>
                </div>
                <div className=" bg-green-700 rounded-xl shadow-lg p-6 flex-1 text-white">
                  <h3 className="text-xl font-bold mb-2">Déblocage du paiement</h3>
                  <p className="mb-3 text-green-50">
                    L'argent est transféré à l'artisan uniquement après validation (manuelle ou automatique après 7 jours).
                  </p>
                  <div className="bg-white/20 backdrop-blur-sm p-3 rounded">
                    <p className="text-sm">
                      💸 <strong>Aucun frais supplémentaire</strong> pour vous. Commission prélevée uniquement sur l'artisan.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="bg-white py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-center text-navy-800 mb-12">
              Questions fréquentes
            </h2>

            <div className="space-y-6">
              <details className="bg-slate-50 rounded-lg p-6 cursor-pointer group">
                <summary className="font-semibold text-navy-800 text-lg list-none flex items-center justify-between">
                  Que se passe-t-il si je ne valide pas après 7 jours ?
                  <span className="text-2xl text-brand-700 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="text-slate-500 mt-4 pl-4 border-l-4 border-brand-500">
                  Si vous ne validez pas et ne signalez aucun problème dans les 7 jours, le système considère automatiquement 
                  que les travaux sont conformes et <strong>débloque le paiement à l'artisan</strong>. Cela évite les blocages 
                  injustifiés et protège les deux parties.
                </p>
              </details>

              <details className="bg-slate-50 rounded-lg p-6 cursor-pointer group">
                <summary className="font-semibold text-navy-800 text-lg list-none flex items-center justify-between">
                  Puis-je récupérer mon argent si les travaux ne sont pas conformes ?
                  <span className="text-2xl text-brand-700 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <div className="text-slate-500 mt-4 pl-4 border-l-4 border-brand-500">
                  Oui ! Si vous signalez un problème pendant les 7 jours, le paiement reste bloqué et notre 
                  <strong> équipe de médiation</strong> intervient. Selon la situation, nous pouvons :
                  <ul className="list-disc ml-6 mt-2 space-y-1">
                    <li>Demander à l'artisan de corriger les défauts</li>
                    <li>Effectuer un remboursement partiel</li>
                    <li>Effectuer un remboursement total si les travaux sont gravement non conformes</li>
                  </ul>
                </div>
              </details>

              <details className="bg-slate-50 rounded-lg p-6 cursor-pointer group">
                <summary className="font-semibold text-navy-800 text-lg list-none flex items-center justify-between">
                  Quels moyens de paiement sont acceptés ?
                  <span className="text-2xl text-brand-700 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <div className="text-slate-500 mt-4 pl-4 border-l-4 border-brand-500">
                  Nous acceptons tous les moyens de paiement sécurisés via <strong>Stripe</strong> :
                  <ul className="list-disc ml-6 mt-2 space-y-1">
                    <li>Carte bancaire (Visa, Mastercard, American Express)</li>
                    <li>Virement bancaire SEPA</li>
                    <li>Paiement en 3 ou 4 fois sans frais (selon montant)</li>
                  </ul>
                </div>
              </details>

              <details className="bg-slate-50 rounded-lg p-6 cursor-pointer group">
                <summary className="font-semibold text-navy-800 text-lg list-none flex items-center justify-between">
                  Y a-t-il des frais supplémentaires pour moi ?
                  <span className="text-2xl text-brand-700 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="text-slate-500 mt-4 pl-4 border-l-4 border-brand-500">
                  <strong>Non, aucun frais</strong> pour les particuliers ! Vous payez exactement le montant du devis signé. 
                  Notre commission (10%) est prélevée uniquement sur l'artisan lors du déblocage du paiement.
                </p>
              </details>

              <details className="bg-slate-50 rounded-lg p-6 cursor-pointer group">
                <summary className="font-semibold text-navy-800 text-lg list-none flex items-center justify-between">
                  Mes données bancaires sont-elles sécurisées ?
                  <span className="text-2xl text-brand-700 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="text-slate-500 mt-4 pl-4 border-l-4 border-brand-500">
                  Absolument ! Nous utilisons <strong>Stripe</strong>, leader mondial du paiement sécurisé, certifié 
                  <strong> PCI DSS Niveau 1</strong> (le plus haut niveau de sécurité). Vos données bancaires ne transitent 
                  jamais par nos serveurs et sont chiffrées de bout en bout.
                </p>
              </details>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Retour / Recherche */}
      <div className=" bg-brand-600 py-12">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Prêt à trouver votre artisan ?</h2>
          <p className="text-white/90 mb-6 text-lg">
            Tous nos paiements sont sécurisés et votre satisfaction garantie
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/">
              <Button className="!bg-white !text-brand-700 hover:!bg-slate-100 px-8 py-3 text-lg font-semibold">
                Trouver un artisan
              </Button>
            </Link>
            <Link href="/confiance/verification-artisans">
              <Button className="bg-navy-800 text-white hover:bg-navy-900 px-8 py-3 text-lg font-semibold">
                Voir les autres garanties →
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
