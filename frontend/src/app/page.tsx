'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui';
import type { Categorie } from '@/types/firestore';
import { METIERS_AVEC_ICONES } from '@/lib/constants/metiers';
import { fetchCategories } from '@/lib/firebase/category-service';

export default function Home() {
  const { t } = useLanguage();
  const router = useRouter();
  const [blinkingFields, setBlinkingFields] = useState<{ville: boolean, date: boolean}>({ ville: false, date: false });
  const [villeSuggestions, setVilleSuggestions] = useState<Array<{nom: string, codePostal: string, departement: string}>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedCodePostal, setSelectedCodePostal] = useState('');
  const [currentCardIndex, setCurrentCardIndex] = useState(0); // État pour le carrousel
  const carouselFlexRef = useRef<HTMLDivElement>(null);
  const [stepPx, setStepPx] = useState(0);
  const [cardWidthPx, setCardWidthPx] = useState(0);
  const [isCarouselHovered, setIsCarouselHovered] = useState(false);

  useEffect(() => {
    const measure = () => {
      if (carouselFlexRef.current) {
        // Mesurer le conteneur visible (parent du flex div = div overflow-hidden)
        const conteneurVisible = carouselFlexRef.current.parentElement;
        if (conteneurVisible) {
          const largeurConteneur = conteneurVisible.offsetWidth;
          const gap = 24; // gap-6 = 24px
          const cartesVisibles = 4;
          const largeurCarte = (largeurConteneur - (cartesVisibles - 1) * gap) / cartesVisibles;
          setCardWidthPx(largeurCarte);
          setStepPx(largeurCarte + gap); // un pas = largeur carte + gap
        }
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Auto-défilement toutes les 3.5 secondes, pause au survol
  useEffect(() => {
    if (isCarouselHovered) return;
    const MAX_INDEX = 3; // 7 cartes - 4 visibles = 3 positions
    const interval = setInterval(() => {
      setCurrentCardIndex(prev => (prev >= MAX_INDEX ? 0 : prev + 1));
    }, 3500);
    return () => clearInterval(interval);
  }, [isCarouselHovered]);
  
  // État du formulaire de recherche
  const [searchForm, setSearchForm] = useState({
    metier: 'plomberie' as Categorie,
    ville: '',
    date: new Date().toISOString().slice(0, 10),
    flexible: false,
    flexibiliteDays: '0',
    rayonMax: '10'
  });

  async function searchVilles(query: string) {
    if (query.length < 2) {
      setVilleSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/geo/communes?nom=${encodeURIComponent(query)}&fields=nom,codesPostaux,codeDepartement&boost=population&limit=10`
      );

      if (!response.ok) {
        setVilleSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      const data = await response.json();
      const suggestions = data.flatMap((commune: any) =>
        commune.codesPostaux.map((cp: string) => ({
          nom: commune.nom,
          codePostal: cp,
          departement: commune.codeDepartement
        }))
      );

      setVilleSuggestions(suggestions);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Erreur recherche villes:', error);
    }
  }

  function selectVille(suggestion: {nom: string, codePostal: string, departement: string}) {
    setSearchForm((prev) => ({ ...prev, ville: suggestion.nom }));
    setSelectedCodePostal(suggestion.codePostal);
    setShowSuggestions(false);
    setVilleSuggestions([]);
  }

  async function handleSearch() {
    // Vérifier quels champs sont vides
    const emptyFields = {
      ville: !searchForm.ville.trim(),
      date: !searchForm.date
    };

    // Si des champs sont vides, les faire clignoter
    if (emptyFields.ville || emptyFields.date) {
      setBlinkingFields(emptyFields);
      
      // Arrêter le clignotement après 600ms
      setTimeout(() => {
        setBlinkingFields({ ville: false, date: false });
      }, 600);
      
      return;
    }

    // Tous les champs sont remplis, continuer avec la recherche
    let codePostal = selectedCodePostal;
    if (!codePostal) {
      try {
        const response = await fetch(
          `/api/geo/communes?nom=${encodeURIComponent(searchForm.ville.trim())}&fields=codesPostaux&limit=1`
        );
        if (response.ok) {
          const data = await response.json();
          if (data.length > 0 && data[0].codesPostaux && data[0].codesPostaux.length > 0) {
            codePostal = data[0].codesPostaux[0];
            console.log(`📮 Code postal trouvé pour ${searchForm.ville}: ${codePostal}`);
          }
        }
      } catch (error) {
        console.error('Erreur récupération code postal:', error);
      }
    }

    // Construire l'URL avec les paramètres de recherche
    const params = new URLSearchParams({
      categorie: searchForm.metier,
      ville: searchForm.ville.trim(),
      codePostal: codePostal,
      dates: JSON.stringify([searchForm.date]),
      flexible: searchForm.flexible.toString(),
      flexibiliteDays: searchForm.flexibiliteDays,
      rayonMax: searchForm.rayonMax,
      urgence: 'normale'
    });

    // Rediriger vers la page de résultats
    router.push(`/resultats?${params.toString()}`);
  }

  const featuredArtisans = [
    {
      name: 'Atelier Morel',
      trade: 'Rénovation intérieure',
      city: 'Paris 16e',
      rating: '4,9',
      delay: 'Répond en 2 h',
      badge: 'Vérifié'
    },
    {
      name: 'Studio Bâtir',
      trade: 'Cuisine & menuiserie',
      city: 'Boulogne-Billancourt',
      rating: '4,8',
      delay: 'Répond aujourd’hui',
      badge: 'Premium'
    },
    {
      name: 'Maison Lenoir',
      trade: 'Peinture & finitions',
      city: 'Neuilly-sur-Seine',
      rating: '5,0',
      delay: 'Disponible cette semaine',
      badge: 'Top avis'
    },
  ];

  const testimonials = [
    {
      quote: 'J’ai trouvé un artisan fiable en quelques minutes, avec une présentation claire et rassurante.',
      author: 'Sonia, Paris',
    },
    {
      quote: 'Le parcours est fluide et on comprend tout de suite à qui l’on confie son projet.',
      author: 'Karim, Courbevoie',
    },
    {
      quote: 'Plus premium qu’un annuaire, plus simple qu’une agence : exactement ce qu’il fallait.',
      author: 'Julie, Boulogne',
    },
  ];

  const [urgenceCategories, setUrgenceCategories] = useState<{ value: string; icon: string; [key: string]: any }[]>([]);
  const [travauxCategories, setTravauxCategories] = useState<{ value: string; icon: string; [key: string]: any }[]>([]);

  useEffect(() => {
    async function loadCategories() {
      try {
        // fetchCategories retourne { urgence, travaux } en un seul appel
        const { urgence, travaux } = await fetchCategories();
        console.log('🚨 Catégories urgence récupérées :', urgence);
        console.log('🛠️ Catégories travaux récupérées :', travaux);
        setUrgenceCategories(urgence);
        setTravauxCategories(travaux);
      } catch (error) {
        console.error('Erreur lors du chargement des catégories :', error);
      }
    }
    loadCategories();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#2C3E50] via-[#3D5A73] to-[#2C3E50]">
      {/* Hero Section avec Bannière de Recherche */}
      <div id="recherche-section" className="container mx-auto px-4 py-16">
        {/* Bannière principale avec image de fond */}
        <div className="relative rounded-3xl overflow-hidden shadow-2xl mb-16 h-[500px]">
          {/* Image de fond */}
          <div className="absolute inset-0">
            <Image 
              src="/images/artisan-banner.png" 
              alt="Artisans au travail - BTP" 
              fill
              className="object-cover"
              priority
            />
            {/* Overlay gradient pour lisibilité */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#2C3E50]/90 via-[#2C3E50]/70 to-[#FF6B00]/80"></div>
          </div>

          <div className="relative z-10 py-12 px-6 md:px-12 h-full flex flex-col justify-center">
            {/* Slogan accrocheur */}
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-3 text-center drop-shadow-lg">
              {t('home.heroTitle')}
            </h1>
            <p className="text-center text-white text-lg mb-8 drop-shadow-md">
              {t('home.heroSubtitle')}
            </p>

            {/* Formulaire de recherche */}
            <div className="max-w-screen-xl mx-auto bg-white rounded-2xl shadow-2xl p-4">
              <div className="grid md:grid-cols-24 gap-2">
                {/* Type de travaux */}
                <div className="relative md:col-span-4">
                  <label className="block text-xs font-medium text-[#6C757D] mb-1 ml-3">
                    {t('home.searchTypeOfWork')}
                  </label>
                  <div className="flex items-center bg-[#F5F7FA] rounded-xl px-3 h-11 hover:bg-[#E9ECEF] transition-colors cursor-pointer">
                    <svg className="w-5 h-5 text-[#FF6B00] mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <select 
                      className="bg-transparent border-none outline-none w-full text-[#2C3E50] font-medium cursor-pointer"
                      value={searchForm.metier}
                      onChange={(e) => setSearchForm({...searchForm, metier: e.target.value as Categorie})}
                    >
                      {METIERS_AVEC_ICONES.map((m) => (
                        <option key={m.value} value={m.value}>{m.icon} {m.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Ville */}
              <div className="relative md:col-span-6">
                  <label className="block text-xs font-medium text-[#6C757D] mb-1 ml-3">{t('home.searchLocation')}</label>
                  <div className={`flex items-center rounded-xl px-3 h-11 transition-colors ${
                    blinkingFields.ville 
                      ? 'animate-blink-once' 
                      : 'bg-[#F5F7FA] hover:bg-[#E9ECEF]'
                  }`}>
                    <style jsx>{`
                      @keyframes blink-once {
                        0%, 100% { background-color: #F8F9FA; }
                        50% { background-color: #D1D5DB; }
                      }
                      .animate-blink-once {
                        animation: blink-once 0.6s ease-in-out 1;
                        background-color: #F8F9FA;
                      }
                    `}</style>
                    <svg className="w-5 h-5 text-[#FF6B00] mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <input 
                      type="text" 
                      placeholder={t('home.locationPlaceholder')}
                      className="bg-transparent border-none outline-none w-full text-[#2C3E50] font-medium placeholder-[#95A5A6]"
                      value={searchForm.ville}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setSearchForm({...searchForm, ville: nextValue});
                        setSelectedCodePostal('');
                        searchVilles(nextValue);
                      }}
                      onFocus={() => {
                        if (villeSuggestions.length > 0) setShowSuggestions(true);
                      }}
                    />
                  </div>

                  {/* Liste des suggestions */}
                  {showSuggestions && villeSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border-2 border-[#FF6B00] rounded-lg shadow-lg max-h-60 overflow-y-auto top-full">
                      {villeSuggestions.map((suggestion, index) => (
                        <button
                          key={`${suggestion.nom}-${suggestion.codePostal}-${index}`}
                          type="button"
                          onClick={() => selectVille(suggestion)}
                          className="w-full text-left px-4 py-3 hover:bg-[#FFF3E0] transition-colors border-b border-[#E9ECEF] last:border-b-0"
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-[#2C3E50]">{suggestion.nom}</span>
                            <span className="text-sm text-[#6C757D]">{suggestion.codePostal}</span>
                          </div>
                          <span className="text-xs text-[#95A5A6]">{t('home.department')} {suggestion.departement}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rayon de recherche */}
                <div className="relative md:col-span-3">
                  <label className="block text-xs font-medium text-[#6C757D] mb-1 ml-3">
                    {t('home.searchRadius')}
                  </label>
                  <div className="flex items-center bg-[#F5F7FA] rounded-xl px-3 h-11 hover:bg-[#E9ECEF] transition-colors cursor-pointer">
                    <svg className="w-5 h-5 text-[#FF6B00] mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c1.657 0 3-1.343 3-3S13.657 2 12 2 9 3.343 9 5s1.343 3 3 3zm0 0v14m6-6H6" />
                    </svg>
                    <select 
                      className="bg-transparent border-none outline-none w-full text-[#2C3E50] font-medium cursor-pointer"
                      value={searchForm.rayonMax}
                      onChange={(e) => setSearchForm({...searchForm, rayonMax: e.target.value})}
                    >
                      <option value="10">10 km</option>
                      <option value="20">20 km</option>
                      <option value="30">30 km</option>
                      <option value="50">50 km</option>
                      <option value="80">80 km</option>
                      <option value="100">100 km</option>
                    </select>
                  </div>
                </div>

                {/* Date souhaitée */}
                <div className="relative md:col-span-4">
                  <label className="block text-xs font-medium text-[#6C757D] mb-1 ml-3">
                    {t('home.searchDate')}
                  </label>
                  <div className={`flex items-center rounded-xl px-3 h-11 transition-colors ${
                    blinkingFields.date 
                      ? 'animate-blink-once' 
                      : 'bg-[#F5F7FA] hover:bg-[#E9ECEF]'
                  }`}>
                    <svg className="w-5 h-5 text-[#FF6B00] mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <input 
                      type="date" 
                      placeholder={t('home.datePlaceholder')} 
                      className="bg-transparent border-none outline-none w-full text-[#2C3E50] font-medium placeholder-[#95A5A6]"
                      value={searchForm.date}
                      onChange={(e) => setSearchForm({...searchForm, date: e.target.value})}
                    />
                  </div>
                </div>

                {/* Flexibilité */}
                <div className="relative md:col-span-3">
                  <label className="block text-xs font-medium text-[#6C757D] mb-1 ml-3">
                    {t('home.flexibility')}
                  </label>
                  <div className="flex items-center bg-[#F5F7FA] rounded-xl px-3 h-11 hover:bg-[#E9ECEF] transition-colors cursor-pointer">
                    <svg className="w-5 h-5 text-[#FF6B00] mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    <select 
                      className="bg-transparent border-none outline-none w-full text-[#2C3E50] font-medium cursor-pointer"
                      value={searchForm.flexibiliteDays}
                      onChange={(e) => {
                        setSearchForm({...searchForm, flexible: e.target.value !== '0', flexibiliteDays: e.target.value});
                      }}
                    >
                      <option value="0">{t('home.flexibilityOption0')}</option>
                      <option value="1">{t('home.flexibilityOption1')}</option>
                      <option value="3">{t('home.flexibilityOption3')}</option>
                      <option value="7">{t('home.flexibilityOption7')}</option>
                      <option value="14">{t('home.flexibilityOption14')}</option>
                    </select>
                  </div>
                </div>

                {/* Bouton Rechercher */}
                <div className="relative min-w-0 md:col-span-3">
                  <label className="block text-xs font-medium text-[#6C757D] mb-1 ml-3">&nbsp;</label>
                  <button 
                    onClick={handleSearch}
                    className="w-full h-11 bg-[#FF6B00] hover:bg-[#E56100] text-white font-bold rounded-xl px-6 transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center"
                  >
                    {t('home.searchButton')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Nouvelle section : Vos garanties ArtisanDispo */}
        <div className="mt-24 mb-8">
          <div className="text-center mb-12">
            <h2 className="text-5xl md:text-6xl font-extrabold text-[#2C3E50] mb-6 leading-tight">
              {t('home.whyChoose')}
            </h2>
            <p className="text-lg md:text-xl font-semibold text-[#FF8C42] max-w-4xl mx-auto leading-relaxed">
              {t('home.whyChooseSubtitle')}
            </p>
          </div>

          {/* Carrousel de cartes avec navigation */}
          <div
            className="relative max-w-7xl mx-auto px-14"
            onMouseEnter={() => setIsCarouselHovered(true)}
            onMouseLeave={() => setIsCarouselHovered(false)}
          >
            {/* Bouton flèche gauche */}
            <button
              onClick={() => setCurrentCardIndex(Math.max(0, currentCardIndex - 1))}
              disabled={currentCardIndex === 0}
              className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white shadow-xl rounded-full p-3 hover:bg-[#FF6B00] hover:text-white transition-all duration-300 ${
                currentCardIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'opacity-100 hover:scale-110'
              }`}
              aria-label={t('home.previousCard')}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Conteneur de défilement - pt-3 pour que hover:-translate-y-2 ne soit pas coupé */}
            <div className="overflow-hidden pt-3 -mt-3">
              <div 
                ref={carouselFlexRef}
                className="flex transition-transform duration-500 ease-in-out gap-6"
                style={{ 
                  transform: `translateX(-${currentCardIndex * stepPx}px)` 
                }}
              >
                {/* Carte 1 : Paiement sécurisé */}
                <Link href="/confiance/paiement-securise" className="group flex-shrink-0" style={{ width: cardWidthPx ? `${cardWidthPx}px` : undefined }}>
                  <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-2xl transition-all duration-300 cursor-pointer h-full border-2 border-transparent hover:border-[#FF6B00] transform hover:-translate-y-2">
                    <div className="w-16 h-16 bg-[#E8F5E9] rounded-full flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                      <span className="text-4xl">🔒</span>
                    </div>
                    <h3 className="text-lg font-bold text-[#2C3E50] mb-3 text-center">
                      {t('home.securePayment')}
                    </h3>
                    <ul className="text-sm text-[#6C757D] space-y-2 mb-4">
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.securePaymentItem1')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.securePaymentItem2')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.securePaymentItem3')}</span>
                      </li>
                    </ul>
                    <div className="text-center">
                      <span className="text-[#FF6B00] font-semibold text-sm group-hover:underline">
                        {t('home.learnMore')}
                      </span>
                    </div>
                  </div>
                </Link>

                {/* Carte 2 : Vérification artisans */}
                <Link href="/confiance/verification-artisans" className="group flex-shrink-0" style={{ width: cardWidthPx ? `${cardWidthPx}px` : undefined }}>
                  <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-2xl transition-all duration-300 cursor-pointer h-full border-2 border-transparent hover:border-[#FF6B00] transform hover:-translate-y-2">
                    <div className="w-16 h-16 bg-[#E3F2FD] rounded-full flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                      <span className="text-4xl">✓</span>
                    </div>
                    <h3 className="text-lg font-bold text-[#2C3E50] mb-3 text-center">
                      {t('home.verifiedArtisans')}
                    </h3>
                    <ul className="text-sm text-[#6C757D] space-y-2 mb-4">
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.verifiedArtisansItem1')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.verifiedArtisansItem2')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.verifiedArtisansItem3')}</span>
                      </li>
                    </ul>
                    <div className="text-center">
                      <span className="text-[#FF6B00] font-semibold text-sm group-hover:underline">
                        {t('home.learnMore')}
                      </span>
                    </div>
                  </div>
                </Link>

                {/* Carte 3 : Planning flexible */}
                <Link href="/confiance/planning-flexibilite" className="group flex-shrink-0" style={{ width: cardWidthPx ? `${cardWidthPx}px` : undefined }}>
                  <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-2xl transition-all duration-300 cursor-pointer h-full border-2 border-transparent hover:border-[#FF6B00] transform hover:-translate-y-2">
                    <div className="w-16 h-16 bg-[#FFF3E0] rounded-full flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                      <span className="text-4xl">📅</span>
                    </div>
                    <h3 className="text-lg font-bold text-[#2C3E50] mb-3 text-center">
                      {t('home.flexiblePlanning')}
                    </h3>
                    <ul className="text-sm text-[#6C757D] space-y-2 mb-4">
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.flexiblePlanningItem1')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.flexiblePlanningItem2')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.flexiblePlanningItem3')}</span>
                      </li>
                    </ul>
                    <div className="text-center">
                      <span className="text-[#FF6B00] font-semibold text-sm group-hover:underline">
                        {t('home.learnMore')}
                      </span>
                    </div>
                  </div>
                </Link>

                {/* Carte 4 : Devis gratuits */}
                <Link href="/confiance/devis-gratuits" className="group flex-shrink-0" style={{ width: cardWidthPx ? `${cardWidthPx}px` : undefined }}>
                  <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-2xl transition-all duration-300 cursor-pointer h-full border-2 border-transparent hover:border-[#FF6B00] transform hover:-translate-y-2">
                    <div className="w-16 h-16 bg-[#E8F5E9] rounded-full flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                      <span className="text-4xl">💰</span>
                    </div>
                    <h3 className="text-lg font-bold text-[#2C3E50] mb-3 text-center">
                      {t('home.freeQuotes')}
                    </h3>
                    <ul className="text-sm text-[#6C757D] space-y-2 mb-4">
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.freeQuotesItem1')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.freeQuotesItem2')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.freeQuotesItem3')}</span>
                      </li>
                    </ul>
                    <div className="text-center">
                      <span className="text-[#FF6B00] font-semibold text-sm group-hover:underline">
                        {t('home.learnMore')}
                      </span>
                    </div>
                  </div>
                </Link>

                {/* Carte 5 : Petits travaux */}
                <Link href="/petits-travaux" className="group flex-shrink-0" style={{ width: cardWidthPx ? `${cardWidthPx}px` : undefined }}>
                  <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-2xl transition-all duration-300 cursor-pointer h-full border-2 border-transparent hover:border-[#FF6B00] transform hover:-translate-y-2">
                    <div className="w-16 h-16 bg-[#FFF9E6] rounded-full flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                      <span className="text-4xl">🔧</span>
                    </div>
                    <h3 className="text-lg font-bold text-[#2C3E50] mb-3 text-center">
                      {t('home.quickWorks')}
                    </h3>
                    <ul className="text-sm text-[#6C757D] space-y-2 mb-4">
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.quickWorksItem1')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.quickWorksItem2')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.quickWorksItem3')}</span>
                      </li>
                    </ul>
                    <div className="text-center">
                      <span className="text-[#FF6B00] font-semibold text-sm group-hover:underline">
                        {t('home.learnMore')}
                      </span>
                    </div>
                  </div>
                </Link>

                {/* Carte 6 : Avis certifiés */}
                <Link href="/confiance/avis-certifies" className="group flex-shrink-0" style={{ width: cardWidthPx ? `${cardWidthPx}px` : undefined }}>
                  <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-2xl transition-all duration-300 cursor-pointer h-full border-2 border-transparent hover:border-[#FF6B00] transform hover:-translate-y-2">
                    <div className="w-16 h-16 bg-[#FFFBF0] rounded-full flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                      <span className="text-4xl">⭐</span>
                    </div>
                    <h3 className="text-lg font-bold text-[#2C3E50] mb-3 text-center">
                      {t('home.certifiedReviews')}
                    </h3>
                    <ul className="text-sm text-[#6C757D] space-y-2 mb-4">
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.certifiedReviewsItem1')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.certifiedReviewsItem2')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.certifiedReviewsItem3')}</span>
                      </li>
                    </ul>
                    <div className="text-center">
                      <span className="text-[#FF6B00] font-semibold text-sm group-hover:underline">
                        {t('home.learnMore')}
                      </span>
                    </div>
                  </div>
                </Link>

                {/* Carte 7 : Protection & médiation */}
                <Link href="/confiance/protection-mediation" className="group flex-shrink-0" style={{ width: cardWidthPx ? `${cardWidthPx}px` : undefined }}>
                  <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-2xl transition-all duration-300 cursor-pointer h-full border-2 border-transparent hover:border-[#FF6B00] transform hover:-translate-y-2">
                    <div className="w-16 h-16 bg-[#FFEBEE] rounded-full flex items-center justify-center mb-4 mx-auto group-hover:scale-110 transition-transform">
                      <span className="text-4xl">🛡️</span>
                    </div>
                    <h3 className="text-lg font-bold text-[#2C3E50] mb-3 text-center">
                      {t('home.protectionMediation')}
                    </h3>
                    <ul className="text-sm text-[#6C757D] space-y-2 mb-4">
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.protectionMediationItem1')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.protectionMediationItem2')}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#28A745] mt-0.5">✓</span>
                        <span>{t('home.protectionMediationItem3')}</span>
                      </li>
                    </ul>
                    <div className="text-center">
                      <span className="text-[#FF6B00] font-semibold text-sm group-hover:underline">
                        {t('home.learnMore')}
                      </span>
                    </div>
                  </div>
                </Link>
              </div>
            </div>

            {/* Bouton flèche droite */}
            <button
              onClick={() => setCurrentCardIndex(Math.min(3, currentCardIndex + 1))}
              disabled={currentCardIndex === 3}
              className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white shadow-xl rounded-full p-3 hover:bg-[#FF6B00] hover:text-white transition-all duration-300 ${
                currentCardIndex === 3 ? 'opacity-30 cursor-not-allowed' : 'opacity-100 hover:scale-110'
              }`}
              aria-label={t('home.nextCard')}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Indicateurs de position - 4 points pour 4 positions (7 cartes, 4 visibles) */}
            <div className="flex justify-center gap-2 mt-8">
              {[0, 1, 2, 3].map((idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentCardIndex(idx)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    currentCardIndex === idx ? 'w-8 bg-[#FF6B00]' : 'w-2 bg-gray-300 hover:bg-gray-400'
                  }`}
                  aria-label={`Voir cartes ${idx + 1} à ${idx + 3}`}
                />
              ))}
            </div>
          </div>
        </div>


        <section className="mb-20 mt-20">
          <div className="mb-10 text-center">
            <div className="premium-pill mx-auto mb-4 w-fit text-xs font-semibold uppercase tracking-[0.18em]">Preuve sociale</div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">Une plateforme qui inspire confiance dès les premiers écrans</h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-600">Des retours clients courts, lisibles et premium renforcent la crédibilité et la conversion.</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.map((item) => (
              <div key={item.author} className="premium-card rounded-[28px] p-8">
                <div className="mb-5 flex items-center gap-1 text-orange-500">
                  <span>★</span><span>★</span><span>★</span><span>★</span><span>★</span>
                </div>
                <p className="text-base leading-7 text-slate-700">“{item.quote}”</p>
                <p className="mt-6 text-sm font-semibold text-slate-900">{item.author}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Double - Artisans et Particuliers */}
        <div className="mt-20 grid md:grid-cols-2 gap-6">
          {/* CTA Particuliers */}
          <div className="bg-gradient-to-r from-[#2C3E50] to-[#3D5A73] rounded-2xl p-8 md:p-12 text-white">
            <div className="text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                {t('home.areYouClient')}
              </h2>
              <p className="text-lg mb-6 text-[#E9ECEF]">
                Décrivez votre projet, comparez les profils les plus pertinents et avancez avec plus de sérénité.
              </p>
              <Link href="/inscription?role=client">
                <button className="bg-white text-[#2C3E50] hover:bg-[#E9ECEF] hover:text-[#1A3A5C] px-6 py-3 text-lg font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl">
                  {t('home.createClientProfile')}
                </button>
              </Link>
            </div>
          </div>

          {/* CTA Artisans */}
          <div className="bg-gradient-to-r from-[#FF6B00] to-[#E56100] rounded-2xl p-8 md:p-12 text-white">
            <div className="text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                {t('home.areYouArtisan')}
              </h2>
              <p className="text-lg mb-6 text-orange-100">
                Présentez votre savoir-faire avec une image plus premium et recevez des demandes mieux qualifiées.
              </p>
              <Link href="/inscription?role=artisan">
                <button className="bg-white text-[#FF6B00] hover:bg-[#E9ECEF] hover:text-[#E56100] px-6 py-3 text-lg font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl">
                  {t('home.createArtisanProfile')}
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
