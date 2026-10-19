'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';

export default function ProtectionMediationPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero Section */}
      <div className="bg-red-700 text-white py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-block bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full mb-6">
              <span className="text-amber-500 text-4xl">🛡️</span>
            </div>
            <h1 className="text-5xl font-bold mb-6">Protection et médiation garanties</h1>
            <p className="text-xl text-red-50">
              Un centre de résolution de litiges à votre service 7j/7
            </p>
          </div>
        </div>
      </div>

      {/* Garanties principales */}
      <div className="container mx-auto px-4 -mt-10 relative z-10">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-lg p-6 text-center border-t-4 border-brand-500">
            <div className="text-3xl mb-3">📞</div>
            <h3 className="font-bold text-navy-800 mb-2">Support 7j/7</h3>
            <p className="text-sm text-slate-500">Équipe dédiée disponible tous les jours</p>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6 text-center border-t-4 border-green-600">
            <div className="text-3xl mb-3">📸</div>
            <h3 className="font-bold text-navy-800 mb-2">Historique complet</h3>
            <p className="text-sm text-slate-500">Photos, messages, documents conservés</p>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6 text-center border-t-4 border-sky-600">
            <div className="text-3xl mb-3">⚖️</div>
            <h3 className="font-bold text-navy-800 mb-2">Médiation gratuite</h3>
            <p className="text-sm text-slate-500">Résolution amiable par nos experts</p>
          </div>
        </div>
      </div>

      {/* Process de médiation */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-navy-800 mb-4">
            Comment fonctionne la médiation ?
          </h2>
          <p className="text-center text-slate-500 mb-12 max-w-2xl mx-auto">
            Un processus structuré en 5 étapes pour résoudre les conflits de manière équitable
          </p>

          <div className="space-y-8">
            {/* Étape 1 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex gap-6 items-start">
              <div className="flex-shrink-0">
                <div className="w-14 h-14 bg-brand-700 text-white rounded-full flex items-center justify-center font-bold text-xl">
                  1
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-navy-800 mb-3">🚨 Signalement du problème</h3>
                <p className="text-slate-500 mb-4">
                  Vous disposez de <strong>7 jours après déclaration de fin des travaux</strong> par l'artisan 
                  pour signaler un problème.
                </p>
                <div className="bg-brand-50 border-l-4 border-brand-500 p-4 rounded">
                  <p className="text-sm text-navy-800 mb-2">
                    <strong>Comment signaler ?</strong>
                  </p>
                  <ul className="text-sm text-slate-500 space-y-1">
                    <li>• Dashboard client → Onglet "Mes contrats"</li>
                    <li>• Bouton "Signaler un problème" sur le contrat concerné</li>
                    <li>• Formulaire détaillé avec upload de photos</li>
                    <li>• Notification immédiate de notre équipe</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Étape 2 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex gap-6 items-start">
              <div className="flex-shrink-0">
                <div className="w-14 h-14 bg-brand-700 text-white rounded-full flex items-center justify-center font-bold text-xl">
                  2
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-navy-800 mb-3">🔒 Blocage du paiement</h3>
                <p className="text-slate-500 mb-4">
                  Dès le signalement, le paiement en séquestre est <strong>immédiatement bloqué</strong>. 
                  L'artisan ne peut pas le recevoir tant que le litige n'est pas résolu.
                </p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-green-50 border border-green-600 p-3 rounded">
                    <p className="text-sm font-semibold text-green-700 mb-1">Protection client</p>
                    <p className="text-xs text-slate-500">Votre argent reste bloqué jusqu'à résolution</p>
                  </div>
                  <div className="bg-blue-50 border border-sky-600 p-3 rounded">
                    <p className="text-sm font-semibold text-sky-700 mb-1">Notification artisan</p>
                    <p className="text-xs text-slate-500">L'artisan reçoit le signalement avec vos griefs</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Étape 3 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex gap-6 items-start">
              <div className="flex-shrink-0">
                <div className="w-14 h-14 bg-brand-700 text-white rounded-full flex items-center justify-center font-bold text-xl">
                  3
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-navy-800 mb-3">🔍 Analyse des preuves</h3>
                <p className="text-slate-500 mb-4">
                  Un médiateur ArtisanDispo analyse <strong>l'intégralité de l'historique</strong> du projet.
                </p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-slate-50 p-3 rounded">
                    <span className="text-2xl">💬</span>
                    <div>
                      <p className="font-semibold text-navy-800 text-sm">Historique messages</p>
                      <p className="text-xs text-slate-500">Toutes les conversations client-artisan sont consultables</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 bg-slate-50 p-3 rounded">
                    <span className="text-2xl">📸</span>
                    <div>
                      <p className="font-semibold text-navy-800 text-sm">Photos avant/après</p>
                      <p className="text-xs text-slate-500">Vous avez uploadé des photos ? Elles servent de preuves</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 bg-slate-50 p-3 rounded">
                    <span className="text-2xl">📄</span>
                    <div>
                      <p className="font-semibold text-navy-800 text-sm">Devis signé</p>
                      <p className="text-xs text-slate-500">Les engagements contractuels sont vérifiés</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 bg-slate-50 p-3 rounded">
                    <span className="text-2xl">🕐</span>
                    <div>
                      <p className="font-semibold text-navy-800 text-sm">Délais et dates</p>
                      <p className="text-xs text-slate-500">Le respect des délais est vérifié automatiquement</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Étape 4 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex gap-6 items-start">
              <div className="flex-shrink-0">
                <div className="w-14 h-14 bg-brand-700 text-white rounded-full flex items-center justify-center font-bold text-xl">
                  4
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-navy-800 mb-3">💬 Tentative de résolution amiable</h3>
                <p className="text-slate-500 mb-4">
                  Le médiateur contacte les deux parties séparément puis propose une solution.
                </p>
                <div className="bg-blue-50 border-l-4 border-sky-600 p-4 rounded">
                  <p className="text-sm text-navy-800 mb-2">
                    <strong>Solutions possibles :</strong>
                  </p>
                  <ul className="text-sm text-slate-500 space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-sky-700 font-bold">→</span>
                      <span><strong>Correction des défauts par l'artisan</strong> (délai accordé de 7 jours)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-sky-700 font-bold">→</span>
                      <span><strong>Remboursement partiel</strong> si défauts mineurs non critiques</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-sky-700 font-bold">→</span>
                      <span><strong>Remboursement total</strong> si travaux gravement non conformes</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-sky-700 font-bold">→</span>
                      <span><strong>Validation avec réserves</strong> (paiement artisan + suivi client)</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Étape 5 */}
            <div className="bg-green-700 rounded-xl shadow-lg p-6 flex gap-6 items-start text-white">
              <div className="flex-shrink-0">
                <div className="w-14 h-14 bg-white text-green-700 rounded-full flex items-center justify-center font-bold text-xl">
                  5
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold mb-3">✅ Résolution finale</h3>
                <p className="text-green-50 mb-4">
                  Dans <strong>95% des cas</strong>, la médiation aboutit à un accord amiable sous 7 jours.
                </p>
                <div className="bg-white/20 backdrop-blur-sm p-4 rounded space-y-2">
                  <p className="text-sm">
                    <strong>Si accord :</strong> Le paiement est débloqué selon les termes négociés
                  </p>
                  <p className="text-sm">
                    <strong>Si désaccord persistant :</strong> Orientation vers une procédure judiciaire 
                    (rare : &lt;5% des cas)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Centre de litiges */}
      <div className="bg-white py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-center text-navy-800 mb-12">
              Votre centre de litiges personnel
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Dashboard */}
              <div className="bg-slate-50 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-brand-700 text-white rounded-full flex items-center justify-center text-2xl">
                    📊
                  </div>
                  <h3 className="text-xl font-bold text-navy-800">Dashboard dédié</h3>
                </div>
                <p className="text-slate-500 mb-4 text-sm">
                  Accédez à tous vos litiges en cours et archivés depuis un espace unifié.
                </p>
                <div className="bg-white rounded-lg p-4 border-2 border-slate-200">
                  <p className="text-xs text-slate-500 mb-2 font-semibold">Vue d'ensemble :</p>
                  <ul className="text-xs text-slate-500 space-y-1">
                    <li>• Statut du litige (en cours, résolu, clos)</li>
                    <li>• Nom du médiateur assigné</li>
                    <li>• Dernières communications</li>
                    <li>• Documents et preuves uploadés</li>
                    <li>• Historique des propositions</li>
                  </ul>
                </div>
              </div>

              {/* Messagerie sécurisée */}
              <div className="bg-slate-50 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-sky-700 text-white rounded-full flex items-center justify-center text-2xl">
                    💬
                  </div>
                  <h3 className="text-xl font-bold text-navy-800">Messagerie tripartite</h3>
                </div>
                <p className="text-slate-500 mb-4 text-sm">
                  Échangez directement avec le médiateur et l'autre partie dans un fil de discussion sécurisé.
                </p>
                <div className="bg-white rounded-lg p-4 border-2 border-slate-200">
                  <p className="text-xs text-slate-500 mb-2 font-semibold">Fonctionnalités :</p>
                  <ul className="text-xs text-slate-500 space-y-1">
                    <li>• Messages horodatés et tracés</li>
                    <li>• Upload photos/documents (PDF, JPG, PNG)</li>
                    <li>• Notifications temps réel (email + app)</li>
                    <li>• Archivage permanent des échanges</li>
                  </ul>
                </div>
              </div>

              {/* Preuves */}
              <div className="bg-slate-50 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-amber-400 text-white rounded-full flex items-center justify-center text-2xl">
                    📸
                  </div>
                  <h3 className="text-xl font-bold text-navy-800">Espace preuves</h3>
                </div>
                <p className="text-slate-500 mb-4 text-sm">
                  Centralisez tous les éléments de preuve : photos, captures, justificatifs.
                </p>
                <div className="bg-white rounded-lg p-4 border-2 border-slate-200">
                  <p className="text-xs text-slate-500 mb-2 font-semibold">Accepté :</p>
                  <ul className="text-xs text-slate-500 space-y-1">
                    <li>• Photos avant/après travaux</li>
                    <li>• Factures et devis externes</li>
                    <li>• Captures d'écran conversations</li>
                    <li>• Rapports d'expertise tiers</li>
                  </ul>
                </div>
              </div>

              {/* Suivi temps réel */}
              <div className="bg-slate-50 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-green-700 text-white rounded-full flex items-center justify-center text-2xl">
                    📍
                  </div>
                  <h3 className="text-xl font-bold text-navy-800">Suivi en temps réel</h3>
                </div>
                <p className="text-slate-500 mb-4 text-sm">
                  Suivez l'avancement de votre litige étape par étape avec des statuts clairs.
                </p>
                <div className="bg-white rounded-lg p-4 border-2 border-slate-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-amber-400 rounded-full"></span>
                    <span className="text-xs text-slate-500">En attente analyse</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-sky-700 rounded-full"></span>
                    <span className="text-xs text-slate-500">Médiation en cours</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-green-700 rounded-full"></span>
                    <span className="text-xs text-slate-500">Résolu</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 bg-red-700 rounded-full"></span>
                    <span className="text-xs text-slate-500">Échec médiation</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Statistiques */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-navy-800 mb-12">
            Nos résultats en chiffres
          </h2>

          <div className="grid md:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
              <div className="text-4xl font-bold text-green-700 mb-2">95%</div>
              <p className="text-sm text-slate-500">Litiges résolus à l'amiable</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
              <div className="text-4xl font-bold text-brand-700 mb-2">7j</div>
              <p className="text-sm text-slate-500">Délai moyen de résolution</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
              <div className="text-4xl font-bold text-sky-700 mb-2">24h</div>
              <p className="text-sm text-slate-500">Première réponse médiateur</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
              <div className="text-4xl font-bold text-amber-500 mb-2">4.8/5</div>
              <p className="text-sm text-slate-500">Satisfaction médiation</p>
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
                  La médiation est-elle vraiment gratuite ?
                  <span className="text-2xl text-brand-700 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="text-slate-500 mt-4 pl-4 border-l-4 border-brand-500">
                  Oui, <strong>100% gratuite</strong> pour les clients ET les artisans. C'est un service inclus dans notre 
                  plateforme. Nous ne facturons aucun frais supplémentaire pour la médiation, même si le processus prend 
                  plusieurs semaines.
                </p>
              </details>

              <details className="bg-slate-50 rounded-lg p-6 cursor-pointer group">
                <summary className="font-semibold text-navy-800 text-lg list-none flex items-center justify-between">
                  Que se passe-t-il si la médiation échoue ?
                  <span className="text-2xl text-brand-700 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <div className="text-slate-500 mt-4 pl-4 border-l-4 border-brand-500">
                  Si aucun accord n'est trouvé après <strong>3 tentatives de résolution</strong>, nous vous orientons vers :
                  <ul className="list-disc ml-6 mt-2 space-y-1">
                    <li>Une <strong>médiation externe</strong> (médiateur de la consommation agréé)</li>
                    <li>Ou une <strong>procédure judiciaire</strong> (tribunal de proximité)</li>
                  </ul>
                  Dans tous les cas, l'argent reste bloqué jusqu'à décision finale.
                </div>
              </details>

              <details className="bg-slate-50 rounded-lg p-6 cursor-pointer group">
                <summary className="font-semibold text-navy-800 text-lg list-none flex items-center justify-between">
                  Les médiateurs sont-ils impartiaux ?
                  <span className="text-2xl text-brand-700 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="text-slate-500 mt-4 pl-4 border-l-4 border-brand-500">
                  Absolument. Nos médiateurs sont <strong>formés et certifiés</strong>. Ils ne sont PAS commissionnés sur 
                  l'issue du litige et suivent une <strong>charte de neutralité stricte</strong>. Leur objectif unique : 
                  trouver une solution juste pour les deux parties.
                </p>
              </details>

              <details className="bg-slate-50 rounded-lg p-6 cursor-pointer group">
                <summary className="font-semibold text-navy-800 text-lg list-none flex items-center justify-between">
                  Puis-je contacter directement l'artisan pendant la médiation ?
                  <span className="text-2xl text-brand-700 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="text-slate-500 mt-4 pl-4 border-l-4 border-brand-500">
                  Oui, la messagerie reste ouverte. Cependant, nous recommandons de <strong>passer par le médiateur</strong> 
                  pour éviter les malentendus. Tous les échanges dans le centre de litiges sont tracés et peuvent servir 
                  de preuves.
                </p>
              </details>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-brand-600 py-12">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Lancez vos travaux en toute sérénité</h2>
          <p className="text-white/90 mb-6 text-lg">
            Protection garantie et médiation gratuite sur tous vos projets
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/">
              <Button className="!bg-white !text-brand-700 hover:!bg-slate-100 px-8 py-3 text-lg font-semibold">
                Trouver un artisan
              </Button>
            </Link>
            <Link href="/confiance/paiement-securise">
              <Button className="bg-navy-800 text-white hover:bg-navy-900 px-8 py-3 text-lg font-semibold">
                Voir toutes nos garanties
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
