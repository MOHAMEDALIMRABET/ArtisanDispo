'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { getUserById } from '@/lib/firebase/user-service';
import { getArtisanById } from '@/lib/firebase/artisan-service';
import { getDemandesForArtisan, getDemandesPubliquesForArtisan, removeArtisanFromDemande } from '@/lib/firebase/demande-service';
import { getDemandesExpressByArtisan, getPropositionsByDemande, refuserDemandeExpressParArtisan } from '@/lib/firebase/demande-express-service';
import { getDevisByDemande, declarerDebutTravaux, declarerFinTravaux } from '@/lib/firebase/devis-service';
import { createNotification } from '@/lib/firebase/notification-service';
import { getFileMetadata } from '@/lib/firebase/storage-service';
import { isDemandeExpired } from '@/lib/dateExpirationUtils';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { User, Demande, DemandeExpress, PropositionExpress } from '@/types/firestore';
import type { Devis } from '@/types/devis';

/** Normalise un champ photo : tableau natif OU objet-map legacy {0:url,1:url,...} */
function normalizePhotoField(field: unknown): string[] {
  if (!field) return [];
  if (Array.isArray(field)) return field as string[];
  if (typeof field === 'object') {
    return Object.keys(field as Record<string, string>)
      .sort((a, b) => Number(a) - Number(b))
      .map(k => (field as Record<string, string>)[k]);
  }
  return [];
}

