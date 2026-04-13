'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { matchArtisansExpress } from '@/lib/firebase/matching-service';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { getUserById } from '@/lib/firebase/user-service';
import type { MatchingResult, User, Categorie } from '@/types/firestore';
import {
  EXPRESS_WORK_TAXONOMY,
  getExpressCategories,
  getExpressCategorieOption,
  type TypeTravauxExpress,
} from '@/lib/express-work-taxonomy';

interface VilleSuggestion {
  nom: string;
  codePostal: string;
  departement: string;
}

export default function RechercheExpressPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: firebaseUser, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [userData, setUserData] = useState<User | null>(null);

  // Paramètres URL
  const typeTravauxParam = (searchParams.get('typeTravaux') as TypeTravauxExpress) || 'depannage-urgence';
  // Verrouiller le type si passé explicitement en URL (depuis la landing page)
  const isTypeLocked = !!searchParams.get('typeTravaux');

  // Rediriger vers la landing si aucun typeTravaux en URL
  useEffect(() => {
    if (!searchParams.get('typeTravaux')) {
      router.replace('/petits-travaux-express');
    }
  }, []);
  const categorieParam = searchParams.get('categorie') || '';
  const sousCategorieParam = searchParams.get('sousCategorie') || '';
  const villeParam = searchParams.get('ville') || '';
  const codePostalParam = searchParams.get('codePostal') || '';
  const rayonMaxParam = Number(searchParams.get('rayonMax')) || 20;

  // États du formulaire
  const typeProjet = 'express'; // Toujours express sur cette page
  const [typeTravaux, setTypeTravaux] = useState<TypeTravauxExpress>(typeTravauxParam);
  const [categorie, setCategorie] = useState(categorieParam);
  const [sousCategorie, setSousCategorie] = useState(sousCategorieParam);
  const [ville, setVille] = useState(villeParam);
  const [codePostal, setCodePostal] = useState(codePostalParam);
  const [rayonMax, setRayonMax] = useState(rayonMaxParam);

  const categorieOptions = getExpressCategories(typeTravaux);
  const selectedCategorie = categorieOptions.find((cat) => cat.value === categorie);

  // Recherche de villes
  const [villeSuggestions, setVilleSuggestions] = useState<VilleSuggestion[]>([]);
  const [activeField, setActiveField] = useState<'ville' | 'codePostal' | null>(null);

  // Si des paramètres de recherche sont déjà dans l'URL (retour depuis profil artisan),
  // on démarre directement en mode "recherche en cours" pour éviter le flash du formulaire vide.
  const hasSearchParams = !!(categorieParam && villeParam && codePostalParam);

  // Résultats
  const [results, setResults] = useState<MatchingResult[]>([]);
  const [loading, setLoading] = useState(hasSearchParams);
  const [searched, setSearched] = useState(hasSearchParams);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const hasAutoSearched = useRef(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const resultsPerPage = 10;
  const totalPages = Math.ceil(results.length / resultsPerPage);
  const startIndex = (currentPage - 1) * resultsPerPage;
  const endIndex = startIndex + resultsPerPage;
  const currentResults = results.slice(startIndex, endIndex);

  useEffect(() => {
    loadUserData();
  }, [firebaseUser]);

  // Auto-relance la recherche si les paramètres URL sont présents (retour depuis profil artisan)
  useEffect(() => {
    if (!hasAutoSearched.current && categorieParam && villeParam && codePostalParam) {
      hasAutoSearched.current = true;
      performSearch({
        typeTravaux: typeTravauxParam,
        categorie: categorieParam,
        sousCategorie: sousCategorieParam,
        ville: villeParam,
        codePostal: codePostalParam,
        rayonMax: rayonMaxParam,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const isValidCategorie = categorieOptions.some((cat) => cat.value === categorie);
    if (!isValidCategorie) {
      setCategorie('');
      setSousCategorie('');
      return;
    }

    if (selectedCategorie && !selectedCategorie.sousCategories.some((sub) => sub.value === sousCategorie)) {
      setSousCategorie('');
    }
  }, [typeTravaux, categorie, sousCategorie]);

  async function loadUserData() {
    if (firebaseUser) {
      try {
        const data = await getUserById(firebaseUser.uid);
        setUserData(data);
      } catch (error) {
        console.error('Erreur chargement user:', error);
      }
    }
  }

  async function searchVilles(query: string) {
    if (query.length < 2) {
      setVilleSuggestions([]);
      setActiveField(null);
      return;
    }

    try {
      const isNumeric = /^\d+$/.test(query);

      let url: string;
      if (isNumeric) {
        if (query.length <= 3) {
          // Code département partiel : recherche par codeDepartement (ex: "38", "75", "130" → tronqué à 2)
          const dep = query.slice(0, 2);
          url = `https://geo.api.gouv.fr/communes?codeDepartement=${encodeURIComponent(dep)}&fields=nom,codesPostaux,codeDepartement&boost=population&limit=15`;
        } else if (query.length === 5) {
          // Code postal complet
          url = `https://geo.api.gouv.fr/communes?codePostal=${encodeURIComponent(query)}&fields=nom,codesPostaux,codeDepartement&boost=population&limit=10`;
        } else {
          // Code postal partiel (4 chiffres) : on filtre côté client après
          const dep = query.slice(0, 2);
          url = `https://geo.api.gouv.fr/communes?codeDepartement=${encodeURIComponent(dep)}&fields=nom,codesPostaux,codeDepartement&boost=population&limit=50`;
        }
      } else {
        // Recherche par nom de commune
        url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&fields=nom,codesPostaux,codeDepartement&boost=population&limit=10`;
      }

      const response = await fetch(url);
      if (!response.ok) return;

      const data = await response.json();
      let suggestions: VilleSuggestion[] = data.flatMap((commune: any) =>
        commune.codesPostaux.map((cp: string) => ({
          nom: commune.nom,
          codePostal: cp,
          departement: commune.codeDepartement,
        }))
      );

      // Filtrer par préfixe si code postal partiel (3-4 chiffres)
      if (isNumeric && query.length >= 3 && query.length < 5) {
        suggestions = suggestions.filter(s => s.codePostal.startsWith(query));
      }

      setVilleSuggestions(suggestions.slice(0, 10));
    } catch (error) {
      console.error('Erreur recherche villes:', error);
    }
  }

  function selectVille(suggestion: VilleSuggestion) {
    setVille(suggestion.nom);
    setCodePostal(suggestion.codePostal);
    setActiveField(null);
    setVilleSuggestions([]);
  }

  async function performSearch(params: {
    typeTravaux: TypeTravauxExpress;
    categorie: string;
    sousCategorie: string;
    ville: string;
    codePostal: string;
    rayonMax: number;
  }) {
    setLoading(true);
    setSearched(true);
    setCurrentPage(1);

    const selectedCat = getExpressCategorieOption(params.typeTravaux, params.categorie);
    if (!selectedCat) {
      alert(t('expressPages.recherche.selectCategoryAlert'));
      setLoading(false);
      return;
    }

    // Mettre à jour l'URL avec les paramètres de recherche (permet le retour en arrière)
    const urlParams = new URLSearchParams({
      typeTravaux: params.typeTravaux,
      categorie: params.categorie,
      ville: params.ville,
      codePostal: params.codePostal,
      rayonMax: String(params.rayonMax),
    });
    if (params.sousCategorie) urlParams.set('sousCategorie', params.sousCategorie);
    router.replace(`/petits-travaux-express/recherche?${urlParams.toString()}`);

    try {
      // Géocodage de la ville (GeoJSON: coordinates = [longitude, latitude])
      const geoResponse = await fetch(
        `https://geo.api.gouv.fr/communes?codePostal=${params.codePostal}&fields=centre&limit=1`
      );
      const geoData = await geoResponse.json();

      if (geoData.length === 0) {
        alert(t('alerts.validation.cityNotFound'));
        setLoading(false);
        return;
      }

      // GeoJSON coordinates = [longitude, latitude]
      const [longitude, latitude] = geoData[0].centre.coordinates as [number, number];

      // Matching artisans express (catégorie + sous-catégorie + rayon)
      const matchResults = await matchArtisansExpress({
        typeTravaux: params.typeTravaux,
        categorie: params.categorie,
        sousCategorie: params.sousCategorie || undefined,
        categorieMetier: selectedCat.metier,
        ville: params.ville,
        codePostal: params.codePostal,
        coordonneesGPS: { latitude, longitude },
        rayonMax: params.rayonMax,
      });

      setResults(matchResults);
      // Auto-scroll vers les résultats sur mobile
      setTimeout(() => {
        if (window.innerWidth < 768) {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } catch (error) {
      console.error('Erreur matching:', error);
      alert(t('alerts.validation.searchError'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();

    if (!categorie || !ville || !codePostal) {
      alert(t('alerts.validation.fillRequired'));
      return;
    }

    await performSearch({ typeTravaux, categorie, sousCategorie, ville, codePostal, rayonMax });
  }

  async function handleDemanderDevis(artisanId: string) {
    if (authLoading) return; // Attendre Firebase

    if (!firebaseUser) {
      // Sauvegarder le contexte et rediriger vers inscription
      const context = {
        categorie: selectedCategorie?.metier || 'renovation',
        categorieExpress: categorie,
        sousCategorie,
        typeProjet: 'express',
        ville,
        codePostal,
        artisanId,
        typeTravaux,
      };
      sessionStorage.setItem('searchContext', JSON.stringify(context));
      router.push('/inscription?role=client');
      return;
    }

    // Créer une demande express directe
    const params = new URLSearchParams({
      artisanId,
      categorie: selectedCategorie?.metier || 'renovation',
      categorieExpress: categorie,
      ville,
      codePostal,
      typeTravaux,
    });
    if (sousCategorie) {
      params.append('sousCategorie', sousCategorie);
    }
    router.push(`/demande/express/nouvelle?${params.toString()}`);
  }

  async function handlePublierDemande() {
    if (!firebaseUser) {
      // Sauvegarder le contexte et rediriger vers inscription
      const context = {
        categorie: selectedCategorie?.metier || 'renovation',
        categorieExpress: categorie,
        sousCategorie,
        typeProjet: 'express',
        ville,
        codePostal,
        typeTravaux,
      };
      sessionStorage.setItem('searchContext', JSON.stringify(context));
      router.push('/inscription?role=client');
      return;
    }

    // Rediriger vers création demande express publique (sans artisan attribué)
    const params = new URLSearchParams({
      categorie: selectedCategorie?.metier || 'renovation',
      categorieExpress: categorie,
      ville,
      codePostal,
      typeTravaux,
    });
    if (sousCategorie) {
      params.append('sousCategorie', sousCategorie);
    }
    router.push(`/demande/express/nouvelle?${params.toString()}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F8F9FA] to-white">
      {/* Header */}
      {/* ── Breadcrumb ── */}
      <div className="bg-white border-b border-[#E9ECEF]">
        <div className="container mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-sm text-[#6C757D]">
            <Link href="/" className="hover:text-[#FF6B00] transition-colors flex items-center gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
              {t('expressPages.landing.breadcrumbHome')}
            </Link>
            <span>&gt;</span>
            <Link href="/petits-travaux-express" className="text-[#2C3E50] hover:text-[#FF6B00] transition-colors">
              {t('expressPages.landing.breadcrumb')}
            </Link>
            <span>&gt;</span>
            <span className="text-[#2C3E50] font-semibold">{t('expressPages.recherche.breadcrumb')}</span>
          </nav>
        </div>
      </div>

      {/* ── Bannière ── */}
      <section className={`text-white py-3 md:py-4 ${typeTravaux === 'depannage-urgence' ? 'bg-[#DC3545]' : 'bg-[#FF6B00]'}`}>
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-2xl md:text-3xl font-bold leading-tight">
            {typeTravaux === 'depannage-urgence'
              ? t('expressPages.recherche.bannerDepannage')
              : t('expressPages.recherche.bannerPetitsTravaux')}
          </h1>
          <p className={`text-sm md:text-base mt-1 ${typeTravaux === 'depannage-urgence' ? 'text-red-100' : 'text-[#4A4A4A]'}`}>
            {t('expressPages.recherche.bannerSubtitle')}
          </p>
        </div>
      </section>

      {/* Section formulaire — style hero pro */}
      <div className="relative bg-[#eef0f8] min-h-[620px] flex items-center overflow-hidden">

        {/* Vague décorative — couche arrière */}
        <svg
          className="absolute bottom-0 left-0 w-full pointer-events-none"
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

        {/* Vague décorative — couche avant */}
        <svg
          className="absolute bottom-0 left-0 w-full pointer-events-none"
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

        {/* Image plombier — droite, image complète visible */}
        <div className="absolute right-0 top-0 w-[38%] pointer-events-none">
          <img
            src="/images/Trv_urgence_std.png"
            alt=""
            aria-hidden="true"
            className="w-full h-auto object-contain object-bottom"
            style={{ filter: 'brightness(0.95)' }}
          />
          {/* Fondu bord gauche */}
          <div className="absolute inset-y-0 left-0 w-1/4" style={{ background: 'linear-gradient(to right, #f5f7fa, transparent)' }} />
          {/* Fondu bord haut */}
          <div className="absolute inset-x-0 top-0 h-16" style={{ background: 'linear-gradient(to bottom, #f5f7fa, transparent)' }} />
        </div>

        {/* Overlay radial central pour intégration naturelle */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(245,247,250,0.7) 0%, rgba(245,247,250,0.4) 50%, rgba(245,247,250,0.0) 100%)',
          }}
        />
        <div className="relative z-10 w-full container mx-auto px-4 py-12">
        <div className={searched ? 'md:flex md:gap-6 md:items-start' : 'max-w-xl mx-auto'}>
          <div className={searched ? 'md:w-96 md:flex-shrink-0 md:sticky md:top-6' : ''}>
          <form onSubmit={handleSearch} className="bg-white rounded-xl shadow-lg p-6 md:p-8 space-y-6">
            {/* Type de travaux */}
            <div>
              <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                {t('expressPages.recherche.typeLabel')} <span className="text-red-500">*</span>
              </label>
              {isTypeLocked ? (
                <div className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg bg-[#F8F9FA] text-[#2C3E50] font-semibold">
                  {typeTravaux === 'depannage-urgence' ? t('expressPages.recherche.depannageOption') : t('expressPages.recherche.petitsTravauxOption')}
                </div>
              ) : (
                <select
                  value={typeTravaux}
                  onChange={(e) => {
                    setTypeTravaux(e.target.value as TypeTravauxExpress);
                    setCategorie('');
                    setSousCategorie('');
                  }}
                  required
                  className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none transition-colors"
                >
                  <option value="depannage-urgence">{t('expressPages.recherche.depannageOption')}</option>
                  <option value="petits-travaux-maintenance">{t('expressPages.recherche.petitsTravauxOption')}</option>
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                {t('expressPages.recherche.categorieLabel')} <span className="text-red-500">*</span>
              </label>
              <select
                value={categorie}
                onChange={(e) => {
                  setCategorie(e.target.value);
                  setSousCategorie('');
                }}
                required
                className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none transition-colors"
              >
                <option value="">{t('expressPages.recherche.selectCategorie')}</option>
                {categorieOptions.map((cat) => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            {/* Sous-catégorie */}
            {selectedCategorie && (
              <div>
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                  {t('expressPages.recherche.sousCategorieLabel')}
                </label>
                <select
                  value={sousCategorie}
                  onChange={(e) => setSousCategorie(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none transition-colors"
                >
                  <option value="">{t('expressPages.recherche.allSubCategories')}</option>
                  {selectedCategorie.sousCategories.map((sc) => (
                    <option key={sc.value} value={sc.value}>
                      {sc.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Localisation */}
            <div className="grid grid-cols-1 gap-4">
              <div className="relative">
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                  {t('expressPages.recherche.villeLabel')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={ville}
                  autoComplete="off"
                  onChange={(e) => {
                    setVille(e.target.value);
                    setActiveField('ville');
                    searchVilles(e.target.value);
                  }}
                  onBlur={() => setTimeout(() => setActiveField(null), 200)}
                  required
                  placeholder={t('expressPages.recherche.villePlaceholder')}
                  className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none transition-colors"
                />
                
                {/* Suggestions de villes */}
                {activeField === 'ville' && villeSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border-2 border-[#E9ECEF] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {villeSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => selectVille(suggestion)}
                        className="w-full text-left px-4 py-2 hover:bg-[#F5F7FA] transition-colors"
                      >
                        <div className="font-semibold text-[#2C3E50]">{suggestion.nom}</div>
                        <div className="text-sm text-[#6C757D]">
                          {suggestion.codePostal} • Dép. {suggestion.departement}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                  {t('expressPages.recherche.codePostalLabel')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={codePostal}
                  autoComplete="off"
                  onChange={(e) => {
                    setCodePostal(e.target.value);
                    setActiveField('codePostal');
                    searchVilles(e.target.value);
                  }}
                  onBlur={() => setTimeout(() => setActiveField(null), 200)}
                  required
                  placeholder={t('expressPages.recherche.codePostalPlaceholder')}
                  pattern="[0-9]{5}"
                  className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none transition-colors"
                />

                {/* Suggestions depuis le champ code postal */}
                {activeField === 'codePostal' && villeSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border-2 border-[#E9ECEF] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {villeSuggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => selectVille(suggestion)}
                        className="w-full text-left px-4 py-2 hover:bg-[#F5F7FA] transition-colors"
                      >
                        <div className="font-semibold text-[#2C3E50]">{suggestion.nom}</div>
                        <div className="text-sm text-[#6C757D]">
                          {suggestion.codePostal} • Dép. {suggestion.departement}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Urgence auto */}
            <div>
              <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                {t('expressPages.recherche.urgenceLabel')}
              </label>
              <div className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg bg-[#F8F9FA] text-[#2C3E50] font-semibold">
                {EXPRESS_WORK_TAXONOMY[typeTravaux].urgenceLabel}
              </div>
            </div>

            {/* Rayon de recherche */}
            <div>
              <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                {t('expressPages.recherche.rayonLabel')} : {rayonMax} {t('expressPages.recherche.km')}
              </label>
              <input
                type="range"
                min="5"
                max="50"
                value={rayonMax}
                onChange={(e) => setRayonMax(parseInt(e.target.value))}
                className="w-full h-2 bg-[#E9ECEF] rounded-lg appearance-none cursor-pointer accent-[#FF6B00]"
              />
              <div className="flex justify-between text-xs text-[#6C757D] mt-1">
                <span>5 {t('expressPages.recherche.km')}</span>
                <span>50 {t('expressPages.recherche.km')}</span>
              </div>
            </div>

            {/* Bouton de recherche */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FF6B00] hover:bg-[#E56100] text-white py-4 text-lg font-bold rounded-lg transition-colors"
            >
              {loading ? t('expressPages.recherche.searching') : t('expressPages.recherche.searchButton')}
            </Button>
          </form>
          </div>

          {/* Résultats */}
          {searched && (
            <div ref={resultsRef} className={searched ? 'flex-1 mt-8 md:mt-0' : 'mt-8'}>
              {loading ? (
                <div className="bg-white rounded-xl shadow-lg p-10 flex flex-col items-center justify-center gap-4">
                  <div className="w-12 h-12 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
                  <p className="text-[#2C3E50] font-semibold text-lg">{t('expressPages.recherche.searchingTitle')}</p>
                  <p className="text-[#6C757D] text-sm">{t('expressPages.recherche.searchingDesc')}</p>
                </div>
              ) : (
              results.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-[#2C3E50]">
                      {results.length} artisan{results.length > 1 ? 's' : ''} disponible{results.length > 1 ? 's' : ''}
                    </h2>
                    
                    {totalPages > 1 && (
                      <p className="text-sm text-[#6C757D]">
                        Page {currentPage} {t('expressPages.recherche.pageSur')} {totalPages}
                      </p>
                    )}
                  </div>
                  
                  <div className="space-y-4">
                    {currentResults.map((result) => {
                      const zone = result.artisan.zonesIntervention?.[0];
                      return (
                      <div
                        key={result.artisanId}
                        className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow border-2 border-transparent hover:border-[#FF6B00]"
                      >
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="flex-1">
                            <a
                              href={`/artisan/${result.artisanId}`}
                              className="text-xl font-bold text-[#2C3E50] hover:text-[#FF6B00] transition-colors mb-2 inline-block"
                            >
                              {result.artisan.raisonSociale}
                            </a>
                            
                            <div className="space-y-2 text-sm text-[#6C757D]">
                              {zone && (
                              <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-[#FF6B00]" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                </svg>
                                <span>{zone.ville} {zone.codePostal ? `(${zone.codePostal})` : ''}</span>
                              </div>
                              )}
                              
                              {result.distance && (
                                <div className="flex items-center gap-2">
                                  <svg className="w-5 h-5 text-[#FF6B00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                  </svg>
                              <span>À {result.distance.toFixed(1)} {t('expressPages.recherche.kmAway')}</span>
                                </div>
                              )}
                              
                              {result.artisan.notation > 0 ? (
                                <a
                                  href={`/artisan/${result.artisanId}`}
                                  className="flex items-center gap-2 hover:text-[#FF6B00] transition-colors group"
                                >
                                  <svg className="w-5 h-5 flex-shrink-0" fill="#FFC107" stroke="#2C3E50" strokeWidth="1" viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                  <span className="font-medium text-[#2C3E50] group-hover:text-[#FF6B00]">
                                    {result.artisan.notation.toFixed(1)}/5
                                  </span>
                                  <span className="text-[#6C757D] group-hover:text-[#FF6B00]">
                                    ({result.artisan.nombreAvis} {t('expressPages.recherche.reviewsCount')}) — {t('expressPages.recherche.seeReviews')}
                                  </span>
                                </a>
                              ) : (
                                <a
                                  href={`/artisan/${result.artisanId}`}
                                  className="flex items-center gap-1 text-[#6C757D] hover:text-[#FF6B00] transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                  </svg>
                                  <span>{t('expressPages.recherche.seeProfile')}</span>
                                </a>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2">
                            <Button
                              onClick={() => handleDemanderDevis(result.artisanId)}
                              className="bg-[#FF6B00] hover:bg-[#E56100] text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
                            >
                              {t('expressPages.recherche.requestIntervention')}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );})}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="mt-8 flex items-center justify-center gap-2">
                      {/* Bouton Précédent */}
                      <button
                        onClick={() => {
                          setCurrentPage(prev => Math.max(1, prev - 1));
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        disabled={currentPage === 1}
                        className="px-4 py-2 rounded-lg border-2 border-[#E9ECEF] text-[#2C3E50] hover:border-[#FF6B00] hover:bg-[#FF6B00] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-[#E9ECEF] disabled:hover:bg-transparent disabled:hover:text-[#2C3E50]"
                      >
                        {t('expressPages.recherche.prev')}
                      </button>

                      {/* Numéros de pages */}
                      <div className="flex gap-2">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                          // Afficher max 7 pages : 1 ... 4 5 6 ... 10
                          const showPage = 
                            pageNum === 1 || 
                            pageNum === totalPages || 
                            (pageNum >= currentPage - 1 && pageNum <= currentPage + 1);
                          
                          const showEllipsis = 
                            (pageNum === currentPage - 2 && currentPage > 3) ||
                            (pageNum === currentPage + 2 && currentPage < totalPages - 2);

                          if (showEllipsis) {
                            return <span key={pageNum} className="px-2 py-2 text-[#6C757D]">...</span>;
                          }

                          if (!showPage) return null;

                          return (
                            <button
                              key={pageNum}
                              onClick={() => {
                                setCurrentPage(pageNum);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className={`w-10 h-10 rounded-lg border-2 font-semibold transition-colors ${
                                currentPage === pageNum
                                  ? 'bg-[#FF6B00] text-white border-[#FF6B00]'
                                  : 'border-[#E9ECEF] text-[#2C3E50] hover:border-[#FF6B00] hover:bg-[#FFF5EE]'
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>

                      {/* Bouton Suivant */}
                      <button
                        onClick={() => {
                          setCurrentPage(prev => Math.min(totalPages, prev + 1));
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 rounded-lg border-2 border-[#E9ECEF] text-[#2C3E50] hover:border-[#FF6B00] hover:bg-[#FF6B00] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-[#E9ECEF] disabled:hover:bg-transparent disabled:hover:text-[#2C3E50]"
                      >
                        {t('expressPages.recherche.next')}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-white rounded-xl shadow-lg p-8 text-center">
                  <div className="text-6xl mb-4">😔</div>
                  <h2 className="text-2xl font-bold text-[#2C3E50] mb-4">
                    {t('expressPages.recherche.noResults')}
                  </h2>
                  <p className="text-[#6C757D] mb-6">
                    {t('expressPages.recherche.noResultsDesc1')}
                    <br />
                    {t('expressPages.recherche.noResultsDesc2')}
                  </p>
                  <button
                    onClick={handlePublierDemande}
                    className="bg-[#FF6B00] text-white hover:bg-[#E56100] px-6 py-3 rounded-lg font-semibold transition-colors"
                  >
                    {t('expressPages.recherche.publishDemande')}
                  </button>
                </div>
              )
              )}
            </div>
          )}
        </div>
        </div>{/* fin z-10 container */}
      </div>{/* fin background image */}
    </div>
  );
}
