'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function PetitsTravauxPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = [
    {
      id: 'plomberie',
      icon: '🚰',
      title: 'Plomberie',
      color: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      exemples: ['Débouchage évier/WC', 'Réparer fuite robinet', 'Changer joint', 'Installer lave-mains']
    },
    {
      id: 'electricite',
      icon: '💡',
      title: 'Électricité',
      color: 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200',
      exemples: ['Installer prise/interrupteur', 'Changer ampoule difficile', 'Réparer disjoncteur', 'Remplacer va-et-vient']
    },
    {
      id: 'menuiserie',
      icon: '🔧',
      title: 'Menuiserie',
      color: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
      exemples: ['Réparer serrure', 'Ajuster porte/fenêtre', 'Changer poignée', 'Fixer étagères']
    },
    {
      id: 'peinture',
      icon: '🎨',
      title: 'Peinture',
      color: 'bg-purple-50 hover:bg-purple-100 border-purple-200',
      exemples: ['Retouche mur', 'Peindre petit espace', 'Réparer fissure', 'Rafraîchir porte']
    },
    {
      id: 'serrurerie',
      icon: '🔑',
      title: 'Serrurerie',
      color: 'bg-slate-50 hover:bg-slate-100 border-slate-200',
      exemples: ['Ouverture porte claquée', 'Changer cylindre', 'Dupliquer clés', 'Réparer verrou']
    },
    {
      id: 'multiservices',
      icon: '🏠',
      title: 'Multiservices',
      color: 'bg-green-50 hover:bg-green-100 border-green-200',
      exemples: ['Montage meuble', 'Fixation TV/tableau', 'Remplacement VMC', 'Petits travaux divers']
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero Section */}
      <div className=" bg-navy-800 text-white py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-extrabold mb-4">
              🔧 Petits travaux à la demande
            </h1>
            <p className="text-xl md:text-2xl text-white/90 mb-6 max-w-3xl mx-auto">
              Intervention rapide • Sans devis si &lt; 150€ • Facturation transparente
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              <div className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                🚀 Intervention sous 2h possible
              </div>
              <div className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                💰 Tarif horaire affiché à l'avance
              </div>
              <div className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                📄 Facture détaillée après travaux
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cadre légal */}
      <div className="container mx-auto px-4 max-w-6xl py-8">
        <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-6 mb-12">
          <h2 className="text-xl font-bold text-navy-800 mb-3 flex items-center gap-2">
            ⚖️ Cadre légal des petits travaux
          </h2>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <h3 className="font-semibold text-green-700 mb-2">✅ Sans devis obligatoire</h3>
              <ul className="space-y-1 text-slate-700">
                <li>• Montant &lt; 150€ TTC</li>
                <li>• Interventions rapides/urgentes</li>
                <li>• Tarif horaire convenu à l'avance</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-red-700 mb-2">❌ Devis obligatoire si</h3>
              <ul className="space-y-1 text-slate-700">
                <li>• Montant ≥ 150€ TTC</li>
                <li>• Travaux de rénovation</li>
                <li>• Client demande un devis</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-slate-600 mt-4 italic">
            ⚠️ Dans tous les cas : facture détaillée obligatoire après intervention
          </p>
        </div>

        {/* Grille des catégories */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-navy-800 mb-8 text-center">
            Choisissez votre type d'intervention
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((category) => (
              <div
                key={category.id}
                className={`${category.color} border-2 rounded-xl p-6 cursor-pointer transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-md ${
                  selectedCategory === category.id ? 'ring-4 ring-brand-500 border-brand-500' : ''
                }`}
                onClick={() => setSelectedCategory(category.id)}
              >
                <div className="text-center mb-4">
                  <span className="text-6xl mb-3 block">{category.icon}</span>
                  <h3 className="text-xl font-bold text-navy-800">{category.title}</h3>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-600 uppercase">Exemples :</p>
                  <ul className="text-sm text-slate-700 space-y-1">
                    {category.exemples.map((ex, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5">✓</span>
                        <span>{ex}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Principal */}
        <div className=" bg-brand-600 rounded-2xl shadow-lg p-8 md:p-12 text-white text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Besoin d'une intervention rapide ?
          </h2>
          <p className="text-xl mb-6 text-orange-100">
            Décrivez votre besoin en 1 minute et trouvez un artisan disponible près de chez vous
          </p>
          <Link href="/demande/nouvelle">
            <button className="bg-white text-brand-700 hover:bg-slate-100 px-8 py-4 rounded-xl font-bold text-lg shadow-sm border border-slate-200 hover:shadow-lg transition-all duration-200 transform hover:scale-105">
              🚀 Demander une intervention
            </button>
          </Link>
          <p className="text-sm text-white/80 mt-4">
            Sans engagement • Réponse rapide • Artisans de confiance
          </p>
        </div>

        {/* Comment ça marche */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-navy-800 mb-8 text-center">
            Comment ça marche ?
          </h2>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-brand-700 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="font-bold text-navy-800 mb-2">Décrivez votre besoin</h3>
              <p className="text-sm text-slate-600">
                Type de travail, urgence, photos si possible
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-brand-700 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="font-bold text-navy-800 mb-2">Artisans disponibles</h3>
              <p className="text-sm text-slate-600">
                Consultez profils, tarifs horaires et disponibilités
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-brand-700 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="font-bold text-navy-800 mb-2">Intervention rapide</h3>
              <p className="text-sm text-slate-600">
                L'artisan intervient selon vos disponibilités
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-brand-700 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                4
              </div>
              <h3 className="font-bold text-navy-800 mb-2">Facturation claire</h3>
              <p className="text-sm text-slate-600">
                Facture détaillée avec temps passé et matériel
              </p>
            </div>
          </div>
        </div>

        {/* Avantages */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-12">
          <h2 className="text-3xl font-bold text-navy-800 mb-8 text-center">
            Pourquoi choisir ArtisanDispo ?
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                🚀
              </div>
              <h3 className="font-bold text-navy-800 mb-2">Intervention rapide</h3>
              <p className="text-sm text-slate-600">
                Artisans disponibles sous 2h pour les urgences
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                💰
              </div>
              <h3 className="font-bold text-navy-800 mb-2">Tarifs transparents</h3>
              <p className="text-sm text-slate-600">
                Tarif horaire affiché à l'avance, pas de surprise
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                ✓
              </div>
              <h3 className="font-bold text-navy-800 mb-2">Artisans vérifiés</h3>
              <p className="text-sm text-slate-600">
                KBIS, assurances et identité contrôlés
              </p>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div>
          <h2 className="text-3xl font-bold text-navy-800 mb-8 text-center">
            Questions fréquentes
          </h2>
          <div className="space-y-4">
            <details className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 cursor-pointer group">
              <summary className="font-bold text-navy-800 flex justify-between items-center">
                Quelle est la différence avec une demande de devis classique ?
                <svg className="w-5 h-5 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <p className="mt-4 text-slate-600 text-sm">
                Pour les <strong>petits travaux &lt; 150€</strong>, pas besoin de devis écrit préalable. L'artisan vous indique son tarif horaire, intervient rapidement et vous facture après les travaux. Pour les <strong>travaux &gt; 150€</strong>, un devis détaillé est obligatoire avant intervention.
              </p>
            </details>

            <details className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 cursor-pointer group">
              <summary className="font-bold text-navy-800 flex justify-between items-center">
                Comment est calculé le prix final ?
                <svg className="w-5 h-5 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <p className="mt-4 text-slate-600 text-sm">
                Le prix se calcule selon : <strong>Tarif horaire × Temps passé + Matériel utilisé</strong>. L'artisan vous informe du tarif horaire avant intervention. La facture détaillée mentionne le temps exact et les fournitures.
              </p>
            </details>

            <details className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 cursor-pointer group">
              <summary className="font-bold text-navy-800 flex justify-between items-center">
                Les artisans sont-ils disponibles le week-end ?
                <svg className="w-5 h-5 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <p className="mt-4 text-slate-600 text-sm">
                Oui ! De nombreux artisans proposent des interventions en soirée et le week-end. Vous verrez leurs disponibilités lors de la sélection. Des tarifs majorés peuvent s'appliquer (généralement +20-30% hors horaires).
              </p>
            </details>

            <details className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 cursor-pointer group">
              <summary className="font-bold text-navy-800 flex justify-between items-center">
                Que faire si le montant dépasse 150€ ?
                <svg className="w-5 h-5 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <p className="mt-4 text-slate-600 text-sm">
                Si l'artisan estime que le montant dépassera 150€, il doit <strong>obligatoirement vous fournir un devis écrit</strong> avant de commencer les travaux. Vous êtes alors libre d'accepter ou de refuser.
              </p>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