export default function ArtisanDemandesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightedDemandeId = searchParams?.get('demandeId');
  const { user: authUser, loading: authLoading } = useAuth();
  const { t, language } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [demandesPubliques, setDemandesPubliques] = useState<Demande[]>([]);
  const [demandesExpress, setDemandesExpress] = useState<DemandeExpress[]>([]);
  const [refusingExpressId, setRefusingExpressId] = useState<string | null>(null);
  const [sectionActive, setSectionActive] = useState<'mes_demandes' | 'demandes_publiques' | 'demandes_express'>('mes_demandes');
  const [categoryActive, setCategoryActive] = useState<'classiques' | 'express' | null>(
    highlightedDemandeId ? 'classiques' : null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'toutes' | 'nouvelles' | 'en_traitement' | 'traitees'>('toutes');
  const [filtreType, setFiltreType] = useState<'toutes' | 'directe' | 'publique'>('toutes');
  const [sousFiltreTraitees, setSousFiltreTraitees] = useState<'tout' | 'payees' | 'refusees' | 'expirees' | 'travaux_en_cours' | 'termines'>('tout');
  const [refusingDemandeId, setRefusingDemandeId] = useState<string | null>(null);
  const [photoMetadata, setPhotoMetadata] = useState<Map<string, string>>(new Map());
  const [demandesRefusStatut, setDemandesRefusStatut] = useState<Map<string, { definitif: boolean; revision: boolean }>>(new Map());
  const [demandesTermineesIds, setDemandesTermineesIds] = useState<Set<string>>(new Set());
  const [demandesAvecDevisPayeIds, setDemandesAvecDevisPayeIds] = useState<Set<string>>(new Set());
  const [devisMap, setDevisMap] = useState<Map<string, Devis[]>>(new Map());
  const [clientsInfo, setClientsInfo] = useState<Map<string, { nom: string; prenom: string }>>(new Map());
  const [expandedDemandeIds, setExpandedDemandeIds] = useState<Set<string>>(new Set());
  const [expandedExpressIds, setExpandedExpressIds] = useState<Set<string>>(new Set());
  const [expressPropositionsMap, setExpressPropositionsMap] = useState<Map<string, PropositionExpress[]>>(new Map());
  const [expressFilter, setExpressFilter] = useState<'nouvelles' | 'propositions_envoyees' | 'acceptees' | 'refusees' | 'validees'>('nouvelles');
  const demandeRefs = useRef<{[key: string]: HTMLDivElement | null}>({});
  // IDs des nouvelles demandes capturées UNE FOIS au chargement (pour le badge 🔔 stable)
  const [demandesNouvellesInitialIds, setDemandesNouvellesInitialIds] = useState<Set<string>>(new Set());
  // IDs des demandes déjà consultées (persiste dans localStorage)
  const [demandesVuesSet, setDemandesVuesSet] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set<string>();
    try {
      const stored = localStorage.getItem('artisan_demandes_vues');
      return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  // Horloge en temps réel — se met à jour chaque seconde
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (authLoading) return; // Attendre que l'auth soit chargée
    
    if (!authUser) {
      router.push('/connexion');
      return;
    }

    loadData();
  }, [authUser, authLoading, router]);

  // Si on arrive avec un demandeId dans l'URL → aller directement dans Classiques
  useEffect(() => {
    if (highlightedDemandeId) {
      setCategoryActive('classiques');
    }
  }, [highlightedDemandeId]);

  // Scroller vers la demande mise en évidence
  useEffect(() => {
    if (highlightedDemandeId && !isLoading && demandeRefs.current[highlightedDemandeId]) {
      setTimeout(() => {
        demandeRefs.current[highlightedDemandeId]?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 300);
    }
  }, [highlightedDemandeId, isLoading]);

  // Réinitialiser le sous-filtre quand on quitte la section "Traitées"
  useEffect(() => {
    if (filter !== 'traitees') {
      setSousFiltreTraitees('tout');
    }
  }, [filter]);

  /**
   * Marquer les demandes comme "vues" UNIQUEMENT quand l'artisan
   * est réellement sur la section affichant ces demandes.
   * Un délai de 800ms assure que la liste est bien rendue avant de marquer.
   */
  useEffect(() => {
    if (isLoading) return;

    // Section "Mes Demandes" (directes) affichée
    if (categoryActive === 'classiques' && sectionActive === 'mes_demandes' && demandes.length > 0) {
      const ids = getDemandesNouvelles(demandes).map(d => d.id);
      const timer = setTimeout(() => saveVuesIds(ids), 800);
      return () => clearTimeout(timer);
    }

    // Section "Demandes Publiques" affichée
    if (categoryActive === 'classiques' && sectionActive === 'demandes_publiques' && demandesPubliques.length > 0) {
      const ids = demandesPubliques
        .filter(d => d.statut !== 'annulee' && !(d.dateExpiration && isDemandeExpired(d.dateExpiration)))
        .map(d => d.id);
      const timer = setTimeout(() => saveVuesIds(ids), 800);
      return () => clearTimeout(timer);
    }

    // Section "Demandes Express" affichée
    if (categoryActive === 'express' && sectionActive === 'demandes_express' && demandesExpress.length > 0) {
      const ids = demandesExpress
        .filter(d => d.statut === 'en_attente_proposition')
        .map(d => d.id);
      const timer = setTimeout(() => saveVuesIds(ids), 800);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryActive, sectionActive, isLoading, demandes.length, demandesPubliques.length, demandesExpress.length]);

  // Pré-charger toutes les propositions express quand on entre dans la section express
  useEffect(() => {
    if (categoryActive !== 'express' || demandesExpress.length === 0) return;
    demandesExpress.forEach(async (d) => {
      if (!expressPropositionsMap.has(d.id)) {
        try {
          const props = await getPropositionsByDemande(d.id);
          setExpressPropositionsMap(prev => new Map(prev).set(d.id, props));
        } catch (e) {
          console.error('Erreur pré-chargement propositions:', e);
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryActive, demandesExpress.length]);

  async function loadData() {
    if (!authUser) return;

    try {
      const userData = await getUserById(authUser.uid);
      if (!userData || userData.role !== 'artisan') {
        router.push('/dashboard');
        return;
      }

      setUser(userData);

      // Charger les demandes pour cet artisan
      const demandesData = await getDemandesForArtisan(authUser.uid);
      console.log('📋 Demandes récupérées:', demandesData.map(d => ({
        id: d.id,
        titre: d.titre,
        photosUrls: d.photosUrls,
        photos: d.photos,
      })));
      setDemandes(demandesData);
      
      // Charger les demandes publiques qui matchent le profil de l'artisan
      const artisanData = await getArtisanById(authUser.uid);
      if (artisanData && artisanData.zonesIntervention && artisanData.zonesIntervention.length > 0) {
        const demandesPubliquesData = await getDemandesPubliquesForArtisan({
          metiers: artisanData.metiers,
          location: { 
            city: artisanData.zonesIntervention[0].ville,
            coordinates: artisanData.zonesIntervention[0].latitude && artisanData.zonesIntervention[0].longitude
              ? { 
                  latitude: artisanData.zonesIntervention[0].latitude, 
                  longitude: artisanData.zonesIntervention[0].longitude 
                }
              : undefined
          }
        });
        console.log('📢 Demandes publiques récupérées:', demandesPubliquesData.length);
        setDemandesPubliques(demandesPubliquesData);
      }

      // Charger les demandes express assignées à cet artisan
      let loadedExpressData: DemandeExpress[] = [];
      try {
        loadedExpressData = await getDemandesExpressByArtisan(authUser.uid);
        console.log('⚡ Demandes express récupérées:', loadedExpressData.length);
        setDemandesExpress(loadedExpressData);
      } catch (error) {
        console.error('Erreur chargement demandes express:', error);
      }
      
      // Charger les devis pour chaque demande
      const devisMapTemp = new Map<string, Devis[]>();
      const refusStatutMap = new Map<string, { definitif: boolean; revision: boolean }>();
      const demandesTermineesSet = new Set<string>();
      const demandesAvecDevisPayeSet = new Set<string>();
      
      for (const demande of demandesData) {
        try {
          const devisForDemande = await getDevisByDemande(demande.id);
          devisMapTemp.set(demande.id, devisForDemande);
        } catch (error) {
          console.error(`Erreur chargement devis pour demande ${demande.id}:`, error);
        }
        try {
          // Vérifier les devis refusés
          const devisQuery = query(
            collection(db, 'devis'),
            where('demandeId', '==', demande.id),
            where('artisanId', '==', authUser.uid),
            where('statut', '==', 'refuse')
          );
          const devisSnapshot = await getDocs(devisQuery);
          
          let hasDefinitif = false;
          let hasRevision = false;
          
          devisSnapshot.docs.forEach(doc => {
            const devis = doc.data() as Devis;
            if (devis.typeRefus === 'definitif') hasDefinitif = true;
            if (devis.typeRefus === 'revision') hasRevision = true;
          });
          
          // Vérifier si la demande a un devis payé
          const devisPayeQuery = query(
            collection(db, 'devis'),
            where('demandeId', '==', demande.id),
            where('artisanId', '==', authUser.uid)
          );
          const devisPayeSnapshot = await getDocs(devisPayeQuery);
          
          devisPayeSnapshot.docs.forEach(doc => {
            const devis = doc.data() as Devis;
            // Statuts indiquant que le devis a été payé
            const statutsPaye = ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'];
            if (statutsPaye.includes(devis.statut)) {
              demandesAvecDevisPayeSet.add(demande.id);
            }
          });
          
          if (hasDefinitif || hasRevision) {
            refusStatutMap.set(demande.id, { definitif: hasDefinitif, revision: hasRevision });
          }
          
          // Vérifier si la demande a un devis terminé (travaux finis)
          if (demande.statut === 'attribuee' && demande.devisAccepteId) {
            const devisAccepteQuery = query(
              collection(db, 'devis'),
              where('demandeId', '==', demande.id),
              where('artisanId', '==', authUser.uid)
            );
            const devisAccepteSnapshot = await getDocs(devisAccepteQuery);
            
            devisAccepteSnapshot.docs.forEach(doc => {
              const devis = doc.data() as Devis;
              // Devis terminé = validé par client ou auto-validé
              if (devis.statut === 'termine_valide' || devis.statut === 'termine_auto_valide') {
                demandesTermineesSet.add(demande.id);
              }
            });
          }
        } catch (error) {
          console.error(`Erreur vérification statuts pour demande ${demande.id}:`, error);
        }
      }
      setDevisMap(devisMapTemp);
      setDemandesRefusStatut(refusStatutMap);
      setDemandesTermineesIds(demandesTermineesSet);
      setDemandesAvecDevisPayeIds(demandesAvecDevisPayeSet);
      
      // Charger les métadonnées des photos (noms originaux)
      const metadata = new Map<string, string>();
      for (const demande of demandesData) {
        const photos = normalizePhotoField(demande.photosUrls).length > 0
          ? normalizePhotoField(demande.photosUrls)
          : normalizePhotoField(demande.photos);
        for (const url of photos) {
          if (url && url.startsWith('http')) {
            const meta = await getFileMetadata(url);
            if (meta?.originalName) {
              metadata.set(url, meta.originalName);
            }
          }
        }
      }
      setPhotoMetadata(metadata);
      
      // Charger les informations des clients
      const clientsMap = new Map<string, { nom: string; prenom: string }>();
      const uniqueClientIds = [...new Set(demandesData.map(d => d.clientId))];
      for (const clientId of uniqueClientIds) {
        try {
          const clientData = await getUserById(clientId);
          if (clientData) {
            clientsMap.set(clientId, { 
              nom: clientData.nom || '',
              prenom: clientData.prenom || ''
            });
          }
        } catch (error) {
          console.error(`Erreur chargement client ${clientId}:`, error);
        }
      }
      // Charger les noms clients des demandes express (clientsMap est maintenant rempli)
      for (const demande of loadedExpressData) {
        if (demande.clientId && !clientsMap.has(demande.clientId)) {
          try {
            const cd = await getUserById(demande.clientId);
            if (cd) {
              clientsMap.set(demande.clientId, { nom: cd.nom || '', prenom: cd.prenom || '' });
            }
          } catch {}
        }
      }
      setClientsInfo(new Map(clientsMap));

      // Capturer au chargement les IDs des nouvelles demandes non encore vues
      // (lecture directe localStorage pour éviter la stale closure)
      const vuesFromStorage = new Set<string>();
      try {
        const stored = localStorage.getItem('artisan_demandes_vues');
        if (stored) JSON.parse(stored).forEach((id: string) => vuesFromStorage.add(id));
      } catch {}
      const initialNouvellesIds = new Set(
        demandesData
          .filter(d =>
            (!d.devisRecus || d.devisRecus === 0) &&
            d.statut !== 'annulee' &&
            !demandesTermineesSet.has(d.id) &&
            !vuesFromStorage.has(d.id)
          )
          .map(d => d.id)
      );
      setDemandesNouvellesInitialIds(initialNouvellesIds);
      
      setIsLoading(false);
    } catch (error) {
      console.error('Erreur chargement demandes:', error);
      setIsLoading(false);
    }
  }

  function toggleExpandDemande(demandeId: string) {
    setExpandedDemandeIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(demandeId)) {
        newSet.delete(demandeId);
      } else {
        newSet.add(demandeId);
      }
      return newSet;
    });
  }

  async function handleRefuserDemande(demandeId: string) {
    if (!user) return;

    const confirmer = confirm(
      '❌ Êtes-vous sûr de vouloir refuser cette demande ?\n\n' +
      'Cette action est définitive. La demande disparaîtra de votre liste et le client sera notifié que vous n\'êtes pas disponible.'
    );

    if (!confirmer) return;

    setRefusingDemandeId(demandeId);

    try {
      // Récupérer la demande pour avoir le clientId
      const demande = demandes.find(d => d.id === demandeId);
      if (!demande) {
        throw new Error('Demande non trouvée');
      }

      // Récupérer les infos de l'artisan qui refuse
      const { getArtisanByUserId: getArtisan } = await import('@/lib/firebase/artisan-service');
      const artisanRefusant = await getArtisan(user.uid);

      // Retirer l'artisan de la liste des matches
      await removeArtisanFromDemande(demandeId, user.uid);

      // Toujours passer la demande en "annulée" quand l'artisan refuse
      // (car il n'y a qu'un seul artisan par demande)
      const { updateDemande } = await import('@/lib/firebase/demande-service');
      const { Timestamp } = await import('firebase/firestore');
      
      await updateDemande(demandeId, {
        statut: 'annulee',
        artisanRefuseId: user.uid,
        artisanRefuseNom: artisanRefusant?.raisonSociale || 'Artisan inconnu',
        dateRefus: Timestamp.now(),
      });
      console.log('✅ Demande passée en statut "annulée" avec infos artisan refusant:', {
        artisanId: user.uid,
        artisanNom: artisanRefusant?.raisonSociale,
      });

      // Notifier le client du refus
      await createNotification(demande.clientId, {
        type: 'demande_refusee',
        titre: 'Votre demande a été refusée',
        message: `L'artisan a décliné votre demande "${demande.categorie}" à ${demande.localisation?.ville || 'votre localisation'}. Vous pouvez relancer une recherche avec les mêmes critères.`,
        lien: `/client/demandes`,
      });

      console.log('✅ Notification envoyée au client');

      // Mettre à jour l'état local (marquer comme annulée)
      setDemandes(prev => prev.map(d => 
        d.id === demandeId 
          ? { ...d, statut: 'annulee' as const, artisanRefuseId: user.uid, artisanRefuseNom: artisanRefusant?.raisonSociale || 'Artisan inconnu' }
          : d
      ));

      alert('✅ Demande refusée avec succès. Elle apparaîtra dans l\'onglet "Refusées".');
    } catch (error) {
      console.error('❌ Erreur refus demande:', error);
      alert('❌ Erreur lors du refus de la demande. Veuillez réessayer.');
    } finally {
      setRefusingDemandeId(null);
    }
  }

  async function handleCommencerTravaux(devisId: string, numeroDevis: string) {
    if (!user) return;

    const confirmation = confirm(
      `🚧 Démarrage des travaux\n\n` +
      `Devis : ${numeroDevis}\n\n` +
      `Confirmez-vous que vous avez commencé les travaux ?\n\n` +
      `Cette action changera le statut du devis en "Travaux en cours".`
    );

    if (!confirmation) return;

    try {
      await declarerDebutTravaux(devisId, user.uid);
      alert('✅ Travaux démarrés avec succès !');
      await loadData(); // Recharger les données
    } catch (error: any) {
      console.error('❌ Erreur démarrage travaux:', error);
      alert(`❌ Erreur : ${error.message || 'Impossible de démarrer les travaux'}`);
    }
  }

  async function handleFinTravaux(devisId: string, numeroDevis: string) {
    if (!user) return;

    const confirmation = confirm(
      `🏁 Fin des travaux\n\n` +
      `Devis : ${numeroDevis}\n\n` +
      `Confirmez-vous que vous avez terminé les travaux ?\n\n` +
      `Le client recevra une notification et aura 7 jours pour valider.`
    );

    if (!confirmation) return;

    try {
      await declarerFinTravaux(devisId, user.uid);
      alert('✅ Fin des travaux déclarée avec succès ! Le client a été notifié.');
      await loadData(); // Recharger les données
    } catch (error: any) {
      console.error('❌ Erreur fin travaux:', error);
      alert(`❌ Erreur : ${error.message || 'Impossible de déclarer la fin des travaux'}`);
    }
  }

  // Fonctions pour organiser les demandes par sections
  
  /**
   * CONTRATS EN COURS
   * - Demandes avec devis payé (travaux en cours)
   * - Exclut les demandes terminées
   */
  /**
   * 📬 NOUVELLES DEMANDES
   * - Demandes où l'artisan n'a PAS encore envoyé de devis
   * - Exclut refusées et terminées
   */
  function getDemandesNouvelles(demandes: Demande[]) {
    return demandes.filter(d => 
      (!d.devisRecus || d.devisRecus === 0) && 
      d.statut !== 'annulee' && 
      !demandesTermineesIds.has(d.id)
    );
  }

  /**
   * ⏳ EN TRAITEMENT
   * - Demandes pour lesquelles l'artisan a envoyé des devis
   * - Pas encore payés (donc pas des contrats)
   * - Exclut refusées et terminées
   */
  function getDemandesEnTraitement(demandes: Demande[]) {
    return demandes.filter(d => 
      d.devisRecus && d.devisRecus > 0 && 
      !demandesAvecDevisPayeIds.has(d.id) && 
      d.statut !== 'annulee' && 
      !demandesTermineesIds.has(d.id)
    );
  }

  /**
   * Helper : Toutes les demandes traitées (sans sous-filtre)
   * Utilisé pour le compteur du bouton "✅ Traitées"
   */
  function getToutesDemandesTraitees(demandes: Demande[]) {
    return demandes.filter(d =>
      demandesAvecDevisPayeIds.has(d.id) ||
      d.statut === 'annulee' ||
      demandesTermineesIds.has(d.id) ||
      d.statut === 'expiree' ||
      (d.dateExpiration && isDemandeExpired(d.dateExpiration))
    );
  }

  /**
   * ✅ TRAITÉES (avec sous-filtrage)
   * - Payées (devis signé, travaux pas encore démarrés)
   * - Travaux en cours
   * - Travaux terminés (validés)
   * - Refusées par l'artisan
   * - Expirées
   */
  function getDemandesTraitees(demandes: Demande[]) {
    const demandesTraitees = getToutesDemandesTraitees(demandes);

    if (filter === 'traitees' && sousFiltreTraitees !== 'tout') {
      return demandesTraitees.filter(d => {
        const devisForDemande = devisMap.get(d.id) || [];
        const devisPaye = devisForDemande.find(dv =>
          ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(dv.statut)
        );
        switch (sousFiltreTraitees) {
          case 'payees':
            return devisPaye?.statut === 'paye';
          case 'travaux_en_cours':
            return devisPaye?.statut === 'en_cours';
          case 'termines':
            return devisPaye && ['travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(devisPaye.statut);
          case 'refusees':
            return d.statut === 'annulee' && !devisPaye;
          case 'expirees':
            return (d.statut === 'expiree' || (d.dateExpiration && isDemandeExpired(d.dateExpiration))) && !devisPaye;
          default:
            return true;
        }
      });
    }

    return demandesTraitees;
  }

  /**
   * Fonction pour déterminer la couleur de la bordure gauche
   */
  const getBorderColor = (demande: Demande): string => {
    const devisForDemande = devisMap.get(demande.id) || [];
    const devisPaye = devisForDemande.find(d => 
      ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(d.statut)
    );
    
    // Section "📬 Nouvelles demandes" → Orange
    if (filter === 'nouvelles') {
      return 'bg-gradient-to-b from-[#FF6B00] to-[#E56100]';
    }
    
    // Section "⏳ En traitement" → Bleu
    if (filter === 'en_traitement') {
      return 'bg-gradient-to-b from-blue-400 to-blue-600';
    }
    
    // Section "✅ Traitées" → couleur selon statut
    if (filter === 'traitees') {
      // Travaux en cours → Jaune
      if (devisPaye?.statut === 'en_cours') {
        return 'bg-gradient-to-b from-yellow-400 to-yellow-600';
      }
      // Terminés (validés) → Gris foncé
      if (devisPaye && ['travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(devisPaye.statut)) {
        return 'bg-gradient-to-b from-gray-700 to-gray-900';
      }
      // Devis payé (signé) → Vert
      if (devisPaye?.statut === 'paye') {
        return 'bg-gradient-to-b from-green-400 to-green-600';
      }
      // Refusées → Rouge
      if (demande.statut === 'annulee') {
        return 'bg-gradient-to-b from-red-400 to-red-600';
      }
      // Expirées → Rouge rayé
      if (demande.statut === 'expiree' || (demande.dateExpiration && isDemandeExpired(demande.dateExpiration))) {
        return 'bg-[repeating-linear-gradient(45deg,#f87171,#f87171_10px,#dc2626_10px,#dc2626_20px)]';
      }
    }
    
    // Fallback (section "Toutes") - Orange par défaut
    return 'bg-gradient-to-b from-[#FF6B00] to-[#E56100]';
  };

  // Helper : sauvegarder des IDs comme vus dans localStorage
  function saveVuesIds(ids: string[]) {
    if (ids.length === 0) return;
    const updated = new Set<string>([...demandesVuesSet, ...ids]);
    setDemandesVuesSet(updated);
    try { localStorage.setItem('artisan_demandes_vues', JSON.stringify([...updated])); } catch {}
  }

  // (Les fonctions mark* ne sont plus utilisées pour marquer au clic — voir useEffect ci-dessus)
  // On conserve markDemandesPubliquesAsVues et markDemandesExpressAsVues pour compatibilité.

  // Compteurs de nouvelles demandes pour les badges du hub (exclut les demandes déjà vues)
  const nbNouvellesClassiques =
    getDemandesNouvelles(demandes).filter(d => !demandesVuesSet.has(d.id)).length +
    demandesPubliques.filter(
      d => d.statut !== 'annulee' && !(d.dateExpiration && isDemandeExpired(d.dateExpiration)) && !demandesVuesSet.has(d.id)
    ).length;

  const nbNouvellesExpress = demandesExpress.filter(
    d => d.statut === 'en_attente_proposition' && !demandesVuesSet.has(d.id)
  ).length;

  // Utiliser la bonne liste selon la section active
  const demandesSource = sectionActive === 'mes_demandes' ? demandes : demandesPubliques;
  
  // Filtrer les demandes selon l'onglet sélectionné
  let demandesFiltrees = demandesSource;
  
  // Si un demandeId est spécifié dans l'URL, afficher uniquement cette demande
  if (highlightedDemandeId) {
    demandesFiltrees = demandesSource.filter(d => d.id === highlightedDemandeId);
  } else if (sectionActive === 'mes_demandes') {
    // Filtrage par onglet uniquement pour "Mes demandes"
    if (filter === 'nouvelles') {
      demandesFiltrees = getDemandesNouvelles(demandesSource);
    } else if (filter === 'en_traitement') {
      demandesFiltrees = getDemandesEnTraitement(demandesSource);
    } else if (filter === 'traitees') {
      demandesFiltrees = getDemandesTraitees(demandesSource);
    }
    // Sinon 'toutes' : afficher toutes les demandes (pas de filtre)
  }
  // Pour "Demandes publiques" : toujours afficher toutes

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00] mx-auto mb-4"></div>
          <p className="text-gray-600">{t('artisanRequests.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* Header */}
      <div className="bg-[#2C3E50] text-white py-8">
        <div className="container mx-auto px-4 max-w-6xl">
          <button
            onClick={() => router.push('/artisan/dashboard')}
            className="flex items-center gap-2 text-white hover:text-[#FF6B00] mb-4 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('artisanRequests.backToDashboard')}
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">
                📬 {t('artisanRequests.pageTitle')}
              </h1>
              <p className="text-gray-300 mt-2">{t('artisanRequests.pageDescription')}</p>
            </div>
            {highlightedDemandeId && (
              <button
                onClick={() => router.push('/artisan/demandes')}
                className="flex items-center gap-2 bg-[#FF6B00] text-white px-4 py-2 rounded-lg hover:bg-[#E56100]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {t('artisanRequests.backToAll')}
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="container mx-auto px-4 py-8 max-w-6xl">

        {/* ══════════════════════════════════════════════
             VUE HUB : 2 grandes catégories
        ══════════════════════════════════════════════ */}
        {!highlightedDemandeId && categoryActive === null && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

            {/* ── CARTE Demandes Classiques ── */}
            <button
              onClick={() => {
                setCategoryActive('classiques');
                setSectionActive('mes_demandes');
                // Auto-activer le filtre "Nouvelles" si des nouvelles demandes non vues existent
                const nbNonVues = getDemandesNouvelles(demandes).filter(d => !demandesVuesSet.has(d.id)).length;
                if (nbNonVues > 0) setFilter('nouvelles');
              }}
              className="group text-left bg-[#2C3E50] rounded-2xl shadow-md hover:shadow-xl transition-all duration-200 overflow-hidden flex flex-col"
            >
              {/* Bandeau */}
              <div className="bg-[#2C3E50] px-6 py-4 flex items-center gap-3">
                <span className="text-3xl">🏗️</span>
                <div className="flex-1">
                  <div className="text-white font-bold text-xl">Demandes Classiques</div>
                  <div className="text-gray-300 text-sm">Devis personnalisés</div>
                </div>
                {nbNouvellesClassiques > 0 && (
                  <span className="bg-[#FF6B00] text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">
                    {nbNouvellesClassiques} nouvelle{nbNouvellesClassiques > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {/* Corps */}
              <div className="bg-white px-6 py-5 space-y-4 flex-1">
                <div className="flex items-center gap-4 p-3 rounded-xl bg-orange-50 border border-orange-200">
                  <span className="text-2xl">📋</span>
                  <div className="flex-1">
                    <div className="font-semibold text-[#2C3E50] text-sm">{t('artisanRequests.tabs.myRequests')}</div>
                  </div>
                  {getDemandesNouvelles(demandes).filter(d => !demandesVuesSet.has(d.id)).length > 0 && (
                    <span className="bg-[#FF6B00] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {getDemandesNouvelles(demandes).filter(d => !demandesVuesSet.has(d.id)).length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 p-3 rounded-xl bg-purple-50 border border-purple-200">
                  <span className="text-2xl">📢</span>
                  <div className="flex-1">
                    <div className="font-semibold text-[#2C3E50] text-sm">{t('artisanRequests.tabs.publicRequests')}</div>
                  </div>
                  {demandesPubliques.filter(d => d.statut !== 'annulee' && !(d.dateExpiration && isDemandeExpired(d.dateExpiration)) && !demandesVuesSet.has(d.id)).length > 0 && (
                    <span className="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {demandesPubliques.filter(d => d.statut !== 'annulee' && !(d.dateExpiration && isDemandeExpired(d.dateExpiration)) && !demandesVuesSet.has(d.id)).length}
                    </span>
                  )}
                </div>
                {nbNouvellesClassiques > 0 && (
                  <div className="flex items-center gap-2 text-[#FF6B00] text-sm font-semibold">
                    <span>🔔</span>
                    <span>{nbNouvellesClassiques} demande{nbNouvellesClassiques > 1 ? 's' : ''} en attente</span>
                  </div>
                )}
                <div className="flex items-center justify-end pt-1">
                  <span className="text-sm font-semibold text-[#FF6B00] group-hover:underline">Accéder →</span>
                </div>
              </div>
            </button>

            {/* ── CARTE Demandes Express ── */}
            <button
              onClick={() => { setCategoryActive('express'); setSectionActive('demandes_express'); }}
              className="group text-left bg-[#FF6B00] rounded-2xl shadow-md hover:shadow-xl transition-all duration-200 overflow-hidden flex flex-col"
            >
              {/* Bandeau */}
              <div className="bg-[#FF6B00] px-6 py-4 flex items-center gap-3">
                <span className="text-3xl">⚡</span>
                <div className="flex-1">
                  <div className="text-white font-bold text-xl">Demandes Express</div>
                  <div className="text-orange-100 text-sm">Petits travaux rapides</div>
                </div>
                {nbNouvellesExpress > 0 && (
                  <span className="bg-white text-[#FF6B00] text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">
                    {nbNouvellesExpress} nouvelle{nbNouvellesExpress > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {/* Corps */}
              <div className="bg-white px-6 py-5 space-y-4 flex-1">
                <div className="flex items-center gap-4 p-3 rounded-xl bg-orange-50 border border-orange-200">
                  <span className="text-2xl">⚡</span>
                  <div className="flex-1">
                    <div className="font-semibold text-[#2C3E50] text-sm">Demandes express</div>
                  </div>
                  {nbNouvellesExpress > 0 && (
                    <span className="bg-[#FF6B00] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {nbNouvellesExpress}
                    </span>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <div className="text-xs text-gray-500 leading-relaxed">Interventions rapides à prix fixe, directement proposées aux artisans disponibles.</div>
                </div>
                {nbNouvellesExpress > 0 && (
                  <div className="flex items-center gap-2 text-[#FF6B00] text-sm font-semibold">
                    <span>🔔</span>
                    <span>{nbNouvellesExpress} demande{nbNouvellesExpress > 1 ? 's' : ''} en attente</span>
                  </div>
                )}
                <div className="flex items-center justify-end pt-1">
                  <span className="text-sm font-semibold text-[#FF6B00] group-hover:underline">Accéder →</span>
                </div>
              </div>
            </button>

          </div>
        )}

        {/* ══════════════════════════════════════════════
             VUE CLASSIQUES : sous-onglets 📋 / 📢
        ══════════════════════════════════════════════ */}
        {!highlightedDemandeId && categoryActive === 'classiques' && (
          <div className="mb-6">
            {/* Fil d'Ariane + retour */}
            <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
              <button onClick={() => setCategoryActive(null)} className="hover:text-[#FF6B00] transition flex items-center gap-1">
                ← Retour
              </button>
              <span>/</span>
              <span className="font-semibold text-[#2C3E50]">🏗️ Demandes Classiques</span>
            </div>
            {/* Sous-onglets */}
            <div className="flex gap-4">
              <button
                onClick={() => setSectionActive('mes_demandes')}
                className={`flex-1 py-4 px-6 rounded-xl font-bold text-lg transition-all shadow-md ${
                  sectionActive === 'mes_demandes'
                    ? 'bg-[#FF6B00] text-white ring-4 ring-[#FF6B00] ring-opacity-30'
                    : 'bg-white text-gray-700 hover:bg-orange-50'
                }`}
              >
                <div className="flex items-center justify-center gap-3">
                  <span className="text-2xl">📋</span>
                  <div className="text-left">
                    <div>{t('artisanRequests.tabs.myRequests')}</div>
                    <div className={`text-sm font-normal ${sectionActive === 'mes_demandes' ? 'text-white opacity-90' : 'text-gray-500'}`}>
                      {demandes.filter(d => d.statut !== 'expiree').length} demande{demandes.filter(d => d.statut !== 'expiree').length > 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              </button>
              <button
                onClick={() => { setSectionActive('demandes_publiques'); }}
                className={`flex-1 py-4 px-6 rounded-xl font-bold text-lg transition-all shadow-md ${
                  sectionActive === 'demandes_publiques'
                    ? 'bg-purple-600 text-white ring-4 ring-purple-600 ring-opacity-30'
                    : 'bg-white text-gray-700 hover:bg-purple-50'
                }`}
              >
                <div className="flex items-center justify-center gap-3">
                  <span className="text-2xl">📢</span>
                  <div className="text-left">
                    <div>{t('artisanRequests.tabs.publicRequests')}</div>
                    <div className={`text-sm font-normal ${sectionActive === 'demandes_publiques' ? 'text-white opacity-90' : 'text-gray-500'}`}>
                      {demandesPubliques.length} demande{demandesPubliques.length > 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
             VUE EXPRESS : fil d'Ariane + contenu
        ══════════════════════════════════════════════ */}
        {!highlightedDemandeId && categoryActive === 'express' && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
              <button onClick={() => setCategoryActive(null)} className="hover:text-[#FF6B00] transition flex items-center gap-1">
                ← Retour
              </button>
              <span>/</span>
              <span className="font-semibold text-[#2C3E50]">⚡ Demandes Express</span>
            </div>
          </div>
        )}

        {/* Onglets de filtrage - Affichés seulement dans "Mes demandes" */}
        {!highlightedDemandeId && categoryActive === 'classiques' && sectionActive === 'mes_demandes' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {/* Toutes */}
              <button
                onClick={() => setFilter('toutes')}
                className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-1 ${
                  filter === 'toutes'
                    ? 'bg-gradient-to-br from-[#FF6B00] to-[#E56100] text-white shadow-xl scale-105'
                    : 'bg-white hover:bg-gray-50 shadow-md hover:shadow-lg border border-gray-100'
                }`}
              >
                <div className={`text-3xl font-black mb-1 ${filter === 'toutes' ? 'text-white' : 'text-[#FF6B00]'}`}>
                  {demandes.length}
                </div>
                <div className={`text-xs font-semibold uppercase tracking-wide ${filter === 'toutes' ? 'text-white' : 'text-gray-600'}`}>
                  {t('artisanRequests.filters.all')}
                </div>
              </button>

              {/* Nouvelles */}
              <button
                onClick={() => setFilter('nouvelles')}
                className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-1 ${
                  filter === 'nouvelles'
                    ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-xl scale-105'
                    : 'bg-white hover:bg-gray-50 shadow-md hover:shadow-lg border border-gray-100'
                }`}
              >
                <div className={`text-3xl font-black mb-1 ${filter === 'nouvelles' ? 'text-white' : 'text-orange-500'}`}>
                  {getDemandesNouvelles(demandes).length}
                </div>
                <div className={`text-xs font-semibold uppercase tracking-wide ${filter === 'nouvelles' ? 'text-white' : 'text-gray-600'}`}>
                  📬 {t('artisanRequests.filters.new')}
                </div>
              </button>

              {/* En traitement */}
              <button
                onClick={() => setFilter('en_traitement')}
                className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-1 ${
                  filter === 'en_traitement'
                    ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-xl scale-105'
                    : 'bg-white hover:bg-gray-50 shadow-md hover:shadow-lg border border-gray-100'
                }`}
              >
                <div className={`text-3xl font-black mb-1 ${filter === 'en_traitement' ? 'text-white' : 'text-blue-600'}`}>
                  {getDemandesEnTraitement(demandes).length}
                </div>
                <div className={`text-xs font-semibold uppercase tracking-wide ${filter === 'en_traitement' ? 'text-white' : 'text-gray-600'}`}>
                  ⏳ En traitement
                </div>
              </button>

              {/* Traitées */}
              <button
                onClick={() => setFilter('traitees')}
                className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-1 ${
                  filter === 'traitees'
                    ? 'bg-gradient-to-br from-green-500 to-green-600 text-white shadow-xl scale-105'
                    : 'bg-white hover:bg-gray-50 shadow-md hover:shadow-lg border border-gray-100'
                }`}
              >
                <div className={`text-3xl font-black mb-1 ${filter === 'traitees' ? 'text-white' : 'text-green-600'}`}>
                  {getToutesDemandesTraitees(demandes).length}
                </div>
                <div className={`text-xs font-semibold uppercase tracking-wide ${filter === 'traitees' ? 'text-white' : 'text-gray-600'}`}>
                  ✅ Traitées
                </div>
              </button>
            </div>

            {/* Sous-filtres pour la section "Traitées" */}
            {filter === 'traitees' && getToutesDemandesTraitees(demandes).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6 bg-white rounded-xl shadow-sm p-3 border border-gray-100">
                {([
                  { key: 'tout', label: '🔍 Tout', count: getToutesDemandesTraitees(demandes).length },
                  { key: 'payees', label: '💰 Payées', count: getToutesDemandesTraitees(demandes).filter(d => devisMap.get(d.id)?.some(v => v.statut === 'paye')).length },
                  { key: 'travaux_en_cours', label: '🚧 Travaux en cours', count: getToutesDemandesTraitees(demandes).filter(d => devisMap.get(d.id)?.some(v => v.statut === 'en_cours')).length },
                  { key: 'termines', label: '✅ Terminés', count: getToutesDemandesTraitees(demandes).filter(d => devisMap.get(d.id)?.some(v => ['travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(v.statut))).length },
                  { key: 'refusees', label: '❌ Refusées', count: getToutesDemandesTraitees(demandes).filter(d => d.statut === 'annulee' && !devisMap.get(d.id)?.some(v => ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(v.statut))).length },
                  { key: 'expirees', label: '⏰ Expirées', count: getToutesDemandesTraitees(demandes).filter(d => (d.statut === 'expiree' || (d.dateExpiration && isDemandeExpired(d.dateExpiration))) && !devisMap.get(d.id)?.some(v => ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(v.statut))).length },
                ] as { key: string; label: string; count: number }[]).filter(({ key, count }) => key === 'tout' || count > 0).map(({ key, label, count }) => (
                  <button
                    key={key}
                    onClick={() => setSousFiltreTraitees(key as typeof sousFiltreTraitees)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      sousFiltreTraitees === key
                        ? 'bg-green-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {label} <span className="opacity-75">({count})</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        
        {/* Liste des demandes (hors express) */}
        {(categoryActive === 'classiques' || highlightedDemandeId) && sectionActive !== 'demandes_express' && (demandesFiltrees.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <svg className="w-24 h-24 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <h3 className="text-xl font-bold text-gray-700 mb-2">
              {t('artisanRequests.empty.noRequests')}
            </h3>
            <p className="text-gray-600">
              {t('artisanRequests.empty.description')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {demandesFiltrees.map((demande) => {
              const isExpanded = expandedDemandeIds.has(demande.id);
              // Badge 🔔 basé sur l'état au chargement (stable, ne disparaît pas avec le timer localStorage)
              const isNouveau = demandesNouvellesInitialIds.has(demande.id);
              return (
              <div 
                key={demande.id} 
                ref={(el) => { demandeRefs.current[demande.id] = el; }}
                onClick={() => toggleExpandDemande(demande.id)}
                className={`bg-white rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 cursor-pointer relative border-2 overflow-hidden group ${
                  isExpanded
                    ? 'border-[#FF6B00] ring-1 ring-[#FF6B00] ring-opacity-30'
                    : isNouveau && filter !== 'nouvelles'
                    ? 'border-orange-200 hover:border-[#FF6B00]'
                    : 'border-transparent hover:border-gray-200'
                }`}
              >
                {/* Barre latérale colorée selon section et statut */}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${getBorderColor(demande)}`} />
                
                <div className="p-6 pl-8">{/* Bouton expand/collapse en haut à droite */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpandDemande(demande.id);
                  }}
                  className="absolute top-5 right-5 p-2.5 rounded-xl hover:bg-gray-100 transition-all duration-200 group"
                  title={isExpanded ? t('artisanRequests.card.hideDetails') : t('artisanRequests.card.viewDetails')}
                >
                  <svg 
                    className={`w-5 h-5 text-gray-400 group-hover:text-[#FF6B00] transition-all duration-200 ${
                      isExpanded ? 'rotate-180' : ''
                    }`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Informations demandeur (toujours visible en haut) */}
                {(() => {
                  const client = clientsInfo.get(demande.clientId);
                  if (client) {
                    return (
                      <div className="mb-4 bg-[#F5F7FA] p-4 rounded-lg border border-gray-200">
                        <div className="flex items-center gap-3">
                          <p className="text-sm font-bold text-gray-700">{t('artisanRequests.card.requester')}</p>
                          <div className="w-8 h-8 bg-[#2C3E50] text-white rounded-full flex items-center justify-center font-bold text-sm">
                            {client.prenom?.[0]?.toUpperCase() || 'C'}{client.nom?.[0]?.toUpperCase() || ''}
                          </div>
                          <p className="font-semibold text-[#2C3E50]">
                            {client.prenom} {client.nom}
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Titre principal + Dates + Badge statut */}
                <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-200 pr-12">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h2 className="text-2xl font-bold text-[#2C3E50]">
                        {demande.titre}
                      </h2>
                      {isNouveau && (
                        <span
                          className="inline-flex items-center gap-1 bg-[#FF6B00] text-white text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
                          style={{ animation: 'pulse 0.7s ease-in-out 4' }}
                        >
                          🔔
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <span className="text-[#FF6B00]">🏷️</span>
                        <span className="font-semibold">{t('artisanRequests.card.category')}</span>
                        <span>{demande.categorie}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-red-500">📅</span>
                        <span>{t('artisanRequests.card.createdOn')} {demande.dateCreation?.toDate().toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR')}</span>
                      </div>
                      {demande.datesSouhaitees?.dates && demande.datesSouhaitees.dates.length > 0 && (
                        <div className="flex items-center gap-1">
                          <span className="text-red-500">📅</span>
                          <span>{t('artisanRequests.card.desiredStart')} {new Date(demande.datesSouhaitees.dates[0].toMillis()).toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        </div>
                      )}
                      {(() => {
                        const devisForDemande = devisMap.get(demande.id) || [];
                        const statutsPaye = ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'];
                        const devisPaye = devisForDemande.find(d => statutsPaye.includes(d.statut));
                        if (devisPaye?.delaiRealisation) {
                          return (
                            <div className="flex items-center gap-1">
                              <span className="text-green-600">⏱️</span>
                              <span className="font-semibold">{t('artisanRequests.card.deadline')}</span>
                              <span>{devisPaye.delaiRealisation} {t('artisanRequests.card.days')}</span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                  
                  {/* Badge statut principal */}
                  <div className="flex flex-col items-end gap-2">
                    {demandesAvecDevisPayeIds.has(demande.id) && (() => {
                      const devisForDemande = devisMap.get(demande.id) || [];
                      const devisPaye = devisForDemande.find(dv =>
                        ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(dv.statut)
                      );
                      if (devisPaye?.statut === 'en_cours') {
                        return (
                          <span className="bg-amber-100 text-amber-700 px-4 py-2 rounded-lg text-sm font-bold border-2 border-amber-400">
                            🚧 Travaux en cours
                          </span>
                        );
                      }
                      if (devisPaye && ['travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(devisPaye.statut)) {
                        return (
                          <span className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg text-sm font-bold border-2 border-gray-400">
                            ✅ Travaux terminés
                          </span>
                        );
                      }
                      // Statut par défaut : paye (devis signé, travaux pas encore commencés)
                      return (
                        <span className="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-sm font-bold border-2 border-green-300">
                          ✅ {t('artisanRequests.status.quoteSigned')}
                        </span>
                      );
                    })()}
                    {/* Compteur devis reçus — uniquement pour les demandes publiques */}
                    {demande.type === 'publique' && (() => {
                      const nb = demande.devisRecus || 0;
                      const isQuotaAtteint = nb >= 5 || (demande.statut as string) === 'quota_atteint';
                      const bgColor = isQuotaAtteint
                        ? 'bg-red-100 border-red-400 text-red-700'
                        : nb >= 4
                        ? 'bg-orange-100 border-orange-400 text-orange-700'
                        : 'bg-blue-50 border-blue-300 text-blue-700';
                      return (
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 ${bgColor} flex items-center gap-1`}>
                          📬 {nb}/5 devis reçus
                          {isQuotaAtteint && <span className="ml-1">🔒</span>}
                        </span>
                      );
                    })()}
                    {/* Compte à rebours expiration en temps réel */}
                    {demande.dateExpiration && !demandesAvecDevisPayeIds.has(demande.id) && (() => {
                      const diffMs = demande.dateExpiration.toDate().getTime() - now;
                      if (diffMs <= 0) return null;
                      const totalSec = Math.floor(diffMs / 1000);
                      const h = Math.floor(totalSec / 3600);
                      const m = Math.floor((totalSec % 3600) / 60);
                      const s = totalSec % 60;
                      const isUrgent = diffMs < 60 * 60 * 1000;
                      const minuteLabel = h > 0
                        ? `${h}h ${String(m).padStart(2, '0')}min`
                        : `${m}min`;
                      const secLabel = h > 0
                        ? `${h}h ${String(m).padStart(2, '0')}min ${String(s).padStart(2, '0')}s`
                        : m > 0
                        ? `${m}min ${String(s).padStart(2, '0')}s`
                        : `${s}s`;
                      const expiresDateStr = demande.dateExpiration.toDate().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        + ' ' + demande.dateExpiration.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                      return (
                        <div className={`flex flex-col items-end gap-0.5 px-3 py-1.5 rounded-lg border-2 ${
                          isUrgent ? 'bg-red-50 border-red-400 text-red-700' : 'bg-orange-50 border-[#FF6B00] text-[#FF6B00]'
                        }`}>
                          <span className={`text-xs font-black ${isUrgent ? 'animate-pulse' : ''}`}>⏱️ Expire dans {minuteLabel}</span>
                          <span className="text-[10px] font-bold opacity-80 tabular-nums">{secLabel}</span>
                          <span className="text-[10px] font-normal opacity-60">Expire le {expiresDateStr}</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Description (toujours visible, retour à la ligne pour texte long) */}
                <div className="mb-4">
                  <p className="text-sm font-bold text-gray-700 mb-2">{t('artisanRequests.card.description')}</p>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
                    {demande.description}
                  </p>
                </div>

                {/* Détails complets (seulement si expanded) */}
                {isExpanded && (
                <>
                  {/* Photos jointes */}
                  {(() => {
                  const photosList = normalizePhotoField(demande.photosUrls).length > 0
                    ? normalizePhotoField(demande.photosUrls)
                    : normalizePhotoField(demande.photos);
                  const validPhotos = photosList.filter((url: string) => url && url.startsWith('http'));
                  
                  if (validPhotos.length === 0) return null;
                  
                  return (
                    <div className="mb-4">
                      <p className="text-sm font-semibold text-gray-700 mb-2">
                        📸 {t('artisanRequests.card.projectPhotos').replace('{count}', validPhotos.length.toString())}
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {validPhotos.map((url: string, idx: number) => {
                          // Récupérer le nom original depuis les métadonnées ou utiliser le nom technique
                          const originalName = photoMetadata.get(url);
                          const displayName = originalName || `${t('artisanRequests.card.photo')} ${idx + 1}`;
                          
                          return (
                            <div
                              key={idx}
                              className="relative aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-[#FF6B00] transition-all shadow-sm"
                              style={{ backgroundColor: '#ffffff' }}
                            >
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={displayName}
                                className="block w-full h-full"
                              >
                                <img
                                  src={url}
                                  alt={displayName}
                                  className="w-full h-full object-contain"
                                  onLoad={(e) => {
                                    console.log('✅ Photo chargée:', displayName, url);
                                  }}
                                  onError={(e) => {
                                    console.error('❌ Erreur chargement photo:', displayName, url);
                                    // Afficher un placeholder si l'image ne charge pas
                                    const img = e.currentTarget;
                                    img.style.display = 'none';
                                    const container = img.parentElement?.parentElement;
                                    if (container && !container.querySelector('.photo-error')) {
                                      const errorDiv = document.createElement('div');
                                      errorDiv.className = 'photo-error absolute inset-0 flex flex-col items-center justify-center bg-gray-100';
                                      errorDiv.innerHTML = `
                                        <svg class="w-10 h-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                        </svg>
                                        <span class="text-xs text-gray-500 text-center px-2">${displayName}</span>
                                      `;
                                      container.appendChild(errorDiv);
                                    }
                                  }}
                                />
                              </a>
                              {/* Tooltip au hover avec le nom du fichier */}
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                                <p className="text-white text-xs truncate">{displayName}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                  {/* Localisation et Dates souhaitées côte à côte */}
                  <div className="mb-6 grid md:grid-cols-2 gap-4">
                    {/* Localisation */}
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <p className="text-sm font-bold text-[#2C3E50] mb-3 flex items-center gap-2">
                        <span>📍</span>
                        {t('artisanRequests.card.location')}
                      </p>
                      <div className="space-y-1">
                        <p className="text-[#2C3E50]">
                          <span className="font-semibold">{t('artisanRequests.card.city')}</span> {demande.localisation?.ville || t('common.notSpecified')}
                        </p>
                        <p className="text-[#2C3E50]">
                          <span className="font-semibold">{t('artisanRequests.card.postalCode')}</span> {demande.localisation?.codePostal || 'N/A'}
                        </p>
                      </div>
                    </div>

                    {/* Dates souhaitées */}
                    {demande.datesSouhaitees?.dates && demande.datesSouhaitees.dates.length > 0 && (
                      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                        <p className="text-sm font-bold text-green-900 mb-3 flex items-center gap-2">
                          <span>📅</span>
                          {t('artisanRequests.card.desiredDate')}
                        </p>
                        <p className="text-green-800">
                          {new Date(demande.datesSouhaitees.dates[0].toMillis()).toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </p>
                        {demande.datesSouhaitees.flexible && (
                          <span className="inline-block mt-2 bg-green-200 text-green-800 px-2 py-1 rounded text-xs font-semibold">
                            {t('artisanRequests.card.flexible')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                {/* Informations complémentaires : dates, budget, sous-catégorie */}
                <div className="mb-6 bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <p className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
                    <span>ℹ️</span>
                    Informations de la demande
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    {/* Date de création avec heure */}
                    <div className="flex items-start gap-2">
                      <span className="text-blue-600 mt-0.5">🕐</span>
                      <div>
                        <p className="font-semibold text-blue-900">Date / heure de création</p>
                        <p className="text-blue-800">
                          {demande.dateCreation?.toDate().toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', {
                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                          })}{' '}
                          à {demande.dateCreation?.toDate().toLocaleTimeString(language === 'en' ? 'en-US' : 'fr-FR', {
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>

                    {/* Date d'expiration avec heure + compte à rebours en temps réel */}
                    {demande.dateExpiration ? (
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 ${isDemandeExpired(demande.dateExpiration) ? 'text-red-500' : 'text-orange-500'}`}>⏳</span>
                        <div>
                          <p className="font-semibold text-blue-900">Date / heure d'expiration</p>
                          <p className={`${isDemandeExpired(demande.dateExpiration) ? 'text-red-700 font-bold' : 'text-orange-700'}`}>
                            {demande.dateExpiration.toDate().toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', {
                              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                            })}{' '}
                            à {demande.dateExpiration.toDate().toLocaleTimeString(language === 'en' ? 'en-US' : 'fr-FR', {
                              hour: '2-digit', minute: '2-digit'
                            })}
                            {isDemandeExpired(demande.dateExpiration) && (
                              <span className="ml-2 bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">Expirée</span>
                            )}
                          </p>
                          {/* Compte à rebours en secondes */}
                          {!isDemandeExpired(demande.dateExpiration) && (() => {
                            const diffMs = demande.dateExpiration!.toDate().getTime() - now;
                            if (diffMs <= 0) return null;
                            const totalSec = Math.floor(diffMs / 1000);
                            const d = Math.floor(totalSec / 86400);
                            const h = Math.floor((totalSec % 86400) / 3600);
                            const m = Math.floor((totalSec % 3600) / 60);
                            const s = totalSec % 60;
                            const parts: string[] = [];
                            if (d > 0) parts.push(`${d}j`);
                            if (h > 0) parts.push(`${h}h`);
                            parts.push(`${String(m).padStart(2, '0')}min`);
                            parts.push(`${String(s).padStart(2, '0')}s`);
                            const isUrgent = diffMs < 60 * 60 * 1000;
                            return (
                              <p className={`mt-1 text-sm font-black tabular-nums ${
                                isUrgent ? 'text-red-600 animate-pulse' : 'text-[#FF6B00]'
                              }`}>
                                ⏱️ {parts.join(' ')}
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <span className="text-gray-400 mt-0.5">⏳</span>
                        <div>
                          <p className="font-semibold text-blue-900">Date / heure d'expiration</p>
                          <p className="text-gray-500 italic">Non définie</p>
                        </div>
                      </div>
                    )}

                    {/* Budget indicatif */}
                    {demande.budgetIndicatif && demande.budgetIndicatif > 0 ? (
                      <div className="flex items-start gap-2">
                        <span className="text-green-600 mt-0.5">💶</span>
                        <div>
                          <p className="font-semibold text-blue-900">Budget indicatif</p>
                          <p className="text-green-700 font-bold">{demande.budgetIndicatif.toLocaleString('fr-FR')} €</p>
                        </div>
                      </div>
                    ) : null}

                    {/* Sous-catégorie */}
                    {demande.sousCategorie && (
                      <div className="flex items-start gap-2">
                        <span className="text-purple-600 mt-0.5">🔖</span>
                        <div>
                          <p className="font-semibold text-blue-900">Sous-catégorie</p>
                          <p className="text-purple-700 capitalize">{demande.sousCategorie.replace(/-/g, ' ')}</p>
                        </div>
                      </div>
                    )}

                    {/* Type de demande */}
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 mt-0.5">📂</span>
                      <div>
                        <p className="font-semibold text-blue-900">Type</p>
                        <p className="text-gray-700">
                          {demande.type === 'publique' ? '📢 Publique' : '🎯 Directe'}
                          {demande.typeProjet === 'express' && (
                            <span className="ml-2 bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">⚡ Express</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Badge Demande urgente */}
                {demande.urgence && (
                  <div className="mb-6 bg-red-50 p-4 rounded-lg border-2 border-red-300">
                    <p className="text-red-700 font-bold flex items-center gap-2">
                      <span>🚨</span>
                      {t('artisanRequests.card.urgent')}
                    </p>
                  </div>
                )}
                </>
                )}

                {/* Message vert + Boutons pour devis payé (TOUJOURS VISIBLES) */}
                {demandesAvecDevisPayeIds.has(demande.id) && (() => {
                  const devisForDemande = devisMap.get(demande.id) || [];
                  const statutsPaye = ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'];
                  const devisPaye = devisForDemande.find(d => statutsPaye.includes(d.statut));
                  
                  return (
                    <div className="mt-4">
                      <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <svg className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div className="flex-1">
                            <p className="font-bold text-green-700 mb-1">✅ {t('artisanRequests.status.quoteAcceptedPaid')}</p>
                            <p className="text-sm text-green-600">
                              {t('artisanRequests.status.assignedToYou')}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-3 mt-3">
                        {/* Bouton "Commencer travaux" si statut = 'paye' */}
                        {devisPaye?.statut === 'paye' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (devisPaye?.id && devisPaye?.numeroDevis) {
                                handleCommencerTravaux(devisPaye.id, devisPaye.numeroDevis);
                              }
                            }}
                            className="flex-1 bg-green-600 text-white hover:bg-green-700 rounded-lg px-4 py-2.5 font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                          >
                            🚧 {t('artisanRequests.actions.startWork')}
                          </button>
                        )}

                        {/* Bouton "Fin des travaux" si statut = 'en_cours' */}
                        {devisPaye?.statut === 'en_cours' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (devisPaye?.id && devisPaye?.numeroDevis) {
                                handleFinTravaux(devisPaye.id, devisPaye.numeroDevis);
                              }
                            }}
                            className="flex-1 bg-[#FF6B00] text-white hover:bg-[#E56100] rounded-lg px-4 py-2.5 font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                          >
                            🏁 {t('artisanRequests.actions.finishWork')}
                          </button>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (devisPaye?.id) {
                              router.push(`/artisan/devis/${devisPaye.id}`);
                            } else {
                              router.push(`/artisan/contrats?demandeId=${demande.id}`);
                            }
                          }}
                          className="flex-1 bg-[#FF6B00] text-white hover:bg-[#E56100] rounded-lg px-4 py-2.5 font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                        >
                          📋 {t('artisanRequests.actions.viewPaidQuote')}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/messages?userId=${demande.clientId}&demandeId=${demande.id}`);
                          }}
                          className="px-4 py-2.5 border-2 border-[#2C3E50] text-[#2C3E50] hover:bg-[#2C3E50] hover:text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2"
                        >
                          💬 {t('artisanRequests.actions.contactClient')}
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Boutons d'action normaux (TOUJOURS VISIBLES) */}
                {!demandesAvecDevisPayeIds.has(demande.id) && demande.statut !== 'annulee' && !demandesTermineesIds.has(demande.id) && (() => {
                  const refusStatut = demandesRefusStatut.get(demande.id);
                  
                  // Si refus définitif : bloquer complètement
                  if (refusStatut?.definitif) {
                    return (
                      <div className="mt-4 space-y-3">
                        <div className="bg-gray-100 border-2 border-gray-300 p-4 rounded-lg">
                          <div className="flex items-start gap-3">
                            <svg className="w-6 h-6 text-gray-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                            <div className="flex-1">
                              <p className="font-bold text-gray-700 mb-1">⛔ {t('artisanRequests.status.requestClosed')}</p>
                              <p className="text-sm text-gray-600">
                                {t('artisanRequests.status.refusedDefinitive')}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  
                  // Si refus avec révision : permettre de créer une variante
                  if (refusStatut?.revision) {
                    return (
                      <div className="flex gap-3 mt-4">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (demande.type === 'publique' && authUser) {
                              const { markDemandeAsViewed } = await import('@/lib/firebase/demande-service');
                              markDemandeAsViewed(demande.id, authUser.uid).catch(error => {
                                console.error('⚠️ Erreur tracking consultation:', error);
                              });
                            }
                            router.push(`/artisan/devis/nouveau?demandeId=${demande.id}`);
                          }}
                          className="flex-1 bg-orange-500 text-white hover:bg-orange-600 rounded-lg px-4 py-2.5 font-medium transition-all duration-200 shadow-sm hover:shadow-md"
                        >
                          🔄 {t('artisanRequests.actions.createRevisedQuote')}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/messages?userId=${demande.clientId}&demandeId=${demande.id}`);
                          }}
                          className="px-4 py-2.5 border-2 border-[#2C3E50] text-[#2C3E50] hover:bg-[#2C3E50] hover:text-white rounded-lg font-medium transition-all duration-200"
                        >
                          💬 {t('artisanRequests.actions.contactClient')}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRefuserDemande(demande.id);
                          }}
                          disabled={refusingDemandeId === demande.id}
                          className="px-4 py-2.5 border-2 border-red-300 text-red-700 hover:bg-red-50 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {refusingDemandeId === demande.id ? `⏳ ${t('artisanRequests.actions.refusing')}` : `❌ ${t('artisanRequests.actions.refuse')}`}
                        </button>
                      </div>
                    );
                  }
                  
                  // Affichage normal
                  return (
                    <div className="flex gap-3 mt-4">
                      {(demande.statut as string) !== 'attribuee' && (demande.statut as string) !== 'quota_atteint' && (() => {
                        // Vérifier si cet artisan a déjà un devis envoyé/en attente
                        const tousDevisDemande = (devisMap.get(demande.id) || []).filter(d => d.artisanId === user?.uid);
                        const devisEnvoye = tousDevisDemande.find(d => ['envoye', 'en_attente_acceptation', 'brouillon'].includes(d.statut));
                        if (devisEnvoye) {
                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/artisan/devis/${devisEnvoye.id}`);
                              }}
                              className="flex-1 bg-blue-600 text-white hover:bg-blue-700 rounded-lg px-4 py-2.5 font-medium transition-all duration-200 shadow-sm hover:shadow-md"
                            >
                              📋 {t('artisanRequests.actions.viewSentQuote') || 'Voir le devis envoyé'}
                            </button>
                          );
                        }
                        return (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (demande.type === 'publique' && authUser) {
                                const { markDemandeAsViewed } = await import('@/lib/firebase/demande-service');
                                markDemandeAsViewed(demande.id, authUser.uid).catch(error => {
                                  console.error('⚠️ Erreur tracking consultation:', error);
                                });
                              }
                              router.push(`/artisan/devis/nouveau?demandeId=${demande.id}`);
                            }}
                            className="flex-1 bg-[#FF6B00] text-white hover:bg-[#E56100] rounded-lg px-4 py-2.5 font-medium transition-all duration-200 shadow-sm hover:shadow-md"
                          >
                            📝 {t('artisanRequests.actions.sendQuote')}
                          </button>
                        );
                      })()}
                      {(demande.statut as string) === 'attribuee' && (() => {
                        // Vérifier si C'EST cet artisan l'attributaire
                        // Cas 1 : artisanAttributaireId correspond à cet artisan
                        // Cas 2 : l'artisan a un devis payé/en cours sur cette demande (rétrocompatibilité)
                        // ⚠️ IMPORTANT : filtrer par artisanId car devisMap contient TOUS les artisans
                        const devisCetArtisan = (devisMap.get(demande.id) || []).filter(d => d.artisanId === user?.uid);
                        const estAttributaire =
                          demande.artisanAttributaireId === user?.uid ||
                          devisCetArtisan.some(d =>
                            ['en_attente_paiement', 'paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'].includes(d.statut)
                          );

                        if (estAttributaire) {
                          // Ce devis est pour cet artisan → bouton vers le devis concerné
                          const devisActif = devisCetArtisan.find(d =>
                            ['en_attente_paiement', 'paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'].includes(d.statut)
                          );
                          if (devisActif) {
                            return (
                              <button
                                onClick={(e) => { e.stopPropagation(); router.push(`/artisan/devis/${devisActif.id}`); }}
                                className="flex-1 bg-green-600 text-white hover:bg-green-700 rounded-lg px-4 py-2.5 font-medium transition-all duration-200 text-center"
                              >
                                📄 Voir le devis
                              </button>
                            );
                          }
                          return null;
                        }

                        // Un autre artisan a été choisi
                        return (
                          <div className="flex-1 bg-gray-100 text-gray-500 px-4 py-2.5 rounded-lg font-medium border border-gray-200 text-center text-sm italic">
                            ✅ {t('artisanRequests.status.alreadyAssigned')}
                          </div>
                        );
                      })()}
                      {(demande.statut as string) === 'quota_atteint' && (
                        <div className="flex-1 bg-orange-50 text-orange-700 px-4 py-2.5 rounded-lg font-medium border-2 border-orange-300 text-center">
                          🔒 {t('artisanRequests.status.quotaReached')}
                        </div>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/messages?userId=${demande.clientId}&demandeId=${demande.id}`);
                        }}
                        className="px-4 py-2.5 border-2 border-[#2C3E50] text-[#2C3E50] hover:bg-[#2C3E50] hover:text-white rounded-lg font-medium transition-all duration-200"
                      >
                        💬 {t('artisanRequests.actions.contactClient')}
                      </button>
                      {(() => {
                        // Griser si un devis est en attente de réponse client (envoye)
                        // OU si le client a déjà accepté (en_attente_paiement, paye, en_cours...)
                        // = toute situation où le devis est "verrouillé" et ne peut plus être annulé
                        const devisEnAttenteClient = (devisMap.get(demande.id) || [])
                          .filter(d => d.artisanId === user?.uid)
                          .find(d => ['envoye', 'en_attente_paiement', 'paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'].includes(d.statut));
                        const devisAccepte = devisEnAttenteClient && devisEnAttenteClient.statut !== 'envoye';
                        const btnDisabled = refusingDemandeId === demande.id || !!devisEnAttenteClient;
                        const btnTitle = devisAccepte
                          ? 'Le client a accepté votre devis — impossible de refuser la demande'
                          : devisEnAttenteClient
                          ? 'Votre devis est en attente de réponse du client — refus indisponible pour l\'instant'
                          : undefined;
                        return (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRefuserDemande(demande.id);
                            }}
                            disabled={btnDisabled}
                            title={btnTitle}
                            className={`px-4 py-2.5 border-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                              devisEnAttenteClient
                                ? 'border-gray-300 text-gray-400 bg-gray-50'
                                : 'border-red-300 text-red-700 hover:bg-red-50'
                            }`}
                          >
                            {refusingDemandeId === demande.id ? `⏳ ${t('artisanRequests.actions.refusing')}` : `❌ ${t('artisanRequests.actions.refuse')}`}
                          </button>
                        );
                      })()}
                    </div>
                  );
                })()}
              </div>
            </div>
            );
            })}
          </div>
        ))}

        {/* Section Demandes Express */}
        {categoryActive === 'express' && sectionActive === 'demandes_express' && (
          demandesExpress.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <span className="text-6xl mb-4 block">⚡</span>
              <h3 className="text-xl font-bold text-gray-700 mb-2">Aucune demande express</h3>
              <p className="text-gray-600">Vous n&apos;avez pas encore reçu de demande express.</p>
            </div>
          ) : (() => {
            // Calcule les listes filtrées (en dehors du JSX pour éviter la repetition)
            const getFilteredList = (key: typeof expressFilter) => demandesExpress.filter(d => {
              const props = expressPropositionsMap.get(d.id) || [];
              const maProps = props.find(p => p.artisanId === authUser?.uid);
              if (key === 'nouvelles') {
                return d.statut === 'en_attente_proposition' && !maProps;
              }
              if (key === 'propositions_envoyees') {
                return maProps?.statut === 'en_attente_acceptation' || maProps?.statut === 'en_negociation' || maProps?.statut === 'proposition_finale_artisan';
              }
              if (key === 'acceptees') {
                return ['acceptee', 'payee', 'en_cours', 'travaux_termines'].includes(d.statut);
              }
              if (key === 'validees') {
                return d.statut === 'terminee';
              }
              if (key === 'refusees') {
                if (maProps?.statut !== 'refusee') return false;
                const refusedAt = maProps.refusedAt?.toDate().getTime() ?? 0;
                return (Date.now() - refusedAt) < 24 * 60 * 60 * 1000;
              }
              return true;
            });

            const counts = {
              nouvelles: getFilteredList('nouvelles').length,
              propositions_envoyees: getFilteredList('propositions_envoyees').length,
              acceptees: getFilteredList('acceptees').length,
              validees: getFilteredList('validees').length,
              refusees: getFilteredList('refusees').length,
            };
            const demandesExpressFiltrees = getFilteredList(expressFilter);

            return (
            <div className="space-y-4">
              {/* Onglets de filtre */}
              <div className="flex gap-2 flex-wrap">
                {([
                  { key: 'nouvelles' as const, label: '🆕 Nouvelles', count: counts.nouvelles },
                  { key: 'propositions_envoyees' as const, label: '📨 Propositions envoyées', count: counts.propositions_envoyees },
                  { key: 'acceptees' as const, label: '✅ Acceptées/Payées', count: counts.acceptees },
                  { key: 'validees' as const, label: '🎉 Validées', count: counts.validees },
                  { key: 'refusees' as const, label: '❌ Refusées', count: counts.refusees },
                ] as { key: typeof expressFilter; label: string; count: number }[]).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setExpressFilter(tab.key)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all border-2 ${
                      expressFilter === tab.key
                        ? 'bg-[#FF6B00] text-white border-[#FF6B00] shadow-md'
                        : 'bg-white text-[#2C3E50] border-gray-200 hover:border-[#FF6B00] hover:bg-orange-50'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                      expressFilter === tab.key ? 'bg-white text-[#FF6B00]' : 'bg-gray-100 text-gray-600'
                    }`}>{tab.count}</span>
                  </button>
                ))}
              </div>

              {demandesExpressFiltrees.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm p-10 text-center border border-gray-100">
                  <span className="text-5xl mb-3 block">
                    {expressFilter === 'nouvelles' ? '🔍' :
                     expressFilter === 'propositions_envoyees' ? '📭' :
                     expressFilter === 'acceptees' ? '💳' :
                     expressFilter === 'validees' ? '🎉' : '✌️'}
                  </span>
                  <p className="text-gray-500 font-medium">
                    {expressFilter === 'nouvelles' ? 'Aucune nouvelle demande pour le moment.' :
                     expressFilter === 'propositions_envoyees' ? 'Aucune proposition en attente de réponse.' :
                     expressFilter === 'acceptees' ? 'Aucune demande acceptée/payée.' :
                     expressFilter === 'validees' ? 'Aucune demande validée par les clients.' :
                     'Aucune proposition refusée (ou disparues après 24h).'}
                  </p>
                </div>
              ) : (
              <div className="space-y-4">
              {demandesExpressFiltrees.map((demande) => {
                const isExpanded = expandedExpressIds.has(demande.id);
                const propositions = expressPropositionsMap.get(demande.id) || [];
                const maProposition = propositions.find(p => p.artisanId === authUser?.uid);
                // Normalise photos : tableau ou objet-map {0:url,...} (bug historique sanitizeForFirestore)
                const rawPhotos = (demande as any).photos;
                const expressPhotos: string[] = !rawPhotos ? []
                  : Array.isArray(rawPhotos) ? rawPhotos
                  : typeof rawPhotos === 'object' ? Object.keys(rawPhotos).sort((a,b)=>Number(a)-Number(b)).map((k:string)=>rawPhotos[k])
                  : [];

                const toggleExpressCard = async (id: string) => {
                  const next = new Set(expandedExpressIds);
                  if (next.has(id)) {
                    next.delete(id);
                  } else {
                    next.add(id);
                    if (!expressPropositionsMap.has(id)) {
                      try {
                        const props = await getPropositionsByDemande(id);
                        setExpressPropositionsMap(prev => new Map(prev).set(id, props));
                      } catch (e) {
                        console.error('Erreur chargement propositions express:', e);
                      }
                    }
                  }
                  setExpandedExpressIds(next);
                };

                return (
                  <div
                    key={demande.id}
                    className={`bg-white rounded-2xl shadow-md transition-all duration-300 relative border-2 overflow-hidden ${
                      isExpanded ? 'border-[#FF6B00] ring-1 ring-[#FF6B00] ring-opacity-30' : 'border-transparent hover:border-gray-200 hover:shadow-xl'
                    }`}
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#FF6B00] to-[#E56100]" />

                    {/* Bouton expand/collapse */}
                    <button
                      onClick={() => toggleExpressCard(demande.id)}
                      className="absolute top-5 right-5 p-2.5 rounded-xl hover:bg-gray-100 transition-all duration-200 group"
                      title={isExpanded ? 'Réduire' : 'Voir les détails'}
                    >
                      <svg
                        className={`w-5 h-5 text-gray-400 group-hover:text-[#FF6B00] transition-all duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Contenu principal (toujours visible) */}
                    <div
                      className="p-6 pl-8 pr-14 cursor-pointer"
                      onClick={() => toggleExpressCard(demande.id)}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">⚡</span>
                        <span className="font-bold text-[#2C3E50] text-lg capitalize">{demande.categorie}</span>
                        {demande.sousCategorie && demande.sousCategorie !== 'toutes' && (
                          <span className="text-sm text-gray-500">• {demande.sousCategorie}</span>
                        )}
                        <span className={`ml-2 px-2 py-1 rounded-full text-xs font-bold ${
                          demande.urgence === 'immediat' ? 'bg-orange-100 text-orange-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {demande.urgence === 'immediat' ? '⚡ Immédiat (2h)' : '🚨 Urgent (24h)'}
                        </span>
                        <span className={`ml-auto mr-2 px-3 py-1 rounded-full text-xs font-bold ${
                          demande.statut === 'en_attente_proposition' ? 'bg-yellow-100 text-yellow-700' :
                          demande.statut === 'proposition_recue' ? 'bg-blue-100 text-blue-700' :
                          demande.statut === 'acceptee' ? 'bg-green-100 text-green-700' :
                          demande.statut === 'en_cours' ? 'bg-orange-100 text-orange-700' :
                          demande.statut === 'terminee' ? 'bg-gray-100 text-gray-600' :
                          demande.statut === 'annulee' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {demande.statut === 'en_attente_proposition' ? '⏳ En attente' :
                           demande.statut === 'proposition_recue' ? '📨 Proposition envoyée' :
                           demande.statut === 'acceptee' ? '✅ Acceptée' :
                           demande.statut === 'en_cours' ? '🔧 En cours' :
                           demande.statut === 'terminee' ? '🏁 Terminée' :
                           demande.statut === 'annulee' ? '❌ Annulée' :
                           demande.statut}
                        </span>
                      </div>
                      {(() => {
                        const expClient = clientsInfo.get(demande.clientId);
                        return expClient ? (
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 bg-[#2C3E50] text-white rounded-full flex items-center justify-center font-bold text-xs">
                              {expClient.prenom?.[0]?.toUpperCase() || 'C'}{expClient.nom?.[0]?.toUpperCase() || ''}
                            </div>
                            <span className="text-sm font-semibold text-[#2C3E50]">{expClient.prenom} {expClient.nom}</span>
                          </div>
                        ) : null;
                      })()}
                      <p className="text-gray-700 mb-3 line-clamp-3 break-all whitespace-pre-wrap overflow-hidden">{demande.description}</p>
                      <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                        <span>📍 {demande.ville} ({demande.codePostal})</span>
                        {demande.createdAt && (
                          <span>🕐 Créée le {demande.createdAt.toDate().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                        {demande.budgetPropose && <span>💰 {demande.budgetPropose}€</span>}
                      </div>
                    </div>

                    {/* Zone dépliée - détails complets + proposition */}
                    {isExpanded && (
                      <div className="px-8 pb-6 border-t border-gray-100 pt-4 space-y-4">

                        {/* Bandeau expiration — uniquement pendant la recherche d'artisan */}
                        {demande.expiresAt && demande.statut === 'en_attente_proposition' && (() => {
                          const diff = demande.expiresAt.toDate().getTime() - Date.now();
                          const isExpired = diff <= 0;
                          const isUrgent = !isExpired && diff < 30 * 60 * 1000;
                          const totalSec = Math.max(0, Math.floor(diff / 1000));
                          const h = Math.floor(totalSec / 3600);
                          const m = Math.floor((totalSec % 3600) / 60);
                          const timeLabel = isExpired ? 'Expirée' : h > 0 ? `${h}h ${String(m).padStart(2,'0')}min` : `${m}min`;
                          const expiresDateStr = demande.expiresAt.toDate().toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
                          return (
                            <div className={`rounded-xl px-4 py-3 flex items-center justify-between border-2 ${
                              isExpired ? 'bg-gray-100 border-gray-300 text-gray-500' :
                              isUrgent ? 'bg-red-50 border-red-400 text-red-700' :
                              'bg-orange-50 border-[#FF6B00] text-[#2C3E50]'
                            }`}>
                              <div className="flex items-center gap-2">
                                <span>{isExpired ? '⏹️' : isUrgent ? '🔴' : '⏱️'}</span>
                                <div>
                                  <p className="text-xs opacity-70 uppercase tracking-wide font-semibold">
                                    {isExpired ? 'Expirée' : 'Expire dans'}
                                  </p>
                                  <p className={`text-lg font-black ${isUrgent && !isExpired ? 'animate-pulse' : ''}`}>{timeLabel}</p>
                                </div>
                              </div>
                              <div className="text-right text-xs">
                                <p className="opacity-60">Expire le</p>
                                <p className="font-semibold text-sm">{expiresDateStr}</p>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Info : le client doit répondre — proposition déjà envoyée */}
                        {demande.expiresAt && ['proposition_recue', 'en_negociation', 'proposition_finale_artisan'].includes(demande.statut) && (
                          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm">
                            <span>📨</span>
                            <p className="text-blue-700 font-medium">
                              Proposition envoyée — le client doit répondre avant le{' '}
                              <strong>{demande.expiresAt.toDate().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
                            </p>
                          </div>
                        )}

                        {/* Grille de métadonnées */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">🕐 Créée le</p>
                            <p className="font-semibold text-[#2C3E50]">
                              {demande.createdAt?.toDate().toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) ?? '—'}
                            </p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">
                              {demande.urgence === 'immediat' ? '⚡' : '🚨'} Intervention attendue
                            </p>
                            <p className="font-semibold text-[#2C3E50]">
                              {demande.urgence === 'immediat' ? 'Dans les 2h' : 'Dans les 24h'} après création
                            </p>
                            {demande.createdAt && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                Avant le {new Date(
                                  demande.createdAt.toDate().getTime() +
                                  (demande.urgence === 'immediat' ? 2 : 24) * 60 * 60 * 1000
                                ).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3">
                            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">📍 Localisation</p>
                            <p className="font-semibold text-[#2C3E50]">{demande.ville} ({demande.codePostal})</p>
                          </div>
                          {demande.budgetPropose && (
                            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                              <p className="text-xs text-orange-400 font-semibold uppercase tracking-wide mb-1">💰 Budget client</p>
                              <p className="text-xl font-black text-[#FF6B00]">{demande.budgetPropose}€</p>
                            </div>
                          )}
                        </div>

                        {/* Photos du chantier */}
                        {expressPhotos.length > 0 && (
                          <div>
                            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">📷 Photos du chantier ({expressPhotos.length})</p>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                              {expressPhotos.map((url, idx) => (
                                <a key={idx} href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                                  <img
                                    src={url}
                                    alt={`Photo ${idx + 1}`}
                                    className="w-full h-24 object-cover rounded-lg border-2 border-[#E9ECEF] hover:border-[#FF6B00] transition-colors cursor-pointer"
                                  />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Proposition */}
                        {maProposition ? (
                          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
                            <h4 className="font-bold text-[#2C3E50]">✅ Votre proposition</h4>
                            <div className="flex items-center gap-4">
                              <div>
                                <p className="text-xs text-gray-500 mb-0.5">Montant proposé</p>
                                <p className="text-2xl font-bold text-[#FF6B00]">{maProposition.montantPropose}€</p>
                              </div>
                              {maProposition.delaiIntervention && (
                                <div>
                                  <p className="text-xs text-gray-500 mb-0.5">Délai</p>
                                  <p className="text-sm font-medium text-[#2C3E50]">{maProposition.delaiIntervention}</p>
                                </div>
                              )}
                              <span className={`ml-auto px-3 py-1 rounded-full text-xs font-bold ${
                                maProposition.statut === 'acceptee' ? 'bg-green-100 text-green-800' :
                                maProposition.statut === 'refusee' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {maProposition.statut === 'acceptee' ? '✅ Acceptée' :
                                 maProposition.statut === 'refusee' ? '❌ Refusée' :
                                 "⏳ En attente d'acceptation"}
                              </span>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-0.5">Description de votre prestation</p>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{maProposition.description}</p>
                            </div>
                          </div>
                        ) : demande.statut === 'en_attente_proposition' ? (
                          <div className="text-center py-4">
                            <p className="text-gray-500 text-sm mb-3">Vous n&apos;avez pas encore fait de proposition sur cette demande.</p>
                            <div className="flex gap-3 justify-center flex-wrap">
                              <button
                                onClick={(e) => { e.stopPropagation(); router.push(`/artisan/demandes-express/${demande.id}`); }}
                                className="px-5 py-2.5 bg-[#FF6B00] text-white rounded-lg hover:bg-[#E56100] text-sm font-medium transition-all"
                              >
                                💬 Faire une proposition
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!confirm('Confirmer le refus de cette demande ?')) return;
                                  setRefusingExpressId(demande.id);
                                  try {
                                    await refuserDemandeExpressParArtisan(demande.id, authUser!.uid);
                                    setDemandesExpress(prev => prev.filter(d => d.id !== demande.id));
                                  } catch (err: unknown) {
                                    const message = err instanceof Error ? err.message : 'Erreur lors du refus';
                                    alert(message);
                                  } finally {
                                    setRefusingExpressId(null);
                                  }
                                }}
                                disabled={refusingExpressId === demande.id}
                                className="px-5 py-2.5 bg-white border-2 border-red-500 text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium transition-all disabled:opacity-50"
                              >
                                {refusingExpressId === demande.id ? '⏳ Refus...' : '✕ Refuser'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); router.push(`/artisan/demandes-express/${demande.id}`); }}
                              className="px-5 py-2.5 bg-[#2C3E50] text-white rounded-lg hover:bg-[#1A3A5C] text-sm font-medium transition-all"
                            >
                              Voir la page complète →
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
              )}
            </div>
            );
          })()
        )}
      </div>
    </div>
  );
}
