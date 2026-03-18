'use client';

import Link from 'next/link';

const CATEGORIES_TRAVAUX = [
  {
    titre: 'Menuiserie',
    icon: '�',
    couleur: '#8B4513',
    href: '/petits-travaux-express/menuiserie',
    description: 'Fenêtres, portes, volets, portails'
  },
  {
    titre: 'Peinture & Décoration',
    icon: '🎨',
    couleur: '#9C27B0',
    href: '/petits-travaux-express/revetement-sols-murs',
    description: 'Peinture, papier peint, enduit'
  },
  {
    titre: 'Électricité',
    icon: '💡',
    couleur: '#FFC107',
    href: '/petits-travaux-express/electricite',
    description: 'Petits dépannages électriques, domotique'
  },
  {
    titre: 'Plomberie',
    icon: '🔧',
    couleur: '#2196F3',
    href: '/petits-travaux-express/plomberie',
    description: 'Petits dépannages, robinetterie'
  },
  {
    titre: 'Serrurerie',
    icon: '🔐',
    couleur: '#455A64',
    href: '/resultats?categorie=serrurerie',
    description: 'Changement serrures, portes blindées'
  },
  {
    titre: 'Extérieur et jardin',
    icon: '🌳',
    couleur: '#4CAF50',
    href: '/petits-travaux-express/exterieur-jardin',
    description: 'Clôture, terrasse, élagage, entretien'
  }
];

export default function PetitsTravauxExpressPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F8F9FA] to-white">
      {/* Header de la page */}
      <div className="bg-white shadow-sm border-b border-[#E9ECEF]">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-[#2C3E50] hover:text-[#FF6B00] transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold text-[#2C3E50]">
              Travaux express
            </h1>
          </div>
        </div>
      </div>

      {/* En-tête descriptif */}
      <div className="container mx-auto px-4 py-8">
        <div className="text-center max-w-3xl mx-auto mb-8">
          <h2 className="text-3xl md:text-4xl font-bold text-[#2C3E50] mb-4">
            Des artisans disponibles pour vos petits travaux du quotidien
          </h2>
          <p className="text-lg text-[#6C757D] mb-2">
            <span className="font-semibold text-[#FF6B00]">2500 artisans</span> près de chez vous pour vos dépannages express <span className="font-semibold">(moins de 150€)</span>
          </p>
          
          {/* Comment ça marche */}
          <div className="mt-8 border-t border-[#E9ECEF] pt-6">
            <h3 className="text-xl font-bold text-[#2C3E50] mb-4">Comment ça marche ?</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-left">
              <div className="flex items-start gap-2">
                <span className="font-bold text-[#FF6B00]">1.</span>
                <span className="text-[#6C757D]">Vous décrivez votre projet</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-[#FF6B00]">2.</span>
                <span className="text-[#6C757D]">Nous vous mettons en relation avec des artisans de notre réseau proches de chez vous</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="font-bold text-[#FF6B00]">3.</span>
                <span className="text-[#6C757D]">L'artisan intervient rapidement (moins de 150€, sans devis formel)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Grille de catégories */}
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
            {CATEGORIES_TRAVAUX.map((categorie, index) => (
              <Link
                key={index}
                href={categorie.href}
                className="group"
              >
                <div 
                  className="bg-[#E9ECEF] hover:bg-[#D6D6D6] rounded-xl p-4 transition-all duration-300 h-full flex flex-col items-center justify-center text-center cursor-pointer shadow-md hover:shadow-xl transform hover:-translate-y-1 border-2 border-transparent hover:border-[#FF6B00]"
                  style={{ 
                    backgroundColor: `${categorie.couleur}15`,
                  }}
                >
                  <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">
                    {categorie.icon}
                  </div>
                  <h3 
                    className="text-base font-bold mb-2 group-hover:underline"
                    style={{ color: categorie.couleur }}
                  >
                    {categorie.titre}
                  </h3>
                  <p className="text-xs text-[#6C757D]">
                    {categorie.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Section CTA */}
      <div className="bg-gradient-to-r from-[#FF6B00] to-[#E56100] py-12 mt-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Besoin d'aide pour votre projet ?
          </h2>
          <p className="text-white/90 mb-6 max-w-2xl mx-auto">
            Nos conseillers sont disponibles pour vous accompagner dans votre recherche d'artisan
          </p>
          <Link 
            href="/etre-rappele"
            className="inline-flex items-center gap-2 bg-white text-[#FF6B00] hover:bg-[#F5F7FA] px-8 py-4 rounded-lg font-bold text-lg transition-colors shadow-lg hover:shadow-xl"
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
