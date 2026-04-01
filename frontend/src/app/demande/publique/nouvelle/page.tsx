'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { createDemande } from '@/lib/firebase/demande-service';
import { matchAndNotifyArtisansForPublicDemande } from '@/lib/firebase/matching-service';
import { uploadMultiplePhotos } from '@/lib/firebase/storage-service';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Timestamp } from 'firebase/firestore';
import { getSearchContext, clearSearchContext, generateDemandeTitle, generateDemandeDescription } from '@/lib/utils/search-context';
import type { Categorie } from '@/types/firestore';

interface VilleSuggestion {
  nom: string;
  code: string;
  codesPostaux: string[];
  _score?: number;
}

const CATEGORIES: { value: Categorie; label: string }[] = [
  { value: 'plomberie', label: 'Plomberie' },
  { value: 'electricite', label: 'Électricité' },
  { value: 'peinture', label: 'Peinture' },
  { value: 'menuiserie', label: 'Menuiserie' },
  { value: 'maconnerie', label: 'Maçonnerie' },
  { value: 'carrelage', label: 'Carrelage' },
  { value: 'chauffage', label: 'Chauffage' },
  { value: 'climatisation', label: 'Climatisation' },
  { value: 'toiture', label: 'Toiture' },
  { value: 'isolation', label: 'Isolation' },
  { value: 'serrurerie', label: 'Serrurerie' },
  { value: 'exterieur-jardin', label: 'Extérieur & Jardin' },
  { value: 'renovation', label: 'Rénovation générale' },
];

const RAYONS = [
  { value: 10, label: '10 km' },
  { value: 25, label: '25 km' },
  { value: 50, label: '50 km' },
  { value: 75, label: '75 km' },
  { value: 100, label: '100 km' },
];

export default function NouvelleDemandePubliquePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [villeSuggestions, setVilleSuggestions] = useState<VilleSuggestion[]>([]);
  const [showVilleSuggestions, setShowVilleSuggestions] = useState(false);
  const [codePostalSuggestions, setCodePostalSuggestions] = useState<VilleSuggestion[]>([]);
  const [showCodePostalSuggestions, setShowCodePostalSuggestions] = useState(false);
  const villeInputRef = useRef<HTMLInputElement>(null);
  const codePostalInputRef = useRef<HTMLInputElement>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  
  const [formData, setFormData] = useState({
    metier: 'plomberie' as Categorie,
    ville: '',
    codePostal: '',
    adresse: '',
    rayon: 50,
    titre: '',
    description: '',
    budget: 0,
    dateDebut: '',
    dateFin: '',
    flexible: true,
    flexibiliteDays: 7,
  });

  // Pré-remplir le formulaire depuis le contexte de recherche
  useEffect(() => {
    const searchContext = getSearchContext();
    if (searchContext) {
      console.log('✅ Contexte de recherche trouvé:', searchContext);
      
      // Pré-remplir le formulaire
      setFormData(prev => ({
        ...prev,
        metier: searchContext.categorie,
        titre: generateDemandeTitle(searchContext),
        description: generateDemandeDescription(searchContext),
      }));
      
      // Nettoyer le contexte après utilisation
      clearSearchContext();
    }
  }, []);

  // Redirection si pas connecté
  if (!authLoading && !user) {
    router.push('/connexion');
    return null;
  }

  // Autocomplétion ville avec API geo.gouv.fr
  const searchVilles = async (query: string) => {
    if (query.length < 2) {
      setVilleSuggestions([]);
      return;
    }

    try {
      const response = await fetch(
        `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query)}&fields=nom,code,codesPostaux&boost=population&limit=10`
      );
      const data: VilleSuggestion[] = await response.json();
      setVilleSuggestions(data);
      setShowVilleSuggestions(true);
    } catch (error) {
      console.error('Erreur recherche villes:', error);
    }
  };

  // Autocomplétion code postal avec API geo.gouv.fr
  const searchByCodePostal = async (codePostal: string) => {
    if (codePostal.length < 2) {
      setCodePostalSuggestions([]);
      return;
    }

    try {
      const response = await fetch(
        `https://geo.api.gouv.fr/communes?codePostal=${encodeURIComponent(codePostal)}&fields=nom,code,codesPostaux&boost=population&limit=10`
      );
      const data: VilleSuggestion[] = await response.json();
      setCodePostalSuggestions(data);
      setShowCodePostalSuggestions(true);
    } catch (error) {
      console.error('Erreur recherche par code postal:', error);
    }
  };

  // Gérer changement ville
  const handleVilleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData({...formData, ville: value});
    
    if (value.length >= 3) {
      searchVilles(value);
      
      // Remplissage auto du code postal avec la première ville trouvée
      try {
        const response = await fetch(
          `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(value)}&fields=nom,code,codesPostaux&boost=population&limit=1`
        );
        const data: VilleSuggestion[] = await response.json();
        if (data.length > 0 && data[0].nom.toLowerCase() === value.toLowerCase()) {
          setFormData(prev => ({
            ...prev,
            ville: data[0].nom,
            codePostal: data[0].codesPostaux[0] || prev.codePostal
          }));
        }
      } catch (error) {
        console.error('Erreur auto-remplissage code postal:', error);
      }
    }
  };

  // Gérer changement code postal
  const handleCodePostalChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData({...formData, codePostal: value});
    
    if (value.length >= 2) {
      searchByCodePostal(value);
    }
    
    // Remplissage auto de la ville quand code postal complet (5 chiffres)
    if (value.length === 5) {
      try {
        const response = await fetch(
          `https://geo.api.gouv.fr/communes?codePostal=${encodeURIComponent(value)}&fields=nom,code,codesPostaux&boost=population&limit=1`
        );
        const data: VilleSuggestion[] = await response.json();
        if (data.length > 0) {
          setFormData(prev => ({
            ...prev,
            ville: data[0].nom,
            codePostal: value
          }));
        }
      } catch (error) {
        console.error('Erreur auto-remplissage ville:', error);
      }
    }
  };

  // Sélectionner une ville dans les suggestions
  const selectVille = (ville: VilleSuggestion) => {
    setFormData({
      ...formData,
      ville: ville.nom,
      codePostal: ville.codesPostaux[0] || '',
    });
    setShowVilleSuggestions(false);
    setVilleSuggestions([]);
  };

  // Sélectionner depuis suggestions code postal
  const selectFromCodePostal = (ville: VilleSuggestion) => {
    setFormData({
      ...formData,
      ville: ville.nom,
      codePostal: ville.codesPostaux[0] || '',
    });
    setShowCodePostalSuggestions(false);
    setCodePostalSuggestions([]);
  };

  // Fermer suggestions si clic en dehors
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (villeInputRef.current && !villeInputRef.current.contains(event.target as Node)) {
        setShowVilleSuggestions(false);
      }
      if (codePostalInputRef.current && !codePostalInputRef.current.contains(event.target as Node)) {
        setShowCodePostalSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    // Validation: max 5 photos, taille < 5MB chacune
    if (photos.length + files.length > 5) {
      alert(t('alerts.demande.maxPhotos'));
      return;
    }

    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        alert(`La photo ${file.name} dépasse 5MB`);
        return;
      }
      if (!file.type.startsWith('image/')) {
        alert(`Le fichier ${file.name} n'est pas une image`);
        return;
      }
    }

    setPhotos([...photos, ...files]);
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      router.push('/connexion');
      return;
    }

    // Validation
    if (!formData.ville || !formData.codePostal) {
      alert(t('alerts.publicDemand.cityAndPostalRequired'));
      return;
    }

    if (!formData.titre || formData.titre.length < 10) {
      alert(t('alerts.publicDemand.titleRequired'));
      return;
    }

    if (!formData.description || formData.description.length < 50) {
      alert(t('alerts.publicDemand.descriptionRequired'));
      return;
    }

    if (!formData.dateDebut) {
      alert(t('alerts.publicDemand.startDateRequired'));
      return;
    }

    setLoading(true);

    try {
      console.log('📤 Début création demande publique...');
      
      // Upload des photos vers Firebase Storage
      let photoUrls: string[] = [];
      if (photos.length > 0) {
        console.log(`📤 Upload de ${photos.length} photo(s)...`);
        try {
          photoUrls = await uploadMultiplePhotos(photos, 'demandes', user.uid);
          console.log(`✅ Photos uploadées:`, photoUrls);
        } catch (error: any) {
          console.error('❌ Erreur upload photos:', error);
          alert(`⚠️ Erreur lors de l'upload des photos: ${error.message || 'Erreur inconnue'}. La demande sera créée sans photos.`);
          photoUrls = [];
        }
      }

      // Préparer dates
      const dateDebut = new Date(formData.dateDebut);
      const dateFin = formData.dateFin ? new Date(formData.dateFin) : dateDebut;
      const dates = [Timestamp.fromDate(dateDebut)];
      if (formData.dateFin) {
        dates.push(Timestamp.fromDate(dateFin));
      }

      // Créer la demande publique
      const demandeData: any = {
        type: 'publique' as const,  // ⭐ Type publique
        statut: 'publiee' as const, // Publié directement (pas de brouillon)
        clientId: user.uid,
        categorie: formData.metier,
        titre: formData.titre,
        description: formData.description,
        
        localisation: {
          adresse: formData.adresse || '',
          ville: formData.ville,
          codePostal: formData.codePostal,
        },
        
        datesSouhaitees: {
          dateDebut: formData.dateDebut,
          dateFin: formData.dateFin || undefined,
          dates: dates,
          flexible: formData.flexible,
          flexibiliteDays: formData.flexible ? formData.flexibiliteDays : 0,
          urgence: 'normal' as const,
        },
        
        // ⭐ Critères de recherche pour matching automatique
        critereRecherche: {
          metier: formData.metier,
          ville: formData.ville,
          rayon: formData.rayon,
        },
        
        photosUrls: photoUrls,
        artisansMatches: [], // Vide au départ
        artisansNotifiesIds: [], // ⭐ Pour tracking notifications
        artisansInteressesIds: [], // ⭐ Pour tracking consultations
      };

      // Ajouter budget seulement si renseigné
      if (formData.budget > 0) {
        demandeData.budgetIndicatif = formData.budget;
      }

      console.log('🔨 Création de la demande publique dans Firestore...');
      const demande = await createDemande(demandeData);
      console.log('✅ Demande créée avec ID:', demande.id);

      // Matching immédiat avec artisans existants
      console.log('🎯 Lancement du matching automatique...');
      const result = await matchAndNotifyArtisansForPublicDemande(demande);
      
      console.log(`✅ Matching terminé: ${result.matched} artisans matchés, ${result.notified} notifiés`);

      // Message de confirmation adapté
      if (result.matched === 0) {
        alert(
          `✅ Demande publiée !\n\n` +
          `Aucun artisan disponible pour le moment dans votre zone.\n\n` +
          `Pas d'inquiétude ! Vous serez automatiquement notifié dès qu'un artisan correspondant s'inscrira sur la plateforme.`
        );
      } else if (result.notified === 0) {
        alert(
          `✅ Demande publiée !\n\n` +
          `${result.matched} artisan(s) correspondent à votre demande mais ont déjà été notifiés.\n\n` +
          `Vous recevrez une notification lorsqu'ils consulteront votre demande.`
        );
      } else {
        alert(
          `✅ Demande publiée avec succès !\n\n` +
          `${result.notified} artisan(s) qualifié(s) ont été notifiés.\n\n` +
          `Vous recevrez une notification dès qu'un artisan vous enverra un devis.`
        );
      }

      // Rediriger vers mes demandes
      router.push('/client/demandes');
      
    } catch (error) {
      console.error('❌ Erreur création demande publique:', error);
      alert(t('alerts.publicDemand.publishError'));
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00] mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* En-tête */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-[#FF6B00] mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour
          </button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-[#2C3E50] mb-2">
                📢 Publier une Demande Ouverte
              </h1>
              <p className="text-gray-600 text-lg">
                Recevez plusieurs devis d'artisans qualifiés dans votre zone
              </p>
            </div>
            <button
              onClick={() => setShowHowItWorks(!showHowItWorks)}
              className="flex items-center gap-2 px-4 py-2 bg-[#FF6B00] text-white rounded-lg hover:bg-[#E56100] transition-colors shadow-md"
              title="Afficher/masquer comment ça marche"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span className="hidden sm:inline">💡 Comment ça marche ?</span>
              <span className="sm:hidden">💡</span>
            </button>
          </div>
        </div>

        {/* Encart "Comment ça marche" (affichage conditionnel) */}
        {showHowItWorks && (
          <div 
            className="mb-6 animate-fadeIn"
            onClick={() => setShowHowItWorks(false)}
          >
            <Card className="border-l-4 border-[#FF6B00] bg-orange-50">
              <div className="p-4">
                <h3 className="font-bold text-[#2C3E50] mb-2 flex items-center gap-2">
                  <svg className="w-5 h-5 text-[#FF6B00]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  Comment ça marche ?
                </h3>
                <ul className="space-y-1 text-sm text-gray-700">
                  <li>✓ Vous publiez votre demande avec vos critères (métier, localisation, rayon)</li>
                  <li>✓ Tous les artisans correspondants dans la zone sont automatiquement notifiés</li>
                  <li>✓ Les nouveaux artisans qui s'inscrivent plus tard reçoivent aussi la notification</li>
                  <li>✓ Vous recevez plusieurs devis et choisissez la meilleure offre</li>
                </ul>
              </div>
            </Card>
          </div>
        )}

        {/* Formulaire */}
        <form onSubmit={handleSubmit}>
          <Card className="p-6">
            {/* Critères de recherche */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-[#2C3E50] mb-4 flex items-center gap-2">
                <svg className="w-6 h-6 text-[#FF6B00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Critères de Recherche
              </h2>
              
              <div className="grid md:grid-cols-2 gap-4">
                {/* Métier */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Métier recherché <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.metier}
                    onChange={(e) => setFormData({...formData, metier: e.target.value as Categorie})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                    required
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rayon */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rayon de recherche <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.rayon}
                    onChange={(e) => setFormData({...formData, rayon: Number(e.target.value)})}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                    required
                  >
                    {RAYONS.map(r => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Ville */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ville <span className="text-red-500">*</span>
                  </label>
                  <Input
                    ref={villeInputRef}
                    type="text"
                    value={formData.ville}
                    onChange={handleVilleChange}
                    onFocus={() => formData.ville.length >= 2 && setShowVilleSuggestions(true)}
                    placeholder="Ex: Paris"
                    autoComplete="off"
                    required
                  />
                  
                  {/* Suggestions dropdown */}
                  {showVilleSuggestions && villeSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {villeSuggestions.map((ville, index) => (
                        <button
                          key={`${ville.code}-${index}`}
                          type="button"
                          onClick={() => selectVille(ville)}
                          className="w-full px-4 py-2 text-left hover:bg-gray-100 flex justify-between items-center"
                        >
                          <span className="font-medium text-gray-800">{ville.nom}</span>
                          <span className="text-sm text-gray-500">{ville.codesPostaux[0]}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Code postal */}
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Code postal <span className="text-red-500">*</span>
                  </label>
                  <Input
                    ref={codePostalInputRef}
                    type="text"
                    value={formData.codePostal}
                    onChange={handleCodePostalChange}
                    onFocus={() => formData.codePostal.length >= 2 && setShowCodePostalSuggestions(true)}
                    placeholder="Ex: 75001"
                    pattern="[0-9]{5}"
                    maxLength={5}
                    autoComplete="off"
                    required
                  />
                  
                  {/* Suggestions dropdown */}
                  {showCodePostalSuggestions && codePostalSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {codePostalSuggestions.map((ville, index) => (
                        <button
                          key={`${ville.code}-${index}`}
                          type="button"
                          onClick={() => selectFromCodePostal(ville)}
                          className="w-full px-4 py-2 text-left hover:bg-gray-100 flex justify-between items-center"
                        >
                          <span className="font-medium text-gray-800">{ville.nom}</span>
                          <span className="text-sm text-gray-500">{ville.codesPostaux[0]}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  
                  <p className="text-xs text-gray-500 mt-1">Tapez pour voir les villes correspondantes</p>
                </div>

                {/* Adresse (optionnel) */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Adresse complète (optionnel)
                  </label>
                  <Input
                    type="text"
                    value={formData.adresse}
                    onChange={(e) => setFormData({...formData, adresse: e.target.value})}
                    placeholder="Ex: 12 rue de la République"
                  />
                </div>
              </div>
            </div>

            {/* Description du projet */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-[#2C3E50] mb-4 flex items-center gap-2">
                <svg className="w-6 h-6 text-[#FF6B00]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Description du Projet
              </h2>

              <div className="space-y-4">
                {/* Titre */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Titre de la demande <span className="text-red-500">*</span>
                    <span className="text-gray-500 text-xs ml-2">(min. 10 caractères)</span>
                  </label>
                  <Input
                    type="text"
                    value={formData.titre}
                    onChange={(e) => setFormData({...formData, titre: e.target.value})}
                    placeholder="Ex: Réparation fuite d'eau sous évier cuisine"
                    minLength={10}
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description détaillée <span className="text-red-500">*</span>
                    <span className="text-gray-500 text-xs ml-2">(min. 50 caractères)</span>
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder="Décrivez votre projet en détail : nature des travaux, contraintes, attentes..."
                    rows={6}
                    minLength={50}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent resize-none"
                    required
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    {formData.description.length} / 50 caractères minimum
                  </p>
                </div>

                {/* Budget indicatif */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Budget indicatif (optionnel)
                  </label>
                  <Input
                    type="number"
                    value={formData.budget || ''}
                    onChange={(e) => setFormData({...formData, budget: Number(e.target.value)})}
                    placeholder="Ex: 1500"
                    min="0"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Indiquez un budget approximatif pour votre projet
                  </p>
                </div>

                {/* Date de début */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date de début souhaitée <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="date"
                    value={formData.dateDebut}
                    onChange={(e) => setFormData({...formData, dateDebut: e.target.value})}
                    min={new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>

                {/* Flexibilité */}
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.flexible}
                      onChange={(e) => setFormData({...formData, flexible: e.target.checked})}
                      className="w-4 h-4 text-[#FF6B00] border-gray-300 rounded focus:ring-[#FF6B00]"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Dates flexibles
                    </span>
                  </label>
                  {formData.flexible && (
                    <div className="mt-2 ml-6">
                      <label className="block text-sm text-gray-600 mb-1">
                        Flexibilité (± jours)
                      </label>
                      <Input
                        type="number"
                        value={formData.flexibiliteDays}
                        onChange={(e) => setFormData({...formData, flexibiliteDays: Number(e.target.value)})}
                        min="0"
                        max="30"
                        className="w-32"
                      />
                    </div>
                  )}
                </div>

                {/* Photos */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Photos (optionnel, max 5)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoUpload}
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-lg file:border-0
                      file:text-sm file:font-semibold
                      file:bg-[#FF6B00] file:text-white
                      hover:file:bg-[#E56100]
                      cursor-pointer"
                  />
                  
                  {photos.length > 0 && (
                    <div className="mt-4 grid grid-cols-3 gap-4">
                      {photos.map((photo, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={URL.createObjectURL(photo)}
                            alt={`Photo ${index + 1}`}
                            className="w-full h-32 object-cover rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => removePhoto(index)}
                            className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Boutons */}
            <div className="flex gap-4 justify-end">
              <Button
                type="button"
                onClick={() => router.back()}
                variant="secondary"
                disabled={loading}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-[#FF6B00] hover:bg-[#E56100] text-white px-8"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Publication...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    📢 Publier la demande
                  </span>
                )}
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </div>
  );
}
