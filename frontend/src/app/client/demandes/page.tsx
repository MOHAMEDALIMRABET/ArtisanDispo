'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getDemandesByClient, deleteDemande, updateDemandeStatut } from '@/lib/firebase/demande-service';
import { getArtisansByIds } from '@/lib/firebase/artisan-service';
import { getDevisByDemande } from '@/lib/firebase/devis-service';
import { createNotification } from '@/lib/firebase/notification-service';
import { getFileMetadata } from '@/lib/firebase/storage-service';
import { isDemandeExpired } from '@/lib/dateExpirationUtils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { Demande, Artisan } from '@/types/firestore';
import type { Devis } from '@/types/devis';
import { useLanguage } from '@/contexts/LanguageContext';

export default function MesDemandesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { t, language } = useLanguage();
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [artisansMap, setArtisansMap] = useState<Map<string, Artisan>>(new Map());
  const [devisMap, setDevisMap] = useState<Map<string, Devis[]>>(new Map());
  const [demandesAvecDevisPayeIds, setDemandesAvecDevisPayeIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showAnnulees, setShowAnnulees] = useState(false);
  const [filtreStatut, setFiltreStatut] = useState<'toutes' | 'publiee' | 'annulee' | 'genere'>('toutes');
  const [filtreDateTravaux, setFiltreDateTravaux] = useState<string>('');
  const [filtreType, setFiltreType] = useState<'toutes' | 'directe' | 'publique'>('toutes');
  const [filtreSection, setFiltreSection] = useState<'toutes' | 'envoyes' | 'publiees' | 'en_traitement' | 'traitees'>('toutes');
  const [sousFiltreTraitees, setSousFiltreTraitees] = useState<'tout' | 'devis_signes' | 'travaux_en_cours' | 'termines' | 'litiges' | 'refusees' | 'expirees'>('tout');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedDemandeIds, setExpandedDemandeIds] = useState<Set<string>>(new Set());
  const [photoMetadata, setPhotoMetadata] = useState<Map<string, string>>(new Map());
  const [showExpirationHelp, setShowExpirationHelp] = useState(false);

  // Clé pour sauvegarder l'état dans sessionStorage
  const STORAGE_KEY = 'client_demandes_state';

  // Restaurer l'état (demande étendue + scroll) au retour depuis /messages
  useEffect(() => {
    if (loading) return; // Attendre que les demandes soient chargées
    
    const savedState = sessionStorage.getItem(STORAGE_KEY);
    if (savedState) {
      try {
        const { demandeId, scrollY, timestamp } = JSON.parse(savedState);
        
        // Valider que l'état est récent (< 5 minutes)
        if (Date.now() - timestamp < 5 * 60 * 1000) {
          console.log('✅ Restauration état:', { demandeId, scrollY });
          
          // Restaurer l'expansion de la demande
          setExpandedDemandeIds(new Set([demandeId]));
          
          // Scroller vers la position sauvegardée après un court délai
          setTimeout(() => {
            window.scrollTo({ top: scrollY, behavior: 'smooth' });
          }, 100);
        } else {
          console.log('⏰ État expiré, ignoré');
        }
        
        // Nettoyer le sessionStorage
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        console.error('❌ Erreur restauration état:', error);
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [loading]);

  useEffect(() => {
    // Attendre que l'auth soit chargée
    if (authLoading) {
      console.log('⏳ Auth en cours de chargement...');
      return;
    }

    if (!user) {
      console.log('❌ Utilisateur non connecté, redirection vers /connexion');
      router.push('/connexion');
      return;
    }

    console.log('✅ Utilisateur connecté:', user.uid);
    
    // Afficher le message de succès si présent dans l'URL
    const success = searchParams.get('success');
    const demandeId = searchParams.get('demandeId');
    if (success === 'demande_publiee' && demandeId) {
      setSuccessMessage(t('clientDemandes.success.published'));
      setFiltreSection('publiees'); // Basculer automatiquement sur l'onglet "Demandes publiées"
      
      // Masquer le message après 8 secondes
      setTimeout(() => {
        setSuccessMessage(null);
        // Nettoyer l'URL
        router.replace('/client/demandes');
      }, 8000);
    }
    
    loadDemandes();
  }, [user, authLoading, router, searchParams]);

  // Réinitialiser le sous-filtre quand on quitte la section "Traitées"
  useEffect(() => {
    if (filtreSection !== 'traitees') {
      setSousFiltreTraitees('tout');
    }
  }, [filtreSection]);

  async function loadDemandes() {
    if (!user) return;

    try {
      const userDemandes = await getDemandesByClient(user.uid);
      setDemandes(userDemandes);

      // Charger les métadonnées des photos (nom original)
      const metadata = new Map<string, string>();
      for (const demande of userDemandes) {
        const photos = demande.photosUrls || demande.photos || [];
        for (const url of photos) {
          if (url && url.startsWith('http')) {
            try {
              const meta = await getFileMetadata(url);
              if (meta?.originalName) {
                metadata.set(url, meta.originalName);
              }
            } catch (error) {
              console.error('Erreur récupération métadonnées photo:', error);
            }
          }
        }
      }
      setPhotoMetadata(metadata);

      // Récupérer tous les artisans matchés
      const allArtisanIds = new Set<string>();
      userDemandes.forEach(demande => {
        demande.artisansMatches?.forEach(id => allArtisanIds.add(id));
      });

      if (allArtisanIds.size > 0) {
        console.log('🔍 IDs artisans à récupérer:', Array.from(allArtisanIds));
        const artisans = await getArtisansByIds(Array.from(allArtisanIds));
        console.log('👷 Artisans récupérés:', artisans.map(a => ({ userId: a.userId, raisonSociale: a.raisonSociale })));
        const map = new Map(artisans.map(a => [a.userId, a]));
        setArtisansMap(map);
      }

      // Charger les devis pour chaque demande et détecter les devis payés
      const devisMapTemp = new Map<string, Devis[]>();
      const demandesAvecDevisPayeSet = new Set<string>();
      
      for (const demande of userDemandes) {
        try {
          const devisForDemande = await getDevisByDemande(demande.id);
          devisMapTemp.set(demande.id, devisForDemande);
          
          // Vérifier si un devis est payé
          const statutsPaye = ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'];
          const hasDevisPaye = devisForDemande.some(devis => statutsPaye.includes(devis.statut));
          
          if (hasDevisPaye) {
            demandesAvecDevisPayeSet.add(demande.id);
          }
        } catch (error) {
          console.error(`Erreur chargement devis pour demande ${demande.id}:`, error);
        }
      }
      setDevisMap(devisMapTemp);
      setDemandesAvecDevisPayeIds(demandesAvecDevisPayeSet);

      // ⏰ Marquer automatiquement en 'expiree' dans Firestore les demandes expirées
      // (à défaut de Cloud Function — le frontend fait le travail au chargement)
      const STATUTS_NON_EXPIRABLES = ['annulee', 'terminee', 'attribuee', 'expiree'];
      const demandesAMarquerExpirees = userDemandes.filter(d =>
        d.dateExpiration &&
        isDemandeExpired(d.dateExpiration) &&
        !STATUTS_NON_EXPIRABLES.includes(d.statut) &&
        !demandesAvecDevisPayeSet.has(d.id) // ne pas expirer si contrat actif
      );
      if (demandesAMarquerExpirees.length > 0) {
        console.log(`⏰ ${demandesAMarquerExpirees.length} demande(s) à marquer comme expirée(s) dans Firestore`);
        await Promise.allSettled(
          demandesAMarquerExpirees.map(d => updateDemandeStatut(d.id, 'expiree'))
        );
        // Mettre à jour le state local pour refléter immédiatement le changement
        setDemandes(prev => prev.map(d =>
          demandesAMarquerExpirees.some(exp => exp.id === d.id)
            ? { ...d, statut: 'expiree' }
            : d
        ));
      }

      // Charger les artisans des devis non encore présents dans la map (ex: demandes publiques avec plusieurs artisans)
      const devisArtisanIds = new Set<string>();
      devisMapTemp.forEach(devisList => {
        devisList.forEach(d => { if (d.artisanId) devisArtisanIds.add(d.artisanId); });
      });
      const missingArtisanIds = Array.from(devisArtisanIds).filter(id => !allArtisanIds.has(id));
      if (missingArtisanIds.length > 0) {
        const artisansSup = await getArtisansByIds(missingArtisanIds);
        setArtisansMap(prev => {
          const updated = new Map(prev);
          artisansSup.forEach(a => updated.set(a.userId, a));
          return updated;
        });
      }
    } catch (error) {
      console.error('Erreur chargement demandes:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDemanderRevision(demandeId: string, artisanId: string, artisanNom: string) {
    const message = prompt(
      t('clientDemandes.dialogs.revisionPrompt')
    );

    if (!message) return;

    try {
      const clientNom = user?.displayName || user?.email || (language === 'fr' ? 'Un client' : 'A client');
      
      await createNotification(artisanId, {
        type: 'nouvelle_demande',
        titre: language === 'fr' ? '🔄 Demande de révision de devis' : '🔄 Quote revision request',
        message: `${clientNom} ${language === 'fr' ? 'souhaite une révision du devis. Motif : ' : 'requests a quote revision. Reason: '}${message}`,
        lien: `/artisan/devis/nouveau?demandeId=${demandeId}`,
      });

      alert(t('clientDemandes.dialogs.revisionSuccess').replace('{artisan}', artisanNom));
    } catch (error) {
      console.error('Erreur envoi demande révision:', error);
      alert(t('clientDemandes.dialogs.revisionError'));
    }
  }

  async function handleDeleteDemande(demandeId: string, titre: string) {
    if (!confirm(t('clientDemandes.dialogs.deleteConfirm').replace('{title}', titre))) {
      return;
    }

    try {
      await deleteDemande(demandeId);
      // Recharger la liste après suppression
      setDemandes(demandes.filter(d => d.id !== demandeId));
      alert(t('clientDemandes.dialogs.deleteSuccess'));
    } catch (error) {
      console.error('Erreur suppression demande:', error);
      alert(t('clientDemandes.dialogs.deleteError'));
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

  function getStatutBadge(demande: Demande) {
    // Logique intelligente selon le type de demande et son avancement
    const hasArtisan = demande.artisansMatches && demande.artisansMatches.length > 0;
    const demandeType = demande.type || 'directe';
    const statut = demande.statut;
    const devisForDemande = devisMap.get(demande.id) || [];
    const isExpired = demande.dateExpiration ? isDemandeExpired(demande.dateExpiration) : false;

    // 🔥 PRIORITÉ 1 : CONTRAT EN COURS (devis payé/signé)
    // → Badge avec BORDURE selon statut du devis — prioritaire sur tout, même l'expiration
    if (demandesAvecDevisPayeIds.has(demande.id)) {
      const devisPaye = devisForDemande.find(d => 
        ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'].includes(d.statut)
      );
      
      if (devisPaye) {
        // Badges spécifiques selon l'état du contrat
        if (devisPaye.statut === 'paye') {
          return (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border-2 border-green-400">
              ✅ Devis signé
            </span>
          );
        }
        if (devisPaye.statut === 'en_cours') {
          return (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 border-2 border-purple-300">
              🚧 Travaux en cours
            </span>
          );
        }
        if (['travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(devisPaye.statut)) {
          return (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-200 text-green-900 border-2 border-green-500">
              ✅ Travaux terminés
            </span>
          );
        }
        if (devisPaye.statut === 'litige') {
          return (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border-2 border-red-400">
              ⚠️ Litige
            </span>
          );
        }
        
        // Fallback : badge générique "Contrat"
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border-2 border-green-400">
            ✅ Contrat en cours
          </span>
        );
      }
    }
    
    // ⏰ PRIORITÉ 1.5 : DEMANDE EXPIRÉE
    // → Prioritaire sur tout sauf un contrat actif (priorité 1)
    // → Une demande expirée ne doit JAMAIS afficher "Envoyé à artisan" ou "Publiée"
    if (isExpired) {
      return (
        <span
          className="px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700"
          title={t('clientDemandes.badges.expiredTooltip')}
        >
          ⏰ {t('clientDemandes.badges.expired')}
        </span>
      );
    }

    // 🎯 PRIORITÉ 2 : DEVIS EN ATTENTE DE PAIEMENT
    // → Badge "En attente de paiement"
    const devisAccepte = devisForDemande.find(d => d.statut === 'en_attente_paiement');
    if (devisAccepte) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 border-2 border-yellow-400">
          💳 En attente de paiement
        </span>
      );
    }
    
    // 📬 PRIORITÉ 3 : DEVIS REÇU (au moins 1 devis envoyé)
    // → Badge "X devis à examiner"
    const devisEnvoyes = devisForDemande.filter(d => d.statut === 'envoye');
    if (devisEnvoyes.length > 0) {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 cursor-pointer">
          📬 {devisEnvoyes.length} devis à examiner
        </span>
      );
    }
    
    // ✅ PRIORITÉ 4 : DEMANDE DIRECTE (envoyée à un artisan spécifique)
    // → Badge "Envoyé à artisan" sauf si tous les devis sont refusés ou expirés
    if (demandeType === 'directe') {
      if (hasArtisan) {
        const STATUTS_TERMINAUX = ['refuse', 'expire'];
        // Si tous les devis sont en état terminal (refusé ou expiré)
        const tousTerminaux = devisForDemande.length > 0 && devisForDemande.every(d => STATUTS_TERMINAUX.includes(d.statut));
        const tousExpires = tousTerminaux && devisForDemande.every(d => d.statut === 'expire');
        const tousRefuses = tousTerminaux && !tousExpires;
        if (tousExpires) {
          return (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-300">
              ⏰ Devis expiré
            </span>
          );
        }
        if (tousRefuses || tousTerminaux) {
          return (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border-2 border-red-400">
              ❌ Devis refusé
            </span>
          );
        }
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border-2 border-orange-300">
            🎯 Envoyé à artisan
          </span>
        );
      }
      // Demande directe : artisan a refusé ou orpheline
      if (demande.artisanRefuseId) {
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border-2 border-red-400">
            ❌ Demande refusée
          </span>
        );
      }
      return (
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700">
          ⚠️ Demande directe (artisan non assigné)
        </span>
      );
    }
    
    // ✅ PRIORITÉ 5 : DEMANDE PUBLIQUE (publiée, matchée, quota atteint)
    if (demandeType === 'publique') {
      if (statut === 'publiee') {
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
            📢 {t('clientDemandes.badges.published')}
          </span>
        );
      }
      if (statut === 'matchee') {
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
            🔍 Artisan trouvé
          </span>
        );
      }
      if (statut === 'quota_atteint') {
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
            🔒 5 devis reçus
          </span>
        );
      }
    }
    
    // Badges statuts standards (fallback)
    const badges = {
      publiee: 'bg-purple-100 text-purple-700',
      matchee: 'bg-green-100 text-green-800',
      attribuee: 'bg-green-100 text-green-800',
      en_cours: 'bg-yellow-100 text-yellow-800',
      terminee: 'bg-green-200 text-green-900',
      annulee: 'bg-red-100 text-red-800',
      expiree: 'bg-red-50 text-red-700',
      quota_atteint: 'bg-orange-100 text-orange-800',
    };

    const labelKeys = {
      publiee: 'published',
      matchee: 'artisanFound',
      attribuee: 'assigned',
      en_cours: 'inProgress',
      terminee: 'completed',
      annulee: 'cancelled',
      expiree: 'expired',
      quota_atteint: 'quotaReached',
    };
    
    return (
      <span 
        className={`px-3 py-1 rounded-full text-xs font-semibold ${badges[statut as keyof typeof badges] || 'bg-gray-200 text-gray-800'}`}
        title={statut === 'expiree' ? t('clientDemandes.badges.expiredTooltip') : undefined}
      >
        {t(`clientDemandes.badges.${labelKeys[statut as keyof typeof labelKeys]}` as any) || statut}
      </span>
    );
  }

  function getTypeBadge(type?: 'directe' | 'publique') {
    const demandeType = type || 'directe'; // Par défaut 'directe' pour compatibilité
    
    if (demandeType === 'publique') {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 flex items-center gap-1">
          📢 Demande publique
        </span>
      );
    } else {
      return (
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 flex items-center gap-1">
          🎯 Demande directe
        </span>
      );
    }
  }

  // Fonctions pour organiser les demandes par sections (NOUVEAU WORKFLOW)
  
  /**
   * 🎯 ENVOYÉS À L'ARTISAN
   * - Définition : Demandes DIRECTES envoyées à un artisan spécifique
   * - Caractéristiques :
   *   • Type: 'directe' (client a choisi UN artisan)
   *   • Artisan assigné (artisansMatches contient 1+ artisan)
   *   • Statut: 'publiee'
   *   • AUCUN devis reçu encore
   * - Workflow : Client choisit artisan → Envoie demande → Attend réponse
   * - FALLBACK : Inclut aussi les demandes directes SANS artisan assigné (orphelines)
   */
  function getDemandesEnvoyees(demandes: Demande[]) {
    return demandes.filter(d => {
      const demandeType = d.type || 'directe';
      if (demandeType !== 'directe') return false;

      const devis = devisMap.get(d.id) || [];
      const hasDevisPaye = demandesAvecDevisPayeIds.has(d.id);
      const isExpired = d.dateExpiration ? isDemandeExpired(d.dateExpiration) : false;

      // Même logique que getStatutBadge() priorité 4 :
      // Une demande directe apparaît dans Envoyés si et seulement si le badge affiche 🎯 Envoyé à artisan
      // → Pas de contrat actif
      // → Pas expirée
      // → Aucun devis ENVOYÉ ou EN ATTENTE DE PAIEMENT (sinon elle est dans EN TRAITEMENT)
      // → Non annulée / terminée
      // → Statut compatible : publiee, attribuee ou matchee
      const hasDevisVisible = devis.some(dv => dv.statut === 'envoye' || dv.statut === 'en_attente_paiement');
      // Exclure si tous les devis sont en état terminal (refusé OU expiré) → bascule dans "Traitées"
      const tousDevisTerminaux = devis.length > 0 && devis.every(dv => dv.statut === 'refuse' || dv.statut === 'expire');

      return !hasDevisPaye &&
             !isExpired &&
             !hasDevisVisible &&
             !tousDevisTerminaux &&
             !d.artisanRefuseId &&
             d.statut !== 'annulee' &&
             d.statut !== 'terminee' &&
             (d.statut === 'publiee' || d.statut === 'attribuee' || d.statut === 'matchee');
    });
  }

  /**
   * 📢 PUBLIÉES
   * - Définition : Demandes PUBLIQUES visibles par tous les artisans
   * - Caractéristiques :
   *   • Type: 'publique'
   *   • Visibles par TOUS les artisans qualifiés
   *   • Statut: 'publiee' OU 'matchee' (le système a trouvé un artisan compatible)
   *   • 'quota_atteint' = 5 devis reçus, plus de devis possibles
   * - Workflow : Client publie → matchee quand artisan trouvé → Attend devis
   */
  function getDemandesPubliees(demandes: Demande[]) {
    return demandes.filter(d => {
      const hasDevisPaye = demandesAvecDevisPayeIds.has(d.id);
      const demandeType = d.type || 'directe';
      const devis = devisMap.get(d.id) || [];

      // Dès qu'un devis est envoyé ou en attente de paiement → passe dans EN TRAITEMENT
      const hasDevisVisible = devis.some(dv => dv.statut === 'envoye' || dv.statut === 'en_attente_paiement');

      // Exclure si tous les devis sont expirés → bascule dans "Traitées"
      const tousDevisExpires = devis.length > 0 && devis.every(dv => dv.statut === 'expire');
      // Publiée = type publique + AUCUN devis visible + pas de devis payé + aucun devis expiré
      // Statuts inclus : publiee, matchee (artisan trouvé), quota_atteint (5 devis max atteint mais aucun envoyé)
      return demandeType === 'publique' && !hasDevisVisible && !hasDevisPaye && !tousDevisExpires &&
             (d.statut === 'publiee' || d.statut === 'matchee' || d.statut === 'quota_atteint');
    });
  }

  /**
   * ⏳ EN COURS DE TRAITEMENT
   * - Définition : Demandes avec au moins 1 devis reçu (pas encore finalisées)
   * - Caractéristiques :
   *   • Au moins 1 devis reçu
   *   • Devis avec statut 'envoye' ou 'en_attente_paiement'
   *   • PAS ENCORE payé, refusé, travaux commencés/terminés
   * - Workflow : Artisan envoie devis → Client compare → Client accepte → Devient "Traitées"
   */
  function getDemandesEnTraitement(demandes: Demande[]) {
    return demandes.filter(d => {
      const devis = devisMap.get(d.id) || [];
      const hasDevisPaye = demandesAvecDevisPayeIds.has(d.id);
      
      // En traitement = au moins 1 devis ENVOYÉ au client (statut 'envoye' ou 'en_attente_paiement')
      // ⚠️ Les devis en brouillon (côté artisan uniquement) ne font PAS basculer la demande ici
      // → La demande reste dans "Envoyés" tant que l'artisan n'a pas soumis son devis
      const hasDevisVisible = devis.some(dv => dv.statut === 'envoye' || dv.statut === 'en_attente_paiement');
      
      return hasDevisVisible && !hasDevisPaye &&
             d.statut !== 'annulee' && d.statut !== 'terminee';
    });
  }

  /**
   * Fonction helper : Récupérer TOUTES les demandes traitées (sans sous-filtre)
   * Utilisé pour le compteur du bouton "✅ Traitées"
   */
  function getToutesDemandesTraitees(demandes: Demande[]) {
    return demandes.filter(d => {
      const hasDevisPaye = demandesAvecDevisPayeIds.has(d.id);
      const isRefusee = d.statut === 'annulee';
      const isTerminee = d.statut === 'terminee';
      const isExpiree = d.dateExpiration ? isDemandeExpired(d.dateExpiration) : false;
      const devis = devisMap.get(d.id) || [];
      // Terminaux = refusé OU expiré (devis expiré = état final, va dans Traitées → Expirées)
      const tousDevisTerminaux = devis.length > 0 && devis.every(dv => dv.statut === 'refuse' || dv.statut === 'expire');
      const artisanARefuse = !!d.artisanRefuseId;
      
      // Traitée = devis payé OU refusée OU terminée OU expirée OU tous les devis terminaux OU artisan a refusé la demande
      return hasDevisPaye || isRefusee || isTerminee || isExpiree || tousDevisTerminaux || artisanARefuse;
    });
  }

  /**
   * ✅ TRAITÉES (Finalisées) - avec sous-filtrage
   * - Définition : Demandes finalisées (payées, refusées, travaux en cours/terminés)
   * - Caractéristiques :
   *   • Devis payé/signé (statuts: paye, en_cours, travaux_termines, etc.)
   *   • OU Demande refusée (statut 'annulee')
   *   • OU Travaux terminés (statut 'terminee')
   *   • OU Litige
   * - Workflow : Phase finale du projet
   */
  function getDemandesTraitees(demandes: Demande[]) {
    const demandesTraitees = getToutesDemandesTraitees(demandes);

    // Appliquer le sous-filtre si on est dans la section "traitees"
    if (filtreSection === 'traitees' && sousFiltreTraitees !== 'tout') {
      return demandesTraitees.filter(d => {
        const devisForDemande = devisMap.get(d.id) || [];
        const devisPaye = devisForDemande.find(dv =>
          ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'].includes(dv.statut)
        );

        // ⚠️ RÈGLE CRITIQUE : Un devis payé a TOUJOURS la priorité sur le statut de la demande
        switch (sousFiltreTraitees) {
          case 'devis_signes':
            return devisPaye?.statut === 'paye';
          case 'travaux_en_cours':
            return devisPaye?.statut === 'en_cours';
          case 'termines':
            return devisPaye && ['travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(devisPaye.statut);
          case 'litiges':
            return devisPaye?.statut === 'litige';
          case 'refusees': {
            // Demandes annulées OU toutes les variantes refusées (mais PAS seulement expirées) OU artisan a refusé
            // Si tous les devis sont expirés → appartient à 'expirees', pas 'refusees'
            const tousRefuses = devisForDemande.length > 0 && devisForDemande.every(dv => dv.statut === 'refuse');
            const tousExpires = devisForDemande.length > 0 && devisForDemande.every(dv => dv.statut === 'expire');
            return (d.statut === 'annulee' || tousRefuses || !!d.artisanRefuseId) && !devisPaye && !tousExpires;
          }
          case 'expirees':
            // Expirées = dateExpiration dépassée OU tous les devis du dossier sont expirés, sans devis payé
            {
              const tousDevisExpires = devisForDemande.length > 0 && devisForDemande.every(dv => dv.statut === 'expire');
              return ((d.dateExpiration && isDemandeExpired(d.dateExpiration)) || tousDevisExpires) && !devisPaye;
            }
          default:
            return true;
        }
      });
    }

    return demandesTraitees;
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-[#FF6B00] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* Header */}
      <div className="bg-[#2C3E50] text-white py-8">
        <div className="container mx-auto px-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-white hover:text-[#FF6B00] mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('clientDemandes.backButton')}
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">{t('clientDemandes.pageTitle')}</h1>
              <p className="text-gray-300 mt-2">Suivez vos projets en temps réel</p>
            </div>
            
            <div className="flex items-center gap-3">
              <Button
                onClick={() => router.push('/recherche')}
                className="bg-[#FF6B00] hover:bg-[#E56100] text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t('common.search')} {t('common.artisan')}
              </Button>
              <button
                onClick={() => setShowExpirationHelp(true)}
                className="flex items-center gap-2 px-4 py-2 border-2 border-white text-white rounded-lg hover:bg-white hover:text-[#2C3E50] transition-colors"
                title={t('clientDemandes.expirationHelp.subtitle')}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <span>Aide : Expiration</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Message de succès */}
      {successMessage && (
        <div className="container mx-auto px-4 pt-6 max-w-6xl">
          <div className="bg-gradient-to-r from-green-50 to-green-100 border-l-4 border-green-500 p-5 rounded-lg shadow-lg flex items-start gap-4 animate-fade-in">
            <div className="flex-shrink-0 bg-green-500 rounded-full p-2">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-green-800 font-semibold text-base leading-relaxed">
                {successMessage}
              </p>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="flex-shrink-0 text-green-600 hover:text-green-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Contenu */}
      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Onglets de filtrage - Design moderne (NOUVEAU : 4 sections) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <button
            onClick={() => setFiltreSection('toutes')}
            className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-1 ${
              filtreSection === 'toutes' 
                ? 'bg-gradient-to-br from-[#FF6B00] to-[#E56100] text-white shadow-xl scale-105' 
                : 'bg-white hover:bg-gray-50 shadow-md hover:shadow-lg border border-gray-100'
            }`}
          >
            <div className={`text-3xl font-black mb-1 ${
              filtreSection === 'toutes' ? 'text-white' : 'text-[#FF6B00]'
            }`}>{demandes.length}</div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${
              filtreSection === 'toutes' ? 'text-white' : 'text-gray-600'
            }`}>{t('clientDemandes.sections.all')}</div>
          </button>
          
          <button
            onClick={() => setFiltreSection('envoyes')}
            className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-1 ${
              filtreSection === 'envoyes' 
                ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-xl scale-105' 
                : 'bg-white hover:bg-gray-50 shadow-md hover:shadow-lg border border-gray-100'
            }`}
          >
            <div className={`text-3xl font-black mb-1 ${
              filtreSection === 'envoyes' ? 'text-white' : 'text-orange-600'
            }`}>{getDemandesEnvoyees(demandes).length}</div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${
              filtreSection === 'envoyes' ? 'text-white' : 'text-gray-600'
            }`}>{t('clientDemandes.sections.sent')}</div>
          </button>
          
          <button
            onClick={() => setFiltreSection('publiees')}
            className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-1 ${
              filtreSection === 'publiees' 
                ? 'bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-xl scale-105' 
                : 'bg-white hover:bg-gray-50 shadow-md hover:shadow-lg border border-gray-100'
            }`}
          >
            <div className={`text-3xl font-black mb-1 ${
              filtreSection === 'publiees' ? 'text-white' : 'text-purple-600'
            }`}>{getDemandesPubliees(demandes).length}</div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${
              filtreSection === 'publiees' ? 'text-white' : 'text-gray-600'
            }`}>{t('clientDemandes.sections.published')}</div>
          </button>
          
          <button
            onClick={() => setFiltreSection('en_traitement')}
            className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-1 ${
              filtreSection === 'en_traitement' 
                ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-xl scale-105' 
                : 'bg-white hover:bg-gray-50 shadow-md hover:shadow-lg border border-gray-100'
            }`}
          >
            <div className={`text-3xl font-black mb-1 ${
              filtreSection === 'en_traitement' ? 'text-white' : 'text-blue-600'
            }`}>{getDemandesEnTraitement(demandes).length}</div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${
              filtreSection === 'en_traitement' ? 'text-white' : 'text-gray-600'
            }`}>{t('clientDemandes.sections.inProgress')}</div>
          </button>
          
          <button
            onClick={() => setFiltreSection('traitees')}
            className={`group rounded-xl p-5 text-center transition-all duration-300 transform hover:-translate-y-1 ${
              filtreSection === 'traitees' 
                ? 'bg-gradient-to-br from-green-500 to-green-600 text-white shadow-xl scale-105' 
                : 'bg-white hover:bg-gray-50 shadow-md hover:shadow-lg border border-gray-100'
            }`}
          >
            <div className={`text-3xl font-black mb-1 ${
              filtreSection === 'traitees' ? 'text-white' : 'text-green-600'
            }`}>{getToutesDemandesTraitees(demandes).length}</div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${
              filtreSection === 'traitees' ? 'text-white' : 'text-gray-600'
            }`}>{t('clientDemandes.sections.processed')}</div>
          </button>
        </div>

        {demandes.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-16 text-center border border-gray-100">
            <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-[#2C3E50] mb-3">
              {t('clientDemandes.empty.noRequests')}
            </h2>
            <p className="text-gray-500 mb-8 text-lg max-w-md mx-auto">
              {t('clientDemandes.empty.noRequestsDescription')}
            </p>
            <Button
              onClick={() => router.push('/recherche')}
              className="bg-gradient-to-r from-[#FF6B00] to-[#E56100] hover:from-[#E56100] hover:to-[#D55000] text-white px-8 py-4 rounded-xl font-semibold shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-0.5"
            >
              {t('clientDemandes.empty.searchArtisan')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {(() => {
              // Filtrer les demandes selon l'onglet sélectionné (NOUVEAU : 4 sections)
              let demandesFiltrees = demandes;
              
              if (filtreSection === 'envoyes') {
                demandesFiltrees = getDemandesEnvoyees(demandes);
              } else if (filtreSection === 'publiees') {
                demandesFiltrees = getDemandesPubliees(demandes);
              } else if (filtreSection === 'en_traitement') {
                demandesFiltrees = getDemandesEnTraitement(demandes);
              } else if (filtreSection === 'traitees') {
                demandesFiltrees = getDemandesTraitees(demandes);
              }

              // Fonction pour déterminer la couleur de la bordure gauche
              const getBorderColor = (demande: Demande): string => {
                const devisForDemande = devisMap.get(demande.id) || [];
                const devisPaye = devisForDemande.find(d => 
                  ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(d.statut)
                );
                
                // Section "🎯 Envoyés" → Orange
                if (filtreSection === 'envoyes') {
                  return 'bg-gradient-to-b from-[#FF6B00] to-[#E56100]';
                }
                
                // Section "📢 Publiées" → Violet
                if (filtreSection === 'publiees') {
                  return 'bg-gradient-to-b from-purple-400 to-purple-600';
                }
                
                // Section "⏳ En traitement" → Bleu
                if (filtreSection === 'en_traitement') {
                  return 'bg-gradient-to-b from-blue-400 to-blue-600';
                }
                
                // Section "✅ Traitées" → Couleur selon badge spécifique
                if (filtreSection === 'traitees') {
                  // PRIORITÉ 1 : Vérifier d'abord le statut du devis payé (contrat)
                  if (devisPaye) {
                    // Badge "✅ Travaux terminés" → Noir
                    if (['travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(devisPaye.statut)) {
                      return 'bg-gradient-to-b from-gray-700 to-gray-900';
                    }
                    
                    // Badge "🚧 Travaux en cours" → Jaune
                    if (devisPaye.statut === 'en_cours') {
                      return 'bg-gradient-to-b from-yellow-400 to-yellow-600';
                    }
                    
                    // Badge "✅ Devis signé" (payé) → Vert
                    if (devisPaye.statut === 'paye') {
                      return 'bg-gradient-to-b from-green-400 to-green-600';
                    }
                  }
                  
                  // PRIORITÉ 2 : Statuts de demande (sans devis payé)
                  // Badge "❌ Refusée" → Rouge uni
                  if (demande.statut === 'annulee') {
                    return 'bg-gradient-to-b from-red-400 to-red-600';
                  }
                  
                  // Badge "⏰ Expirée" → Rouge rayé diagonal (vérification dateExpiration réelle)
                  if (demande.dateExpiration && isDemandeExpired(demande.dateExpiration)) {
                    return 'bg-[repeating-linear-gradient(45deg,#f87171,#f87171_10px,#dc2626_10px,#dc2626_20px)]';
                  }
                  
                  // Badge "✅ Terminée" (sans contrat) → Vert standard
                  if (demande.statut === 'terminee') {
                    return 'bg-gradient-to-b from-green-400 to-green-600';
                  }
                }
                
                // Fallback (section "Toutes") - ancienne logique
                if (demande.statut === 'terminee') return 'bg-gradient-to-b from-green-400 to-green-600';
                if (demande.statut === 'annulee') return 'bg-gradient-to-b from-red-400 to-red-600';
                if (demande.dateExpiration && isDemandeExpired(demande.dateExpiration)) return 'bg-[repeating-linear-gradient(45deg,#f87171,#f87171_10px,#dc2626_10px,#dc2626_20px)]';
                if (demande.statut === 'publiee') return 'bg-gradient-to-b from-purple-400 to-purple-600';
                return 'bg-gradient-to-b from-blue-400 to-blue-600';
              };

              const renderDemande = (demande: Demande) => {
                const isExpanded = expandedDemandeIds.has(demande.id);
                
                return (
                  <div
                    key={demande.id}
                    onClick={() => toggleExpandDemande(demande.id)}
                    className={`bg-white rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 cursor-pointer relative border-2 overflow-hidden group ${
                      isExpanded ? 'border-[#FF6B00] ring-1 ring-[#FF6B00] ring-opacity-30' : 'border-transparent hover:border-gray-200'
                    }`}
                  >
                    {/* Barre latérale colorée selon section et statut */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${getBorderColor(demande)}`} />
                    
                    <div className="p-6 pl-8">
                  {/* Bouton expandre/rétracter en haut à droite */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpandDemande(demande.id);
                    }}
                    className="absolute top-5 right-5 p-2.5 rounded-xl hover:bg-gray-100 transition-all duration-200 group"
                    title={isExpanded ? t('clientDemandes.card.collapse') : t('clientDemandes.card.expand')}
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

                  <div className="flex items-start justify-between mb-5 pb-5 border-b border-gray-100 pr-14">
                    <div className="flex-1">
                      {/* Nom de l'entreprise (artisan) avec badge style identique demandeur */}
                    {(() => {
                      if (demande.statut === 'annulee' && demande.artisanRefuseNom) {
                        const initiales = demande.artisanRefuseNom
                          .split(' ')
                          .slice(0, 2)
                          .map(word => word[0]?.toUpperCase() || '')
                          .join('');
                        return (
                          <div className="mb-5 bg-gradient-to-r from-gray-50 to-gray-100 p-4 rounded-xl border border-gray-200">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Artisan</span>
                              <div className="w-10 h-10 bg-gradient-to-br from-[#2C3E50] to-[#1A3A5C] text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md">
                                {initiales || 'A'}
                              </div>
                              <p className="font-bold text-[#2C3E50] text-lg">
                                {demande.artisanRefuseNom}
                              </p>
                            </div>
                          </div>
                        );
                      } else if (demande.artisansMatches && demande.artisansMatches.length > 0) {
                        const artisanId = demande.artisansMatches[0];
                        const artisan = artisansMap.get(artisanId);
                        const raisonSociale = artisan?.raisonSociale || 'Non assigné';
                        const initiales = raisonSociale
                          .split(' ')
                          .slice(0, 2)
                          .map(word => word[0]?.toUpperCase() || '')
                          .join('');
                        return (
                          <div className="mb-5 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-blue-600 uppercase tracking-wide">{t('clientDemandes.artisan.label')}</span>
                              <div className="w-10 h-10 bg-gradient-to-br from-[#2C3E50] to-[#1A3A5C] text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md">
                                {initiales || 'A'}
                              </div>
                              <p className="font-bold text-[#2C3E50] text-lg">
                                {raisonSociale}
                              </p>
                            </div>
                          </div>
                        );
                      } else {
                        return (
                          <div className="mb-5 bg-gradient-to-r from-gray-50 to-gray-100 p-4 rounded-xl border border-gray-200">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{t('clientDemandes.artisan.label')}</span>
                              <div className="w-10 h-10 bg-gradient-to-br from-gray-400 to-gray-500 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md">
                                ?
                              </div>
                              <p className="font-semibold text-gray-500 text-lg">
                                {t('clientDemandes.artisan.notAssigned')}
                              </p>
                            </div>
                          </div>
                        );
                      }
                    })()}
                    
                    {/* Titre principal + Dates + Badge statut */}
                    <h2 className="text-2xl font-extrabold text-[#2C3E50] mb-3 tracking-tight">
                      {demande.titre}
                    </h2>
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg">
                        <span className="text-blue-600">🏷️</span>
                        <span className="font-semibold text-blue-900">{demande.categorie}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="font-medium">{t('clientDemandes.card.createdOn')} {demande.dateCreation?.toDate().toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US')}</span>
                      </div>
                      {demande.datesSouhaitees?.dates && demande.datesSouhaitees.dates.length > 0 && (
                        <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-lg">
                          <span className="text-amber-600">📅</span>
                          <span className="font-semibold text-amber-900">{t('clientDemandes.card.startDate')} {new Date(demande.datesSouhaitees.dates[0].toMillis()).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}</span>
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
                              <span className="font-semibold">{t('clientDemandes.card.delay')}</span>
                              <span>{devisPaye.delaiRealisation} {t('clientDemandes.card.days')}</span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                      {(() => {
                        const devisForDemande = devisMap.get(demande.id) || [];
                        const statutsPaye = ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'];
                        const devisPaye = devisForDemande.find(d => statutsPaye.includes(d.statut));
                        if (devisPaye?.delaiRealisation && demande.datesSouhaitees?.dates && demande.datesSouhaitees.dates.length > 0) {
                          // Calculer la date de fin : date de début + délai
                          const dateDebut = new Date(demande.datesSouhaitees.dates[0].toMillis());
                          const dateFin = new Date(dateDebut);
                          dateFin.setDate(dateFin.getDate() + parseInt(devisPaye.delaiRealisation));
                          
                          return (
                            <div className="flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-lg">
                              <span className="text-green-600">📅</span>
                              <span className="font-semibold text-green-900">Fin: {dateFin.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}</span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                  
                  {/* Badge statut principal */}
                  <div className="flex flex-col items-end gap-2">
                    {getStatutBadge(demande)}
                  </div>
                </div>

                {/* Description (toujours visible, tronquée si collapsed) */}
                <div className="mb-4">
                  <p className="text-sm font-bold text-gray-700 mb-2">{t('clientDemandes.card.description')}</p>
                  <p className={`text-gray-700 leading-relaxed break-words ${!isExpanded ? 'line-clamp-2' : 'whitespace-pre-wrap'}`}>
                    {demande.description}
                  </p>
                </div>
                  
                {/* Boutons d'action pour brouillon et annulée */}
                {!isExpanded && (
                  <div className="flex gap-3 ml-4">
                    {/* Bouton Compléter pour brouillon uniquement */}
                    {demande.statut === 'genere' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/demande/nouvelle?brouillonId=${demande.id}`);
                        }}
                        className="px-3 py-2 bg-[#FF6B00] text-white hover:bg-[#E56100] rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 shadow-sm hover:shadow-md"
                        title={t('clientDemandes.card.completeDraftTitle')}
                      >
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          className="h-4 w-4" 
                          fill="none" 
                          viewBox="0 0 24 24" 
                          stroke="currentColor"
                        >
                          <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" 
                          />
                        </svg>
                        {t('clientDemandes.card.completeDraft')}
                      </button>
                    )}
                    
                    {/* Bouton Relancer pour demande annulée */}
                    {demande.statut === 'annulee' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const searchCriteria = {
                            categorie: demande.categorie,
                            ville: demande.localisation?.ville || '',
                            codePostal: demande.localisation?.codePostal || '',
                            dates: demande.datesSouhaitees?.dates?.map(d => d.toDate().toISOString().split('T')[0]) || [],
                            flexible: demande.datesSouhaitees?.flexible || false,
                            flexibiliteDays: demande.datesSouhaitees?.flexibiliteDays || 0,
                            urgence: demande.urgence || false,
                          };
                          sessionStorage.setItem('searchCriteria', JSON.stringify(searchCriteria));
                          router.push('/recherche');
                        }}
                        className="px-3 py-2 bg-[#FF6B00] text-white hover:bg-[#E56100] rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 shadow-sm hover:shadow-md"
                        title={t('clientDemandes.card.relaunchSearchTitle')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {t('clientDemandes.card.relaunchSearch')}
                      </button>
                    )}
                    
                    {/* Bouton Supprimer pour brouillon et annulée */}
                    {(demande.statut === 'genere' || demande.statut === 'annulee') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDemande(demande.id, demande.titre);
                        }}
                        className="px-3 py-2 border-2 border-[#DC3545] text-[#DC3545] hover:bg-[#DC3545] hover:text-white rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 shadow-sm hover:shadow-md"
                        title={t('clientDemandes.card.deleteTitle')}
                      >
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          className="h-4 w-4" 
                          fill="none" 
                          viewBox="0 0 24 24" 
                          stroke="currentColor"
                        >
                          <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" 
                          />
                        </svg>
                        {t('clientDemandes.card.delete')}
                      </button>
                    )}
                  </div>
                )}

                {/* Informations détaillées - visibles uniquement si étendu */}
                {isExpanded && (
                  <div className="mt-6 pt-6 border-t border-gray-200 space-y-4">
                    <h4 className="font-bold text-[#2C3E50] text-lg mb-4">{t('clientDemandes.details.title')}</h4>
                    
                    {/* Photos du projet */}
                    {(() => {
                      const photosList = demande.photosUrls || demande.photos || [];
                      const validPhotos = photosList.filter((url: string) => url && url.startsWith('http'));
                      
                      if (validPhotos.length === 0) return null;
                      
                      return (
                        <div className="mb-4">
                          <p className="text-sm font-semibold text-gray-700 mb-2">
                            {t('clientDemandes.details.photos').replace('{count}', String(validPhotos.length))}
                          </p>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {validPhotos.map((photoUrl: string, idx: number) => {
                              const displayName = photoMetadata.get(photoUrl) || `Photo ${idx + 1}`;
                              return (
                                <div
                                  key={idx}
                                  className="relative aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-[#FF6B00] transition-all shadow-sm"
                                  style={{ backgroundColor: '#ffffff' }}
                                >
                                  <a
                                    href={photoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={displayName}
                                    className="block w-full h-full"
                                  >
                                    <img
                                      src={photoUrl}
                                      alt={displayName}
                                      className="w-full h-full object-contain"
                                    />
                                  </a>
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
                    
                    {/* Localisation détaillée */}
                    {demande.localisation && (
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <p className="text-sm font-semibold text-blue-900 mb-2">{t('clientDemandes.details.location')}</p>
                          <div className="space-y-1 text-sm text-blue-800">
                            <p><strong>{t('clientDemandes.details.city')}</strong> {demande.localisation.ville}</p>
                            <p><strong>{t('clientDemandes.details.postalCode')}</strong> {demande.localisation.codePostal}</p>
                            {demande.localisation.adresse && (
                              <p><strong>{t('clientDemandes.details.address')}</strong> {demande.localisation.adresse}</p>
                            )}
                          </div>
                        </div>
                        
                        {/* Dates souhaitées */}
                        {demande.datesSouhaitees && (
                          <div className="bg-green-50 p-4 rounded-lg">
                            <p className="text-sm font-semibold text-green-900 mb-2">{t('clientDemandes.details.dates')}</p>
                            <div className="space-y-1 text-sm text-green-800">
                              {demande.datesSouhaitees.dates && demande.datesSouhaitees.dates.length > 0 ? (
                                <>
                                  {demande.datesSouhaitees.dates.map((date, idx) => (
                                    <p key={idx}>
                                      <strong>{t('clientDemandes.details.date').replace('{number}', String(idx + 1))}</strong> {date.toDate().toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { 
                                        weekday: 'long', 
                                        year: 'numeric', 
                                        month: 'long', 
                                        day: 'numeric' 
                                      })}
                                    </p>
                                  ))}
                                  {demande.datesSouhaitees.flexible && (
                                    <p className="text-xs mt-2 text-green-700">
                                      {t('clientDemandes.details.flexibleDates').replace('{days}', String(demande.datesSouhaitees.flexibiliteDays || 7))}
                                    </p>
                                  )}
                                </>
                              ) : (
                                <p>{t('clientDemandes.details.noDates')}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Urgence */}
                    {demande.urgence && (
                      <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded">
                        <p className="text-red-800 font-semibold flex items-center gap-2">
                          {t('clientDemandes.details.urgent')}
                        </p>
                      </div>
                    )}

                    {/* Liste des devis à examiner */}
                    {(() => {
                      const devisAExaminer = (devisMap.get(demande.id) || []).filter(d => d.statut === 'envoye');
                      if (devisAExaminer.length === 0) return null;
                      return (
                        <div id={`devis-section-${demande.id}`} className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4 scroll-mt-4">
                          <h5 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
                            📬 {devisAExaminer.length} devis à examiner
                          </h5>
                          <div className="space-y-3">
                            {devisAExaminer.map(devis => {
                              const artisan = artisansMap.get(devis.artisanId);
                              const nomArtisan = artisan?.raisonSociale || t('clientDemandes.devis.unknownArtisan');
                              const initiales = nomArtisan.split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() || '').join('');
                              return (
                                <div key={devis.id} className="bg-white rounded-lg p-4 border border-purple-100 flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div className="w-10 h-10 bg-gradient-to-br from-[#2C3E50] to-[#1A3A5C] text-white rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                                      {initiales || 'A'}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-semibold text-[#2C3E50] truncate">{nomArtisan}</p>
                                      <div className="flex items-center gap-3 text-sm flex-wrap">
                                        <span className="font-bold text-[#FF6B00]">{devis.totaux?.totalTTC?.toFixed(2)} € TTC</span>
                                        {devis.delaiRealisation && (
                                          <span className="text-gray-600">⏱️ {devis.delaiRealisation}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/client/devis/${devis.id}`);
                                    }}
                                    className="flex-shrink-0 bg-[#FF6B00] text-white hover:bg-[#E56100] px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap shadow-sm"
                                  >
                                    {t('clientDemandes.devis.examine')}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Message dynamique pour les demandes avec devis payé (contrats) */}
                {demandesAvecDevisPayeIds.has(demande.id) && (() => {
                  const devisForDemande = devisMap.get(demande.id) || [];
                  const statutsPaye = ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'];
                  const devisPaye = devisForDemande.find(d => statutsPaye.includes(d.statut));
                  const st = devisPaye?.statut;

                  // Choisir textes et styles selon le statut du devis
                  const titleKey = st === 'en_cours'
                    ? 'clientDemandes.contract.titleEnCours'
                    : st === 'travaux_termines'
                    ? 'clientDemandes.contract.titleTravauxTermines'
                    : (st === 'termine_valide' || st === 'termine_auto_valide')
                    ? 'clientDemandes.contract.titleTermine'
                    : st === 'litige'
                    ? 'clientDemandes.contract.titleLitige'
                    : 'clientDemandes.contract.title';

                  const descKey = st === 'en_cours'
                    ? 'clientDemandes.contract.descriptionEnCours'
                    : st === 'travaux_termines'
                    ? 'clientDemandes.contract.descriptionTravauxTermines'
                    : (st === 'termine_valide' || st === 'termine_auto_valide')
                    ? 'clientDemandes.contract.descriptionTermine'
                    : st === 'litige'
                    ? 'clientDemandes.contract.descriptionLitige'
                    : 'clientDemandes.contract.description';

                  const boxClass = st === 'en_cours'
                    ? 'bg-purple-50 border-2 border-purple-200'
                    : st === 'litige'
                    ? 'bg-red-50 border-2 border-red-200'
                    : 'bg-green-50 border-2 border-green-200';

                  const iconColorClass = st === 'en_cours'
                    ? 'text-purple-600'
                    : st === 'litige'
                    ? 'text-red-500'
                    : 'text-green-600';

                  const titleColorClass = st === 'en_cours'
                    ? 'text-purple-700'
                    : st === 'litige'
                    ? 'text-red-700'
                    : 'text-green-700';

                  const descColorClass = st === 'en_cours'
                    ? 'text-purple-600'
                    : st === 'litige'
                    ? 'text-red-600'
                    : 'text-green-600';

                  return (
                    <div className="mt-4">
                      <div className={`${boxClass} rounded-lg p-4`}>
                        <div className="flex items-start gap-3">
                          {/* Icône adaptée au statut */}
                          {st === 'en_cours' ? (
                            <svg className={`w-6 h-6 ${iconColorClass} flex-shrink-0 mt-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          ) : st === 'litige' ? (
                            <svg className={`w-6 h-6 ${iconColorClass} flex-shrink-0 mt-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          ) : st === 'travaux_termines' ? (
                            <svg className={`w-6 h-6 ${iconColorClass} flex-shrink-0 mt-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          ) : (
                            <svg className={`w-6 h-6 ${iconColorClass} flex-shrink-0 mt-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                          <div className="flex-1">
                            <p className={`font-bold ${titleColorClass} mb-1`}>{t(titleKey)}</p>
                            <p className={`text-sm ${descColorClass}`}>
                              {t(descKey)}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-3 mt-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (devisPaye?.id) {
                                router.push(`/client/devis/${devisPaye.id}`);
                              } else {
                                router.push(`/client/contrats?demandeId=${demande.id}`);
                              }
                            }}
                            className="flex-1 bg-[#FF6B00] text-white hover:bg-[#E56100] rounded-lg px-4 py-2.5 font-medium transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                          >
                            {t('clientDemandes.contract.viewQuote')}
                          </button>

                          {/* Bouton Contacter artisan : masqué si travaux terminés/validés */}
                          {['travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(st || '') ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const params = new URLSearchParams({
                                  categorie: demande.categorie,
                                  ville: demande.localisation.ville,
                                  codePostal: demande.localisation.codePostal,
                                });
                                router.push(`/recherche?${params.toString()}`);
                              }}
                              className="px-4 py-2.5 border-2 border-[#FF6B00] text-[#FF6B00] hover:bg-[#FF6B00] hover:text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2 text-sm"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              {t('clientDemandes.contract.newProject')}
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const artisanId = demande.artisansMatches?.[0];
                                if (artisanId) {
                                  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
                                    demandeId: demande.id,
                                    scrollY: window.scrollY,
                                    timestamp: Date.now()
                                  }));
                                  // ✅ Toujours inclure demandeId : garantit qu'une nouvelle
                                  // conversation est créée pour chaque demande distincte
                                  router.push(`/messages?userId=${artisanId}&demandeId=${demande.id}`);
                                }
                              }}
                              className="px-4 py-2.5 border-2 border-[#2C3E50] text-[#2C3E50] hover:bg-[#2C3E50] hover:text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2"
                            >
                              {t('clientDemandes.contract.contactArtisan')}
                            </button>
                          )}
                        </div>
                    </div>
                  </div>
                  );
                })()}

                {/* Bouton Chercher un autre artisan en bas au centre si devis refusé */}
                {(() => {
                  const devisForDemande = devisMap.get(demande.id) || [];
                  const devisRefuse = devisForDemande.find(d => d.statut === 'refuse');
                  
                  if (devisRefuse) {
                    return (
                      <div className="flex justify-center pt-4 border-t border-gray-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Construire l'URL avec toutes les informations de la demande
                            const params = new URLSearchParams({
                              categorie: demande.categorie,
                              ville: demande.localisation.ville,
                              codePostal: demande.localisation.codePostal,
                              description: demande.description || '',
                              urgence: String(demande.urgence || 'normale'),
                            });
                            
                            // Ajouter les dates si elles existent
                            if (demande.datesSouhaitees?.dates && demande.datesSouhaitees.dates.length > 0) {
                              const dates = demande.datesSouhaitees.dates.map(d => 
                                d.toDate().toISOString().split('T')[0]
                              );
                              params.append('dates', JSON.stringify(dates));
                              params.append('flexible', String(demande.datesSouhaitees.flexible || false));
                              if (demande.datesSouhaitees.flexibiliteDays) {
                                params.append('flexibiliteDays', String(demande.datesSouhaitees.flexibiliteDays));
                              }
                            }
                            
                            router.push(`/recherche?${params.toString()}`);
                          }}
                          className="text-sm bg-[#FF6B00] text-white px-4 py-2 rounded-lg hover:bg-[#E56100] transition font-medium flex items-center gap-2"
                        >
                          {t('clientDemandes.searchAnotherArtisan')}
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}
                </div>
              </div>
            );
          };

          return (
            <>
              {/* Titre de la section active */}
              {filtreSection !== 'toutes' && demandesFiltrees.length > 0 && (
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-[#2C3E50]">
                    {filtreSection === 'envoyes' && t('clientDemandes.sectionTitles.sent')}
                    {filtreSection === 'publiees' && t('clientDemandes.sectionTitles.published')}
                    {filtreSection === 'en_traitement' && t('clientDemandes.sectionTitles.inProgress')}
                    {filtreSection === 'traitees' && t('clientDemandes.sectionTitles.processed')}
                  </h2>
                  <p className="text-sm text-[#6C757D] mt-1">
                    {filtreSection === 'envoyes' && t('clientDemandes.sectionDescriptions.sent')}
                    {filtreSection === 'publiees' && t('clientDemandes.sectionDescriptions.published')}
                    {filtreSection === 'en_traitement' && t('clientDemandes.sectionDescriptions.inProgress')}
                    {filtreSection === 'traitees' && t('clientDemandes.sectionDescriptions.processed')}
                  </p>

                  {/* Pills de sous-filtrage pour "✅ Traitées" */}
                  {filtreSection === 'traitees' && (() => {
                    // Calculer les compteurs pour chaque type
                    const toutesTraitees = demandes.filter(d => {
                      const hasDevisPaye = demandesAvecDevisPayeIds.has(d.id);
                      const isRefusee = d.statut === 'annulee';
                      const isTerminee = d.statut === 'terminee';
                      const isExpiree = d.dateExpiration ? isDemandeExpired(d.dateExpiration) : false;
                      return hasDevisPaye || isRefusee || isTerminee || isExpiree;
                    });

                    const countDevisSignes = toutesTraitees.filter(d => {
                      const devisForDemande = devisMap.get(d.id) || [];
                      return devisForDemande.some(dv => dv.statut === 'paye');
                    }).length;

                    const countTravauxEnCours = toutesTraitees.filter(d => {
                      const devisForDemande = devisMap.get(d.id) || [];
                      return devisForDemande.some(dv => dv.statut === 'en_cours');
                    }).length;

                    const countTermines = toutesTraitees.filter(d => {
                      const devisForDemande = devisMap.get(d.id) || [];
                      return devisForDemande.some(dv => ['travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(dv.statut));
                    }).length;

                    const countLitiges = toutesTraitees.filter(d => {
                      const devisForDemande = devisMap.get(d.id) || [];
                      return devisForDemande.some(dv => dv.statut === 'litige');
                    }).length;

                    // CORRECTION : Seulement les demandes annulées SANS devis payé
                    const countRefusees = toutesTraitees.filter(d => {
                      if (d.statut !== 'annulee') return false;
                      const devisForDemande = devisMap.get(d.id) || [];
                      const hasDevisPaye = devisForDemande.some(dv => 
                        ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(dv.statut)
                      );
                      return !hasDevisPaye; // Seulement si PAS de devis payé
                    }).length;

                    // CORRECTION : Seulement les demandes expirées SANS devis payé (vérification dateExpiration réelle)
                    const countExpirees = toutesTraitees.filter(d => {
                      if (!d.dateExpiration || !isDemandeExpired(d.dateExpiration)) return false;
                      const devisForDemande = devisMap.get(d.id) || [];
                      const hasDevisPaye = devisForDemande.some(dv => 
                        ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide'].includes(dv.statut)
                      );
                      return !hasDevisPaye; // Seulement si PAS de devis payé
                    }).length;

                    return (
                      <div className="flex flex-wrap gap-2 mt-4">
                        {/* Pill "Tout" */}
                        <button
                          onClick={() => setSousFiltreTraitees('tout')}
                          className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                            sousFiltreTraitees === 'tout'
                              ? 'bg-[#2C3E50] text-white shadow-lg transform scale-105'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {t('clientDemandes.subFilters.all')} ({toutesTraitees.length})
                        </button>

                        {/* Pill "✅ Devis signés" */}
                        {countDevisSignes > 0 && (
                          <button
                            onClick={() => setSousFiltreTraitees('devis_signes')}
                            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                              sousFiltreTraitees === 'devis_signes'
                                ? 'bg-gradient-to-r from-green-400 to-green-600 text-white shadow-lg transform scale-105'
                                : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                            }`}
                          >
                            {t('clientDemandes.subFilters.signedQuotes')} ({countDevisSignes})
                          </button>
                        )}

                        {/* Pill "🚧 Travaux en cours" */}
                        {countTravauxEnCours > 0 && (
                          <button
                            onClick={() => setSousFiltreTraitees('travaux_en_cours')}
                            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                              sousFiltreTraitees === 'travaux_en_cours'
                                ? 'bg-gradient-to-r from-yellow-400 to-yellow-600 text-white shadow-lg transform scale-105'
                                : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200'
                            }`}
                          >
                            {t('clientDemandes.subFilters.worksInProgress')} ({countTravauxEnCours})
                          </button>
                        )}

                        {/* Pill "✅ Terminés" */}
                        {countTermines > 0 && (
                          <button
                            onClick={() => setSousFiltreTraitees('termines')}
                            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                              sousFiltreTraitees === 'termines'
                                ? 'bg-gradient-to-r from-gray-700 to-gray-900 text-white shadow-lg transform scale-105'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
                            }`}
                          >
                            {t('clientDemandes.subFilters.completed')} ({countTermines})
                          </button>
                        )}

                        {/* Pill "⚠️ Litiges" */}
                        {countLitiges > 0 && (
                          <button
                            onClick={() => setSousFiltreTraitees('litiges')}
                            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                              sousFiltreTraitees === 'litiges'
                                ? 'bg-gradient-to-r from-orange-400 to-orange-600 text-white shadow-lg transform scale-105'
                                : 'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-300'
                            }`}
                          >
                            {t('clientDemandes.subFilters.disputes')} ({countLitiges})
                          </button>
                        )}

                        {/* Pill "❌ Refusées" */}
                        {countRefusees > 0 && (
                          <button
                            onClick={() => setSousFiltreTraitees('refusees')}
                            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                              sousFiltreTraitees === 'refusees'
                                ? 'bg-gradient-to-r from-red-400 to-red-600 text-white shadow-lg transform scale-105'
                                : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                            }`}
                          >
                            {t('clientDemandes.subFilters.rejected')} ({countRefusees})
                          </button>
                        )}

                        {/* Pill "⏰ Expirées" */}
                        {countExpirees > 0 && (
                          <button
                            onClick={() => setSousFiltreTraitees('expirees')}
                            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                              sousFiltreTraitees === 'expirees'
                                ? 'bg-gradient-to-r from-red-500 to-red-700 text-white shadow-lg transform scale-105'
                                : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-300'
                            }`}
                          >
                            {t('clientDemandes.subFilters.expired')} ({countExpirees})
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ⚠️ Bandeau rétention 120 jours - visible uniquement dans le sous-filtre Expirées */}
              {filtreSection === 'traitees' && sousFiltreTraitees === 'expirees' && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3 mb-2">
                  <span className="text-2xl flex-shrink-0">🗑️</span>
                  <div>
                    <p className="font-semibold text-orange-800 text-sm">
                      {t('clientDemandes.expiredRetentionBanner.title')}
                    </p>
                    <p className="text-orange-700 text-sm mt-1">
                      {t('clientDemandes.expiredRetentionBanner.message')}
                    </p>
                  </div>
                </div>
              )}

              {/* Liste des demandes filtrées */}
              {demandesFiltrees.length > 0 ? (
                <div className="space-y-4">
                  {demandesFiltrees.map(renderDemande)}
                </div>
              ) : (
                <Card className="p-12 text-center">
                  <div className="text-6xl mb-4">🔍</div>
                  <h2 className="text-2xl font-bold text-[#2C3E50] mb-2">
                    {t('clientDemandes.empty.noRequestsInCategory')}
                  </h2>
                  <p className="text-[#6C757D] mb-6">
                    {filtreSection === 'toutes' ? t('clientDemandes.empty.noRequestsYet') : t('clientDemandes.empty.tryAnotherCategory')}
                  </p>
                  {filtreSection !== 'toutes' && (
                    <button
                      onClick={() => setFiltreSection('toutes')}
                      className="text-[#FF6B00] hover:underline font-medium"
                    >
                      {t('clientDemandes.empty.viewAllRequests')}
                    </button>
                  )}
                </Card>
              )}
            </>
          );
            })()}
          </div>
        )}
      </main>

      {/* 🆘 Modal d'aide : Expiration automatique */}
      {showExpirationHelp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setShowExpirationHelp(false)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    {t('clientDemandes.expirationHelp.title')}
                  </h2>
                  <p className="text-blue-100">{t('clientDemandes.expirationHelp.subtitle')}</p>
                </div>
                <button 
                  onClick={() => setShowExpirationHelp(false)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Corps du modal */}
            <div className="p-6 space-y-6">
              {/* Intro */}
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                <p className="text-gray-700">
                  <strong>{t('clientDemandes.expirationHelp.intro.title')}</strong><br />
                  {t('clientDemandes.expirationHelp.intro.description')}
                </p>
              </div>

              {/* Règles détaillées */}
              <div>
                <h3 className="text-xl font-bold text-[#2C3E50] mb-4 flex items-center gap-2">
                  <span className="text-2xl">📐</span>
                  {t('clientDemandes.expirationHelp.rules.title')}
                </h3>
                
                <div className="space-y-4">
                  {/* Règle 1 */}
                  <div className="border-l-4 border-orange-400 bg-orange-50 p-4 rounded">
                    <h4 className="font-bold text-orange-900 mb-2">{t('clientDemandes.expirationHelp.rules.urgent.title')}</h4>
                    <p className="text-sm text-gray-700 mb-2">
                      <strong>{t('clientDemandes.expirationHelp.rules.urgent.expiration')}</strong> {t('clientDemandes.expirationHelp.rules.urgent.expirationValue')}
                    </p>
                    <div className="bg-white p-3 rounded text-sm">
                      <strong>{t('clientDemandes.expirationHelp.rules.urgent.example')}</strong><br />
                      {t('clientDemandes.expirationHelp.rules.urgent.created')}<br />
                      {t('clientDemandes.expirationHelp.rules.urgent.worksStart')}<br />
                      → <span className="text-green-600 font-bold">{t('clientDemandes.expirationHelp.rules.urgent.result')}</span><br />
                      <span className="text-xs text-gray-600">{t('clientDemandes.expirationHelp.rules.urgent.note')}</span>
                    </div>
                  </div>

                  {/* Règle 2 */}
                  <div className="border-l-4 border-blue-400 bg-blue-50 p-4 rounded">
                    <h4 className="font-bold text-blue-900 mb-2">{t('clientDemandes.expirationHelp.rules.normal.title')}</h4>
                    <p className="text-sm text-gray-700 mb-2">
                      <strong>{t('clientDemandes.expirationHelp.rules.normal.expiration')}</strong> {t('clientDemandes.expirationHelp.rules.normal.expirationValue')}
                    </p>
                    <div className="bg-white p-3 rounded text-sm">
                      <strong>{t('clientDemandes.expirationHelp.rules.normal.example')}</strong><br />
                      {t('clientDemandes.expirationHelp.rules.normal.created')}<br />
                      {t('clientDemandes.expirationHelp.rules.normal.worksStart')}<br />
                      → <span className="text-green-600 font-bold">{t('clientDemandes.expirationHelp.rules.normal.result')}</span><br />
                      <span className="text-xs text-gray-600">{t('clientDemandes.expirationHelp.rules.normal.note')}</span>
                    </div>
                  </div>

                  {/* Règle 3 */}
                  <div className="border-l-4 border-purple-400 bg-purple-50 p-4 rounded">
                    <h4 className="font-bold text-purple-900 mb-2">{t('clientDemandes.expirationHelp.rules.distant.title')}</h4>
                    <p className="text-sm text-gray-700 mb-2">
                      <strong>{t('clientDemandes.expirationHelp.rules.distant.expiration')}</strong> {t('clientDemandes.expirationHelp.rules.distant.expirationValue')}
                    </p>
                    <div className="bg-white p-3 rounded text-sm">
                      <strong>{t('clientDemandes.expirationHelp.rules.distant.example')}</strong><br />
                      {t('clientDemandes.expirationHelp.rules.distant.created')}<br />
                      {t('clientDemandes.expirationHelp.rules.distant.worksStart')}<br />
                      → <span className="text-green-600 font-bold">{t('clientDemandes.expirationHelp.rules.distant.result')}</span><br />
                      <span className="text-xs text-gray-600">{t('clientDemandes.expirationHelp.rules.distant.note')}</span>
                    </div>
                  </div>

                  {/* Règle 4 */}
                  <div className="border-l-4 border-gray-400 bg-gray-50 p-4 rounded">
                    <h4 className="font-bold text-gray-900 mb-2">{t('clientDemandes.expirationHelp.rules.noDate.title')}</h4>
                    <p className="text-sm text-gray-700 mb-2">
                      <strong>{t('clientDemandes.expirationHelp.rules.noDate.expiration')}</strong> {t('clientDemandes.expirationHelp.rules.noDate.expirationValue')}
                    </p>
                    <div className="bg-white p-3 rounded text-sm">
                      <strong>{t('clientDemandes.expirationHelp.rules.noDate.example')}</strong><br />
                      {t('clientDemandes.expirationHelp.rules.noDate.created')}<br />
                      {t('clientDemandes.expirationHelp.rules.noDate.worksStart')}<br />
                      → <span className="text-green-600 font-bold">{t('clientDemandes.expirationHelp.rules.noDate.result')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* FAQ rapide */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-bold text-[#2C3E50] mb-3">{t('clientDemandes.expirationHelp.faq.title')}</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-semibold text-gray-900">{t('clientDemandes.expirationHelp.faq.why5Days.question')}</p>
                    <p className="text-gray-700">{t('clientDemandes.expirationHelp.faq.why5Days.answer')}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{t('clientDemandes.expirationHelp.faq.expired.question')}</p>
                    <p className="text-gray-700">{t('clientDemandes.expirationHelp.faq.expired.answer')}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{t('clientDemandes.expirationHelp.faq.extend.question')}</p>
                    <p className="text-gray-700">{t('clientDemandes.expirationHelp.faq.extend.answer')}</p>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <p className="font-semibold text-orange-900">{t('clientDemandes.expirationHelp.faq.retention.question')}</p>
                    <p className="text-orange-800">{t('clientDemandes.expirationHelp.faq.retention.answer')}</p>
                  </div>
                </div>
              </div>

              {/* Bouton fermer */}
              <div className="flex justify-end">
                <button
                  onClick={() => setShowExpirationHelp(false)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                >
                  {t('clientDemandes.expirationHelp.understood')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
