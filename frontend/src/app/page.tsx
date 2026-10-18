'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { BadgeCheck, CalendarClock, CalendarDays, Check, Hammer, Lock, MapPin, Radar, Receipt, Repeat, Search, ShieldCheck, Star, Wrench } from 'lucide-react';
import { buttonClasses } from '@/components/ui';
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

  // Cartes "Vos garanties" (contenu traduit inchangé)
  const garanties = [
    { href: '/confiance/paiement-securise', icon: Lock, tone: 'bg-green-50 text-green-700', title: 'home.securePayment', items: ['home.securePaymentItem1', 'home.securePaymentItem2', 'home.securePaymentItem3'] },
    { href: '/confiance/verification-artisans', icon: BadgeCheck, tone: 'bg-blue-50 text-blue-700', title: 'home.verifiedArtisans', items: ['home.verifiedArtisansItem1', 'home.verifiedArtisansItem2', 'home.verifiedArtisansItem3'] },
    { href: '/confiance/planning-flexibilite', icon: CalendarClock, tone: 'bg-brand-50 text-brand-700', title: 'home.flexiblePlanning', items: ['home.flexiblePlanningItem1', 'home.flexiblePlanningItem2', 'home.flexiblePlanningItem3'] },
    { href: '/confiance/devis-gratuits', icon: Receipt, tone: 'bg-green-50 text-green-700', title: 'home.freeQuotes', items: ['home.freeQuotesItem1', 'home.freeQuotesItem2', 'home.freeQuotesItem3'] },
    { href: '/petits-travaux', icon: Wrench, tone: 'bg-amber-50 text-amber-700', title: 'home.quickWorks', items: ['home.quickWorksItem1', 'home.quickWorksItem2', 'home.quickWorksItem3'] },
    { href: '/confiance/avis-certifies', icon: Star, tone: 'bg-amber-50 text-amber-700', title: 'home.certifiedReviews', items: ['home.certifiedReviewsItem1', 'home.certifiedReviewsItem2', 'home.certifiedReviewsItem3'] },
    { href: '/confiance/protection-mediation', icon: ShieldCheck, tone: 'bg-red-50 text-red-700', title: 'home.protectionMediation', items: ['home.protectionMediationItem1', 'home.protectionMediationItem2', 'home.protectionMediationItem3'] },
  ];

  const fieldBox = 'flex h-12 items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 transition-colors focus-within:border-brand-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500/20 hover:border-slate-300';
  const fieldLabel = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500';
  const fieldControl = 'w-full min-w-0 bg-transparent text-[15px] font-medium text-slate-900 outline-none placeholder:text-slate-400';

  return (
    <div className="bg-white">
      {/* ── HERO + RECHERCHE ── */}
      <section id="recherche-section" className="relative isolate overflow-hidden bg-navy-900">
        <Image
          src="/images/artisan-banner.png"
          alt="Artisans au travail - BTP"
          fill
          className="-z-10 object-cover opacity-30"
          priority
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-navy-900/60 via-navy-900/80 to-navy-900" aria-hidden="true" />

        <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:px-8 lg:pb-24">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-inset ring-white/20">
              <ShieldCheck className="h-4 w-4 text-brand-400" aria-hidden="true" />
              Artisans vérifiés · Paiement protégé
            </p>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
              {t('home.heroTitle')}
            </h1>
            <p className="mt-4 max-w-2xl text-base text-navy-100 sm:text-lg">
              {t('home.heroSubtitle')}
            </p>
          </div>

          {/* Formulaire de recherche */}
          <div className="mt-8 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-black/5 sm:p-5">
            <style jsx>{`
              @keyframes blink-once {
                0%, 100% { border-color: #e2e8f0; }
                50% { border-color: #dc2626; background-color: #fef2f2; }
              }
              .animate-blink-once {
                animation: blink-once 0.6s ease-in-out 1;
              }
            `}</style>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
              {/* Type de travaux */}
              <div className="lg:col-span-3">
                <label className={fieldLabel}>{t('home.searchTypeOfWork')}</label>
                <div className={fieldBox}>
                  <Hammer className="h-5 w-5 flex-shrink-0 text-brand-600" aria-hidden="true" />
                  <select
                    className={`${fieldControl} cursor-pointer`}
                    value={searchForm.metier}
                    onChange={(e) => setSearchForm({...searchForm, metier: e.target.value as Categorie})}
                  >
                    {METIERS_AVEC_ICONES.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Ville */}
              <div className="relative lg:col-span-3">
                <label className={fieldLabel}>{t('home.searchLocation')}</label>
                <div className={`${fieldBox} ${blinkingFields.ville ? 'animate-blink-once' : ''}`}>
                  <MapPin className="h-5 w-5 flex-shrink-0 text-brand-600" aria-hidden="true" />
                  <input
                    type="text"
                    placeholder={t('home.locationPlaceholder')}
                    className={fieldControl}
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
                  <div className="absolute top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                    {villeSuggestions.map((suggestion, index) => (
                      <button
                        key={`${suggestion.nom}-${suggestion.codePostal}-${index}`}
                        type="button"
                        onClick={() => selectVille(suggestion)}
                        className="w-full px-4 py-2.5 text-left transition-colors hover:bg-slate-50"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-900">{suggestion.nom}</span>
                          <span className="text-sm text-slate-500">{suggestion.codePostal}</span>
                        </div>
                        <span className="text-xs text-slate-400">{t('home.department')} {suggestion.departement}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Rayon de recherche */}
              <div className="lg:col-span-2">
                <label className={fieldLabel}>{t('home.searchRadius')}</label>
                <div className={fieldBox}>
                  <Radar className="h-5 w-5 flex-shrink-0 text-brand-600" aria-hidden="true" />
                  <select
                    className={`${fieldControl} cursor-pointer`}
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
              <div className="lg:col-span-2">
                <label className={fieldLabel}>{t('home.searchDate')}</label>
                <div className={`${fieldBox} ${blinkingFields.date ? 'animate-blink-once' : ''}`}>
                  <CalendarDays className="h-5 w-5 flex-shrink-0 text-brand-600" aria-hidden="true" />
                  <input
                    type="date"
                    placeholder={t('home.datePlaceholder')}
                    className={fieldControl}
                    value={searchForm.date}
                    onChange={(e) => setSearchForm({...searchForm, date: e.target.value})}
                  />
                </div>
              </div>

              {/* Flexibilité */}
              <div className="lg:col-span-2">
                <label className={fieldLabel}>{t('home.flexibility')}</label>
                <div className={fieldBox}>
                  <Repeat className="h-5 w-5 flex-shrink-0 text-brand-600" aria-hidden="true" />
                  <select
                    className={`${fieldControl} cursor-pointer`}
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
              <div className="sm:col-span-2 lg:col-span-12 lg:flex lg:justify-end">
                <button
                  type="button"
                  onClick={handleSearch}
                  className={buttonClasses('primary', 'lg', 'w-full lg:w-auto lg:min-w-64')}
                >
                  <Search className="h-5 w-5" aria-hidden="true" />
                  {t('home.searchButton')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── VOS GARANTIES ── */}
      <section className="bg-slate-50 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">
              {t('home.whyChoose')}
            </h2>
            <p className="mt-4 text-base text-slate-600 sm:text-lg">
              {t('home.whyChooseSubtitle')}
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {garanties.map(({ href, icon: Icon, tone, title, items }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
              >
                <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${tone}`}>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-navy-900">{t(title)}</h3>
                <ul className="mt-3 flex-1 space-y-2 text-sm text-slate-600">
                  {items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-700" aria-hidden="true" />
                      <span>{t(item)}</span>
                    </li>
                  ))}
                </ul>
                <span className="mt-5 text-sm font-semibold text-brand-700 group-hover:underline">
                  {t('home.learnMore')}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── TÉMOIGNAGES ── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">Avis clients</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">
              Une plateforme qui inspire confiance dès les premiers écrans
            </h2>
            <p className="mt-4 text-slate-600">Ils ont trouvé leur artisan sur ArtisanDispo.</p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {testimonials.map((item) => (
              <figure key={item.author} className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="flex gap-0.5 text-amber-400" aria-label="5 étoiles sur 5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} className="h-4 w-4 fill-current" aria-hidden="true" />
                  ))}
                </div>
                <blockquote className="mt-4 flex-1 text-base leading-7 text-slate-700">“{item.quote}”</blockquote>
                <figcaption className="mt-6 text-sm font-semibold text-navy-900">{item.author}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA PARTICULIERS / ARTISANS ── */}
      <section className="pb-16 sm:pb-24">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 md:grid-cols-2 lg:px-8">
          <div className="rounded-2xl bg-navy-800 p-8 text-white sm:p-10">
            <h2 className="text-2xl font-bold sm:text-3xl">{t('home.areYouClient')}</h2>
            <p className="mt-3 text-navy-100">
              Décrivez votre projet, comparez les profils les plus pertinents et avancez avec plus de sérénité.
            </p>
            <Link
              href="/inscription?role=client"
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-lg bg-white px-6 font-semibold text-navy-800 transition-colors hover:bg-navy-50"
            >
              {t('home.createClientProfile')}
            </Link>
          </div>

          <div className="rounded-2xl bg-brand-700 p-8 text-white sm:p-10">
            <h2 className="text-2xl font-bold sm:text-3xl">{t('home.areYouArtisan')}</h2>
            <p className="mt-3 text-brand-50">
              Présentez votre savoir-faire avec une image plus premium et recevez des demandes mieux qualifiées.
            </p>
            <Link
              href="/inscription?role=artisan"
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-lg bg-white px-6 font-semibold text-brand-800 transition-colors hover:bg-brand-50"
            >
              {t('home.createArtisanProfile')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
