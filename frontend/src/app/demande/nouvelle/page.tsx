'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { createDemande, publierDemande, addArtisansMatches, getDemandeById, updateDemande } from '@/lib/firebase/demande-service';
import { notifyArtisanNouvelDemande, sendBulkNotifications, notifyArtisansDemandePublique } from '@/lib/firebase/notification-service';
import { uploadMultiplePhotos } from '@/lib/firebase/storage-service';
import { getArtisanByUserId } from '@/lib/firebase/artisan-service';
import type { Artisan } from '@/types/firestore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Timestamp } from 'firebase/firestore';

function NouvelleDemandeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [artisan, setArtisan] = useState<Artisan | null>(null);
  const [searchCriteria, setSearchCriteria] = useState<any>(null);
  const [isEditingBrouillon, setIsEditingBrouillon] = useState(false);
  const [showExpirationInfo, setShowExpirationInfo] = useState(false);

  const artisanPreselect = searchParams.get('artisan');
  const brouillonId = searchParams.get('brouillonId');

  // Protection immédiate : Rediriger si non connecté
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/connexion?redirect=/demande/nouvelle');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    // Charger les critères de recherche
    const savedCriteria = sessionStorage.getItem('searchCriteria');
    if (savedCriteria) {
      setSearchCriteria(JSON.parse(savedCriteria));
    }

    // Charger l'artisan pré-sélectionné
    async function loadArtisan() {
      if (artisanPreselect) {
        try {
          const artisanData = await getArtisanByUserId(artisanPreselect);
          setArtisan(artisanData);
        } catch (error) {
          console.error('Erreur chargement artisan:', error);
        }
      }
    }
    loadArtisan();

    // Charger le brouillon si brouillonId est présent
    async function loadBrouillon() {
      if (brouillonId && user) {
        try {
          const brouillon = await getDemandeById(brouillonId);
          if (brouillon && brouillon.clientId === user.uid && brouillon.statut === 'genere') {
            setIsEditingBrouillon(true);
            
            // Pré-remplir le formulaire avec les données du brouillon
            setFormData({
              titre: brouillon.titre,
              description: brouillon.description,
              budget: typeof (brouillon as any).budget === 'number' 
                ? (brouillon as any).budget 
                : ((brouillon as any).budget?.min || brouillon.budgetIndicatif || 0), // Compatibilité ancien format
            });

            // Pré-remplir les critères de recherche depuis le brouillon
            const brouillonCriteria = {
              categorie: brouillon.categorie,
              ville: brouillon.localisation.ville,
              codePostal: brouillon.localisation.codePostal,
              adresse: brouillon.localisation.adresse || '',
              coordonneesGPS: brouillon.localisation.coordonneesGPS,
              dates: brouillon.datesSouhaitees?.dates?.map(d => 
                d.toDate().toISOString().split('T')[0]
              ) || [],
              flexible: brouillon.datesSouhaitees?.flexible || false,
              flexibiliteDays: brouillon.datesSouhaitees?.flexibiliteDays || 0,
              urgence: brouillon.urgence,
            };
            setSearchCriteria(brouillonCriteria);
            sessionStorage.setItem('searchCriteria', JSON.stringify(brouillonCriteria));
          }
        } catch (error) {
          console.error('❌ Erreur chargement brouillon:', error);
          alert(t('alerts.draft.loadError'));
        }
      }
    }
    loadBrouillon();
  }, [artisanPreselect, brouillonId, user]);

  const [formData, setFormData] = useState({
    titre: '',
    description: '',
    budget: 0, // Budget unique au lieu de min/max
  });

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

    // La vérification d'authentification est maintenant faite en amont via useEffect
    // L'utilisateur est automatiquement redirigé vers /connexion s'il n'est pas connecté

    if (!formData.titre || !formData.description) {
      alert(t('alerts.demande.fillAllFields'));
      return;
    }

    if (formData.titre.length < 10) {
      alert(t('alerts.publicDemand.titleRequired'));
      return;
    }

    if (formData.description.length < 50) {
      alert(t('alerts.publicDemand.descriptionRequired'));
      return;
    }

    setLoading(true);

    try {
      console.log('📤 Début création de la demande...');
      
      // Récupérer les critères de recherche depuis sessionStorage
      const searchCriteria = sessionStorage.getItem('searchCriteria');
      if (!searchCriteria) {
        alert(t('alerts.demande.missingCriteria'));
        router.push('/recherche');
        return;
      }

      const criteria = JSON.parse(searchCriteria);
      console.log('✅ Critères récupérés:', criteria);

      // Upload des photos vers Firebase Storage
      let photoUrls: string[] = [];
      if (photos.length > 0) {
        console.log(`📤 Upload de ${photos.length} photo(s) vers Firebase Storage...`);
        try {
          photoUrls = await uploadMultiplePhotos(photos, 'demandes', user!.uid);
          console.log(`✅ Photos uploadées:`, photoUrls);
        } catch (error: any) {
          console.error('❌ Erreur upload photos:', error);
          console.error('Détails erreur:', error.message, error.code);
          alert(`⚠️ Erreur lors de l'upload des photos: ${error.message || 'Erreur inconnue'}. La demande sera créée sans photos.`);
          // Continuer sans photos
          photoUrls = [];
        }
      }

      // Créer la demande
      const demandeData: any = {
        type: 'directe' as const, // ✅ Demande directe (envoyée à un artisan spécifique)
        clientId: user!.uid,
        categorie: criteria.categorie,
        titre: formData.titre,
        description: formData.description,
        localisation: {
          adresse: criteria.adresse || '',
          ville: criteria.ville,
          codePostal: criteria.codePostal,
          coordonneesGPS: criteria.coordonneesGPS,
        },
        datesSouhaitees: {
          dates: criteria.dates.map((d: string) => Timestamp.fromDate(new Date(d))),
          flexible: criteria.flexible || false,
          flexibiliteDays: criteria.flexible ? (criteria.flexibiliteDays || 0) : 0,
        },
        urgence: criteria.urgence,
        photosUrls: photoUrls, // URLs Firebase Storage au lieu des noms de fichiers
        // ✅ Statut intelligent : 'matchee' si artisan présélectionné, sinon 'publiee'
        statut: (artisanPreselect ? 'matchee' : 'publiee'),
        devisRecus: 0,
        artisansMatches: artisanPreselect ? [artisanPreselect] : [],
      };

      // Ajouter budgetIndicatif seulement si > 0 (Firestore refuse undefined)
      if (formData.budget > 0) {
        demandeData.budgetIndicatif = formData.budget;
      }

      // Créer ou mettre à jour la demande
      let demandeId: string;
      
      if (isEditingBrouillon && brouillonId) {
        // Mise à jour du brouillon existant
        console.log('📝 Mise à jour du brouillon existant:', brouillonId);
        await updateDemande(brouillonId, demandeData);
        demandeId = brouillonId;
        console.log('✅ Brouillon mis à jour');
      } else {
        // Création d'une nouvelle demande
        console.log('🔨 Création de la demande dans Firestore...');
        const demande = await createDemande(demandeData);
        demandeId = demande.id;
        console.log('✅ Demande créée avec ID:', demandeId);
      }

      // Si artisan présélectionné, ajouter le match (déjà fait ci-dessus dans artisansMatches)
      if (artisanPreselect) {
        console.log('👷 Artisan pré-sélectionné:', artisanPreselect, '(déjà dans artisansMatches)');
      }

      // Pas besoin de publierDemande() car statut déjà correct ('matchee' ou 'publiee')
      console.log('✅ Demande créée avec statut correct:', demandeData.statut);

      // Envoyer notifications aux artisans
      if (demandeData.artisansMatches.length > 0) {
        // Cas 1 : artisan présélectionné → notification directe
        try {
          console.log('🔔 Envoi notification à l\'artisan présélectionné...');
          await sendBulkNotifications(
            demandeData.artisansMatches,
            {
              type: 'nouvelle_demande',
              titre: `Nouvelle demande: ${criteria.categorie}`,
              message: `Un client recherche un artisan à ${criteria.ville}. Consultez la demande pour envoyer un devis.`,
              lien: `/artisan/demandes`,
            }
          );
          console.log('✅ Notification artisan présélectionné envoyée');
        } catch (notifError) {
          console.error('⚠️ Erreur envoi notification artisan présélectionné:', notifError);
        }
      } else {
        // Cas 2 : aucun artisan présélectionné → notifier tous les artisans qualifiés
        // (même logique que demande publique)
        notifyArtisansDemandePublique(
          demandeId,
          demandeData.categorie || criteria.categorie,
          criteria.ville,
          formData.description || '',
          criteria.coordonneesGPS
            ? { latitude: criteria.coordonneesGPS.latitude, longitude: criteria.coordonneesGPS.longitude }
            : undefined
        ).then(notified => {
          console.log(`✅ ${notified.length} artisan(s) notifié(s) pour la demande`);
        }).catch(err => {
          console.error('⚠️ Erreur notification artisans (non bloquant):', err);
        });
      }

      // Rediriger vers tableau de bord
      const successMessage = isEditingBrouillon
        ? `✅ Votre brouillon "${formData.titre}" a été complété et publié avec succès !\n\n${artisan ? `${artisan.raisonSociale} a reçu une notification.` : 'Les artisans correspondants vont recevoir une notification.'}\n\nVous pouvez suivre l'état de votre demande depuis votre tableau de bord.`
        : `✅ Votre demande "${formData.titre}" a été créée avec succès !\n\n${artisan ? `${artisan.raisonSociale} a reçu une notification.` : 'Les artisans correspondants vont recevoir une notification.'}\n\nVous pouvez suivre l'état de votre demande depuis votre tableau de bord.`;
      
      alert(successMessage);
      router.push('/dashboard');

    } catch (error) {
      console.error('❌ Erreur création demande:', error);
      alert(`❌ Erreur lors de la création de la demande.\n\nDétails: ${error instanceof Error ? error.message : 'Erreur inconnue'}\n\nVeuillez réessayer ou contacter le support.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* Header */}
      <header className="bg-[#2C3E50] text-white py-6 shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">
                {isEditingBrouillon ? 'Compléter votre brouillon' : 'Créer votre demande de devis'}
              </h1>
              <p className="text-[#95A5A6] mt-2">
                {isEditingBrouillon ? 'Finalisez et publiez votre demande' : 'Complétez les détails de votre projet'}
              </p>
            </div>
            <button
              onClick={() => setShowExpirationInfo(!showExpirationInfo)}
              className="flex items-center gap-2 px-4 py-2 bg-[#FF6B00] text-white rounded-lg hover:bg-[#E56100] transition-colors shadow-md"
              title="Afficher/masquer les règles d'expiration"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              <span className="hidden sm:inline">💡 Comment ça marche ?</span>
              <span className="sm:hidden">💡</span>
            </button>
          </div>
        </div>
      </header>

      {/* Formulaire */}
      <main className="container mx-auto px-4 py-8">
        {/* 🕒 Encart info expiration automatique (affichage conditionnel) */}
        {showExpirationInfo && (
          <div className="mb-6 animate-fadeIn">
            <Card className="border-l-4 border-[#FF6B00] bg-orange-50 relative">
              <button
                onClick={() => setShowExpirationInfo(false)}
                className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-orange-100 transition-colors"
                title="Fermer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="p-4 pr-8">
                <h3 className="font-bold text-[#2C3E50] mb-2 flex items-center gap-2">
                  <svg className="w-5 h-5 text-[#FF6B00]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                  ⏰ Expiration automatique de votre demande
                </h3>
                <div className="text-sm text-gray-700 space-y-2">
                  <p className="font-medium">Votre demande sera automatiquement fermée selon ces règles :</p>
                  <ul className="ml-4 space-y-1">
                    <li className="flex items-start gap-2">
                      <span className="text-[#FF6B00] font-bold">•</span>
                      <span><strong>Travaux urgents</strong> (dans moins de 7 jours) : minimum 5 jours pour recevoir des devis</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#FF6B00] font-bold">•</span>
                      <span><strong>Travaux normaux</strong> (7-30 jours) : fermeture 5 jours avant la date de début</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#FF6B00] font-bold">•</span>
                      <span><strong>Travaux lointains</strong> (plus de 30 jours) : fermeture après 30 jours maximum</span>
                    </li>
                  </ul>
                  <p className="text-xs text-gray-600 mt-2 italic">
                    💡 Ces délais garantissent que les artisans aient le temps de visiter votre chantier et vous envoyer des devis de qualité.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Bandeau artisan sélectionné */}
        {artisan && (
          <Card className="p-6 mb-6 bg-[#FFF3E0] border-l-4 border-[#FF6B00]">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-[#E9ECEF] rounded-full flex items-center justify-center text-3xl flex-shrink-0">
                {artisan.photoProfil ? (
                  <img src={artisan.photoProfil} alt={artisan.raisonSociale} className="w-full h-full rounded-full object-cover" />
                ) : '👷'}
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-[#2C3E50] text-lg mb-1">
                  Demande pour : {artisan.raisonSociale}
                </h3>
                <p className="text-[#6C757D] text-sm">
                  {artisan.metiers?.join(' • ')}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {artisan.verified && (
                  <div className="bg-[#28A745] text-white px-3 py-1 rounded-full text-sm font-semibold">
                    ✓ Vérifié
                  </div>
                )}
                {artisan.verificationDocuments?.decennale?.verified && (
                  <img 
                    src="/badge-decennale.svg" 
                    alt="Garantie Décennale" 
                    className="w-20 h-20"
                    title="Garantie Décennale vérifiée"
                  />
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Critères de recherche */}
        {searchCriteria && (
          <Card className="p-6 mb-6 bg-[#E3F2FD]">
            <h3 className="font-bold text-[#2C3E50] mb-3">📋 Informations de votre recherche</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <span className="text-[#6C757D]">Catégorie :</span>
                <p className="font-semibold text-[#2C3E50]">{searchCriteria.categorie}</p>
              </div>
              <div>
                <span className="text-[#6C757D]">Localisation :</span>
                <p className="font-semibold text-[#2C3E50]">{searchCriteria.ville} ({searchCriteria.codePostal})</p>
              </div>
              <div>
                <span className="text-[#6C757D]">Date souhaitée :</span>
                <p className="font-semibold text-[#2C3E50]">{searchCriteria.dates?.[0] || 'Non précisée'}</p>
              </div>
              <div>
                <span className="text-[#6C757D]">Flexibilité :</span>
                <p className="font-semibold text-[#2C3E50]">±{searchCriteria.flexibiliteDays || 0}J</p>
              </div>
              <div>
                <span className="text-[#6C757D]">Urgence :</span>
                <p className="font-semibold text-[#2C3E50]">
                  {searchCriteria.urgence === 'urgent' ? '⚡ Urgent' : searchCriteria.urgence === 'normale' ? '📅 Normal' : '🗓️ Flexible'}
                </p>
              </div>
            </div>
          </Card>
        )}

        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <Card className="p-8 mb-6">
            {/* Titre du projet */}
            <section className="mb-6">
              <Input
                label="Titre du projet *"
                value={formData.titre}
                onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                placeholder="Ex: Rénovation salle de bain complète"
                required
                maxLength={100}
              />
              <p className="text-sm text-[#6C757D] mt-1">
                Un titre clair aidera les artisans à identifier rapidement votre besoin
              </p>
            </section>

            {/* Description détaillée */}
            <section className="mb-6">
              <label className="block text-[#2C3E50] font-semibold mb-2">
                Description détaillée du projet *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Décrivez précisément les travaux à réaliser :&#10;- Surface concernée&#10;- Matériaux souhaités&#10;- Contraintes particulières&#10;- Délais souhaités&#10;- Toute autre information utile"
                required
                rows={8}
                maxLength={2000}
                className="w-full px-4 py-3 border border-[#E9ECEF] rounded-lg focus:border-[#FF6B00] focus:ring-2 focus:ring-[#FF6B00] focus:ring-opacity-20 outline-none resize-none"
              />
              <p className="text-sm text-[#6C757D] mt-1">
                {formData.description.length}/2000 caractères
              </p>
            </section>

            {/* Photos */}
            <section className="mb-6">
              <label className="block text-[#2C3E50] font-semibold mb-2">
                Photos du chantier (optionnel)
              </label>
              <div className="border-2 border-dashed border-[#E9ECEF] rounded-lg p-6 text-center hover:border-[#FF6B00] transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                  id="photo-upload"
                />
                <label htmlFor="photo-upload" className="cursor-pointer">
                  <div className="text-5xl mb-3">📷</div>
                  <p className="text-[#2C3E50] font-semibold mb-1">
                    Cliquez pour ajouter des photos
                  </p>
                  <p className="text-sm text-[#6C757D]">
                    Maximum 5 photos • 5MB par photo • JPG, PNG
                  </p>
                </label>
              </div>

              {/* Prévisualisation photos */}
              {photos.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
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
                        className="absolute top-1 right-1 bg-[#DC3545] text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Budget */}
            <section className="mb-6">
              <label className="block text-[#2C3E50] font-semibold mb-2">
                Budget estimé (optionnel)
              </label>
              <Input
                type="number"
                label="Montant en €"
                value={formData.budget || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    budget: parseInt(e.target.value) || 0,
                  })
                }
                placeholder="1000"
                min="0"
              />
              <p className="text-sm text-[#6C757D] mt-2">
                Indiquer un budget aide les artisans à adapter leurs devis
              </p>
            </section>
          </Card>

          {/* Bandeau sécurité */}
          <Card className="p-6 mb-6 bg-[#E8F5E9] border-l-4 border-[#28A745]">
            <div className="flex items-start gap-4">
              <div className="text-4xl">🔒</div>
              <div>
                <h3 className="font-bold text-[#2C3E50] mb-2">
                  Vos coordonnées sont protégées
                </h3>
                <p className="text-[#6C757D] text-sm">
                  • Vos coordonnées ne seront visibles qu'après signature du contrat<br />
                  • Communication sécurisée via notre messagerie
                </p>
              </div>
            </div>
          </Card>

          {/* Boutons */}
          <div className="flex gap-4">
            <Button
              type="button"
              onClick={() => router.back()}
              className="flex-1 border-2 border-[#6C757D] text-[#6C757D] hover:bg-[#6C757D] hover:text-white"
              disabled={loading}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#FF6B00] hover:bg-[#E56100] text-white font-bold"
              disabled={loading}
            >
              {loading ? '⏳ Envoi...' : '📤 Envoyer la demande'}
            </Button>
          </div>

          <p className="text-center text-sm text-[#6C757D] mt-4">
            En publiant, vous acceptez nos{' '}
            <a href="/cgu" className="text-[#FF6B00] hover:underline">
              Conditions Générales d'Utilisation
            </a>
          </p>
        </form>
      </main>
    </div>
  );
}

export default function NouvelleDemandePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-[#FF6B00] border-t-transparent"></div>
      </div>
    }>
      <NouvelleDemandeContent />
    </Suspense>
  );
}
