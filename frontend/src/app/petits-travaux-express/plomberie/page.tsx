'use client';

import Link from 'next/link';
import { useState } from 'react';

const SOUS_CATEGORIES_PLOMBERIE = [
  {
    titre: 'Petits dépannages',
    couleur: '#2C3E50',
    href: '/petits-travaux-express/recherche?categorie=plomberie&sousCategorie=depannage',
  },
  {
    titre: 'Robinetterie',
    couleur: '#2C3E50',
    href: '/petits-travaux-express/recherche?categorie=plomberie&sousCategorie=robinetterie',
  },
  {
    titre: 'Fuite d\'eau',
    couleur: '#2C3E50',
    href: '/petits-travaux-express/recherche?categorie=plomberie&sousCategorie=fuite',
  },
  {
    titre: 'WC / Lavabo',
    couleur: '#2C3E50',
    href: '/petits-travaux-express/recherche?categorie=plomberie&sousCategorie=wc-lavabo',
  },
];

export default function PlomberiePage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSousCategories = SOUS_CATEGORIES_PLOMBERIE.filter(cat =>
    cat.titre.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Breadcrumb et header */}
      <div className="bg-white shadow-sm border-b border-slate-200">
        <div className="container mx-auto px-4 py-6">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm mb-4">
            <Link href="/" className="text-navy-800 hover:text-brand-700 transition-colors flex items-center gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
            </Link>
            <span className="text-slate-500">&gt;</span>
            <Link href="/petits-travaux-express/recherche" className="text-navy-800 hover:text-brand-700 transition-colors">
              Travaux express
            </Link>
            <span className="text-slate-500">&gt;</span>
            <span className="text-navy-800 font-semibold">Plomberie</span>
          </nav>

          {/* Barre de recherche */}
          <div className="flex items-center gap-3 bg-slate-50 border-2 border-slate-200 rounded-lg px-4 py-3 hover:border-brand-500 transition-colors max-w-2xl">
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Rechercher"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none text-navy-800 placeholder-slate-500 w-full"
            />
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="container mx-auto px-4 py-12">
        {/* Grille de sous-catégories */}
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            {filteredSousCategories.map((sousCategorie, index) => (
              <Link
                key={index}
                href={sousCategorie.href}
                className="group"
              >
                <div 
                  className="flex h-full min-h-20 items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
                >
                  <h3 
                    className="text-base font-semibold sm:text-lg"
                    style={{ color: sousCategorie.couleur }}
                  >
                    {sousCategorie.titre}
                  </h3>
                  <span aria-hidden="true" className="text-xl text-brand-600 transition-transform group-hover:translate-x-0.5">→</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Message si aucun résultat */}
          {filteredSousCategories.length === 0 && (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-bold text-navy-800 mb-2">Aucun résultat trouvé</h3>
              <p className="text-slate-500">Essayez d&apos;autres mots-clés</p>
            </div>
          )}

          {/* Bouton retour */}
          <div className="mt-12 text-center">
            <Link 
              href="/petits-travaux-express/recherche"
              className="inline-flex items-center gap-2 text-navy-800 hover:text-brand-700 font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Retour aux catégories
            </Link>
          </div>
        </div>
      </div>

      {/* Section CTA */}
      <div className="bg-brand-600 py-12 mt-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Une fuite ou un petit problème de plomberie ?
          </h2>
          <p className="text-white/90 mb-6 max-w-2xl mx-auto">
            Nos plombiers interviennent rapidement pour vos petits dépannages
          </p>
          <Link 
            href="/etre-rappele"
            className="inline-flex items-center gap-2 bg-white text-brand-700 hover:bg-slate-50 px-8 py-4 rounded-xl font-bold text-lg transition-colors shadow-sm border border-slate-200 hover:shadow-md"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Être rappelé gratuitement
          </Link>
        </div>
      </div>
    </div>
  );
}
