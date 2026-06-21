'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { createDemandeExpress } from '@/lib/firebase/demande-express-service';
import { uploadMultiplePhotos } from '@/lib/firebase/storage-service';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { getUserById } from '@/lib/firebase/user-service';
import type { Categorie, User } from '@/types/firestore';
import {
  EXPRESS_WORK_TAXONOMY,
  getExpressCategories,
  getExpressCategorieOption,
  getExpressSousCategorieLabel,
  type TypeTravauxExpress,
} from '@/lib/express-work-taxonomy';

export default function NouvelleDemandeExpressPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: firebaseUser, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [userData, setUserData] = useState<User | null>(null);

  // Paramètres URL
  const artisanIdParam = searchParams.get('artisanId') || '';
  const typeTravauxParam = (searchParams.get('typeTravaux') as TypeTravauxExpress) || 'depannage-urgence';
  const categorieExpressParam = searchParams.get('categorieExpress') || '';
  const categorieMetierParam = (searchParams.get('categorie') as Categorie) || '';
  const sousCategorieParam = searchParams.get('sousCategorie') || '';
  const villeParam = searchParams.get('ville') || '';
  const codePostalParam = searchParams.get('codePostal') || '';

  // États du formulaire
  const [artisanId, setArtisanId] = useState(artisanIdParam);
  const [typeTravaux, setTypeTravaux] = useState<TypeTravauxExpress>(typeTravauxParam);
  const [categorieExpress, setCategorieExpress] = useState(categorieExpressParam || categorieMetierParam || '');
  const [sousCategorie, setSousCategorie] = useState(sousCategorieParam);
  const [description, setDescription] = useState('');
  const [budgetPropose, setBudgetPropose] = useState('');
  const [ville, setVille] = useState(villeParam);
  const [codePostal, setCodePostal] = useState(codePostalParam);
  const [photos, setPhotos] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  const categorieOptions = getExpressCategories(typeTravaux);
  const selectedCategorie = getExpressCategorieOption(typeTravaux, categorieExpress);
  const urgence = EXPRESS_WORK_TAXONOMY[typeTravaux].urgenceValue;
  const dateReference = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (authLoading) return; // Attendre que Firebase initialise
    if (!firebaseUser) {
      router.push('/connexion');
      return;
    }
    loadUserData();
  }, [firebaseUser, authLoading]);

  useEffect(() => {
    const isValidCategorie = categorieOptions.some((cat) => cat.value === categorieExpress);
    if (!isValidCategorie) {
      setCategorieExpress('');
      setSousCategorie('');
      return;
    }

    if (selectedCategorie && !selectedCategorie.sousCategories.some((sub) => sub.value === sousCategorie)) {
      setSousCategorie('');
    }
  }, [typeTravaux, categorieExpress, sousCategorie]);

  async function loadUserData() {
    if (firebaseUser) {
      try {
        const data = await getUserById(firebaseUser.uid);
        setUserData(data);
        
        if (data?.role !== 'client') {
          alert(t('alerts.express.clientOnly'));
          router.push('/');
        }
      } catch (error) {
        console.error('Erreur chargement user:', error);
      }
    }
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (photos.length + files.length > 5) {
      alert('Maximum 5 photos autorisées');
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
    setPhotos(prev => [...prev, ...files]);
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!firebaseUser || !userData) {
      alert(t('alerts.express.mustBeLogged'));
      return;
    }

    if (!selectedCategorie || !description || !ville || !codePostal) {
      alert(t('alerts.express.fillRequired'));
      return;
    }

    const budget = budgetPropose ? parseFloat(budgetPropose) : undefined;
    if (budget && budget > 150) {
      alert(t('alerts.express.budgetExceeded'));
      return;
    }

    setLoading(true);

    try {
      // Géocodage de la ville
      let coordinates: { latitude: number; longitude: number } | null = null;
      try {
        const geoResponse = await fetch(
          `https://geo.api.gouv.fr/communes?codePostal=${codePostal}&fields=centre&limit=1`
        );
        const geoData = await geoResponse.json();
        if (geoData.length > 0 && geoData[0].centre?.coordinates) {
          // Format GeoJSON : tableau [longitude, latitude]
          const [lon, lat] = geoData[0].centre.coordinates;
          coordinates = { latitude: lat, longitude: lon };
        }
      } catch (error) {
        console.error('Erreur géocodage:', error);
      }

      let photoUrls: string[] = [];
      if (photos.length > 0) {
        try {
          photoUrls = await uploadMultiplePhotos(photos, 'demandes_express', firebaseUser.uid);
        } catch {
          photoUrls = [];
        }
      }

      const demandeId = await createDemandeExpress({
        clientId: firebaseUser.uid,
        artisanId: artisanId ? artisanId : undefined,
        typeTravauxExpress: typeTravaux,
        categorie: selectedCategorie.metier,
        categorieLabel: selectedCategorie.label,
        sousCategorie: sousCategorie || undefined,
        sousCategorieLabel: getExpressSousCategorieLabel(typeTravaux, categorieExpress, sousCategorie) || undefined,
        description,
        budgetPropose: budget,
        ville,
        codePostal,
        coordonneesGPS: coordinates !== null ? coordinates : undefined,
        date: dateReference,
        urgence,
        typeProjet: 'express',
        photos: photoUrls.length > 0 ? photoUrls : undefined,
      });

      alert(t('alerts.express.createSuccess'));
      router.push(`/client/demandes-express/${demandeId}`);
    } catch (error: any) {
      console.error('Erreur création demande:', error);
      alert(error.message || 'Erreur lors de la création de la demande');
    } finally {
      setLoading(false);
    }
  }

  if (!userData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00] mx-auto mb-4"></div>
          <p className="text-[#6C757D]">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F8F9FA] to-white">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-[#E9ECEF]">
        <div className="container mx-auto px-4 py-6">
          <nav className="flex items-center gap-2 text-sm mb-4">
            <Link href="/" className="text-[#2C3E50] hover:text-[#FF6B00]">
              Accueil
            </Link>
            <span className="text-[#6C757D]">&gt;</span>
            <Link href="/petits-travaux-express/recherche" className="text-[#2C3E50] hover:text-[#FF6B00]">
              Travaux express
            </Link>
            <span className="text-[#6C757D]">&gt;</span>
            <span className="text-[#2C3E50] font-semibold">Nouvelle demande</span>
          </nav>

          <h1 className="text-2xl md:text-3xl font-bold text-[#2C3E50]">
            🚀 Nouvelle demande express
          </h1>
          <p className="text-[#6C757D] mt-2">
            Intervention rapide — moins de 150€ • Sans devis formel
          </p>
        </div>
      </div>

      {/* Formulaire */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-6 md:p-8 space-y-6">
            {/* Catégorie */}
            <div>
              <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                Type de travaux <span className="text-red-500">*</span>
              </label>
              {typeTravauxParam ? (
                <div className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg bg-[#F8F9FA] text-[#2C3E50] font-semibold">
                  {typeTravaux === 'depannage-urgence' ? '🚨 Dépannage en urgence' : '🛠️ Petits travaux & maintenance'}
                </div>
              ) : (
                <select
                  value={typeTravaux}
                  onChange={(e) => {
                    setTypeTravaux(e.target.value as TypeTravauxExpress);
                    setCategorieExpress('');
                    setSousCategorie('');
                  }}
                  required
                  className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none"
                >
                  <option value="depannage-urgence">🚨 Dépannage en urgence</option>
                  <option value="petits-travaux-maintenance">🛠️ Petits travaux & maintenance</option>
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                Catégorie <span className="text-red-500">*</span>
              </label>
              {categorieExpressParam ? (
                <div className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg bg-[#F8F9FA] text-[#2C3E50] font-semibold">
                  {selectedCategorie?.label ?? categorieExpress}
                </div>
              ) : (
                <select
                  value={categorieExpress}
                  onChange={(e) => {
                    setCategorieExpress(e.target.value);
                    setSousCategorie('');
                  }}
                  required
                  className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none"
                >
                  <option value="">Sélectionnez une catégorie</option>
                  {categorieOptions.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Sous-catégorie */}
            {selectedCategorie && (
              <div>
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                  Sous catégorie
                </label>
                {sousCategorieParam ? (
                  <div className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg bg-[#F8F9FA] text-[#2C3E50] font-semibold">
                    {selectedCategorie.sousCategories.find(sc => sc.value === sousCategorie)?.label ?? sousCategorie}
                  </div>
                ) : (
                  <select
                    value={sousCategorie}
                    onChange={(e) => setSousCategorie(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none"
                  >
                    <option value="">-- Choisir une sous-catégorie --</option>
                    {selectedCategorie.sousCategories.map((sc) => (
                      <option key={sc.value} value={sc.value} title={sc.prix ? `Prix indicatif : ${sc.prix}` : undefined}>
                        {sc.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                Description des travaux <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={4}
                placeholder="Décrivez en détail les travaux à réaliser..."
                className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none resize-none"
              />
              <p className="text-xs text-[#6C757D] mt-1">
                Soyez précis pour que l'artisan puisse vous faire une proposition adaptée
              </p>
            </div>

            {/* Photos */}
            <div>
              <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                Photos du chantier (optionnel)
              </label>
              <div className="border-2 border-dashed border-[#E9ECEF] rounded-lg p-6 text-center hover:border-[#FF6B00] transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                  id="photo-upload-express"
                />
                <label htmlFor="photo-upload-express" className="cursor-pointer">
                  <div className="text-5xl mb-3">📷</div>
                  <p className="text-[#2C3E50] font-semibold mb-1">Cliquez pour ajouter des photos</p>
                  <p className="text-sm text-[#6C757D]">Maximum 5 photos • 5MB par photo • JPG, PNG</p>
                </label>
              </div>
              {photos.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
                  {photos.map((photo, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={URL.createObjectURL(photo)}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg border border-[#E9ECEF]"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        className="absolute top-1 right-1 bg-[#DC3545] text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Budget proposé */}
            <div>
              <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                Budget proposé (optionnel)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={budgetPropose}
                  onChange={(e) => setBudgetPropose(e.target.value)}
                  min="1"
                  max="150"
                  step="1"
                  placeholder="Ex: 120"
                  className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none pr-12"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6C757D] font-semibold">
                  €
                </span>
              </div>
            </div>

            {/* Localisation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                  Ville <span className="text-red-500">*</span>
                </label>
                {villeParam ? (
                  <div className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg bg-[#F8F9FA] text-[#2C3E50] font-semibold">
                    {ville}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={ville}
                    onChange={(e) => setVille(e.target.value)}
                    required
                    placeholder="Ex: Paris"
                    className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none"
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                  Code postal <span className="text-red-500">*</span>
                </label>
                {codePostalParam ? (
                  <div className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg bg-[#F8F9FA] text-[#2C3E50] font-semibold">
                    {codePostal}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={codePostal}
                    onChange={(e) => setCodePostal(e.target.value)}
                    required
                    pattern="[0-9]{5}"
                    placeholder="Ex: 75001"
                    className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:outline-none"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#2C3E50] mb-2">
                Urgence
              </label>
              <div className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-lg bg-[#F8F9FA] text-[#2C3E50] font-semibold">
                {typeTravaux === 'depannage-urgence' ? '🚨' : '⚡'} {EXPRESS_WORK_TAXONOMY[typeTravaux].urgenceLabel}
              </div>
            </div>

            {/* Info */}
            <div className="bg-[#FFF5EE] border-2 border-[#FF6B00] rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-[#FF6B00] flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <h4 className="font-semibold text-[#2C3E50] mb-1">Comment ça marche ?</h4>
                  <ul className="text-sm text-[#6C757D] space-y-1">
                    <li>1️⃣ Vous envoyez votre demande à l'artisan</li>
                    <li>2️⃣ L'artisan vous fait une proposition de prix</li>
                    <li>3️⃣ Vous acceptez et payez directement</li>
                    <li>4️⃣ L'artisan intervient rapidement !</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Boutons */}
            <div className="flex gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                className="flex-1 py-3 rounded-lg font-semibold"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 bg-[#FF6B00] hover:bg-[#E56100] text-white py-3 rounded-lg font-semibold"
              >
                {loading ? '⏳ Envoi...' : '✉️ Envoyer ma demande'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
