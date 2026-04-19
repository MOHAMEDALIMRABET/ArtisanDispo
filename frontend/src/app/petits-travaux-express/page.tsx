'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { EXPRESS_WORK_TAXONOMY } from '@/lib/express-work-taxonomy';

// Icones associees a chaque categorie express (depannage urgence)
const URGENCE_ICONS: Record<string, string> = {
  serrurerie: '🔑',
  plomberie: '🚰',
  chauffage: '🔥',
  electricite: '💡',
  vitrerie: '🪟',
};

// Icones associees a chaque categorie express (petits travaux & maintenance)
const TRAVAUX_ICONS: Record<string, string> = {
  'reglage-reparation': '🔧',
  'installation-simple': '📦',
  'amelioration-optimisation': '✨',
  'petits-travaux-bois': '🪑',
  'maintenance-preventive': '🛡️',
  'traitement-nuisibles': '🐜',
};

// Categories issues directement de la taxonomie Express (coherence avec le profil artisan)
const URGENCE_ITEMS = EXPRESS_WORK_TAXONOMY['depannage-urgence'].categories.map((cat) => ({
  value: cat.value,
  label: cat.label,
  icon: URGENCE_ICONS[cat.value] || '🚨',
}));

const TRAVAUX_ITEMS = EXPRESS_WORK_TAXONOMY['petits-travaux-maintenance'].categories.map((cat) => ({
  value: cat.value,
  label: cat.label,
  icon: TRAVAUX_ICONS[cat.value] || '🛠️',
}));

