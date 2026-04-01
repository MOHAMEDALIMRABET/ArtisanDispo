'use client';

/**
 * Page de création de devis - Style Qonto
 * Layout split : formulaire à gauche, prévisualisation à droite
 */

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { getDemandeById } from '@/lib/firebase/demande-service';
import { getUserById } from '@/lib/firebase/user-service';
import { getArtisanByUserId } from '@/lib/firebase/artisan-service';
import { createDevis, updateDevis, genererProchainNumeroDevis } from '@/lib/firebase/devis-service';
import { Logo } from '@/components/ui';
import type { Demande } from '@/types/firestore';
import type { Devis, LigneDevis, TVARate, calculerLigne, calculerTotaux } from '@/types/devis';
import { Timestamp, query, collection, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { validateMessage } from '@/lib/antiBypassValidator';
import { SignatureCanvas } from '@/components/SignatureCanvas';

/**
 * Masque un numéro de téléphone en ne montrant que les 2 premiers chiffres
 * Ex: "0612345678" → "06 ** ** ** **"
 * Ex: "+33612345678" → "+33 6 ** ** ** **"
 */
function masquerTelephone(telephone: string): string {
  if (!telephone) return '';
  
  // Nettoyer le numéro (enlever espaces, points, tirets)
  const clean = telephone.replace(/[\s.\-]/g, '');
  
  // Format français standard 10 chiffres
  if (clean.length === 10) {
    return `${clean.substring(0, 2)} ** ** ** **`;
  }
  
  // Format international +33
  if (clean.startsWith('+33') && clean.length === 12) {
    return `+33 ${clean.substring(3, 4)} ** ** ** **`;
  }
  
  // Format par défaut : afficher 2 premiers et masquer le reste
  return `${clean.substring(0, 2)}${'*'.repeat(Math.max(0, clean.length - 2))}`;
}

/**
 * Fonction de validation anti-contournement
 * Utilise le même système que la messagerie (antiBypassValidator)
 * Détecte 40+ patterns : téléphones, emails, adresses, réseaux sociaux
 */
function detecterInformationsInterdites(texte: string): { valide: boolean; raison?: string } {
  if (!texte) return { valide: true };
  
  const validation = validateMessage(texte);
  
  if (!validation.isValid) {
    return {
      valide: false,
      raison: validation.message?.split('\n\n')[0] || '⛔ Informations personnelles interdites'
    };
  }
  
  return { valide: true };
}

export default function NouveauDevisPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const demandeId = searchParams?.get('demandeId');
  const devisBrouillonId = searchParams?.get('devisId'); // ID du brouillon à modifier
  const revisionDevisId = searchParams?.get('revisionDevisId'); // ID du devis à réviser
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();

  // États
  const [loading, setLoading] = useState(true);
  const [savingBrouillon, setSavingBrouillon] = useState(false);
  const [savingEnvoi, setSavingEnvoi] = useState(false);
  const [demande, setDemande] = useState<Demande | null>(null);
  const [ancienDevisId, setAncienDevisId] = useState<string | null>(null);
  const [modeEdition, setModeEdition] = useState(false); // true si modification d'un brouillon
  const [estPremierDevis, setEstPremierDevis] = useState(true); // true si aucun devis existant pour cette demande

  // Formulaire
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [lignes, setLignes] = useState<LigneDevis[]>([]);
  const [delaiRealisation, setDelaiRealisation] = useState<number | ''>(15);
  const [dateDebutPrevue, setDateDebutPrevue] = useState('');
  const [dateValidite, setDateValidite] = useState(30); // Jours
  const [conditions, setConditions] = useState('');
  
  // Lignes spéciales Prestations
  const [mainOeuvreQuantite, setMainOeuvreQuantite] = useState<number>(1);
  const [mainOeuvreUnite, setMainOeuvreUnite] = useState<string>('j'); // h ou j
  const [mainOeuvrePrixHT, setMainOeuvrePrixHT] = useState<number>(0);
  const [mainOeuvreTVA, setMainOeuvreTVA] = useState<TVARate>(20);
  const [ajouterMatierePremiere, setAjouterMatierePremiere] = useState(false);
  const [matierePremiereQuantite, setMatierePremiereQuantite] = useState<number>(1);
  const [matierePremierePrixHT, setMatierePremierePrixHT] = useState<number>(0);
  const [mpTvaRate, setMpTvaRate] = useState<TVARate>(20);
  
  // Devis alternatifs (variantes) - AUTOMATIQUE pour tous les devis
  const [variantesExistantes, setVariantesExistantes] = useState<Devis[]>([]);
  
  // Validation anti-contournement
  const [erreurValidation, setErreurValidation] = useState<string | null>(null);

  // Signature électronique artisan
  const [showSignatureArtisan, setShowSignatureArtisan] = useState(false);
  const [signatureArtisanDataURL, setSignatureArtisanDataURL] = useState<string | null>(null);
  // Ref miroir (accessible sans closure périmée dans les fonctions async)
  const signatureArtisanRef = useRef<string | null>(null);
  // Ref pour l'action en attente
  const pendingActionRef = useRef<'generer' | 'envoyer' | null>(null);

  // Auto-masquer l'erreur après 5 secondes
  useEffect(() => {
    if (erreurValidation) {
      const timer = setTimeout(() => setErreurValidation(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [erreurValidation]);
  // Informations client/artisan (pré-remplies)
  const [clientInfo, setClientInfo] = useState<Devis['client'] | null>(null);
  const [artisanInfo, setArtisanInfo] = useState<Devis['artisan'] | null>(null);
  
  // Numéro de devis temporaire pour prévisualisation
  const [numeroDevisPreview, setNumeroDevisPreview] = useState(`DV-${new Date().getFullYear()}-XXXX`);
  
  // Date de création du devis (fixée à la première création, ne change pas)
  const [dateCreation, setDateCreation] = useState<Date>(new Date());

  /**
   * Charger les données de la demande et profils (ou d'un brouillon existant)
   */
  useEffect(() => {
    async function loadData() {
      // Cas 1 : Modification d'un brouillon existant
      if (devisBrouillonId && user) {
        console.log('📝 Mode ÉDITION - Chargement brouillon:', devisBrouillonId);
        await chargerBrouillon(devisBrouillonId);
        return;
      }

      // Cas 2 : Création d'une révision
      if (revisionDevisId && user) {
        console.log('🔄 Mode RÉVISION - Chargement devis original:', revisionDevisId);
        await chargerDevisPourRevision(revisionDevisId);
        return;
      }

      // Cas 3 : Création d'un nouveau devis depuis une demande
      if (!demandeId || !user) {
        console.log('❌ Pas de demandeId ou user:', { demandeId, user: user?.uid });
        return;
      }

      console.log('🔍 Chargement devis pour demande:', demandeId);

      try {
        // Charger la demande
        console.log('📋 Chargement demande...');
        const demandeData = await getDemandeById(demandeId);
        console.log('✅ Demande chargée:', demandeData);
        
        if (!demandeData) {
          alert(t('alerts.demande.notFound'));
          router.push('/artisan/demandes');
          return;
        }

        // Vérifier que la demande n'est pas annulée
        if (demandeData.statut === 'annulee') {
          alert(
            '❌ Demande annulée\n\n' +
            'Cette demande a été annulée par le client.\n' +
            'Vous ne pouvez plus créer de devis pour cette demande.'
          );
          router.push('/artisan/demandes');
          return;
        }

        setDemande(demandeData);

        // Vérifier s'il y a un ancien devis en révision pour cette demande
        try {
          const q = query(
            collection(db, 'devis'),
            where('demandeId', '==', demandeId),
            where('artisanId', '==', user.uid),
            where('statut', '==', 'refuse')
          );
          const devisSnapshot = await getDocs(q);
          
          // Trouver le dernier devis refusé avec typeRefus='revision'
          const ancienDevis = devisSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as Devis))
            .filter(d => d.typeRefus === 'revision')
            .sort((a, b) => {
              const dateA = a.dateCreation?.toMillis() || 0;
              const dateB = b.dateCreation?.toMillis() || 0;
              return dateB - dateA;
            })[0];
          
          if (ancienDevis) {
            setAncienDevisId(ancienDevis.id);
            console.log('🔄 Détection ancien devis en révision:', ancienDevis.numeroDevis);
          }
        } catch (error) {
          console.error('⚠️ Erreur détection ancien devis:', error);
        }

        // Charger les informations client
        console.log('👤 Chargement client:', demandeData.clientId);
        
        try {
          const client = await getUserById(demandeData.clientId);
          console.log('✅ Client chargé:', client);
          
          if (client) {
            const clientData: any = {
              nom: client.nom || '',
              prenom: client.prenom || '',
              email: client.email || '',
              telephone: client.telephone || '',
            };
            if (client.adresse?.rue && client.adresse?.ville && client.adresse?.codePostal) {
              clientData.adresse = {
                rue: client.adresse.rue,
                ville: client.adresse.ville,
                codePostal: client.adresse.codePostal,
              };
            }
            setClientInfo(clientData);
          } else {
            console.warn('⚠️ Client introuvable, utilisation données minimales');
            // Fallback : données minimales (demande n'a pas les infos client complètes)
            const fallbackData: any = {
              nom: 'Client',
              prenom: '',
              email: '',
              telephone: '',
            };
            // Utiliser l'adresse de localisation si disponible
            if (demandeData.localisation?.adresse && demandeData.localisation?.ville && demandeData.localisation?.codePostal) {
              fallbackData.adresse = {
                rue: demandeData.localisation.adresse,
                ville: demandeData.localisation.ville,
                codePostal: demandeData.localisation.codePostal,
              };
            }
            setClientInfo(fallbackData);
          }
        } catch (clientError) {
          console.error('❌ Erreur chargement client:', clientError);
          console.warn('⚠️ Utilisation données minimales comme fallback');
          // Fallback : données minimales
          const fallbackData: any = {
            nom: 'Client',
            prenom: '',
            email: '',
            telephone: '',
          };
          // Utiliser l'adresse de localisation si disponible
          if (demandeData.localisation?.adresse && demandeData.localisation?.ville && demandeData.localisation?.codePostal) {
            fallbackData.adresse = {
              rue: demandeData.localisation.adresse,
              ville: demandeData.localisation.ville,
              codePostal: demandeData.localisation.codePostal,
            };
          }
          setClientInfo(fallbackData);
        }

        // Charger les informations artisan
        console.log('🔧 Chargement artisan:', user.uid);
        const artisan = await getArtisanByUserId(user.uid);
        console.log('✅ Artisan chargé:', artisan);
        
        if (!artisan) {
          console.error('❌ Profil artisan introuvable pour:', user.uid);
          alert(t('alerts.demande.profileNotFound'));
          router.push('/artisan/profil');
          return;
        }
        
        if (artisan) {
          const artisanData: any = {
            raisonSociale: artisan.raisonSociale || '',
            siret: artisan.siret || '',
            nom: artisan.nom,
            prenom: artisan.prenom,
            email: artisan.email || user.email || '',
            telephone: artisan.telephone || '',
            adresse: artisan.adresse || '', // Adresse complète de l'entreprise
          };
          setArtisanInfo(artisanData);
        }

        // Pré-remplir le titre avec le titre de la demande (sans préfixe redondant)
        setTitre(demandeData.titre || 'Travaux');
        setDescription(demandeData.description || '');
        
        // Pré-remplir la date de début avec la première date souhaitée du client
        if (demandeData.datesSouhaitees?.dates?.[0]) {
          const dateClient = demandeData.datesSouhaitees.dates[0].toDate();
          setDateDebutPrevue(dateClient.toISOString().split('T')[0]);
        }

        // Charger le prochain numéro de devis pour la prévisualisation
        // Passer demandeId + info variante pour afficher le bon numéro (ex: DV-2026-00001-A)
        try {
          const varInfoPreview = await calculerVarianteInfo(demandeId);
          const prochainNumero = await genererProchainNumeroDevis(
            user.uid,
            demandeId,
            varInfoPreview?.varianteLettreReference,
            varInfoPreview?.varianteGroupe
          );
          setNumeroDevisPreview(prochainNumero);
        } catch (error) {
          console.error('Erreur génération numéro devis:', error);
          // Garder le placeholder par défaut si erreur
        }

        // Ajouter une première ligne vide
        ajouterLigne();
        
        // Charger les variantes existantes pour cette demande
        await chargerVariantesExistantes(demandeId, user.uid);

        // Si c'est une révision, charger le devis original et auto-activer la variante
        if (revisionDevisId) {
          console.log('🔄 Mode révision détecté, devis original:', revisionDevisId);
          await chargerDevisOriginalPourRevision(revisionDevisId);
        }

        console.log('✅ Toutes les données chargées avec succès');

      } catch (error) {
        console.error('❌ ERREUR chargement données:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'Pas de stack');
        alert(t('alerts.demande.loadError'));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [demandeId, devisBrouillonId, user, router]);

  /**
   * Charger les devis existants pour cette demande
   * MODÈLE ARTISANDISPO : 1 demande = 1 artisan spécifique
   * Si un devis existe déjà, forcer le mode variante
   */
  const chargerVariantesExistantes = async (demandeId: string, artisanId: string) => {
    try {
      const q = query(
        collection(db, 'devis'),
        where('demandeId', '==', demandeId),
        where('artisanId', '==', artisanId)
      );
      
      const snapshot = await getDocs(q);
      const devisTous = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Devis));
      
      // Filtrer pour exclure les devis annulés/remplacés
      const devisActifs = devisTous.filter(d => 
        d.statut !== 'annule' && d.statut !== 'remplace'
      );
      
      // Déterminer si c'est le premier devis
      setEstPremierDevis(devisActifs.length === 0);
      
      if (devisActifs.length > 0) {
        // Il existe déjà des devis pour cette demande
        console.log(`📊 ${devisActifs.length} devis existant(s) pour cette demande`);
        
        // Ne garder que ceux qui ont un groupe de variantes
        const variantes = devisActifs.filter(d => d.varianteGroupe);
        setVariantesExistantes(variantes.length > 0 ? variantes : devisActifs);
        
        console.log('📋 Devis existants pour cette demande:', devisActifs.length);
      } else {
        setVariantesExistantes([]);
      }
    } catch (error) {
      console.error('❌ Erreur chargement devis existants:', error);
    }
  };

  /**
   * Charger le devis original pour créer une révision
   */
  const chargerDevisOriginalPourRevision = async (devisOriginalId: string) => {
    try {
      console.log('🔄 Chargement devis original pour révision:', devisOriginalId);
      
      const devisDoc = await getDoc(doc(db, 'devis', devisOriginalId));
      if (!devisDoc.exists()) {
        console.error('❌ Devis original introuvable');
        return;
      }

      const devisOriginal = { id: devisDoc.id, ...devisDoc.data() } as Devis;
      
      // Stocker l'ID du devis original pour révision
      setAncienDevisId(devisOriginalId);
      
      // Pré-remplir le formulaire avec les données du devis original
      setTitre(devisOriginal.titre || '');
      setDescription(devisOriginal.description || '');
      setLignes(devisOriginal.lignes || []);
      // Convertir delaiRealisation en number (support anciens devis avec string)
      const delaiNum = typeof devisOriginal.delaiRealisation === 'number' 
        ? devisOriginal.delaiRealisation 
        : (parseInt(devisOriginal.delaiRealisation as any) || 15);
      setDelaiRealisation(delaiNum);
      
      // Charger Main d'œuvre
      if (devisOriginal.mainOeuvre) {
        setMainOeuvreQuantite(devisOriginal.mainOeuvre.quantite || 1);
        setMainOeuvrePrixHT(devisOriginal.mainOeuvre.prixHT || 0);
        setMainOeuvreTVA(devisOriginal.mainOeuvre.tauxTVA || 20);
      }
      
      // Charger Matière première
      if (devisOriginal.matierePremiere) {
        setAjouterMatierePremiere(true);
        setMatierePremiereQuantite(devisOriginal.matierePremiere.quantite || 1);
        setMatierePremierePrixHT(devisOriginal.matierePremiere.prixHT || 0);
        setMpTvaRate(devisOriginal.matierePremiere.tauxTVA || 20);
      }
      
      if (devisOriginal.dateDebutPrevue) {
        const dateDebut = devisOriginal.dateDebutPrevue.toDate();
        setDateDebutPrevue(dateDebut.toISOString().split('T')[0]);
      }
      
      setConditions(devisOriginal.conditions || '');
      
      console.log('✅ Devis original chargé pour révision, variante auto-activée');
    } catch (error) {
      console.error('❌ Erreur chargement devis original:', error);
    }
  };

  /**
   * Charger un devis brouillon existant pour modification
   */
  const chargerBrouillon = async (devisId: string) => {
    if (!user) return;

    try {
      setLoading(true);
      console.log('📋 Chargement du brouillon:', devisId);

      // Récupérer le devis
      const devisDoc = await getDoc(doc(db, 'devis', devisId));
      if (!devisDoc.exists()) {
        alert(t('alerts.devis.notFound'));
        router.push('/artisan/devis');
        return;
      }

      const devisBrouillon = { id: devisDoc.id, ...devisDoc.data() } as Devis;
      
      // Vérifier que c'est bien un brouillon de l'artisan
      if (devisBrouillon.artisanId !== user.uid) {
        alert(t('alerts.devis.unauthorized'));
        router.push('/artisan/devis');
        return;
      }

      if (devisBrouillon.statut !== 'genere') {
        alert(t('alerts.devis.onlyDraftEditable'));
        router.push('/artisan/devis');
        return;
      }

      console.log('✅ Brouillon chargé:', devisBrouillon);

      // Charger la demande associée si elle existe
      if (devisBrouillon.demandeId) {
        const demandeData = await getDemandeById(devisBrouillon.demandeId);
        if (demandeData) {
          setDemande(demandeData);
        }
      }

      // Remplir le formulaire avec les données du brouillon
      setModeEdition(true);
      setTitre(devisBrouillon.titre || '');
      setDescription(devisBrouillon.description || '');
      setLignes(devisBrouillon.lignes || []);
      // Convertir delaiRealisation en number (support anciens devis avec string)
      const delaiNum = typeof devisBrouillon.delaiRealisation === 'number' 
        ? devisBrouillon.delaiRealisation 
        : (parseInt(devisBrouillon.delaiRealisation as any) || 15);
      setDelaiRealisation(delaiNum);
      
      // Charger Main d'œuvre
      if (devisBrouillon.mainOeuvre) {
        setMainOeuvreQuantite(devisBrouillon.mainOeuvre.quantite || 1);
        setMainOeuvrePrixHT(devisBrouillon.mainOeuvre.prixHT || 0);
        setMainOeuvreTVA(devisBrouillon.mainOeuvre.tauxTVA || 20);
      }
      
      // Charger Matière première
      if (devisBrouillon.matierePremiere) {
        setAjouterMatierePremiere(true);
        setMatierePremiereQuantite(devisBrouillon.matierePremiere.quantite || 1);
        setMatierePremierePrixHT(devisBrouillon.matierePremiere.prixHT || 0);
        setMpTvaRate(devisBrouillon.matierePremiere.tauxTVA || 20);
      }
      
      if (devisBrouillon.dateDebutPrevue) {
        const dateDebut = devisBrouillon.dateDebutPrevue.toDate();
        setDateDebutPrevue(dateDebut.toISOString().split('T')[0]);
      }

      // Calculer dateValidite en jours
      if (devisBrouillon.dateValidite) {
        const maintenant = new Date();
        const dateValiditeDate = devisBrouillon.dateValidite.toDate();
        const joursRestants = Math.ceil((dateValiditeDate.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24));
        setDateValidite(Math.max(1, joursRestants)); // Au moins 1 jour
      }

      setConditions(devisBrouillon.conditions || '');
      setClientInfo(devisBrouillon.client);
      setArtisanInfo(devisBrouillon.artisan);
      setNumeroDevisPreview(devisBrouillon.numeroDevis || `DV-${new Date().getFullYear()}-XXXX`);
      
      // Conserver la date de création originale
      if (devisBrouillon.dateCreation) {
        setDateCreation(devisBrouillon.dateCreation.toDate());
      }

      if (devisBrouillon.devisOriginalId) {
        setAncienDevisId(devisBrouillon.devisOriginalId);
      }

      console.log('✅ Formulaire pré-rempli avec succès');

    } catch (error) {
      console.error('❌ Erreur chargement brouillon:', error);
      alert(t('alerts.draft.loadError'));
      router.push('/artisan/devis');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Charger un devis pour créer une révision
   */
  const chargerDevisPourRevision = async (devisId: string) => {
    if (!user) return;

    try {
      setLoading(true);
      console.log('📋 Chargement du devis original pour révision:', devisId);

      // Récupérer le devis original
      const devisDoc = await getDoc(doc(db, 'devis', devisId));
      if (!devisDoc.exists()) {
        alert(t('alerts.devis.notFound'));
        router.push('/artisan/devis');
        return;
      }

      const devisOriginal = { id: devisDoc.id, ...devisDoc.data() } as Devis;
      
      // Vérifier que c'est bien un devis de l'artisan
      if (devisOriginal.artisanId !== user.uid) {
        alert(t('alerts.devis.unauthorized'));
        router.push('/artisan/devis');
        return;
      }

      console.log('✅ Devis original chargé:', devisOriginal);

      // Charger la demande associée si elle existe
      if (devisOriginal.demandeId) {
        const demandeData = await getDemandeById(devisOriginal.demandeId);
        if (demandeData) {
          setDemande(demandeData);
        }
      }

      // Pré-remplir le formulaire avec les données du devis original
      setTitre(devisOriginal.titre || '');
      setDescription(devisOriginal.description || '');
      setLignes(devisOriginal.lignes || []);
      // Convertir delaiRealisation en number (support anciens devis avec string)
      const delaiNum2 = typeof devisOriginal.delaiRealisation === 'number' 
        ? devisOriginal.delaiRealisation 
        : (parseInt(devisOriginal.delaiRealisation as any) || 15);
      setDelaiRealisation(delaiNum2);
      
      // Charger Main d'œuvre
      if (devisOriginal.mainOeuvre) {
        setMainOeuvreQuantite(devisOriginal.mainOeuvre.quantite || 1);
        setMainOeuvrePrixHT(devisOriginal.mainOeuvre.prixHT || 0);
        setMainOeuvreTVA(devisOriginal.mainOeuvre.tauxTVA || 20);
      }
      
      // Charger Matière première
      if (devisOriginal.matierePremiere) {
        setAjouterMatierePremiere(true);
        setMatierePremiereQuantite(devisOriginal.matierePremiere.quantite || 1);
        setMatierePremierePrixHT(devisOriginal.matierePremiere.prixHT || 0);
        setMpTvaRate(devisOriginal.matierePremiere.tauxTVA || 20);
      }
      
      if (devisOriginal.dateDebutPrevue) {
        const dateDebut = devisOriginal.dateDebutPrevue.toDate();
        setDateDebutPrevue(dateDebut.toISOString().split('T')[0]);
      }

      setDateValidite(30); // Réinitialiser à 30 jours
      setConditions(devisOriginal.conditions || '');
      setClientInfo(devisOriginal.client);
      setArtisanInfo(devisOriginal.artisan);

      // Stocker l'ID du devis original pour révision
      setAncienDevisId(devisOriginal.id);

      // Charger les variantes existantes + calculer le numéro de prévisualisation
      if (devisOriginal.demandeId) {
        await chargerVariantesExistantes(devisOriginal.demandeId, user.uid);
        try {
          const varInfoPreview = await calculerVarianteInfo(devisOriginal.demandeId);
          const prochainNumero = await genererProchainNumeroDevis(
            user.uid,
            devisOriginal.demandeId,
            varInfoPreview?.varianteLettreReference,
            varInfoPreview?.varianteGroupe
          );
          setNumeroDevisPreview(prochainNumero);
        } catch (e) {
          console.error('Erreur génération numéro preview révision:', e);
        }
      }

      console.log('✅ Formulaire pré-rempli pour révision avec succès');

    } catch (error) {
      console.error('❌ Erreur chargement devis pour révision:', error);
      alert(t('alerts.devis.loadError'));
      router.push('/artisan/devis');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Ajouter une nouvelle ligne de prestation
   */
  const ajouterLigne = () => {
    const nouvelleLigne: LigneDevis = {
      id: `ligne-${Date.now()}-${Math.random()}`,
      description: '',
      quantite: 1,
      unite: 'h',
      prixUnitaireHT: 0,
      tauxTVA: 20,
      totalHT: 0,
      totalTVA: 0,
      totalTTC: 0,
    };
    setLignes([...lignes, nouvelleLigne]);
  };

  /**
   * Supprimer une ligne
   */
  const supprimerLigne = (id: string) => {
    setLignes(lignes.filter(l => l.id !== id));
  };

  /**
   * Mettre à jour une ligne et recalculer les totaux
   */
  const mettreAJourLigne = (id: string, updates: Partial<LigneDevis>) => {
    setLignes(lignes.map(ligne => {
      if (ligne.id !== id) return ligne;
      
      const ligneUpdate = { ...ligne, ...updates };
      
      // Recalculer les totaux de la ligne
      const totalHT = ligneUpdate.quantite * ligneUpdate.prixUnitaireHT;
      const totalTVA = totalHT * (ligneUpdate.tauxTVA / 100);
      const totalTTC = totalHT + totalTVA;
      
      return {
        ...ligneUpdate,
        totalHT: Math.round(totalHT * 100) / 100,
        totalTVA: Math.round(totalTVA * 100) / 100,
        totalTTC: Math.round(totalTTC * 100) / 100,
      };
    }));
  };

  /**
   * Calculer les totaux globaux
   */
  const calculerTotauxGlobaux = () => {
    // Calcul des lignes de prestations normales
    const totalHT = lignes.reduce((sum, ligne) => sum + ligne.totalHT, 0);
    
    const totalTVA: { [key in TVARate]?: number } = {};
    lignes.forEach(ligne => {
      totalTVA[ligne.tauxTVA] = (totalTVA[ligne.tauxTVA] || 0) + ligne.totalTVA;
    });
    
    // Ajout Main d'œuvre
    const mainOeuvreHT = mainOeuvreQuantite * mainOeuvrePrixHT;
    const mainOeuvreTVAMontant = mainOeuvreHT * (mainOeuvreTVA / 100);
    const mainOeuvreTTC = mainOeuvreHT + mainOeuvreTVAMontant;
    
    // Ajout Matière première (si activée)
    let matierePremiereHT = 0;
    let matierePremiereTVAMontant = 0;
    let matierePremiereTTC = 0;
    
    if (ajouterMatierePremiere) {
      matierePremiereHT = matierePremiereQuantite * matierePremierePrixHT;
      matierePremiereTVAMontant = matierePremiereHT * (mpTvaRate / 100);
      matierePremiereTTC = matierePremiereHT + matierePremiereTVAMontant;
    }
    
    // Totaux HT (lignes + main d'œuvre + matière première)
    const totalHTGlobal = totalHT + mainOeuvreHT + matierePremiereHT;
    
    // Ajout des TVA de Main d'œuvre et Matière première
    totalTVA[mainOeuvreTVA] = (totalTVA[mainOeuvreTVA] || 0) + mainOeuvreTVAMontant;
    if (ajouterMatierePremiere) {
      totalTVA[mpTvaRate] = (totalTVA[mpTvaRate] || 0) + matierePremiereTVAMontant;
    }
    
    const totalTVAGlobal = Object.values(totalTVA).reduce((sum, val) => sum + (val || 0), 0);
    const totalTTC = totalHTGlobal + totalTVAGlobal;
    
    return {
      totalHT: Math.round(totalHTGlobal * 100) / 100,
      totalTVA,
      totalTVAGlobal: Math.round(totalTVAGlobal * 100) / 100,
      totalTTC: Math.round(totalTTC * 100) / 100,
    };
  };

  /**
   * Nettoyer un objet pour supprimer toutes les valeurs undefined
   */
  const cleanObject = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    
    const cleaned: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          const cleanedNested = cleanObject(obj[key]);
          if (Object.keys(cleanedNested).length > 0) {
            cleaned[key] = cleanedNested;
          }
        } else {
          cleaned[key] = obj[key];
        }
      }
    }
    return cleaned;
  };

  /**
   * Calcule la prochaine lettre de variante via une requête Firestore fraîche.
   * Évite tout problème d'état périmé (variantesExistantes) lors de la génération/envoi.
   */
  const calculerVarianteInfo = async (demandeIdParam: string) => {
    if (!user) return null;
    const snap = await getDocs(query(
      collection(db, 'devis'),
      where('demandeId', '==', demandeIdParam),
      where('artisanId', '==', user.uid)
    ));
    const devisActifs = snap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) }))
      .filter((d: any) => d.statut !== 'annule' && d.statut !== 'remplace');

    if (devisActifs.length === 0) return null;

    const premierDevis = devisActifs[0] as any;
    const varianteGroupe = premierDevis.varianteGroupe || `VG-${demandeIdParam}-${Date.now()}`;
    const lettresUtilisees = devisActifs
      .map((v: any) => v.varianteLettreReference || '')
      .filter(Boolean);
    const lettres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let prochaineLettreReference = 'A';
    for (let i = 0; i < lettres.length; i++) {
      if (!lettresUtilisees.includes(lettres[i])) {
        prochaineLettreReference = lettres[i];
        break;
      }
    }
    return {
      varianteGroupe,
      varianteLettreReference: prochaineLettreReference,
      premierDevisId: premierDevis.id as string,
      premierDevisHasGroupe: !!premierDevis.varianteGroupe,
    };
  };

  /**
   * Sauvegarder le devis en brouillon
   */
  const sauvegarderBrouillon = async () => {
    if (!user || !clientInfo || !artisanInfo) return;

    // Vérification : au moins une demande OU mode édition
    if (!modeEdition && (!demande || !demandeId)) {
      alert(t('alerts.validation.noDemande'));
      return;
    }

    // Validation minimale pour brouillon
    if (!titre.trim()) {
      alert(t('alerts.validation.enterTitle'));
      return;
    }
    
    if (!mainOeuvrePrixHT || mainOeuvrePrixHT <= 0 || isNaN(mainOeuvrePrixHT)) {
      alert(t('alerts.validation.enterPrice'));
      return;
    }
    
    if (!mainOeuvreQuantite || mainOeuvreQuantite <= 0 || isNaN(mainOeuvreQuantite)) {
      alert(t('alerts.validation.enterQuantity'));
      return;
    }
    
    if (lignes.filter(l => l.description.trim()).some(l => l.prixUnitaireHT <= 0)) {
      alert(t('alerts.validation.completeLines'));
      return;
    }

    // Signature artisan obligatoire : ouvrir le modal si pas encore signé
    if (!signatureArtisanRef.current) {
      pendingActionRef.current = 'generer';
      setShowSignatureArtisan(true);
      return;
    }

    setSavingBrouillon(true);
    try {
      const devisData: any = {
        ...(demandeId && { demandeId: demandeId }),
        ...(demande && { clientId: demande.clientId }),
        artisanId: user.uid,
        statut: 'genere',
        ...(ancienDevisId && { devisOriginalId: ancienDevisId }),
        client: cleanObject(clientInfo),
        artisan: cleanObject(artisanInfo),
        titre,
        description,
        lignes,
        // Main d'œuvre (obligatoire)
        mainOeuvre: {
          quantite: mainOeuvreQuantite,
          prixHT: mainOeuvrePrixHT,
          tauxTVA: mainOeuvreTVA,
          unite: 'j'
        },
        // Matière première (optionnelle)
        ...(ajouterMatierePremiere && {
          matierePremiere: {
            quantite: matierePremiereQuantite,
            prixHT: matierePremierePrixHT,
            tauxTVA: mpTvaRate,
            unite: 'unité'
          }
        }),
        totaux: calculerTotauxGlobaux(),
        delaiRealisation,
        dateDebutPrevue: Timestamp.fromDate(new Date(dateDebutPrevue)), // OBLIGATOIRE
        dateValidite: Timestamp.fromDate(
          new Date(Date.now() + dateValidite * 24 * 60 * 60 * 1000)
        ),
        conditions,
        ...(signatureArtisanRef.current && {
          signatureArtisan: {
            url: signatureArtisanRef.current,
            date: Timestamp.now(),
          }
        }),
      };
      
      // 🚨 SYSTÈME DE VARIANTES PROGRESSIF (SANS TRANSFORMATION RÉTROACTIVE)
      // Requête Firestore fraîche pour éviter les états périmés
      if (!modeEdition && demandeId) {
        const varianteInfo = await calculerVarianteInfo(demandeId);
        if (varianteInfo) {
          if (!varianteInfo.premierDevisHasGroupe) {
            console.log('🔗 Ajout varianteGroupe au premier devis (brouillon)');
            await updateDevis(varianteInfo.premierDevisId, { varianteGroupe: varianteInfo.varianteGroupe });
          }
          devisData.varianteGroupe = varianteInfo.varianteGroupe;
          devisData.varianteLettreReference = varianteInfo.varianteLettreReference;
          console.log('📋 Variante assignée (brouillon):', {
            lettre: varianteInfo.varianteLettreReference,
            groupe: varianteInfo.varianteGroupe,
          });
        } else {
          console.log('📋 Premier devis pour cette demande (brouillon) → SANS lettre');
        }
      }

      if (modeEdition && devisBrouillonId) {
        // Mise à jour du brouillon existant
        console.log('📝 Mise à jour du brouillon:', devisBrouillonId);
        await updateDevis(devisBrouillonId, devisData);
        alert(t('alerts.devis.draftUpdated'));
      } else {
        // Création d'un nouveau brouillon
        console.log('➕ Création nouveau brouillon');
        await createDevis(devisData);
        alert(t('alerts.devis.draftGenerated'));
      }
      
      router.push('/artisan/devis');
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la sauvegarde';
      alert(errorMessage);
    } finally {
      setSavingBrouillon(false);
    }
  };

  /**
   * Envoyer le devis au client
   */
  const envoyerDevis = async () => {
    if (!user || !clientInfo || !artisanInfo) return;
    
    // Vérification : au moins une demande OU mode édition
    if (!modeEdition && (!demande || !demandeId)) {
      alert(t('alerts.validation.noSendDemande'));
      return;
    }
    
    // Validation
    if (!titre.trim()) {
      alert(t('alerts.validation.enterTitle'));
      return;
    }
    if (!mainOeuvrePrixHT || mainOeuvrePrixHT <= 0 || isNaN(mainOeuvrePrixHT)) {
      alert(t('alerts.validation.enterPrice'));
      return;
    }
    if (!mainOeuvreQuantite || mainOeuvreQuantite <= 0 || isNaN(mainOeuvreQuantite)) {
      alert(t('alerts.validation.enterQuantity'));
      return;
    }
    if (!dateDebutPrevue) {
      alert(t('alerts.validation.enterDate'));
      return;
    }

    // Signature artisan obligatoire : ouvrir le modal si pas encore signé
    if (!signatureArtisanRef.current) {
      pendingActionRef.current = 'envoyer';
      setShowSignatureArtisan(true);
      return;
    }
    
    // 🚫 VÉRIFICATION : Limite de 5 devis pour les demandes publiques
    if (demande && demande.type === 'publique' && (demande.devisRecus ?? 0) >= 5) {
      alert(
        `🚫 ENVOI BLOQUÉ : Limite de devis atteinte\n\n` +
        `Cette demande publique a déjà reçu 5 devis (la limite maximale).\n\n` +
        `❌ Aucun nouveau devis ne peut être envoyé pour cette demande.\n\n` +
        `💡 Conseil : Cherchez une autre demande plus intéressante !`
      );
      return; // Bloquer l'envoi
    }

    // Vérifier que la date de début est dans les préférences du client (si demande existe)
    if (demande?.datesSouhaitees?.dates?.[0]) {
      const dateProposee = new Date(dateDebutPrevue);
      const dateClient = demande.datesSouhaitees.dates[0].toDate();
      const flexDays = demande.datesSouhaitees.flexibiliteDays || 0;
      
      const dateMin = new Date(dateClient);
      dateMin.setDate(dateMin.getDate() - flexDays);
      const dateMax = new Date(dateClient);
      dateMax.setDate(dateMax.getDate() + flexDays);
      
      if (dateProposee < dateMin || dateProposee > dateMax) {
        alert(
          `❌ DEVIS BLOQUÉ : Date hors préférences du client\n\n` +
          `📅 Date proposée : ${dateProposee.toLocaleDateString('fr-FR')}\n` +
          `✅ Date souhaitée par le client : ${dateClient.toLocaleDateString('fr-FR')} (±${flexDays} jours)\n` +
          `📆 Plage acceptée : du ${dateMin.toLocaleDateString('fr-FR')} au ${dateMax.toLocaleDateString('fr-FR')}\n\n` +
          `⚠️ Le client refusera très probablement ce devis.\n\n` +
          `💡 Modifiez la "Date de début prévue" pour qu'elle soit dans la plage acceptée.`
        );
        return; // Bloquer l'envoi
      }
    }
    
    if (lignes.filter(l => l.description.trim()).some(l => l.prixUnitaireHT <= 0)) {
      alert(t('alerts.validation.completeLines'));
      return;
    }

    // VALIDATION ANTI-CONTOURNEMENT : Vérifier tous les champs de texte
    const champsAVerifier = [
      { nom: 'titre', valeur: titre },
      { nom: 'description', valeur: description },
      { nom: 'conditions', valeur: conditions },
      ...lignes.map((l, i) => ({ nom: `ligne ${i + 1}`, valeur: l.description }))
    ];

    for (const champ of champsAVerifier) {
      const validation = detecterInformationsInterdites(champ.valeur);
      if (!validation.valide) {
        alert(`❌ ${validation.raison}\n\nChamp concerné : ${champ.nom}\n\n💬 Utilisez le bouton "Contacter client" pour échanger via la messagerie sécurisée de la plateforme.`);
        setSavingEnvoi(false);
        return;
      }
    }

    setSavingEnvoi(true);
    try {
      const devisData: any = {
        ...(demandeId && { demandeId: demandeId }),
        ...(demande && { clientId: demande.clientId }),
        artisanId: user.uid,
        statut: 'envoye',
        ...(ancienDevisId && { devisOriginalId: ancienDevisId }),
        client: cleanObject(clientInfo),
        artisan: cleanObject(artisanInfo),
        titre,
        description,
        lignes,
        // Main d'œuvre (obligatoire)
        mainOeuvre: {
          quantite: mainOeuvreQuantite,
          prixHT: mainOeuvrePrixHT,
          tauxTVA: mainOeuvreTVA,
          unite: 'j'
        },
        // Matière première (optionnelle)
        ...(ajouterMatierePremiere && {
          matierePremiere: {
            quantite: matierePremiereQuantite,
            prixHT: matierePremierePrixHT,
            tauxTVA: mpTvaRate,
            unite: 'unité'
          }
        }),
        totaux: calculerTotauxGlobaux(),
        delaiRealisation: delaiRealisation || 15, // Défaut 15 jours si vide
        dateDebutPrevue: Timestamp.fromDate(new Date(dateDebutPrevue)),
        dateValidite: Timestamp.fromDate(
          new Date(Date.now() + dateValidite * 24 * 60 * 60 * 1000)
        ),
        conditions,
        ...(signatureArtisanRef.current && {
          signatureArtisan: {
            url: signatureArtisanRef.current,
            date: Timestamp.now(),
          }
        }),
      };
      
      // 🚨 SYSTÈME DE VARIANTES PROGRESSIF (SANS TRANSFORMATION RÉTROACTIVE)
      // Requête Firestore fraîche pour éviter les états périmés
      if (!modeEdition && demandeId) {
        const varianteInfo = await calculerVarianteInfo(demandeId);
        if (varianteInfo) {
          if (!varianteInfo.premierDevisHasGroupe) {
            console.log('🔗 Ajout varianteGroupe au premier devis (envoi)');
            await updateDevis(varianteInfo.premierDevisId, { varianteGroupe: varianteInfo.varianteGroupe });
          }
          devisData.varianteGroupe = varianteInfo.varianteGroupe;
          devisData.varianteLettreReference = varianteInfo.varianteLettreReference;
          console.log('📋 Variante assignée (envoi):', {
            lettre: varianteInfo.varianteLettreReference,
            groupe: varianteInfo.varianteGroupe,
          });
        } else {
          console.log('📋 Premier devis pour cette demande (envoi) → SANS lettre');
        }
      }

      if (modeEdition && devisBrouillonId) {
        // Mise à jour + envoi du brouillon existant
        console.log('📝 Mise à jour et envoi du brouillon:', devisBrouillonId);
        await updateDevis(devisBrouillonId, devisData);
        
        // Si c'est une révision, marquer le devis original comme remplacé
        if (revisionDevisId && revisionDevisId !== devisBrouillonId) {
          console.log('🔄 Marquage devis original comme remplacé:', revisionDevisId);
          await updateDevis(revisionDevisId, {
            statut: 'remplace',
            devisRevisionId: devisBrouillonId,
            dateRemplacement: Timestamp.now()
          });
        }
        
        alert(t('alerts.devis.sendSuccess'));
      } else {
        // Création + envoi d'un nouveau devis
        console.log('➕ Création et envoi nouveau devis');
        const nouveauDevisId = await createDevis(devisData);
        
        // Si c'est une révision, marquer le devis original comme remplacé
        if (revisionDevisId) {
          console.log('🔄 Marquage devis original comme remplacé:', revisionDevisId);
          await updateDevis(revisionDevisId, {
            statut: 'remplace',
            devisRevisionId: nouveauDevisId.id,
            dateRemplacement: Timestamp.now()
          });
        }
        
        alert(t('alerts.devis.sendSuccess'));
      }
      
      router.push('/artisan/devis');
    } catch (error) {
      console.error('Erreur envoi:', error);
      const errorMessage = error instanceof Error ? error.message : "Erreur lors de l'envoi du devis";
      alert(errorMessage);
    } finally {
      setSavingEnvoi(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00] mx-auto"></div>
          <p className="mt-4 text-[#6C757D]">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user || (!demande && !modeEdition)) {
    return null;
  }

  const totaux = calculerTotauxGlobaux();

  return (
    <>
      <div className="min-h-screen bg-[#F5F7FA] flex">
      {/* PARTIE GAUCHE : FORMULAIRE */}
      <div className="w-1/2 overflow-y-auto p-8">
        <div className="max-w-2xl">
          {/* Header */}
          <div className="mb-8">
            <button
              onClick={() => router.back()}
              className="text-[#FF6B00] hover:underline mb-4"
            >
              ← Retour {modeEdition ? 'aux devis' : 'aux demandes'}
            </button>
            <h1 className="text-3xl font-bold text-[#2C3E50]">
              {modeEdition ? '📝 Modifier le brouillon' : 'Créer un devis'}
            </h1>
            <p className="text-[#6C757D] mt-2">
              {modeEdition ? (
                <span>
                  Modification en cours • Client : {clientInfo?.prenom} {clientInfo?.nom}
                </span>
              ) : (
                <span>
                  Demande de {clientInfo?.prenom} {clientInfo?.nom}
                </span>
              )}
            </p>
          </div>

          {/* Avertissement limite de devis (demandes publiques) */}
          {demande && demande.type === 'publique' && (demande.devisRecus ?? 0) >= 4 && (
            <div className={`mb-6 border-l-4 p-4 rounded-lg ${
              (demande.devisRecus ?? 0) >= 5 
                ? 'bg-red-50 border-red-500' 
                : 'bg-yellow-50 border-yellow-500'
            }`}>
              <div className="flex items-start">
                <span className="text-2xl mr-3">
                  {(demande.devisRecus ?? 0) >= 5 ? '🚫' : '⚠️'}
                </span>
                <div>
                  <h3 className={`font-semibold mb-1 ${
                    (demande.devisRecus ?? 0) >= 5 ? 'text-red-800' : 'text-yellow-800'
                  }`}>
                    {(demande.devisRecus ?? 0) >= 5 
                      ? 'Limite de devis atteinte' 
                      : 'Demande presque au maximum'
                    }
                  </h3>
                  <p className={`text-sm ${
                    (demande.devisRecus ?? 0) >= 5 ? 'text-red-700' : 'text-yellow-700'
                  }`}>
                    {(demande.devisRecus ?? 0) >= 5 
                      ? `Cette demande a atteint son maximum de 5 devis. Aucun nouveau devis ne peut être envoyé.`
                      : `Cette demande a déjà reçu ${demande.devisRecus} des 5 devis maximum. Préparez une offre compétitive !`
                    }
                  </p>
                  {(demande.devisRecus ?? 0) === 4 && (
                    <p className="text-yellow-600 text-xs mt-2">
                      💡 <strong>C'est votre dernière chance</strong> : Présentez votre meilleure offre !
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Alerte de validation anti-contournement */}
          {erreurValidation && (
            <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
              <div className="flex items-start">
                <span className="text-2xl mr-3">⚠️</span>
                <div>
                  <h3 className="text-red-800 font-semibold mb-1">Contenu non autorisé</h3>
                  <p className="text-red-700 text-sm">{erreurValidation}</p>
                  <p className="text-red-600 text-xs mt-2">
                    💡 <strong>Pour votre sécurité</strong> : tous les échanges doivent se faire via la messagerie intégrée de la plateforme.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Informations générales */}
          <div className="bg-white rounded-lg p-6 shadow-sm mb-6">
            <h2 className="text-xl font-semibold text-[#2C3E50] mb-4">Informations générales</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#2C3E50] mb-1">
                  Titre du devis *
                </label>
                <input
                  type="text"
                  value={titre}
                  onChange={(e) => {
                    const validation = detecterInformationsInterdites(e.target.value);
                    if (!validation.valide) {
                      setErreurValidation(validation.raison || null);
                      return;
                    }
                    setErreurValidation(null);
                    setTitre(e.target.value);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                  placeholder="Ex: Rénovation salle de bain"
                />
              </div>

              <div className="grid grid-cols-5 gap-4">
                <div className="col-span-3">
                  <label className="block text-sm font-medium text-[#2C3E50] mb-1">
                    Date de début prévue *
                    {demande?.datesSouhaitees?.dates && demande.datesSouhaitees.dates.length > 0 && (
                      <span className="font-normal text-[#6C757D]">
                        {' '}: {demande.datesSouhaitees.dates[0].toDate().toLocaleDateString('fr-FR')}
                        {demande.datesSouhaitees.flexible && demande.datesSouhaitees.flexibiliteDays && (
                          <span> (±{demande.datesSouhaitees.flexibiliteDays} jours)</span>
                        )}
                      </span>
                    )}
                  </label>
                  <input
                    type="date"
                    value={dateDebutPrevue}
                    onChange={(e) => setDateDebutPrevue(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                    required
                  />
                  {(() => {
                    if (!dateDebutPrevue || !demande?.datesSouhaitees?.dates?.[0]) return null;
                    
                    const dateProposee = new Date(dateDebutPrevue);
                    const dateClient = demande.datesSouhaitees.dates[0].toDate();
                    const flexDays = demande.datesSouhaitees.flexibiliteDays || 0;
                    
                    const dateMin = new Date(dateClient);
                    dateMin.setDate(dateMin.getDate() - flexDays);
                    const dateMax = new Date(dateClient);
                    dateMax.setDate(dateMax.getDate() + flexDays);
                    
                    if (dateProposee < dateMin || dateProposee > dateMax) {
                      return (
                        <p className="text-xs text-orange-600 mt-1 bg-orange-50 px-2 py-1 rounded">
                          ⚠️ Cette date est en dehors des préférences du client. Le client pourrait refuser le devis.
                        </p>
                      );
                    }
                    return (
                      <p className="text-xs text-green-600 mt-1">
                        ✅ Correspond aux préférences du client
                      </p>
                    );
                  })()}
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-[#2C3E50] mb-1">
                    Délai de réalisation (en jours) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={delaiRealisation}
                    onChange={(e) => setDelaiRealisation(e.target.value ? parseInt(e.target.value) : '')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                    placeholder="Ex: 15"
                  />
                  <p className="text-xs text-gray-500 mt-1">Nombre de jours nécessaires pour réaliser les travaux</p>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-[#2C3E50] mb-1">
                    Validité de devis (jours)
                  </label>
                  <input
                    type="number"
                    value={dateValidite}
                    onChange={(e) => setDateValidite(parseInt(e.target.value) || 30)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                    min="1"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Devis Alternatifs (Variantes) */}
          {(!estPremierDevis || revisionDevisId) && (variantesExistantes.length > 0 || demandeId) ? (
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-lg p-6 shadow-sm mb-6">
              {revisionDevisId ? (
                // Mode révision : affichage spécial automatique
                <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 mb-4 rounded">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <div className="flex-1">
                      <p className="font-semibold text-indigo-800 mb-1">
                        🔄 Révision automatique du devis
                      </p>
                      <p className="text-sm text-indigo-700">
                        Ce devis est une révision suite au refus du client. Il sera automatiquement lié au devis original comme variante alternative.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                // Mode normal (devis existants)
                <>
                  {variantesExistantes.length > 0 && (() => {
                    // Calculer la prochaine lettre disponible (même logique que dans sauvegarderBrouillon/envoyerDevis)
                    const lettresUtilisees = variantesExistantes
                      .map(v => v.varianteLettreReference || '')
                      .filter(Boolean);
                    
                    const lettres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                    let prochaineLettreReference = 'A';
                    for (let i = 0; i < lettres.length; i++) {
                      if (!lettresUtilisees.includes(lettres[i])) {
                        prochaineLettreReference = lettres[i];
                        break;
                      }
                    }
                    
                    return (
                      <div className="bg-orange-50 border-l-4 border-[#FF6B00] p-4 mb-4 rounded">
                        <div className="flex items-start gap-3">
                          <svg className="w-6 h-6 text-[#FF6B00] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <div className="flex-1">
                            <p className="font-semibold text-[#2C3E50] mb-1">
                              📋 Création d'une nouvelle variante
                            </p>
                            <p className="text-sm text-[#2C3E50]">
                              Ce devis sera automatiquement créé comme <strong>variante {prochaineLettreReference}</strong> pour permettre au client de comparer vos différentes propositions.
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {variantesExistantes.length > 0 && (
                <div className="bg-white rounded-lg p-4 mb-4 border border-gray-200">
                  <h3 className="font-medium text-[#2C3E50] mb-2">
                    📊 Devis existants ({variantesExistantes.length})
                  </h3>
                  <div className="space-y-2">
                    {variantesExistantes.map((v) => (
                      <div key={v.id} className="flex items-center justify-between text-sm bg-gray-100 px-3 py-2 rounded">
                        <span className="font-mono font-semibold text-[#2C3E50]">
                          {v.numeroDevis}
                        </span>
                        <span className="text-[#6C757D]">
                          {v.totaux?.totalTTC ? `${v.totaux.totalTTC.toFixed(2)} €` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
                </>
              )}
            </div>
          ) : null}

          {/* Prestations */}
          <div className="bg-white rounded-lg p-6 shadow-sm mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-[#2C3E50]">Prestations</h2>
              <button
                onClick={ajouterLigne}
                className="bg-[#FF6B00] text-white px-4 py-2 rounded-lg hover:bg-[#E56100] transition"
              >
                + Ajouter une ligne
              </button>
            </div>

            <div className="space-y-4">
              {/* Main d'œuvre - OBLIGATOIRE */}
              <div className="border-2 border-[#FF6B00] rounded-lg p-4 bg-orange-50">
                <div className="flex justify-between items-start mb-3">
                  <span className="text-sm font-semibold text-[#FF6B00]">Main d'œuvre *</span>
                  <span className="text-xs bg-[#FF6B00] text-white px-2 py-1 rounded">OBLIGATOIRE</span>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-[#6C757D] mb-1">Quantité</label>
                    <input
                      type="number"
                      value={mainOeuvreQuantite || ''}
                      onChange={(e) => {
                        if (e.target.value === '') {
                          setMainOeuvreQuantite(0);
                          return;
                        }
                        const num = parseFloat(e.target.value);
                        setMainOeuvreQuantite(isNaN(num) ? 0 : num);
                      }}
                      onBlur={(e) => {
                        if (e.target.value === '' || parseFloat(e.target.value) < 0) {
                          setMainOeuvreQuantite(0);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                      min="0"
                      step="0.01"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[#6C757D] mb-1">Unité</label>
                    <select
                      value={mainOeuvreUnite}
                      onChange={(e) => setMainOeuvreUnite(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                    >
                      <option value="h">h</option>
                      <option value="j">j</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-[#6C757D] mb-1">Prix U. HT (€)</label>
                    <input
                      type="number"
                      value={mainOeuvrePrixHT || ''}
                      onChange={(e) => {
                        if (e.target.value === '') {
                          setMainOeuvrePrixHT(0);
                          return;
                        }
                        const num = parseFloat(e.target.value);
                        setMainOeuvrePrixHT(isNaN(num) ? 0 : num);
                      }}
                      onBlur={(e) => {
                        if (e.target.value === '' || parseFloat(e.target.value) < 0) {
                          setMainOeuvrePrixHT(0);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[#6C757D] mb-1">TVA (%)</label>
                    <select
                      value={mainOeuvreTVA}
                      onChange={(e) => setMainOeuvreTVA(parseFloat(e.target.value) as TVARate)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                    >
                      <option value="0">0%</option>
                      <option value="5.5">5.5%</option>
                      <option value="10">10%</option>
                      <option value="20">20%</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end text-sm mt-2">
                  <span className="text-[#6C757D]">Total : </span>
                  <span className="font-semibold text-[#2C3E50] ml-2">
                    {(mainOeuvreQuantite * mainOeuvrePrixHT * (1 + mainOeuvreTVA / 100)).toFixed(2)} € TTC
                  </span>
                </div>
              </div>

              {/* Matière première - OPTIONNELLE */}
              <div className={`border rounded-lg p-4 ${ajouterMatierePremiere ? 'border-[#2C3E50] bg-gray-100' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="ajouterMatierePremiere"
                      checked={ajouterMatierePremiere}
                      onChange={(e) => {
                        setAjouterMatierePremiere(e.target.checked);
                        if (e.target.checked) setMatierePremiereQuantite(1);
                      }}
                      className="w-4 h-4 text-[#FF6B00] focus:ring-[#FF6B00] border-gray-300 rounded"
                    />
                    <label htmlFor="ajouterMatierePremiere" className="text-sm font-medium text-[#2C3E50] cursor-pointer">
                      Matière première (optionnel)
                    </label>
                  </div>
                  {ajouterMatierePremiere && (
                    <span className="text-xs bg-gray-500 text-white px-2 py-1 rounded">OPTIONNEL</span>
                  )}
                </div>

                {ajouterMatierePremiere && (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-[#6C757D] mb-1">Quantité</label>
                      <input
                        type="number"
                        value={1}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-[#6C757D] mb-1">Prix U. HT (€)</label>
                      <input
                        type="number"
                        value={matierePremierePrixHT || ''}
                        onChange={(e) => {
                          if (e.target.value === '') {
                            setMatierePremierePrixHT(0);
                            return;
                          }
                          const num = parseFloat(e.target.value);
                          setMatierePremierePrixHT(isNaN(num) ? 0 : num);
                        }}
                        onBlur={(e) => {
                          if (e.target.value === '' || parseFloat(e.target.value) < 0) {
                            setMatierePremierePrixHT(0);
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                        min="0"
                        step="0.01"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-[#6C757D] mb-1">TVA (%)</label>
                      <select
                        value={mpTvaRate}
                        onChange={(e) => setMpTvaRate(parseFloat(e.target.value) as TVARate)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                      >
                        <option value="0">0%</option>
                        <option value="5.5">5.5%</option>
                        <option value="10">10%</option>
                        <option value="20">20%</option>
                      </select>
                    </div>
                  </div>
                )}

                {ajouterMatierePremiere && (
                  <div className="flex justify-end text-sm mt-2">
                    <span className="text-[#6C757D]">Total : </span>
                    <span className="font-semibold text-[#2C3E50] ml-2">
                      {(matierePremiereQuantite * matierePremierePrixHT * (1 + mpTvaRate / 100)).toFixed(2)} € TTC
                    </span>
                  </div>
                )}
              </div>

              {/* Lignes de prestations personnalisées */}
              {lignes.map((ligne, index) => (
                <div key={ligne.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-sm font-medium text-[#6C757D]">Ligne {index + 1}</span>
                    <button
                      onClick={() => supprimerLigne(ligne.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      🗑️ Supprimer
                    </button>
                  </div>

                  <div className="space-y-3">
                    <input
                      type="text"
                      value={ligne.description}
                      onChange={(e) => {
                        const validation = detecterInformationsInterdites(e.target.value);
                        if (!validation.valide) {
                          setErreurValidation(validation.raison || null);
                          return;
                        }
                        setErreurValidation(null);
                        mettreAJourLigne(ligne.id, { description: e.target.value });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                      placeholder="Description de la prestation"
                    />

                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-[#6C757D] mb-1">Quantité</label>
                        <input
                          type="number"
                          value={ligne.quantite || ''}
                          onChange={(e) => {
                            if (e.target.value === '') {
                              mettreAJourLigne(ligne.id, { quantite: 0 });
                              return;
                            }
                            const num = parseFloat(e.target.value);
                            mettreAJourLigne(ligne.id, { quantite: isNaN(num) ? 0 : num });
                          }}
                          onBlur={(e) => {
                            if (e.target.value === '' || parseFloat(e.target.value) < 0) {
                              mettreAJourLigne(ligne.id, { quantite: 0 });
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                          min="0"
                          step="0.01"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-[#6C757D] mb-1">Unité</label>
                        <select
                          value={ligne.unite}
                          onChange={(e) => mettreAJourLigne(ligne.id, { unite: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                        >
                          <option value="h">h</option>
                          <option value="j">j</option>
                          <option value="m²">m²</option>
                          <option value="ml">ml</option>
                          <option value="unité">unité</option>
                          <option value="forfait">forfait</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs text-[#6C757D] mb-1">Prix U. HT (€)</label>
                        <input
                          type="number"
                          value={ligne.prixUnitaireHT || ''}
                          onChange={(e) => {
                            if (e.target.value === '') {
                              mettreAJourLigne(ligne.id, { prixUnitaireHT: 0 });
                              return;
                            }
                            const num = parseFloat(e.target.value);
                            mettreAJourLigne(ligne.id, { prixUnitaireHT: isNaN(num) ? 0 : num });
                          }}
                          onBlur={(e) => {
                            if (e.target.value === '' || parseFloat(e.target.value) < 0) {
                              mettreAJourLigne(ligne.id, { prixUnitaireHT: 0 });
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                          min="0"
                          step="0.01"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-[#6C757D] mb-1">TVA (%)</label>
                        <select
                          value={ligne.tauxTVA}
                          onChange={(e) => mettreAJourLigne(ligne.id, { tauxTVA: parseFloat(e.target.value) as TVARate })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent"
                        >
                          <option value="0">0%</option>
                          <option value="5.5">5.5%</option>
                          <option value="10">10%</option>
                          <option value="20">20%</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end text-sm">
                      <span className="text-[#6C757D]">Total ligne : </span>
                      <span className="font-semibold text-[#2C3E50] ml-2">
                        {ligne.totalTTC.toFixed(2)} € TTC
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/artisan/devis')}
              disabled={savingBrouillon || savingEnvoi}
              className="px-5 py-3 rounded-lg font-semibold border-2 border-[#2C3E50] text-[#2C3E50] hover:bg-[#2C3E50] hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ✕ Annuler
            </button>
            <button
              onClick={sauvegarderBrouillon}
              disabled={savingBrouillon || savingEnvoi || (demande?.type === 'publique' && (demande?.devisRecus || 0) >= 10)}
              className="flex-1 bg-gray-200 text-[#2C3E50] px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingBrouillon ? '⏳ Génération...' : '📄 Générer le devis'}
            </button>
            <button
              onClick={envoyerDevis}
              disabled={savingBrouillon || savingEnvoi || (demande?.type === 'publique' && (demande?.devisRecus || 0) >= 10)}
              className="flex-1 bg-[#FF6B00] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#E56100] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingEnvoi ? '⏳ Envoi...' : '📨 Envoyer le devis'}
            </button>
          </div>
          
          {/* Message blocage si limite atteinte */}
          {demande?.type === 'publique' && (demande?.devisRecus || 0) >= 10 && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <p className="text-red-700 font-semibold">
                🚫 Cette demande ne peut plus recevoir de devis (limite maximale atteinte)
              </p>
              <p className="text-red-600 text-sm mt-1">
                {demande.devisRecus} devis ont déjà été envoyés. Le client ne peut pas en traiter davantage.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* PARTIE DROITE : PRÉVISUALISATION */}
      <div className="w-1/2 bg-white border-l border-gray-200 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">
          {/* En-tête devis */}
          <div className="mb-8">
            <div className="flex justify-between items-start mb-8">
              {/* Logo à gauche */}
              <div className="flex-shrink-0">
                <Logo size="sm" variant="full" />
              </div>

              {/* Titre DEVIS au centre */}
              <div className="flex-1 text-center">
                <h1 className="text-4xl font-bold text-[#2C3E50] mb-2">DEVIS</h1>
                <p className="text-[#6C757D]">N° {numeroDevisPreview}</p>
              </div>

              {/* Dates à droite */}
              <div className="text-right flex-shrink-0">
                <p className="text-sm text-[#6C757D]">Date</p>
                <p className="font-semibold">{dateCreation.toLocaleDateString('fr-FR')}</p>
                <p className="text-sm text-[#6C757D] mt-2">Validité</p>
                <p className="font-semibold">{dateValidite} jours</p>
              </div>
            </div>

            {/* Informations artisan et client */}
            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <h3 className="text-sm font-semibold text-[#2C3E50] mb-2">DE :</h3>
                <div className="text-sm">
                  <p className="font-semibold">{artisanInfo?.raisonSociale}</p>
                  <p className="text-[#6C757D]">SIRET : {artisanInfo?.siret}</p>
                  {artisanInfo?.adresse && (
                    <p className="text-[#6C757D]">
                      {artisanInfo.adresse.rue}, {artisanInfo.adresse.codePostal} {artisanInfo.adresse.ville}
                    </p>
                  )}
                  <p className="text-[#6C757D]">{artisanInfo?.telephone}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-[#2C3E50] mb-2">POUR :</h3>
                <div className="text-sm">
                  <p className="font-semibold">{clientInfo?.prenom} {clientInfo?.nom}</p>
                  {clientInfo?.telephone && (
                    <p className="text-[#6C757D] mt-1">
                      📞 {masquerTelephone(clientInfo.telephone)}
                    </p>
                  )}
                  {clientInfo?.adresse && (
                    <p className="text-[#6C757D] mt-2">
                      {clientInfo.adresse.rue}<br />
                      {clientInfo.adresse.codePostal} {clientInfo.adresse.ville}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Titre et description */}
            {titre && (
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-[#2C3E50] mb-2">{titre}</h2>
              </div>
            )}

            {dateDebutPrevue && (
              <div className="bg-gray-50 border-l-4 border-[#2C3E50] p-4 mb-4">
                <p className="text-sm">
                  <span className="font-semibold">📅 Date de début des travaux prévue :</span>{' '}
                  {new Date(dateDebutPrevue).toLocaleDateString('fr-FR', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </p>
              </div>
            )}

            {delaiRealisation && dateDebutPrevue && (
              <div className="bg-[#FFF3E0] border-l-4 border-[#FF6B00] p-4 mb-6">
                <p className="text-sm">
                  <span className="font-semibold">📅 Date de fin des travaux prévue :</span>{' '}
                  {(() => {
                    const debut = new Date(dateDebutPrevue);
                    debut.setDate(debut.getDate() + Number(delaiRealisation));
                    return debut.toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    });
                  })()}
                </p>
              </div>
            )}
          </div>

          {/* Tableau des prestations */}
          <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
            <table className="w-full table-fixed">
              <thead className="bg-[#2C3E50] text-white">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold w-[40%]">Description</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold w-[12%]">Qté</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold w-[15%]">P.U. HT</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold w-[13%]">TVA</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold w-[20%]">Total TTC</th>
                </tr>
              </thead>
              <tbody>
                {/* Main d'œuvre (toujours affichée) */}
                <tr className="border-t border-gray-200 bg-orange-50">
                  <td className="px-4 py-3 text-sm break-words">
                    <span className="font-semibold text-[#FF6B00]">⚡ Main d'œuvre</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    {mainOeuvreQuantite} j
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {mainOeuvrePrixHT.toFixed(2)} €
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    {mainOeuvreTVA}%
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold">
                    {(() => {
                      const ht = mainOeuvreQuantite * mainOeuvrePrixHT;
                      const ttc = ht * (1 + mainOeuvreTVA / 100);
                      return ttc.toFixed(2);
                    })()} €
                  </td>
                </tr>

                {/* Matière première (si activée) */}
                {ajouterMatierePremiere && (
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td className="px-4 py-3 text-sm break-words">
                      <span className="font-semibold text-[#2C3E50]">🛠️ Matière première</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {matierePremiereQuantite}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {matierePremierePrixHT.toFixed(2)} €
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {mpTvaRate}%
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">
                      {(() => {
                        const ht = matierePremiereQuantite * matierePremierePrixHT;
                        const ttc = ht * (1 + mpTvaRate / 100);
                        return ttc.toFixed(2);
                      })()} €
                    </td>
                  </tr>
                )}

                {lignes.filter(ligne => ligne.description.trim() || ligne.prixUnitaireHT > 0).map((ligne) => (
                  <tr key={ligne.id} className="border-t border-gray-200">
                    <td className="px-4 py-3 text-sm break-words">
                      {ligne.description || <span className="text-gray-400 italic">Description...</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {ligne.quantite} {ligne.unite}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {ligne.prixUnitaireHT.toFixed(2)} €
                    </td>
                    <td className="px-4 py-3 text-sm text-center">
                      {ligne.tauxTVA}%
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">
                      {ligne.totalTTC.toFixed(2)} €
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totaux */}
          <div className="bg-[#F5F7FA] rounded-lg p-6 mb-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[#6C757D]">Total HT</span>
                <span className="font-semibold">{totaux.totalHT.toFixed(2)} €</span>
              </div>
              {Object.entries(totaux.totalTVA).map(([taux, montant]) => (
                <div key={taux} className="flex justify-between text-sm">
                  <span className="text-[#6C757D]">TVA {taux}%</span>
                  <span className="font-semibold">{montant?.toFixed(2)} €</span>
                </div>
              ))}
              <div className="border-t border-gray-300 pt-2 mt-2">
                <div className="flex justify-between">
                  <span className="text-lg font-bold text-[#2C3E50]">Total TTC</span>
                  <span className="text-2xl font-bold text-[#FF6B00]">{totaux.totalTTC.toFixed(2)} €</span>
                </div>
              </div>
            </div>
          </div>

          {/* Signature artisan - indicateur visuel uniquement (déclenchée par les boutons) */}
          <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end">
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-2">Signature de l'artisan :</p>
              {signatureArtisanDataURL ? (
                <div>
                  <img
                    src={signatureArtisanDataURL}
                    alt="Signature artisan"
                    className="h-16 border border-gray-200 rounded bg-white mb-1 ml-auto"
                  />
                  <p className="text-xs text-[#28A745]">✅ Signé</p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Signature apposée lors de l'envoi</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Modal signature artisan */}
    {showSignatureArtisan && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
          <h3 className="text-lg font-bold text-[#2C3E50] mb-1">✍️ Signature électronique requise</h3>
          <p className="text-sm text-gray-500 mb-4">
            {pendingActionRef.current === 'envoyer'
              ? 'Signez pour confirmer et envoyer ce devis au client. Si vous annulez, le devis ne sera pas envoyé.'
              : 'Signez pour confirmer et générer ce devis. Si vous annulez, le devis ne sera pas généré.'}
          </p>
          <SignatureCanvas
            onSave={(dataURL) => {
              // Mettre à jour le ref ET l'état (le ref est lu immédiatement par les fonctions async)
              signatureArtisanRef.current = dataURL;
              setSignatureArtisanDataURL(dataURL);
              setShowSignatureArtisan(false);
              // Exécuter l'action en attente avec la signature fraîche
              const action = pendingActionRef.current;
              pendingActionRef.current = null;
              if (action === 'generer') sauvegarderBrouillon();
              else if (action === 'envoyer') envoyerDevis();
            }}
            onCancel={() => {
              setShowSignatureArtisan(false);
              pendingActionRef.current = null; // annuler = pas de signature, pas d'action
            }}
          />
        </div>
      </div>
    )}
    </>
  );
}







