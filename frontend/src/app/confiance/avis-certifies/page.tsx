'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';

export default function AvisCertifiesPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero Section */}
      <div className="bg-amber-400 text-navy-800 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-block bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full mb-6">
              <span className="text-4xl">⭐</span>
            </div>
            <h1 className="text-5xl font-bold mb-6">Avis 100% certifiés et vérifiés</h1>
            <p className="text-xl">
              Uniquement des avis basés sur des missions réelles et payées
            </p>
          </div>
        </div>
      </div>

      {/* Différence avec les autres sites */}
      <div className="container mx-auto px-4 -mt-10 relative z-10">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-2xl font-bold text-navy-800 text-center mb-6">
              Pourquoi nos avis sont plus fiables ?
            </h2>
            <div className="grid md:grid-cols-2 gap-8">
              {/* Autres sites */}
              <div className="bg-red-50 rounded-lg p-6 border-2 border-red-600">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-3xl">❌</span>
                  <h3 className="font-bold text-red-700 text-lg">Autres plateformes</h3>
                </div>
                <ul className="space-y-3 text-slate-500">
                  <li className="flex items-start gap-2">
                    <span className="text-red-700 mt-1">✗</span>
                    <span>Avis possibles sans prestation réalisée</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-700 mt-1">✗</span>
                    <span>Notes globales sans détails (non transparentes)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-700 mt-1">✗</span>
                    <span>Avis anonymes non vérifiables</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-700 mt-1">✗</span>
                    <span>Possibilité de faux avis achetés</span>
                  </li>
                </ul>
              </div>

              {/* ArtisanDispo */}
              <div className="bg-green-50 rounded-lg p-6 border-2 border-green-600">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-3xl">✅</span>
                  <h3 className="font-bold text-green-700 text-lg">ArtisanDispo</h3>
                </div>
                <ul className="space-y-3 text-slate-500">
                  <li className="flex items-start gap-2">
                    <span className="text-green-700 mt-1">✓</span>
                    <strong>Avis uniquement après paiement validé</strong>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-700 mt-1">✓</span>
                    <strong>Notation multi-critères détaillée</strong>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-700 mt-1">✓</span>
                    <strong>Identité client vérifiée (prénom + ville)</strong>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-700 mt-1">✓</span>
                    <strong>Score dynamique actualisé en temps réel</strong>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Système de notation */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-navy-800 mb-4">
            Notre système de notation multi-critères
          </h2>
          <p className="text-center text-slate-500 mb-12 max-w-2xl mx-auto">
            Fini les notes globales peu informatives. Chaque prestation est notée sur 4 aspects essentiels.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Critère 1 : Qualité */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-green-50 text-green-700 rounded-full flex items-center justify-center text-2xl">
                  🎯
                </div>
                <div>
                  <h3 className="font-bold text-navy-800 text-lg">Qualité du travail</h3>
                  <p className="text-sm text-slate-500">Note /5</p>
                </div>
              </div>
              <p className="text-slate-500 text-sm mb-3">
                Le travail a-t-il été réalisé conformément au devis ? Finitions soignées ? Résultat satisfaisant ?
              </p>
              <div className="bg-slate-50 rounded p-3">
                <p className="text-xs text-slate-500">
                  <strong>Exemples de questions :</strong><br/>
                  • Le problème est-il résolu ?<br/>
                  • Les finitions sont-elles propres ?<br/>
                  • Recommanderiez-vous ce travail ?
                </p>
              </div>
            </div>

            {/* Critère 2 : Respect des délais */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-blue-50 text-sky-700 rounded-full flex items-center justify-center text-2xl">
                  ⏱️
                </div>
                <div>
                  <h3 className="font-bold text-navy-800 text-lg">Respect des délais</h3>
                  <p className="text-sm text-slate-500">Note /5</p>
                </div>
              </div>
              <p className="text-slate-500 text-sm mb-3">
                L'artisan a-t-il commencé à la date prévue ? A-t-il terminé dans les temps annoncés ?
              </p>
              <div className="bg-slate-50 rounded p-3">
                <p className="text-xs text-slate-500">
                  <strong>Exemples de questions :</strong><br/>
                  • Arrivée ponctuelle le jour J ?<br/>
                  • Durée des travaux respectée ?<br/>
                  • Prévenance en cas de retard ?
                </p>
              </div>
            </div>

            {/* Critère 3 : Rapport qualité/prix */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-brand-50 text-brand-700 rounded-full flex items-center justify-center text-2xl">
                  💰
                </div>
                <div>
                  <h3 className="font-bold text-navy-800 text-lg">Rapport qualité/prix</h3>
                  <p className="text-sm text-slate-500">Note /5</p>
                </div>
              </div>
              <p className="text-slate-500 text-sm mb-3">
                Le prix est-il justifié par rapport à la qualité du travail fourni ?
              </p>
              <div className="bg-slate-50 rounded p-3">
                <p className="text-xs text-slate-500">
                  <strong>Exemples de questions :</strong><br/>
                  • Prix cohérent avec le marché ?<br/>
                  • Pas de frais cachés ?<br/>
                  • Bon rapport qualité/prix ?
                </p>
              </div>
            </div>

            {/* Critère 4 : Communication */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-purple-50 text-purple-700 rounded-full flex items-center justify-center text-2xl">
                  💬
                </div>
                <div>
                  <h3 className="font-bold text-navy-800 text-lg">Communication</h3>
                  <p className="text-sm text-slate-500">Note /5</p>
                </div>
              </div>
              <p className="text-slate-500 text-sm mb-3">
                L'artisan a-t-il été réactif, clair et professionnel dans ses échanges ?
              </p>
              <div className="bg-slate-50 rounded p-3">
                <p className="text-xs text-slate-500">
                  <strong>Exemples de questions :</strong><br/>
                  • Réponses rapides aux messages ?<br/>
                  • Explications claires ?<br/>
                  • Attitude professionnelle ?
                </p>
              </div>
            </div>
          </div>

          {/* Note globale */}
          <div className="mt-8 bg-brand-600 rounded-xl shadow-lg p-8 text-white text-center">
            <h3 className="text-2xl font-bold mb-3">Note globale = Moyenne des 4 critères</h3>
            <p className="text-lg text-orange-100 mb-4">
              (Qualité + Délais + Prix + Communication) ÷ 4
            </p>
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4 inline-block">
              <p className="text-sm">
                Exemple : 4.5 + 5.0 + 4.0 + 4.5 = <strong className="text-amber-500">18 ÷ 4 = 4.5/5</strong>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Garanties anti-fraude */}
      <div className="bg-white py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-center text-navy-800 mb-12">
              Nos garanties anti-fraude
            </h2>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-slate-50 rounded-xl p-6 text-center">
                <div className="text-4xl mb-3">🔒</div>
                <h3 className="font-bold text-navy-800 mb-2">Avis après paiement uniquement</h3>
                <p className="text-sm text-slate-500">
                  Impossible de laisser un avis sans avoir réellement payé pour la prestation
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-6 text-center">
                <div className="text-4xl mb-3">👤</div>
                <h3 className="font-bold text-navy-800 mb-2">Identité vérifiée</h3>
                <p className="text-sm text-slate-500">
                  Prénom + première lettre du nom + ville affichés (ex: "Marie D. - Paris")
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-6 text-center">
                <div className="text-4xl mb-3">🚫</div>
                <h3 className="font-bold text-navy-800 mb-2">Modération active</h3>
                <p className="text-sm text-slate-500">
                  Avis suspects signalés et vérifiés manuellement par notre équipe
                </p>
              </div>
            </div>

            <div className="mt-12 bg-brand-50 border-l-4 border-brand-500 rounded-lg p-6">
              <h3 className="font-bold text-navy-800 mb-3 flex items-center gap-2">
                <span className="text-2xl">⚠️</span>
                Signalement d'avis frauduleux
              </h3>
              <p className="text-slate-500 mb-3">
                Vous suspectez un avis faux ou injuste ? Signalez-le en un clic. Notre équipe enquête sous <strong>24h</strong>.
              </p>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div className="bg-white rounded p-3">
                  <p className="font-semibold text-navy-800 mb-1">Pour les artisans</p>
                  <p className="text-xs text-slate-500">Droit de réponse public + contestation possible avec preuves</p>
                </div>
                <div className="bg-white rounded p-3">
                  <p className="font-semibold text-navy-800 mb-1">Pour les clients</p>
                  <p className="text-xs text-slate-500">Signalement d'avis suspects achetés ou manipulés</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Score dynamique */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-navy-800 mb-12">
            Score dynamique et transparent
          </h2>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-brand-700 text-white rounded-full flex items-center justify-center font-bold">
                  1
                </div>
                <div>
                  <h3 className="font-semibold text-navy-800 mb-2">Calcul en temps réel</h3>
                  <p className="text-slate-500 text-sm">
                    La note moyenne est recalculée <strong>instantanément</strong> à chaque nouvel avis. 
                    Pas de notes figées ou obsolètes.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-brand-700 text-white rounded-full flex items-center justify-center font-bold">
                  2
                </div>
                <div>
                  <h3 className="font-semibold text-navy-800 mb-2">Affichage nombre d'avis</h3>
                  <p className="text-slate-500 text-sm mb-2">
                    La note est toujours accompagnée du <strong>nombre total d'avis</strong>.
                  </p>
                  <div className="flex items-center gap-4 bg-slate-50 rounded p-3">
                    <div className="text-center">
                      <div className="flex items-center gap-1 text-amber-500 text-2xl mb-1">
                        ★★★★☆
                      </div>
                      <p className="text-sm text-slate-500">4.2/5 (3 avis)</p>
                      <p className="text-xs text-red-700 mt-1">⚠️ Peu d'avis</p>
                    </div>
                    <div className="border-l-2 border-slate-200 h-16"></div>
                    <div className="text-center">
                      <div className="flex items-center gap-1 text-amber-500 text-2xl mb-1">
                        ★★★★☆
                      </div>
                      <p className="text-sm text-slate-500">4.2/5 (127 avis)</p>
                      <p className="text-xs text-green-700 mt-1">✓ Fiable</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-brand-700 text-white rounded-full flex items-center justify-center font-bold">
                  3
                </div>
                <div>
                  <h3 className="font-semibold text-navy-800 mb-2">Détails par critère</h3>
                  <p className="text-slate-500 text-sm mb-2">
                    Sur la fiche artisan, vous voyez la note détaillée pour chaque critère :
                  </p>
                  <div className="bg-slate-50 rounded p-3 space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">🎯 Qualité du travail</span>
                      <span className="font-bold text-green-700">4.8/5</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">⏱️ Respect des délais</span>
                      <span className="font-bold text-brand-700">4.2/5</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">💰 Rapport qualité/prix</span>
                      <span className="font-bold text-brand-700">4.0/5</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">💬 Communication</span>
                      <span className="font-bold text-green-700">4.5/5</span>
                    </div>
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
                  Puis-je laisser un avis anonyme ?
                  <span className="text-2xl text-brand-700 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="text-slate-500 mt-4 pl-4 border-l-4 border-brand-500">
                  Non. Pour garantir l'authenticité, votre <strong>prénom + première lettre du nom + ville</strong> 
                  sont affichés (ex: "Marie D. - Paris"). Cela empêche les faux avis tout en préservant votre vie privée.
                </p>
              </details>

              <details className="bg-slate-50 rounded-lg p-6 cursor-pointer group">
                <summary className="font-semibold text-navy-800 text-lg list-none flex items-center justify-between">
                  L'artisan peut-il supprimer un avis négatif ?
                  <span className="text-2xl text-brand-700 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="text-slate-500 mt-4 pl-4 border-l-4 border-brand-500">
                  <strong>Absolument pas</strong>. Seul notre équipe de modération peut supprimer un avis, et uniquement 
                  s'il est prouvé frauduleux ou diffamatoire (après enquête). L'artisan peut répondre publiquement à l'avis 
                  pour donner sa version.
                </p>
              </details>

              <details className="bg-slate-50 rounded-lg p-6 cursor-pointer group">
                <summary className="font-semibold text-navy-800 text-lg list-none flex items-center justify-between">
                  Combien de temps ai-je pour laisser un avis ?
                  <span className="text-2xl text-brand-700 group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="text-slate-500 mt-4 pl-4 border-l-4 border-brand-500">
                  Vous recevez une notification <strong>7 jours après validation des travaux</strong>. Vous avez ensuite 
                  <strong>30 jours</strong> pour laisser votre avis. Passé ce délai, l'option disparaît (évite les avis 
                  basés sur des souvenirs flous).
                </p>
              </details>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-brand-600 py-12">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Consultez les avis certifiés de nos artisans</h2>
          <p className="text-white/90 mb-6 text-lg">
            Chaque avis est basé sur une mission réelle et payée
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/">
              <Button className="!bg-white !text-brand-700 hover:!bg-slate-100 px-8 py-3 text-lg font-semibold">
                Trouver un artisan
              </Button>
            </Link>
            <Link href="/confiance/protection-mediation">
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