// Etapes du "Comment ca marche"
const steps = [
  {
    number: 1,
    title: 'Dépannage en urgence',
    description: 'Un problème urgent ?',
    icon: (
      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    number: 2,
    title: 'Petits travaux & maintenance',
    description: 'Un projet ou des travaux à réaliser ?',
    icon: (
      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    number: 3,
    title: 'Comment ça marche',
    description: 'Un problème urgent ?',
    icon: (
      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function PetitsTravauxExpressPage() {
  const router = useRouter();
  const { t } = useLanguage();

  return (
    <main className="min-h-screen bg-[#F8F9FA]">

      {/* Banniere bleue */}
      <div className="bg-[#2C3E50] text-white py-8">
        <div className="container mx-auto px-4">
          {/* Bouton retour vers la page de choix */}
          <button
            onClick={() => router.push('/choisir-type-travaux')}
            className="flex items-center gap-2 text-white hover:text-[#FF6B00] mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour au tableau de bord
          </button>

          {/* Titre et sous-titre */}
          <div>
            <h1 className="text-3xl font-bold">{t('expressPages.landing.heroTitle')}</h1>
            <p className="text-gray-300 mt-2">{t('expressPages.landing.heroSubtitle')}</p>
          </div>
        </div>
      </div>

      {/* Stat */}
      <section className="bg-white border-b border-[#E9ECEF]">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <p className="text-2xl md:text-3xl font-bold text-[#2C3E50]">
              <span className="text-[#FF6B00]">2 500</span> {t('expressPages.landing.stat2500').replace('2 500 ', '')}
            </p>
            <p className="text-[#6C757D] mt-1 text-base">
              {t('expressPages.landing.statDescription')}
            </p>
            <p className="text-[#95A5A6] mt-2 text-xs italic">
              ⚠️ À partir de 150€, un devis vous sera envoyé avant toute intervention.
            </p>
          </div>
        </div>
      </section>

      {/* Deux blocs types de travaux */}
      <section className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-4">

          {/* Bloc 1 : Depannage en urgence */}
          <div className="bg-white rounded-xl border border-[#E9ECEF] shadow-sm overflow-hidden hover:border-red-400 hover:shadow-md transition-all duration-200 flex flex-col">
            {/* En-tete rouge */}
            <div className="bg-[#DC3545] px-4 py-3 flex items-center gap-3">
              <div className="bg-white/20 rounded-lg p-2">
                <span className="text-2xl">🚨</span>
              </div>
              <div>
                <h3 className="text-white font-bold text-base leading-tight">{t('expressPages.landing.depannageTitle')}</h3>
                <p className="text-red-100 text-xs mt-0.5 flex items-center gap-1">
                  <svg className="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t('expressPages.landing.depannageSubtitle')}
                </p>
              </div>
            </div>

            {/* Corps */}
            <div className="px-4 py-3 flex flex-col flex-1">
              {/* Accroche */}
              <p className="text-[#2C3E50] font-semibold text-sm text-center mb-1">Un problème urgent ?</p>
              <p className="text-[#6C757D] text-xs text-center mb-4">
                Intervention rapide par un artisan qualifié, disponible près de chez vous.
              </p>

              {/* Grille de cartes icones - Depannage en urgence : meme dimensionnement que travaux (grid-cols-3) */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                {URGENCE_ITEMS.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => router.push(`/petits-travaux-express/recherche?typeTravaux=depannage-urgence&categorie=${item.value}`)}
                    className="flex flex-col items-center justify-center gap-1.5 h-[104px] bg-red-50 hover:bg-red-100 border border-red-100 hover:border-red-300 rounded-xl px-2 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm group"
                  >
                    <span className="w-12 h-12 flex items-center justify-center text-4xl leading-none group-hover:scale-110 transition-transform duration-150">{item.icon}</span>
                    <span className="text-[11px] font-semibold text-[#2C3E50] text-center leading-tight">{item.label}</span>
                  </button>
                ))}
              </div>

              {/* CTA - mt-4 fixe identique au bloc travaux */}
              <button
                onClick={() => router.push('/petits-travaux-express/recherche?typeTravaux=depannage-urgence')}
                className="w-full mt-4 bg-[#DC3545] hover:bg-[#C82333] text-white font-bold py-3 rounded-xl text-sm transition-colors duration-200 flex items-center justify-center gap-2"
              >
                {t('expressPages.landing.depannageCTA')}
              </button>
            </div>
          </div>

          {/* Bloc 2 : Petits travaux & maintenance */}
          <div className="bg-white rounded-xl border border-[#E9ECEF] shadow-sm overflow-hidden hover:border-[#FF6B00] hover:shadow-md transition-all duration-200 flex flex-col">
            {/* En-tete orange */}
            <div className="bg-[#FF6B00] px-4 py-3 flex items-center gap-3">
              <div className="bg-white/20 rounded-lg p-2">
                <span className="text-2xl">🛠️</span>
              </div>
              <div>
                <h3 className="text-white font-bold text-base leading-tight">{t('expressPages.landing.petitsTravauxTitle')}</h3>
                <p className="text-orange-100 text-xs mt-0.5 flex items-center gap-1">
                  <svg className="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t('expressPages.landing.petitsTravauxSubtitle')}
                </p>
              </div>
            </div>

            {/* Corps */}
            <div className="px-4 py-3 flex flex-col flex-1">
              {/* Accroche */}
              <p className="text-[#2C3E50] font-semibold text-sm text-center mb-1">Un projet ou des travaux à réaliser ?</p>
              <p className="text-[#6C757D] text-xs text-center mb-4">
                Trouvez un artisan disponible près de chez vous pour vos travaux du quotidien.
              </p>

              {/* Grille de cartes icones - Petits travaux & maintenance : 6 categories sur 2 lignes de 3 */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                {TRAVAUX_ITEMS.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => router.push(`/petits-travaux-express/recherche?typeTravaux=petits-travaux-maintenance&categorie=${item.value}`)}
                    className="flex flex-col items-center justify-center gap-1.5 h-[104px] bg-orange-50 hover:bg-orange-100 border border-orange-100 hover:border-orange-300 rounded-xl px-2 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm group"
                  >
                    <span className="w-12 h-12 flex items-center justify-center text-4xl leading-none group-hover:scale-110 transition-transform duration-150">{item.icon}</span>
                    <span className="text-[11px] font-semibold text-[#2C3E50] text-center leading-tight">{item.label}</span>
                  </button>
                ))}
              </div>

              {/* CTA - mt-4 fixe identique au bloc urgence */}
              <button
                onClick={() => router.push('/petits-travaux-express/recherche?typeTravaux=petits-travaux-maintenance')}
                className="w-full mt-4 bg-[#FF6B00] hover:bg-[#E56100] text-white font-bold py-3 rounded-xl text-sm transition-colors duration-200 flex items-center justify-center gap-2"
              >
                {t('expressPages.landing.petitsTravauxCTA')}
              </button>
            </div>
          </div>

        </div>
      </section>

      {/* Comment ca marche */}
      <section className="container mx-auto px-4 pb-14">
        <div className="bg-white rounded-2xl border border-[#E9ECEF] shadow-sm p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold text-[#2C3E50] text-center mb-10">
            {t('expressPages.landing.howItWorksTitle')}
          </h2>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Ligne de connexion - visible uniquement desktop */}
            <div className="hidden md:block absolute top-10 left-[calc(16.67%+1.5rem)] right-[calc(16.67%+1.5rem)] h-0.5 bg-[#E9ECEF] z-0" />

            {steps.map((step, i) => (
              <div key={step.number} className="relative z-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-[#FF6B00] flex items-center justify-center shadow-md mb-5">
                  {step.icon}
                </div>
                <div className="absolute top-0 right-[calc(50%-1rem)] -translate-y-1 bg-[#2C3E50] text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                  {step.number}
                </div>
                <h3 className="font-bold text-[#2C3E50] text-lg mb-2">{step.title}</h3>
                <p className="text-[#6C757D] text-sm leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>

        </div>
      </section>

    </main>
  );
}
