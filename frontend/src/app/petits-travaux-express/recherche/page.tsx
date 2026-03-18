'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { matchArtisans } from '@/lib/firebase/matching-service';
import { createDemande } from '@/lib/firebase/demande-service';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { getUserById } from '@/lib/firebase/user-service';
import type { MatchingResult, User, Categorie } from '@/types/firestore';

// Mapping des sous-catégories par catégorie
const SOUS_CATEGORIES: Record<string, Array<{ value: string; label: string }>> = {
  electricite: [
    { value: 'eclairage', label: 'Éclairage' },
    { value: 'domotique', label: 'Domotique' },
    { value: 'prises-interrupteurs', label: 'Prises / Interrupteurs' },
    { value: 'petits-travaux', label: 'Petits dépannages électriques' },
  ],
  plomberie: [
    { value: 'robinetterie', label: 'Robinetterie' },
    { value: 'depannage', label: 'Petits dépannages' },
    { value: 'fuite', label: 'Fuite d\'eau' },
    { value: 'wc-lavabo', label: 'WC / Lavabo' },
  ],
  menuiserie: [
    { value: 'fenetres', label: 'Fenêtres' },
    { value: 'portes', label: 'Portes' },
    { value: 'volets-stores', label: 'Volets / Stores' },
    { value: 'portails', label: 'Portails' },
  ],
  peinture: [
    { value: 'murs', label: 'Peinture murs' },
    { value: 'plafonds', label: 'Peinture plafonds' },
    { value: 'papier-peint', label: 'Papier peint' },
    { value: 'enduit', label: 'Enduit' },
  ],
  serrurerie: [
    { value: 'serrures', label: 'Changement serrures' },
    { value: 'portes-blindees', label: 'Portes blindées' },
    { value: 'depannage', label: 'Dépannage d\'urgence' },
  ],
  'exterieur-jardin': [
    { value: 'cloture-portail', label: 'Clôture et portail' },
    { value: 'terrasse-dallage', label: 'Terrasse et dallage' },
    { value: 'elagage-abattage', label: 'Élagage et abattage' },
    { value: 'entretien-jardin', label: 'Entretien jardin' },
    { value: 'arrosage-automatique', label: 'Arrosage automatique' },
    { value: 'amenagement-paysager', label: 'Aménagement paysager' },
  ],
};

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
  const categorieParam = searchParams.get('categorie') as Categorie || '';
  const sousCategorieParam = searchParams.get('sousCategorie') || '';

  // États du formulaire
  const typeProjet = 'express'; // Toujours express sur cette page
  const [categorie, setCategorie] = useState<Categorie | ''>(categorieParam);
  const [sousCategorie, setSousCategorie] = useState(sousCategorieParam);
  const [ville, setVille] = useState('');
  const [codePostal, setCodePostal] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [urgence, setUrgence] = useState<'immediat' | 'urgent'>('urgent');
  const [rayonMax, setRayonMax] = useState(20);

  // Recherche de villes
  const [villeSuggestions, setVilleSuggestions] = useState<VilleSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Résultats
  const [results, setResults] = useState<MatchingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

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
      setShowSuggestions(false);
      return;
    }

    try {
      // Détecter si la saisie est un code postal (que des chiffres)
      const isCodePostal = /^\d+$/.test(query);
      
      let url: string;
      if (isCodePostal) {
        // Recherche par code postal
        url = `https://geo.api.gouv.fr/communes?codePostal=${encodeURIComponent(query)}&fields=nom,codesPostaux,codeDepartement&boost=population&limit=10`;
      } else {
        // Recherche par nom de commune
        url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&fields=nom,codesPostaux,codeDepartement&boost=population&limit=10`;
      }

      const response = await fetch(url);
      
      if (!response.ok) return;
      
      const data = await response.json();
      const suggestions = data.flatMap((commune: any) => 
        commune.codesPostaux.map((cp: string) => ({
          nom: commune.nom,
          codePostal: cp,
          departement: commune.codeDepartement
        }))
      );
      
      setVilleSuggestions(suggestions);
      setShowSuggestions(suggestions.length > 0);
    } catch (error) {
      console.error('Erreur recherche villes:', error);
    }
  }

  function selectVille(suggestion: VilleSuggestion) {
    setVille(suggestion.nom);
    setCodePostal(suggestion.codePostal);
    setShowSuggestions(false);
    setVilleSuggestions([]);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    
    if (!categorie || !ville || !codePostal) {
      alert(t('alerts.validation.fillRequired'));
      return;
    }

    setLoading(true);
    setSearched(true);
    setCurrentPage(1); // ✅ Réinitialiser pagination à la page 1

    try {
      // Géocodage de la ville
      const geoResponse = await fetch(
        `https://geo.api.gouv.fr/communes?codePostal=${codePostal}&fields=centre&limit=1`
      );
      const geoData = await geoResponse.json();
      
      if (geoData.length === 0) {
        alert(t('alerts.validation.cityNotFound'));
        setLoading(false);
        return;
      }

      const { lat, lon } = geoData[0].centre.coordinates;

      // Mapping urgence vers le format attendu par MatchingCriteria
      const urgenceMapping: Record<string, 'faible' | 'normale' | 'urgent'> = {
        immediat: 'urgent',
        urgent: 'urgent',
      };

      // Matching artisans
      const matchResults = await matchArtisans({
        categorie,
        ville,
        codePostal,
        coordonneesGPS: {
          latitude: lon,
          longitude: lat,
        },
        dates: [date],
        flexible: false,
        urgence: urgenceMapping[urgence] || 'normale',
        rayonMax: rayonMax,
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

  async function handleDemanderDevis(artisanId: string) {
    if (authLoading) return; // Attendre Firebase

    if (!firebaseUser) {
      // Sauvegarder le contexte et rediriger vers inscription
      const context = {
        categorie,
        sousCategorie,
        typeProjet: 'express',
        ville,
        codePostal,
        artisanId,
      };
      sessionStorage.setItem('searchContext', JSON.stringify(context));
      router.push('/inscription?role=client');
      return;
    }

    // Créer une demande express directe
    const params = new URLSearchParams({
      artisanId,
      categorie,
      ville,
      codePostal,
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
        categorie,
        sousCategorie,
        typeProjet: 'express',
        ville,
        codePostal,
      };
      sessionStorage.setItem('searchContext', JSON.stringify(context));
      router.push('/inscription?role=client');
      return;
    }

    // Rediriger vers création demande publique
    const params = new URLSearchParams({
      categorie,
      typeProjet: 'express',
      ville,
      codePostal,
    });
    if (sousCategorie) {
      params.append('sousCategorie', sousCategorie);
    }
    router.push(`/demande/publique/nouvelle?${params.toString()}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F8F9FA] to-white">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-[#E9ECEF]">
        <div className="container mx-auto px-4 py-6">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm mb-4">
            <Link href="/" className="text-[#2C3E50] hover:text-[#FF6B00] transition-colors flex items-center gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
            </Link>
            <span className="text-[#6C757D]">&gt;</span>
            <Link href="/petits-travaux-express" className="text-[#2C3E50] hover:text-[#FF6B00] transition-colors">
              Travaux express
            </Link>
            <span className="text-[#6C757D]">&gt;</span>
            <span className="text-[#2C3E50] font-semibold">Recherche d'artisan</span>
          </nav>

          <h1 className="text-2xl md:text-3xl font-bold text-[#2C3E50]">
            🚀 Trouvez un artisan pour vos travaux express
          </h1>
          <p className="text-[#6C757D] mt-2">
            Intervention rapide • Moins de 150€ • Sans devis formel
          </p>
          
          {/* Badge info travaux express */}
          <div className="mt-4 inline-flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 px-4 py-2 rounded-lg text-sm font-medium">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Recherche spécialisée petits travaux express uniquement</span>
          </div>
        </div>
      </div>

      {/* Formulaire de recherche */}
      <div className="container mx-auto px-4 py-8">
        <div className={searched ? 'md:flex md:gap-6 md:items-start' : 'max-w-4xl mx-auto'}>
          <div className={searched ? 'md:w-96 md:flex-shrink-0 md:sticky md:top-6' : ''}>
          <form onSubmit={handleSearch} className="bg-white rounded-xl shadow-lg p-6 md:p-8 space-y-6">
            {/* Type de travaux */}
            <div>
              <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                Type de travaux <span className="text-red-500">*</span>
              </label>
              <select
                value={categorie}
                onChange={(e) => {
                  setCategorie(e.target.value as Categorie);
                  setSousCategorie(''); // Reset sous-catégorie
                }}
                required
                className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none transition-colors"
              >
                <option value="">Sélectionnez un type de travaux</option>
                <option value="electricite">💡 Électricité</option>
                <option value="plomberie">🔧 Plomberie</option>
                <option value="menuiserie">🔨 Menuiserie</option>
                <option value="peinture">🎨 Peinture &amp; Décoration</option>
                <option value="serrurerie">🔐 Serrurerie</option>
                <option value="exterieur-jardin">🌳 Extérieur &amp; Jardin</option>
              </select>
            </div>

            {/* Sous-catégorie */}
            {categorie && SOUS_CATEGORIES[categorie] && (
              <div>
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                  Sous-catégorie
                </label>
                <select
                  value={sousCategorie}
                  onChange={(e) => setSousCategorie(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none transition-colors"
                >
                  <option value="">Toutes les sous-catégories</option>
                  {SOUS_CATEGORIES[categorie].map((sc) => (
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
                  Ville <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={ville}
                  autoComplete="off"
                  onChange={(e) => {
                    setVille(e.target.value);
                    searchVilles(e.target.value);
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  required
                  placeholder="Ex: Paris"
                  className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none transition-colors"
                />
                
                {/* Suggestions de villes */}
                {showSuggestions && villeSuggestions.length > 0 && (
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
                  Code postal <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={codePostal}
                  onChange={(e) => {
                    setCodePostal(e.target.value);
                    searchVilles(e.target.value);
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  required
                  placeholder="Ex: 75001"
                  pattern="[0-9]{5}"
                  className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none transition-colors"
                />

                {/* Suggestions depuis le champ code postal */}
                {showSuggestions && villeSuggestions.length > 0 && (
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

            {/* Date et urgence */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                  Date souhaitée <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  required
                  className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                  Urgence
                </label>
                <select
                  value={urgence}
                  onChange={(e) => setUrgence(e.target.value as any)}
                  className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none transition-colors"
                >
                  <option value="immediat">⚡ Immédiat (2 heures)</option>
                  <option value="urgent">🚨 Urgent (sous 24h)</option>
                </select>
              </div>
            </div>

            {/* Rayon de recherche */}
            <div>
              <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                Rayon de recherche : {rayonMax} km
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
                <span>5 km</span>
                <span>50 km</span>
              </div>
            </div>

            {/* Bouton de recherche */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FF6B00] hover:bg-[#E56100] text-white py-4 text-lg font-bold rounded-lg transition-colors"
            >
              {loading ? '🔍 Recherche en cours...' : '🔍 Rechercher des artisans'}
            </Button>
          </form>
          </div>

          {/* Résultats */}
          {searched && (
            <div ref={resultsRef} className={searched ? 'flex-1 mt-8 md:mt-0' : 'mt-8'}>
              {loading ? (
                <div className="bg-white rounded-xl shadow-lg p-10 flex flex-col items-center justify-center gap-4">
                  <div className="w-12 h-12 border-4 border-[#FF6B00] border-t-transparent rounded-full animate-spin" />
                  <p className="text-[#2C3E50] font-semibold text-lg">Recherche en cours...</p>
                  <p className="text-[#6C757D] text-sm">Nous cherchons les artisans disponibles près de vous</p>
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
                        Page {currentPage} sur {totalPages}
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
                                  <span>À {result.distance.toFixed(1)} km de vous</span>
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
                                    ({result.artisan.nombreAvis} avis) — Voir les avis →
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
                                  <span>Voir le profil</span>
                                </a>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2">
                            <Button
                              onClick={() => handleDemanderDevis(result.artisanId)}
                              className="bg-[#FF6B00] hover:bg-[#E56100] text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
                            >
                              🚀 Demander une intervention
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
                        ← Précédent
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
                        Suivant →
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-white rounded-xl shadow-lg p-8 text-center">
                  <div className="text-6xl mb-4">😔</div>
                  <h2 className="text-2xl font-bold text-[#2C3E50] mb-4">
                    Aucun artisan disponible
                  </h2>
                  <p className="text-[#6C757D] mb-6">
                    Nous n'avons pas trouvé d'artisan disponible pour ces critères.
                    <br />
                    Publiez votre demande et les artisans proches de vous vous contacteront !
                  </p>
                  
                  <Button
                    onClick={handlePublierDemande}
                    className="bg-[#FF6B00] hover:bg-[#E56100] text-white px-8 py-4 rounded-lg font-bold text-lg transition-colors inline-flex items-center gap-2"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                    </svg>
                    Publier ma demande
                  </Button>
                </div>
              )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
