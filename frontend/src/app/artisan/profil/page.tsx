'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { authService } from '@/lib/auth-service';
import { getArtisanByUserId, updateArtisan } from '@/lib/firebase/artisan-service';
import { Button, Input, Logo } from '@/components/ui';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { METIERS_MAP, METIERS_DISPONIBLES } from '@/lib/constants/metiers';
import { artisanDoitDecennale } from '@/lib/decennale-helper';
import { EXPRESS_WORK_TAXONOMY } from '@/lib/express-work-taxonomy';
import type { Categorie, Artisan, ZoneIntervention } from '@/types/firestore';

interface VilleSuggestion {
  nom: string;
  codePostal: string;
  departement: string;
}

export default function ProfilArtisanPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [artisan, setArtisan] = useState<Artisan | null>(null);
  
  // Autocomplétion ville
  const [villeSuggestions, setVilleSuggestions] = useState<VilleSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Formulaire
  const [siret, setSiret] = useState('');
  const [raisonSociale, setRaisonSociale] = useState('');
  const [adresse, setAdresse] = useState('');
  const [metiers, setMetiers] = useState<Categorie[]>([]);
  const [specialitesDepannage, setSpecialitesDepannage] = useState<string[]>([]);
  const [sousCatsDepannage, setSousCatsDepannage] = useState<string[]>([]);
  const [specialitesPetitsTravaux, setSpecialitesPetitsTravaux] = useState<string[]>([]);
  const [sousCatsPetitsTravaux, setSousCatsPetitsTravaux] = useState<string[]>([]);
  const [typesTravauxChoisis, setTypesTravauxChoisis] = useState<('travaux-classiques' | 'depannages-rapides')[]>([]);
  const [ville, setVille] = useState('');
  const [codePostal, setCodePostal] = useState('');
  const [rayonKm, setRayonKm] = useState(30);
  const [presentation, setPresentation] = useState('');

  // Vérifier si décennale en cours de vérification (bloquer modification métiers)
  const decennaleEnCoursVerification = !!(artisan?.verificationDocuments?.decennale?.url && 
                                        !artisan.verificationDocuments.decennale.verified && 
                                        !artisan.verificationDocuments.decennale.rejected);

  useEffect(() => {
    loadArtisanProfile();
  }, []);

  async function loadArtisanProfile() {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        router.push('/connexion');
        return;
      }

      const artisanData = await getArtisanByUserId(currentUser.uid);
      if (!artisanData) {
        setError(t('profile.messages.profileNotFound'));
        setIsLoading(false);
        return;
      }

      setArtisan(artisanData);
      
      // Pré-remplir le formulaire
      setSiret(artisanData.siret || '');
      setRaisonSociale(artisanData.raisonSociale || '');
      setAdresse(artisanData.adresse || '');
      
      // Assurer que metiers est bien un tableau
      const metiersArray = Array.isArray(artisanData.metiers) 
        ? artisanData.metiers 
        : (artisanData.metiers ? Object.values(artisanData.metiers) : []);
      
      setMetiers(metiersArray as Categorie[]);
      setSpecialitesDepannage(artisanData.specialitesExpress?.depannageUrgence ?? []);
      setSousCatsDepannage(artisanData.specialitesExpress?.depannageUrgenceSousCategories ?? []);
      setSpecialitesPetitsTravaux(artisanData.specialitesExpress?.petitsTravauxMaintenance ?? []);
      setSousCatsPetitsTravaux(artisanData.specialitesExpress?.petitsTravauxSousCategories ?? []);

      // Initialiser typesTravauxChoisis avec backward compat
      const typesTravaux: ('travaux-classiques' | 'depannages-rapides')[] = [...(artisanData.typesTravauxChoisis ?? [])];
      if (!typesTravaux.includes('travaux-classiques') && metiersArray.length > 0) typesTravaux.push('travaux-classiques');
      if (!typesTravaux.includes('depannages-rapides') &&
        ((artisanData.specialitesExpress?.depannageUrgence?.length ?? 0) > 0 ||
         (artisanData.specialitesExpress?.petitsTravauxMaintenance?.length ?? 0) > 0)) {
        typesTravaux.push('depannages-rapides');
      }
      setTypesTravauxChoisis(typesTravaux);

      setPresentation(artisanData.presentation || '');
      
      if (artisanData.zonesIntervention && artisanData.zonesIntervention.length > 0) {
        setVille(artisanData.zonesIntervention[0].ville);
        setCodePostal(artisanData.zonesIntervention[0].codePostal || '');
        setRayonKm(artisanData.zonesIntervention[0].rayonKm || artisanData.zonesIntervention[0].rayon || 30);
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Erreur chargement profil:', err);
      setError(t('profile.messages.loadError'));
      setIsLoading(false);
    }
  }

  // Recherche de villes via API
  async function searchVilles(query: string) {
    if (query.length < 2) {
      setVilleSuggestions([]);
      return;
    }

    try {
      const response = await fetch(
        `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&fields=nom,codesPostaux,departement&limit=10`
      );
      const data = await response.json();
      
      const suggestions: VilleSuggestion[] = data.flatMap((commune: any) => 
        commune.codesPostaux.map((cp: string) => ({
          nom: commune.nom,
          codePostal: cp,
          departement: commune.departement.nom
        }))
      );
      
      setVilleSuggestions(suggestions);
    } catch (error) {
      console.error('Erreur recherche villes:', error);
      setVilleSuggestions([]);
    }
  }

  // Sélection d'une ville
  function selectVille(suggestion: VilleSuggestion) {
    setVille(suggestion.nom);
    setCodePostal(suggestion.codePostal);
    setVilleSuggestions([]);
    setShowSuggestions(false);
  }

  function toggleMetier(metier: Categorie) {
    if (metiers.includes(metier)) {
      setMetiers(metiers.filter(m => m !== metier));
    } else {
      setMetiers([...metiers, metier]);
    }
  }

  function toggleSpecialiteDepannage(catValue: string) {
    const isSelected = specialitesDepannage.includes(catValue);
    setSpecialitesDepannage(prev =>
      isSelected ? prev.filter(c => c !== catValue) : [...prev, catValue]
    );
    const catDef = EXPRESS_WORK_TAXONOMY['depannage-urgence'].categories.find(c => c.value === catValue);
    if (catDef) {
      const scValues = catDef.sousCategories.map(sc => sc.value);
      if (isSelected) {
        // Désélectionner toutes les sous-catégories de cette catégorie
        setSousCatsDepannage(prev => prev.filter(sc => !scValues.includes(sc)));
      } else {
        // Sélectionner automatiquement toutes les sous-catégories
        setSousCatsDepannage(prev => [...new Set([...prev, ...scValues])]);
      }
    }
  }

  function toggleSousCatDepannage(scValue: string, catValue: string) {
    setSousCatsDepannage(prev => {
      const updated = prev.includes(scValue) ? prev.filter(s => s !== scValue) : [...prev, scValue];
      // Si toutes les sous-catégories de la catégorie sont désélectionnées, désélectionner la catégorie
      const catDef = EXPRESS_WORK_TAXONOMY['depannage-urgence'].categories.find(c => c.value === catValue);
      if (catDef) {
        const scValues = catDef.sousCategories.map(sc => sc.value);
        const anyRemaining = scValues.some(sc => updated.includes(sc));
        if (!anyRemaining) {
          setSpecialitesDepannage(p => p.filter(c => c !== catValue));
        }
      }
      return updated;
    });
  }

  function toggleSpecialitePetitsTravaux(catValue: string) {
    const isSelected = specialitesPetitsTravaux.includes(catValue);
    setSpecialitesPetitsTravaux(prev =>
      isSelected ? prev.filter(c => c !== catValue) : [...prev, catValue]
    );
    const catDef = EXPRESS_WORK_TAXONOMY['petits-travaux-maintenance'].categories.find(c => c.value === catValue);
    if (catDef) {
      const scValues = catDef.sousCategories.map(sc => sc.value);
      if (isSelected) {
        // Désélectionner toutes les sous-catégories de cette catégorie
        setSousCatsPetitsTravaux(prev => prev.filter(sc => !scValues.includes(sc)));
      } else {
        // Sélectionner automatiquement toutes les sous-catégories
        setSousCatsPetitsTravaux(prev => [...new Set([...prev, ...scValues])]);
      }
    }
  }

  function toggleSousCatPetitsTravaux(scValue: string, catValue: string) {
    setSousCatsPetitsTravaux(prev => {
      const updated = prev.includes(scValue) ? prev.filter(s => s !== scValue) : [...prev, scValue];
      // Si toutes les sous-catégories de la catégorie sont désélectionnées, désélectionner la catégorie
      const catDef = EXPRESS_WORK_TAXONOMY['petits-travaux-maintenance'].categories.find(c => c.value === catValue);
      if (catDef) {
        const scValues = catDef.sousCategories.map(sc => sc.value);
        const anyRemaining = scValues.some(sc => updated.includes(sc));
        if (!anyRemaining) {
          setSpecialitesPetitsTravaux(p => p.filter(c => c !== catValue));
        }
      }
      return updated;
    });
  }

  function toggleTypesTravaux(type: 'travaux-classiques' | 'depannages-rapides') {
    setTypesTravauxChoisis(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  }

  function validateSiret(value: string): boolean {
    // SIRET doit contenir exactement 14 chiffres
    return /^\d{14}$/.test(value.replace(/\s/g, ''));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validations
    if (!validateSiret(siret)) {
      setError('Vérifiez que votre SIRET est correct et que votre entreprise est active.');
      return;
    }

    if (!raisonSociale.trim()) {
      setError(t('profile.messages.businessNameRequired'));
      return;
    }

    if (!adresse.trim()) {
      setError(t('profile.messages.addressRequired'));
      return;
    }

    if (typesTravauxChoisis.length === 0) {
      setError('Veuillez sélectionner au moins un type de travaux : 🏗️ Travaux classiques et/ou 🚀 Dépannages rapides.');
      return;
    }

    if (typesTravauxChoisis.includes('travaux-classiques') && metiers.length === 0) {
      setError('Vous avez sélectionné 🏗️ Travaux classiques — veuillez choisir au moins un métier (Plomberie, Électricité, Maçonnerie…).');
      return;
    }

    if (typesTravauxChoisis.includes('depannages-rapides') &&
        specialitesDepannage.length === 0 && specialitesPetitsTravaux.length === 0) {
      setError('Vous avez sélectionné 🚀 Dépannages rapides — veuillez choisir au moins une catégorie dans 🚨 Dépannage en urgence ou 🛠️ Petits travaux & maintenance.');
      return;
    }

    if (!ville.trim()) {
      setError(t('profile.messages.cityRequired'));
      return;
    }

    if (rayonKm < 5 || rayonKm > 100) {
      setError('Le rayon doit être entre 5 et 100 km');
      return;
    }

    if (!artisan) return;

    setIsSaving(true);

    try {
      const zonesIntervention: ZoneIntervention[] = [{
        ville: ville.trim(),
        codePostal: codePostal.trim(),
        rayonKm,
        departements: []
      }];

      await updateArtisan(artisan.userId, {
        siret: siret.replace(/\s/g, ''),
        raisonSociale: raisonSociale.trim(),
        adresse: adresse.trim(),
        metiers,
        typesTravauxChoisis,
        zonesIntervention,
        presentation: presentation.trim() || undefined,
        specialitesExpress: {
          depannageUrgence: specialitesDepannage,
          depannageUrgenceSousCategories: sousCatsDepannage,
          petitsTravauxMaintenance: specialitesPetitsTravaux,
          petitsTravauxSousCategories: sousCatsPetitsTravaux,
        },
      });

      setSuccess(t('profile.messages.updateSuccess'));
      
      // Recharger le profil
      await loadArtisanProfile();
      
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      console.error('Erreur mise à jour:', err);
      setError(t('profile.messages.updateError'));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00] mx-auto mb-4"></div>
          <p className="text-gray-600">{t('profile.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* Header */}
      <div className="bg-[#2C3E50] text-white py-8">
        <div className="container mx-auto px-4 max-w-3xl">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-white hover:text-[#FF6B00] mb-4 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('profile.backToDashboard')}
          </button>
          <h1 className="text-3xl font-bold">👤 {t('profile.pageTitle')}</h1>
          <p className="text-gray-300 mt-2">{t('profile.pageDescription')}</p>
        </div>
      </div>
      <div className="container mx-auto px-4 py-8 max-w-3xl">

        {/* Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}
        
        {/* Toast notification - Position fixe en haut à droite */}
        {success && (
          <div className="fixed top-20 right-6 z-50 p-4 bg-green-500 text-white rounded-lg shadow-2xl flex items-center gap-3 animate-slideDown max-w-md">
            <span className="text-3xl">✅</span>
            <div className="flex-1">
              <p className="font-bold text-lg">{t('profile.messages.updateSuccessTitle')}</p>
              <p className="text-sm">{t('profile.messages.updateSuccessMessage')}</p>
            </div>
            <button
              onClick={() => setSuccess('')}
              className="text-white hover:text-gray-200 text-2xl font-bold ml-2"
            >
              ×
            </button>
          </div>
        )}

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-md p-6 space-y-6">
          {/* Informations entreprise */}
          <div className="border-b border-gray-200 pb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">{t('profile.companyInfo.title')}</h2>
            
            <div className="space-y-4">
              <Input
                label={t('profile.companyInfo.siret')}
                type="text"
                value={siret}
                onChange={(e) => {
                  // Accepter uniquement les chiffres
                  const value = e.target.value.replace(/\D/g, '');
                  // Limiter à 14 chiffres maximum
                  setSiret(value.slice(0, 14));
                }}
                placeholder={t('profile.companyInfo.siretPlaceholder')}
                required
                helperText={t('profile.companyInfo.siretHelper')}
                maxLength={14}
              />
              
              <Input
                label={t('profile.companyInfo.businessName')}
                type="text"
                value={raisonSociale}
                onChange={(e) => setRaisonSociale(e.target.value)}
                placeholder={t('profile.companyInfo.businessNamePlaceholder')}
                required
              />
              
              <AddressAutocomplete
                label={t('profile.companyInfo.address')}
                value={adresse}
                onChange={(value) => setAdresse(value)}
                onAddressSelect={(data) => {
                  setAdresse(data.adresseComplete);
                  setVille(data.ville || ville);
                  setCodePostal(data.codePostal || codePostal);
                }}
                placeholder={t('profile.companyInfo.addressPlaceholder')}
                required
                helper={t('profile.companyInfo.addressHelper')}
              />
            </div>
          </div>

          {/* Type de travaux */}
          <div className="border-b border-gray-200 pb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-2">Type de travaux</h2>
            <p className="text-sm text-gray-500 mb-4">Sélectionnez au moins un type de travaux que vous proposez.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => toggleTypesTravaux('travaux-classiques')}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  typesTravauxChoisis.includes('travaux-classiques')
                    ? 'border-[#FF6B00] bg-orange-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="text-3xl mb-1">🏗️</div>
                <div className="font-semibold text-gray-800">Travaux classiques</div>
                <div className="text-sm text-gray-500 mt-1">Plomberie, électricité, maçonnerie, peinture…</div>
              </button>
              <button
                type="button"
                onClick={() => toggleTypesTravaux('depannages-rapides')}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  typesTravauxChoisis.includes('depannages-rapides')
                    ? 'border-[#FF6B00] bg-orange-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="text-3xl mb-1">🚀</div>
                <div className="font-semibold text-gray-800">Dépannages rapides</div>
                <div className="text-sm text-gray-500 mt-1">Urgences, petits travaux &amp; maintenance</div>
              </button>
            </div>
          </div>

          {/* Métiers */}
          {typesTravauxChoisis.includes('travaux-classiques') && (
          <div className="border-b border-gray-200 pb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-1">🏗️ Travaux classiques</h2>
            <p className="text-sm text-gray-500 mb-4">
              {t('profile.trades.title')} <span className="font-normal">{t('profile.trades.selectAtLeastOne')}</span>
            </p>

            {/* Avertissement blocage si décennale en cours */}
            {decennaleEnCoursVerification && (
              <div className="mb-4 bg-red-50 border-l-4 border-red-500 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🔒</span>
                  <div className="flex-1">
                    <h4 className="text-red-900 font-semibold mb-1">{t('profile.trades.lockedTitle')}</h4>
                    <p className="text-sm text-red-800">
                      {t('profile.trades.lockedMessage')}
                    </p>
                    <p className="text-xs text-red-700 mt-2">
                      {t('profile.trades.lockedHelper')}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {METIERS_DISPONIBLES.map((metier) => (
                <button
                  key={metier}
                  type="button"
                  onClick={() => !decennaleEnCoursVerification && toggleMetier(metier)}
                  disabled={decennaleEnCoursVerification}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                    decennaleEnCoursVerification 
                      ? 'opacity-50 cursor-not-allowed bg-gray-100 border-gray-300 text-gray-500' 
                      : metiers.includes(metier)
                        ? 'border-[#FF6B00] bg-orange-50 text-[#FF6B00]'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {METIERS_MAP[metier]}
                </button>
              ))}
            </div>

            {/* Avertissement décennale si métiers concernés ET document pas encore uploadé */}
            {metiers.length > 0 && artisanDoitDecennale(metiers) && !artisan?.verificationDocuments?.decennale?.url && (
              <div className="mt-4 bg-yellow-50 border-l-4 border-[#FFC107] rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div className="flex-1">
                    <h4 className="text-yellow-900 font-semibold mb-1">{t('profile.trades.decennaleMandatoryTitle')}</h4>
                    <p className="text-sm text-yellow-800">
                      {t('profile.trades.decennaleMandatoryMessage')}
                    </p>
                    <p className="text-xs text-yellow-700 mt-2">
                      {t('profile.trades.decennaleConcernedTrades')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Dépannages rapides */}
          {typesTravauxChoisis.includes('depannages-rapides') && (
          <div className="border-b border-gray-200 pb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-1">🚀 Dépannages rapides</h2>
            <p className="text-sm text-gray-500 mb-5">Sélectionnez au moins un domaine dans lesquels vous intervenez en urgence ou pour de petits travaux.</p>

            {/* 🚨 Dépannage en urgence */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🚨</span>
                <h3 className="font-semibold text-gray-800">Dépannage en urgence</h3>
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">⚡ Immédiat (30 min – 1h)</span>
              </div>
              <p className="text-xs text-gray-400 mb-3 italic">En sélectionnant une catégorie, toutes ses sous-catégories sont sélectionnées automatiquement. Vous pouvez en désélectionner certaines selon vos compétences.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {EXPRESS_WORK_TAXONOMY['depannage-urgence'].categories.map((cat) => {
                  const selected = specialitesDepannage.includes(cat.value);
                  return (
                    <div key={cat.value}>
                      <button
                        type="button"
                        onClick={() => toggleSpecialiteDepannage(cat.value)}
                        className={`w-full p-3 rounded-lg border-2 text-sm font-medium transition-all text-left ${
                          selected
                            ? 'border-red-500 bg-red-50 text-red-700'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        {cat.label}
                      </button>
                      {selected && (
                        <div className="mt-2 grid grid-cols-2 gap-1 px-1">
                          {cat.sousCategories.map((sc) => (
                            <button
                              key={sc.value}
                              type="button"
                              onClick={() => toggleSousCatDepannage(sc.value, cat.value)}
                              title={sc.prix ? `Prix indicatif : ${sc.prix}` : undefined}
                              className={`text-xs px-2 py-1.5 rounded-lg border transition-all text-left ${
                                sousCatsDepannage.includes(sc.value)
                                  ? 'bg-red-500 text-white border-red-500'
                                  : 'bg-white text-red-600 border-red-200 hover:bg-red-50'
                              }`}
                            >
                              {sc.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 🛠️ Petits travaux & maintenance */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🛠️</span>
                <h3 className="font-semibold text-gray-800">Petits travaux &amp; maintenance</h3>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">🚨 En urgence (2h)</span>
              </div>
              <p className="text-xs text-gray-400 mb-3 italic">En sélectionnant une catégorie, toutes ses sous-catégories sont sélectionnées automatiquement. Vous pouvez en désélectionner certaines selon vos compétences.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {EXPRESS_WORK_TAXONOMY['petits-travaux-maintenance'].categories.map((cat) => {
                  const selected = specialitesPetitsTravaux.includes(cat.value);
                  return (
                    <div key={cat.value}>
                      <button
                        type="button"
                        onClick={() => toggleSpecialitePetitsTravaux(cat.value)}
                        className={`w-full p-3 rounded-lg border-2 text-sm font-medium transition-all text-left ${
                          selected
                            ? 'border-[#FF6B00] bg-orange-50 text-[#FF6B00]'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        {cat.label}
                      </button>
                      {selected && (
                        <div className="mt-2 grid grid-cols-2 gap-1 px-1">
                          {cat.sousCategories.map((sc) => (
                            <button
                              key={sc.value}
                              type="button"
                              onClick={() => toggleSousCatPetitsTravaux(sc.value, cat.value)}
                              title={sc.prix ? `Prix indicatif : ${sc.prix}` : undefined}
                              className={`text-xs px-2 py-1.5 rounded-lg border transition-all text-left ${
                                sousCatsPetitsTravaux.includes(sc.value)
                                  ? 'bg-[#FF6B00] text-white border-[#FF6B00]'
                                  : 'bg-white text-[#FF6B00] border-orange-200 hover:bg-orange-50'
                              }`}
                            >
                              {sc.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          )}

          {/* Zone d'intervention */}
          <div className="border-b border-gray-200 pb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">{t('profile.serviceArea.title')}</h2>
            
            <div className="grid md:grid-cols-2 gap-4">
              {/* Ville principale avec autocomplétion */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('profile.serviceArea.mainCity')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={ville}
                  onChange={(e) => {
                    setVille(e.target.value);
                    searchVilles(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder={t('profile.serviceArea.mainCityPlaceholder')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                  required
                />
                
                {/* Suggestions de villes */}
                {showSuggestions && villeSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {villeSuggestions.map((suggestion, index) => (
                      <button
                        key={`${suggestion.nom}-${suggestion.codePostal}-${index}`}
                        type="button"
                        onClick={() => selectVille(suggestion)}
                        className="w-full px-4 py-2 text-left hover:bg-orange-50 hover:text-[#FF6B00] transition-colors border-b border-gray-100 last:border-0"
                      >
                        <div className="font-medium text-gray-900">{suggestion.nom}</div>
                        <div className="text-sm text-gray-500">
                          {suggestion.codePostal} - {suggestion.departement}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('profile.serviceArea.radius')}
                </label>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={rayonKm}
                  onChange={(e) => setRayonKm(parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>{t('profile.serviceArea.radiusMin')}</span>
                  <span className="font-bold text-[#FF6B00]">{rayonKm} km</span>
                  <span>{t('profile.serviceArea.radiusMax')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Présentation */}
          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-4">{t('profile.presentation.title')}</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('profile.presentation.label')}
              </label>
              <textarea
                value={presentation}
                onChange={(e) => setPresentation(e.target.value)}
                placeholder={t('profile.presentation.placeholder')}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                maxLength={500}
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('profile.presentation.characters').replace('{count}', String(presentation.length))}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4">
            <Button
              type="submit"
              className="flex-1 bg-[#FF6B00] hover:bg-[#E56100]"
              isLoading={isSaving}
            >
              {isSaving ? t('profile.actions.saving') : t('profile.actions.save')}
            </Button>
            
            <Link href="/dashboard" className="flex-1">
              <button
                type="button"
                className="w-full px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {t('profile.actions.cancel')}
              </button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
