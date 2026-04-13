'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

// ─────────────────────────────────────────────────────────────────────────────
// Page intermédiaire : choix du type de recherche
//
// Accessible depuis le dashboard client via "Rechercher un artisan".
// Propose deux options :
//   - Travaux standard  → /recherche?from=dashboard
//   - Travaux en urgence → /petits-travaux-express
// ─────────────────────────────────────────────────────────────────────────────

export default function ChoisirTypeTravauxPage() {
  const router = useRouter();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── En-tête bleu avec retour (identique à /recherche?from=dashboard) ── */}
      <header className="bg-[#2C3E50] text-white py-8">
        <div className="container mx-auto px-4">
          {/* Bouton retour vers le dashboard */}
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-white hover:text-[#FF6B00] mb-4"
            aria-label="Retour au tableau de bord"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour au tableau de bord
          </button>

          {/* Titre et sous-titre */}
          <div>
            <h1 className="text-3xl font-bold">Trouver un artisan</h1>
            <p className="text-gray-300 mt-2">Quel type de travaux souhaitez-vous réaliser ?</p>
          </div>
        </div>
      </header>

      {/* ── Contenu principal ────────────────────────────────────────── */}
      <main className="flex-1 relative flex flex-col items-center justify-start px-4 pt-8 pb-12">

        {/* Image de fond — balise img native pour rendu sans flou Next.js */}
        <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none z-0" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/Trv_urgence_std.png"
            alt=""
            className="w-full h-full object-cover object-center"
            style={{ imageRendering: 'crisp-edges' }}
          />
        </div>

        {/* Vagues SVG décoratives — bas de page (identique au dashboard) */}
        <svg
          className="absolute bottom-0 left-0 w-full pointer-events-none z-0"
          viewBox="0 0 1440 180"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M0,120 C200,160 400,60 600,100 C800,140 1000,80 1200,110 C1320,130 1400,100 1440,90 L1440,180 L0,180 Z"
            fill="#2C3E50"
            fillOpacity="0.08"
          />
        </svg>
        <svg
          className="absolute bottom-0 left-0 w-full pointer-events-none z-0"
          viewBox="0 0 1440 140"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M0,80 C180,40 360,120 600,80 C840,40 1100,110 1300,70 C1380,50 1420,65 1440,60 L1440,140 L0,140 Z"
            fill="#2C3E50"
            fillOpacity="0.13"
          />
        </svg>

        {/* Contenu au-dessus des vagues */}
        <div className="relative z-10 w-full flex flex-col items-center">

          {/* ── Cartes de choix ─────────────────────────────────────────── */}
          <div className="grid md:grid-cols-2 gap-8 w-full max-w-5xl">

          {/* Option 1 : Travaux standard */}
          <Link href="/recherche?from=dashboard">
            <div className="
              group bg-white/80 backdrop-blur-sm rounded-2xl shadow-md p-10 cursor-pointer
              border-2 border-transparent
              hover:border-[#FF6B00] hover:shadow-xl
              transition-all duration-200
              flex flex-col items-center text-center gap-4
            ">
              {/* Icône calendrier / travaux planifiés */}
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center group-hover:bg-[#FF6B00] transition-colors duration-200">
                <svg
                  className="w-8 h-8 text-[#FF6B00] group-hover:text-white transition-colors duration-200"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>

              <div>
                {/* Titre de l'option */}
                <h2 className="text-xl font-bold text-[#2C3E50] mb-2">
                  Travaux standard
                </h2>
                {/* Description */}
                <p className="text-[#6C757D] text-sm leading-relaxed">
                  Planifiez vos travaux à votre rythme. Comparez les devis d'artisans qualifiés et choisissez le meilleur professionnel pour votre projet.
                </p>
              </div>

              {/* Badge délai */}
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 text-[#FF6B00] text-xs font-semibold">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Sous quelques jours
              </span>
            </div>
          </Link>

          {/* Option 2 : Travaux en urgence */}
          <Link href="/petits-travaux-express">
            <div className="
              group bg-white/80 backdrop-blur-sm rounded-2xl shadow-md p-10 cursor-pointer
              border-2 border-transparent
              hover:border-[#DC3545] hover:shadow-xl
              transition-all duration-200
              flex flex-col items-center text-center gap-4
            ">
              {/* Icône éclair / urgence */}
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center group-hover:bg-[#DC3545] transition-colors duration-200">
                <svg
                  className="w-8 h-8 text-[#DC3545] group-hover:text-white transition-colors duration-200"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>

              <div>
                {/* Titre de l'option */}
                <h2 className="text-xl font-bold text-[#2C3E50] mb-2">
                  Travaux en urgence
                </h2>
                {/* Description */}
                <p className="text-[#6C757D] text-sm leading-relaxed">
                  Besoin d'une intervention rapide ? Trouvez un artisan disponible immédiatement pour vos urgences : fuite, panne électrique, serrurerie...
                </p>
              </div>

              {/* Badge urgence */}
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-[#DC3545] text-xs font-semibold">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Intervention rapide
              </span>
            </div>
          </Link>

        </div>

        </div>{/* fin div z-10 */}

      </main>

    </div>
  );
}
