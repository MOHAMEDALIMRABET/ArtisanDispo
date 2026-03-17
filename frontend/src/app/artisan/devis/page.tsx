'use client';

/**
 * Page de gestion des devis et factures de l'artisan
 * Affiche tous les devis avec leurs statuts et permet la gestion
 */

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { collection, query, where, getDocs, orderBy, doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Devis } from '@/types/devis';
import type { Demande } from '@/types/firestore';
import { declarerDebutTravaux, declarerFinTravaux, supprimerDevisAnulesExpires } from '@/lib/firebase/devis-service';

type TabType = 'devis' | 'factures';
type DevisFilter = 'tous' | 'genere' | 'envoye' | 'en_attente_paiement' | 'paye' | 'revision' | 'refuse';

// Type pour stocker les infos des demandes
type DemandeInfo = {
  titre: string;
  categorie: string;
  ville: string;
};

export default function MesDevisPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightedDevisId = searchParams?.get('devisId');
  const filtreDemandeId = searchParams?.get('demandeId');
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>('devis');
  const [devis, setDevis] = useState<Devis[]>([]);
  const [demandesInfo, setDemandesInfo] = useState<Record<string, DemandeInfo>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DevisFilter>('tous');
  const [sousFiltrePayes, setSousFiltrePayes] = useState<'tout' | 'paye' | 'en_cours' | 'travaux_termines' | 'valide' | 'litige'>('tout');
  const [showRemplace, setShowRemplace] = useState(false);
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);
  const [showInfoGestion, setShowInfoGestion] = useState(false);
  const devisRefs = useRef<{[key: string]: HTMLTableRowElement | null}>({});

  // Helper pour vérifier si un devis a une réponse client récente (notification récente)
  // SYSTÈME LU/NON LU inspiré de Gmail, Slack, LinkedIn
  // Le badge apparaît UNIQUEMENT si le CLIENT a répondu ET l'artisan n'a PAS encore consulté
  const aReponseClienteRecente = (devis: Devis): boolean => {
    // Règle simple : Devis accepté OU refusé OU annulé + Non vu par l'artisan
    if ((devis.statut === 'en_attente_paiement' || devis.statut === 'refuse' || devis.statut === 'annule') && devis.vuParArtisan === false) {
      return true;
    }
    return false;
  };

  // Obtenir le texte du badge selon le statut
  const getTexteBadgeReponse = (devis: Devis): string => {
    if (devis.statut === 'en_attente_paiement') return '💳 En attente paiement';
    if (devis.statut === 'en_revision') return '🔄 Révision';
    if (devis.statut === 'refuse') return '❌ Refusé';
    if (devis.statut === 'annule') return '🚫 Annulé';
    return 'Nouveau';
  };

  // Compter les réponses clients récentes par catégorie
  const compterReponsesRecentes = (filtre: DevisFilter): number => {
    return devis.filter(d => {
      if (!aReponseClienteRecente(d)) return false;
      if (filtre === 'tous') return true;
      if (filtre === 'genere') return d.statut === 'genere';
      if (filtre === 'envoye') return d.statut === 'envoye';
      if (filtre === 'en_attente_paiement') return d.statut === 'en_attente_paiement';
      if (filtre === 'paye') return ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'].includes(d.statut);
      if (filtre === 'revision') return d.statut === 'en_revision';
      if (filtre === 'refuse') return d.statut === 'refuse' || d.statut === 'annule';
      return false;
    }).length;
  };

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      router.push('/connexion');
      return;
    }
    
    loadDevis();
  }, [user, authLoading, router]);

  // Scroller vers le devis mis en évidence
  useEffect(() => {
    if (highlightedDevisId && !loading && devisRefs.current[highlightedDevisId]) {
      // Petit délai pour s'assurer que le rendu est terminé
      setTimeout(() => {
        const element = devisRefs.current[highlightedDevisId];
        if (element) {
          element.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest'
          });
          
          // Focus sur l'élément pour l'accessibilité
          element.focus();
          
          console.log('✅ Scroll vers le devis:', highlightedDevisId);
        }
      }, 500);
    }
  }, [highlightedDevisId, loading]);

  const loadDevis = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // 🗑️ SUPPRESSION AUTOMATIQUE : Devis annulés de plus de 24h
      // Notification envoyée à l'artisan avant suppression
      const devisSupprimés = await supprimerDevisAnulesExpires(user.uid);
      if (devisSupprimés > 0) {
        console.log(`🔔 ${devisSupprimés} devis annulé(s) supprimé(s) - Notification envoyée`);
      }

      const q = query(
        collection(db, 'devis'),
        where('artisanId', '==', user.uid)
      );

      const querySnapshot = await getDocs(q);
      let devisData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Devis));

      // Filtrer par demandeId si présent dans l'URL (navigation depuis page demandes)
      if (filtreDemandeId) {
        devisData = devisData.filter(d => d.demandeId === filtreDemandeId);
      }

      // Filtrer les devis refusés/annulés de plus de 24h (sauf révisions)
      const maintenant = Date.now();
      const VINGT_QUATRE_HEURES = 24 * 60 * 60 * 1000;
      
      devisData = devisData.filter(devis => {
        // Les révisions ne sont jamais masquées (statut dédié)
        if (devis.statut === 'en_revision') {
          return true;
        }
        
        // Si le devis est refusé définitivement
        if (devis.statut === 'refuse') {
          const dateRefus = devis.dateRefus?.toMillis() || 0;
          const deltaTemps = maintenant - dateRefus;
          
          // Si refusé depuis plus de 24h, masquer
          if (deltaTemps > VINGT_QUATRE_HEURES) {
            console.log(`🗑️ Devis ${devis.numeroDevis} masqué (refus définitif depuis ${Math.floor(deltaTemps / (60 * 60 * 1000))}h)`);
            return false;
          }
        }

        // Si le devis est annulé (déjà supprimé automatiquement après 24h)
        // On garde les devis annulés < 24h pour que l'artisan puisse les voir
        if (devis.statut === 'annule') {
          const dateAnnulation = (devis as any).dateAnnulation?.toMillis() || 0;
          const deltaTemps = maintenant - dateAnnulation;
          
          // Si annulé depuis plus de 24h, il a déjà été supprimé
          // Donc ce filtre ne devrait jamais se déclencher grâce à supprimerDevisAnulesExpires()
          if (deltaTemps > VINGT_QUATRE_HEURES) {
            console.warn(`⚠️ Devis annulé ${devis.numeroDevis} encore présent après 24h - Suppression manquée`);
            return false;
          }
        }

        return true;
      });

      // Trier par date de création décroissante
      devisData.sort((a, b) => {
        const dateA = a.dateCreation?.toMillis() || 0;
        const dateB = b.dateCreation?.toMillis() || 0;
        return dateB - dateA;
      });

      setDevis(devisData);

      // 🔍 DEBUG : Vérifier les devis NON VUS (système lu/non lu)
      const devisNonVus = devisData.filter(d => 
        (d.statut === 'en_attente_paiement' || d.statut === 'refuse') && d.vuParArtisan === false
      );
      
      console.log('📊 Total devis:', devisData.length);
      console.log('🔔 Devis NON VUS (avec réponse client):', devisNonVus.length);
      
      if (devisNonVus.length > 0) {
        console.log('📋 Devis nécessitant attention:');
        devisNonVus.forEach(d => {
          console.log(`  ✓ ${d.numeroDevis}: statut=${d.statut}, vuParArtisan=${d.vuParArtisan}`);
        });
      }

      // Charger les informations des demandes associées
      const demandesInfoTemp: Record<string, DemandeInfo> = {};
      const demandeIds = [...new Set(devisData.map(d => d.demandeId).filter(Boolean))];
      
      for (const demandeId of demandeIds) {
        try {
          const demandeDoc = await getDoc(doc(db, 'demandes', demandeId as string));
          if (demandeDoc.exists()) {
            const demandeData = demandeDoc.data() as Demande;
            demandesInfoTemp[demandeId as string] = {
              titre: demandeData.titre,
              categorie: demandeData.categorie,
              ville: demandeData.localisation?.ville || 'Non spécifiée',
            };
          }
        } catch (error) {
          console.error(`Erreur chargement demande ${demandeId}:`, error);
        }
      }
      
      setDemandesInfo(demandesInfoTemp);
    } catch (error) {
      console.error('Erreur chargement devis:', error);
    } finally {
      setLoading(false);
    }
  };

  // Marquer un devis comme "vu" par l'artisan (système lu/non lu)
  const marquerCommeVu = async (devisId: string) => {
    try {
      const devisRef = doc(db, 'devis', devisId);
      await updateDoc(devisRef, {
        vuParArtisan: true,
        dateVueParArtisan: Timestamp.now(),
      });
      console.log(`✅ Devis ${devisId} marqué comme vu`);
    } catch (error) {
      console.error('Erreur marquage devis comme vu:', error);
    }
  };

  // Marquer tous les devis d'une section comme "vus" par l'artisan
  const marquerSectionCommeVue = async (filtre: DevisFilter) => {
    try {
      // Trouver tous les devis visibles dans cette section qui ont vuParArtisan=false
      const devisAMarquer = devis.filter(d => {
        // Ignorer les devis déjà vus
        if (d.vuParArtisan !== false) return false;
        
        // Ignorer les devis remplacés si non affichés
        if (!showRemplace && d.statut === 'remplace') return false;
        
        // Vérifier si le devis correspond au filtre sélectionné
        if (filtre === 'tous') return true;
        if (filtre === 'genere') return d.statut === 'genere';
        if (filtre === 'envoye') return d.statut === 'envoye';
        if (filtre === 'en_attente_paiement') return d.statut === 'en_attente_paiement';
        if (filtre === 'paye') return ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'].includes(d.statut);
        if (filtre === 'revision') return d.statut === 'en_revision';
        if (filtre === 'refuse') return d.statut === 'refuse' || d.statut === 'annule';
        
        return false;
      });

      // Marquer tous ces devis comme vus
      if (devisAMarquer.length > 0) {
        console.log(`📝 Marquage de ${devisAMarquer.length} devis dans section "${filtre}"`);
        
        const updatedIds: string[] = [];
        
        for (const d of devisAMarquer) {
          try {
            const devisRef = doc(db, 'devis', d.id);
            await updateDoc(devisRef, {
              vuParArtisan: true,
              dateVueParArtisan: Timestamp.now(),
            });
            updatedIds.push(d.id);
          } catch (error: any) {
            // Ignorer les erreurs de permission (devis supprimé ou non accessible)
            console.warn(`⚠️ Impossible de marquer devis ${d.id}:`, error.code || error.message);
          }
        }
        
        if (updatedIds.length > 0) {
          console.log(`✅ ${updatedIds.length} devis marqués comme vus`);
          
          // Mettre à jour l'état local au lieu de recharger depuis Firestore
          setDevis(prev => prev.map(dv => 
            updatedIds.includes(dv.id) 
              ? { ...dv, vuParArtisan: true, dateVueParArtisan: Timestamp.now() }
              : dv
          ));
        }
      }
    } catch (error) {
      console.error('Erreur marquage section comme vue:', error);
    }
  };

  // Gérer le changement de filtre avec marquage automatique comme "vu"
  const handleFilterChange = async (newFilter: DevisFilter) => {
    // Réinitialiser le sous-filtre quand on quitte la section "Payés"
    if (newFilter !== 'paye') {
      setSousFiltrePayes('tout');
    }
    // D'abord changer le filtre (synchrone)
    setFilter(newFilter);
    
    // Puis marquer les devis de cette section comme vus (asynchrone)
    // Note : on utilise setTimeout pour laisser React finir le re-render
    setTimeout(() => {
      marquerSectionCommeVue(newFilter).catch(err => {
        console.error('Erreur lors du marquage automatique:', err);
      });
    }, 100);
  };

  // Gérer le clic sur un devis pour le consulter
  const handleVoirDevis = async (devisId: string, hasRecentNotif: boolean) => {
    // Si le devis a une notification non vue, le marquer comme vu
    if (hasRecentNotif) {
      await marquerCommeVu(devisId);
    }
    // Naviguer vers le détail
    router.push(`/artisan/devis/${devisId}`);
  };

  // Envoyer un devis brouillon au client
  const handleEnvoyerDevis = async (devisId: string) => {
    const confirmer = confirm(
      '📨 Envoyer ce devis au client ?\n\n' +
      'Le client recevra une notification et pourra consulter votre devis.\n\n' +
      '⚠️ Vous ne pourrez plus modifier ce devis après l\'envoi.'
    );

    if (!confirmer) return;

    try {
      const devisRef = doc(db, 'devis', devisId);
      const devisDoc = await getDoc(devisRef);
      
      if (!devisDoc.exists()) {
        alert(t('alerts.devis.notFound'));
        return;
      }

      const devisData = devisDoc.data() as Devis;

      // Mettre à jour le statut du devis
      await updateDoc(devisRef, {
        statut: 'envoye',
        dateEnvoi: Timestamp.now(),
      });

      // Envoyer une notification au client
      const { createNotification } = await import('@/lib/firebase/notification-service');
      await createNotification(devisData.clientId, {
        type: 'nouveau_devis',
        titre: 'Nouveau devis reçu',
        message: `Vous avez reçu un devis de ${devisData.artisan.raisonSociale || 'l\'artisan'} pour un montant de ${devisData.totaux.totalTTC.toFixed(2)}€ TTC.`,
        lien: `/client/devis/${devisId}`,
      });

      console.log('✅ Devis envoyé avec succès');
      alert(t('alerts.devis.sendSuccess'));
      
      // Recharger la liste des devis
      loadDevis();
    } catch (error) {
      console.error('❌ Erreur envoi devis:', error);
      alert(t('alerts.devis.sendError'));
    }
  };

  // 🔨 ACTIONS RAPIDES : Déclarer le début des travaux
  const handleDeclarerDebutRapide = async (devisId: string, numeroDevis: string) => {
    if (actionEnCours) return; // Éviter les double-clics

    const confirmer = confirm(
      `🔨 Déclarer le début des travaux ?\n\n` +
      `Devis : ${numeroDevis}\n\n` +
      `Cela marquera le début de la prestation et informera le client.`
    );

    if (!confirmer) return;

    try {
      setActionEnCours(devisId);
      await declarerDebutTravaux(devisId, user!.uid);
      console.log('✅ Début des travaux déclaré');
      alert(t('alerts.devis.workStartSuccess'));
      await loadDevis(); // Recharger la liste
    } catch (error) {
      console.error('❌ Erreur déclaration début:', error);
      alert(t('alerts.devis.declarationError'));
    } finally {
      setActionEnCours(null);
    }
  };

  // 🏁 ACTIONS RAPIDES : Déclarer la fin des travaux
  const handleDeclarerFinRapide = async (devisId: string, numeroDevis: string) => {
    if (actionEnCours) return; // Éviter les double-clics

    const confirmer = confirm(
      `🏁 Déclarer la fin des travaux ?\n\n` +
      `Devis : ${numeroDevis}\n\n` +
      `Le client aura 7 jours pour valider les travaux.\n` +
      `Après ce délai, les travaux seront validés automatiquement.`
    );

    if (!confirmer) return;

    try {
      setActionEnCours(devisId);
      await declarerFinTravaux(devisId, user!.uid);
      console.log('✅ Fin des travaux déclarée');
      alert(t('alerts.devis.workEndSuccess'));
      await loadDevis(); // Recharger la liste
    } catch (error) {
      console.error('❌ Erreur déclaration fin:', error);
      alert(t('alerts.devis.declarationError'));
    } finally {
      setActionEnCours(null);
    }
  };

  // Supprimer un devis brouillon
  const handleSupprimerDevis = async (devisId: string, numeroDevis: string) => {
    const confirmer = confirm(
      `🗑️ Supprimer définitivement ce devis ?\n\n` +
      `Numéro: ${numeroDevis}\n\n` +
      `⚠️ Cette action est irréversible.\n` +
      `Le devis sera définitivement supprimé`
    );

    if (!confirmer) return;

    try {
      const { deleteDoc } = await import('firebase/firestore');
      const devisRef = doc(db, 'devis', devisId);
      
      await deleteDoc(devisRef);
      
      console.log('✅ Devis supprimé:', devisId);
      alert(t('alerts.devis.deleteSuccess'));
      
      // Recharger la liste des devis
      loadDevis();
    } catch (error) {
      console.error('❌ Erreur suppression devis:', error);
      alert(t('alerts.devis.deleteError'));
    }
  };

  const getStatutBadge = (statut: string) => {
    const styles: { [key: string]: string } = {
      brouillon: 'bg-gray-100 text-gray-800',
      envoye: 'bg-purple-100 text-purple-700',
      accepte: 'bg-green-100 text-green-800',
      en_attente_paiement: 'bg-yellow-100 text-yellow-800',
      paye: 'bg-green-600 text-white',
      en_cours: 'bg-amber-600 text-white',
      travaux_termines: 'bg-orange-100 text-orange-800',
      termine_valide: 'bg-green-700 text-white',
      termine_auto_valide: 'bg-green-600 text-white',
      litige: 'bg-red-600 text-white',
      refuse: 'bg-red-100 text-red-800',
      en_revision: 'bg-purple-100 text-purple-800',
      expire: 'bg-orange-100 text-orange-800',
      remplace: 'bg-purple-100 text-purple-800',
      annule: 'bg-gray-200 text-gray-700',
    };

    const labels: { [key: string]: string} = {
      brouillon: `📝 ${t('quotes.draft')}`,
      envoye: `📤 ${t('quotes.sent')}`,
      accepte: `✅ ${t('quotes.accepted')}`,
      en_attente_paiement: `💳 ${t('quotes.waitingPayment')}`,
      paye: `💰 ${t('quotes.paid')}`,
      en_cours: `🚧 ${t('quotes.inProgress')}`,
      travaux_termines: `✅ ${t('quotes.worksCompleted')}`,
      termine_valide: `✔️ ${t('quotes.validated')}`,
      termine_auto_valide: `✔️ ${t('quotes.autoValidated')}`,
      litige: `⚠️ ${t('quotes.dispute')}`,
      refuse: `❌ ${t('quotes.refused')}`,
      en_revision: `🔄 ${t('quotes.inRevision')}`,
      expire: `⏰ ${t('quotes.expired')}`,
      remplace: `🔄 ${t('quotes.replaced')}`,
      annule: `🚫 ${t('quotes.cancelled')}`,
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[statut] || 'bg-gray-100 text-gray-800'}`}>
        {labels[statut] || statut}
      </span>
    );
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00] mx-auto"></div>
          <p className="mt-4 text-[#6C757D]">{t('quotes.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Exclure les devis remplacés des statistiques principales
  const devisActifs = devis.filter(d => d.statut !== 'remplace');
  const devisGeneres = devisActifs.filter(d => d.statut === 'genere');
  const devisEnvoyes = devisActifs.filter(d => d.statut === 'envoye');
  const devisEnAttentePaiement = devisActifs.filter(d => d.statut === 'en_attente_paiement');
  const devisPayes = devisActifs.filter(d => ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'].includes(d.statut));
  const devisRefuses = devisActifs.filter(d => d.statut === 'refuse' || d.statut === 'annule');
  const devisRevisionDemandee = devisActifs.filter(d => d.statut === 'en_revision');
  const devisRemplace = devis.filter(d => d.statut === 'remplace');

  // Filtrage des devis selon le filtre actif
  const filteredDevis = devis
    .filter(d => {
      // Si un devisId est spécifié dans l'URL, afficher uniquement ce devis
      if (highlightedDevisId) {
        return d.id === highlightedDevisId;
      }
      
      // Masquer les devis remplacés sauf si explicitement demandé
      if (!showRemplace && d.statut === 'remplace') return false;
      
      if (filter === 'tous') return true;
      if (filter === 'genere') return d.statut === 'genere';
      if (filter === 'envoye') return d.statut === 'envoye';
      if (filter === 'en_attente_paiement') return d.statut === 'en_attente_paiement';
      if (filter === 'paye') {
        if (!['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'].includes(d.statut)) return false;
        if (sousFiltrePayes === 'tout') return true;
        if (sousFiltrePayes === 'paye') return d.statut === 'paye';
        if (sousFiltrePayes === 'en_cours') return d.statut === 'en_cours';
        if (sousFiltrePayes === 'travaux_termines') return d.statut === 'travaux_termines';
        if (sousFiltrePayes === 'valide') return ['termine_valide', 'termine_auto_valide'].includes(d.statut);
        if (sousFiltrePayes === 'litige') return d.statut === 'litige';
        return true;
      }
      if (filter === 'revision') return d.statut === 'en_revision';
      if (filter === 'refuse') return d.statut === 'refuse' || d.statut === 'annule';
      return true;
    })
    // TRI PRIORITAIRE : Devis avec notifications récentes EN HAUT
    .sort((a, b) => {
      const aRecent = aReponseClienteRecente(a);
      const bRecent = aReponseClienteRecente(b);
      
      // 1. Priorité absolue : notifications récentes en premier
      if (aRecent && !bRecent) return -1;
      if (!aRecent && bRecent) return 1;
      
      // 2. Si les deux ont (ou n'ont pas) de notification récente, trier par date de création
      const dateA = a.dateCreation?.toMillis() || 0;
      const dateB = b.dateCreation?.toMillis() || 0;
      return dateB - dateA; // Plus récent en premier
    });

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <style jsx>{`
        @keyframes pulse-border {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(255, 107, 0, 0.7);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(255, 107, 0, 0);
          }
        }
        
        @keyframes slide-in {
          from {
            transform: translateX(-100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        @keyframes highlight-flash {
          0%, 100% {
            background-color: rgba(255, 107, 0, 0.1);
            transform: scale(1);
          }
          50% {
            background-color: rgba(255, 107, 0, 0.3);
            transform: scale(1.02);
          }
        }
        
        .badge-reponse-client {
          animation: slide-in 0.5s ease-out;
        }
        
        .devis-reponse-recente {
          animation: pulse-border 2s infinite;
          background: linear-gradient(to right, rgba(255, 107, 0, 0.05), rgba(255, 107, 0, 0.02));
        }
        
        .devis-highlight {
          animation: highlight-flash 1s ease-in-out 4;
          background: linear-gradient(135deg, rgba(255, 107, 0, 0.15) 0%, rgba(255, 107, 0, 0.05) 100%) !important;
          box-shadow: 0 4px 20px rgba(255, 107, 0, 0.4) !important;
          border-left: 6px solid #FF6B00 !important;
          position: relative;
        }
        
        .devis-notification-recente {
          border-left: 5px solid #FF6B00 !important;
          background: linear-gradient(to right, rgba(255, 107, 0, 0.08), rgba(255, 193, 7, 0.03), rgba(255, 255, 255, 0.95)) !important;
          box-shadow: 
            0 2px 8px rgba(255, 107, 0, 0.15), 
            inset 3px 0 0 rgba(255, 107, 0, 0.3),
            inset 0 1px 0 rgba(255, 193, 7, 0.2),
            inset 0 -1px 0 rgba(255, 193, 7, 0.2) !important;
          position: relative;
          animation: subtle-pulse 3s ease-in-out infinite;
        }
        
        .devis-notification-recente:hover {
          background: linear-gradient(to right, rgba(255, 107, 0, 0.12), rgba(255, 193, 7, 0.05), rgba(255, 255, 255, 0.95)) !important;
          box-shadow: 
            0 4px 16px rgba(255, 107, 0, 0.25), 
            inset 5px 0 0 rgba(255, 107, 0, 0.4),
            inset 0 2px 0 rgba(255, 193, 7, 0.3),
            inset 0 -2px 0 rgba(255, 193, 7, 0.3) !important;
        }
        
        .devis-notification-recente .numero-devis::before {
          content: '🔔';
          display: inline-block;
          margin-right: 4px;
          font-size: 13px;
          animation: ring-bell 2s ease-in-out infinite;
          filter: drop-shadow(0 2px 4px rgba(255, 107, 0, 0.5));
        }
        
        @keyframes ring-bell {
          0%, 100% { 
            transform: rotate(0deg); 
          }
          10%, 30% { 
            transform: rotate(-15deg); 
          }
          20%, 40% { 
            transform: rotate(15deg); 
          }
          50% { 
            transform: rotate(0deg); 
          }
        }
        
        @keyframes subtle-pulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.005);
          }
        }
        
        @keyframes pulse-icon {
          0%, 100% { transform: translateY(-50%) scale(1); }
          50% { transform: translateY(-50%) scale(1.2); }
        }
        
        .devis-highlight::before {
          content: '👁️ Vous consultez ce devis';
          position: absolute;
          top: 50%;
          left: -200px;
          transform: translateY(-50%);
          background: linear-gradient(135deg, #FF6B00 0%, #E56100 100%);
          color: white;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: bold;
          white-space: nowrap;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          z-index: 10;
          animation: slide-in 0.5s ease-out;
        }
        
        @media (max-width: 768px) {
          .devis-highlight::before {
            display: none;
          }
        }
      `}</style>
      
      {/* Header */}
      <div className="bg-[#2C3E50] text-white py-8">
        <div className="container mx-auto px-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-white hover:text-[#FF6B00] mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Retour au tableau de bord
          </button>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold">{t('quotes.myQuotes')}</h1>
              <p className="text-gray-300 mt-2">
                {highlightedDevisId ? t('quotes.quoteDetail') : t('quotes.manageQuotesInvoices')}
              </p>
            </div>
            {highlightedDevisId && (
              <button
                onClick={() => router.push('/artisan/devis')}
                className="flex items-center gap-2 bg-[#FF6B00] text-white px-4 py-2 rounded-lg hover:bg-[#E56100]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {t('quotes.backToAllQuotes')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Bouton info collapsible - Gestion automatique des devis */}
        <div className="mb-6">
          <button
            onClick={() => setShowInfoGestion(prev => !prev)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-200 ${
              showInfoGestion
                ? 'bg-[#2C3E50] text-white border-[#2C3E50]'
                : 'bg-white text-[#2C3E50] border-gray-300 hover:border-[#2C3E50] hover:bg-gray-50'
            }`}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            ℹ️ {t('quotes.automaticManagement')}
            <svg
              className={`w-4 h-4 ml-1 transition-transform duration-200 ${showInfoGestion ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showInfoGestion && (
            <div className="mt-2 bg-gray-50 border-l-4 border-gray-300 p-4 rounded-lg relative">
              <button
                onClick={() => setShowInfoGestion(false)}
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <p className="text-[#2C3E50] text-sm pr-6">
                <span className="block mb-1.5"><strong>{t('quotes.refusedQuoteCleanup')}</strong></span>
                <span className="block mb-1.5"><strong>{t('quotes.cancelledQuoteCleanup')}</strong></span>
                <span className="block"><strong>{t('quotes.revisionQuoteCleanup')}</strong></span>
              </p>
            </div>
          )}
        </div>

        {/* Bannière de notification si devis spécifique */}
        {highlightedDevisId && (
          <div className="mb-6 bg-gradient-to-r from-[#FF6B00] to-[#E56100] text-white p-4 rounded-lg shadow-lg flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-3">
              <div className="bg-white bg-opacity-20 p-2 rounded-full">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <div>
                <p className="font-bold">📋 {t('quotes.specificQuoteConsultation')}</p>
                <p className="text-sm text-white text-opacity-90">{t('quotes.quoteHighlighted')}</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/artisan/devis')}
              className="bg-white bg-opacity-20 hover:bg-opacity-30 px-4 py-2 rounded-lg transition flex items-center gap-2"
            >
              <span className="text-sm font-semibold">{t('quotes.viewAllQuotes')}</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('devis')}
              className={`flex-1 px-6 py-4 font-semibold ${
                activeTab === 'devis'
                  ? 'text-[#FF6B00] border-b-2 border-[#FF6B00]'
                  : 'text-gray-600 hover:text-[#FF6B00]'
              }`}
            >
              📋 {t('quotes.title')} ({devisActifs.length})
            </button>
            <button
              onClick={() => setActiveTab('factures')}
              className={`flex-1 px-6 py-4 font-semibold ${
                activeTab === 'factures'
                  ? 'text-[#FF6B00] border-b-2 border-[#FF6B00]'
                  : 'text-gray-600 hover:text-[#FF6B00]'
              }`}
            >
              🧾 {t('quotes.invoices')} (0)
            </button>
          </div>
        </div>

        {/* Statistiques rapides - Cliquables pour filtrer - Masquées si devis spécifique */}
        {activeTab === 'devis' && !highlightedDevisId && (
          <>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4 mb-4">
            <button
              onClick={() => handleFilterChange('tous')}
              className={`rounded-lg shadow-md p-4 text-left transition-all hover:shadow-lg relative ${
                filter === 'tous' ? 'bg-[#FF6B00] text-white ring-4 ring-[#FF6B00] ring-opacity-50' : 'bg-white'
              }`}
            >
              <div className={`text-2xl font-bold ${filter === 'tous' ? 'text-white' : 'text-[#FF6B00]'}`}>{devisActifs.length}</div>
              <div className={`text-sm ${filter === 'tous' ? 'text-white' : 'text-gray-600'}`}>{t('quotes.all')}</div>
              {compterReponsesRecentes('tous') > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center badge-reponse-client" title={t('quotes.recentClientResponses')}>
                  {compterReponsesRecentes('tous')}
                </span>
              )}
            </button>
            <button
              onClick={() => handleFilterChange('genere')}
              className={`rounded-lg shadow-md p-4 text-left transition-all hover:shadow-lg relative ${
                filter === 'genere' ? 'bg-gray-600 text-white ring-4 ring-gray-600 ring-opacity-50' : 'bg-white'
              }`}
            >
              <div className={`text-2xl font-bold ${filter === 'genere' ? 'text-white' : 'text-gray-600'}`}>{devisGeneres.length}</div>
              <div className={`text-sm ${filter === 'genere' ? 'text-white' : 'text-gray-600'}`}>📄 {t('quotes.generated')}</div>
              {compterReponsesRecentes('genere') > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center badge-reponse-client" title={t('quotes.recentClientResponses')}>
                  {compterReponsesRecentes('genere')}
                </span>
              )}
            </button>
            <button
              onClick={() => handleFilterChange('envoye')}
              className={`rounded-lg shadow-md p-4 text-left transition-all hover:shadow-lg relative ${
                filter === 'envoye' ? 'bg-purple-600 text-white ring-4 ring-purple-600 ring-opacity-50' : 'bg-white'
              }`}
            >
              <div className={`text-2xl font-bold ${filter === 'envoye' ? 'text-white' : 'text-purple-600'}`}>{devisEnvoyes.length}</div>
              <div className={`text-sm ${filter === 'envoye' ? 'text-white' : 'text-gray-600'}`}>📤 {t('quotes.sentPlural')}</div>
              {compterReponsesRecentes('envoye') > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center badge-reponse-client" title={t('quotes.recentClientResponses')}>
                  {compterReponsesRecentes('envoye')}
                </span>
              )}
            </button>
            <button
              onClick={() => handleFilterChange('revision')}
              className={`rounded-lg shadow-md p-4 text-left transition-all hover:shadow-lg relative ${
                filter === 'revision' ? 'bg-orange-600 text-white ring-4 ring-orange-600 ring-opacity-50' : 'bg-white border-2 border-orange-400'
              }`}
            >
              <div className={`text-2xl font-bold ${filter === 'revision' ? 'text-white' : 'text-orange-600'}`}>{devisRevisionDemandee.length}</div>
              <div className={`text-sm ${filter === 'revision' ? 'text-white' : 'text-orange-700'} font-semibold`}>🔄 {t('quotes.revisions')}</div>
              {compterReponsesRecentes('revision') > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center badge-reponse-client" title={t('quotes.recentClientResponses')}>
                  {compterReponsesRecentes('revision')}
                </span>
              )}
            </button>
            <button
              onClick={() => handleFilterChange('en_attente_paiement')}
              className={`rounded-lg shadow-md p-4 text-left transition-all hover:shadow-lg relative ${
                filter === 'en_attente_paiement' ? 'bg-yellow-600 text-white ring-4 ring-yellow-600 ring-opacity-50' : 'bg-white border-2 border-yellow-400'
              }`}
            >
              <div className={`text-2xl font-bold ${filter === 'en_attente_paiement' ? 'text-white' : 'text-yellow-600'}`}>{devisEnAttentePaiement.length}</div>
              <div className={`text-sm ${filter === 'en_attente_paiement' ? 'text-white' : 'text-yellow-700'} font-semibold`}>⏳ {t('quotes.pending')}</div>
              {compterReponsesRecentes('en_attente_paiement') > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center badge-reponse-client" title={t('quotes.recentClientResponses')}>
                  {compterReponsesRecentes('en_attente_paiement')}
                </span>
              )}
            </button>
            <button
              onClick={() => handleFilterChange('paye')}
              className={`rounded-lg shadow-md p-4 text-left transition-all hover:shadow-lg relative ${
                filter === 'paye' ? 'bg-green-600 text-white ring-4 ring-green-600 ring-opacity-50' : 'bg-white'
              }`}
            >
              <div className={`text-2xl font-bold ${filter === 'paye' ? 'text-white' : 'text-green-600'}`}>{devisPayes.length}</div>
              <div className={`text-sm ${filter === 'paye' ? 'text-white' : 'text-gray-600'}`}>💰 {t('quotes.paidPlural')}</div>
              {compterReponsesRecentes('paye') > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center badge-reponse-client" title={t('quotes.recentClientResponses')}>
                  {compterReponsesRecentes('paye')}
                </span>
              )}
            </button>
            <button
              onClick={() => handleFilterChange('refuse')}
              className={`rounded-lg shadow-md p-4 text-left transition-all hover:shadow-lg relative ${
                filter === 'refuse' ? 'bg-red-600 text-white ring-4 ring-red-600 ring-opacity-50' : 'bg-white'
              }`}
            >
              <div className={`text-2xl font-bold ${filter === 'refuse' ? 'text-white' : 'text-red-600'}`}>{devisRefuses.length}</div>
              <div className={`text-sm ${filter === 'refuse' ? 'text-white' : 'text-gray-600'}`}>❌ {t('quotes.refusedPlural')}</div>
              {compterReponsesRecentes('refuse') > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center badge-reponse-client" title={t('quotes.recentClientResponses')}>
                  {compterReponsesRecentes('refuse')}
                </span>
              )}
            </button>
          </div>

          {/* Sous-filtres pour la section "Payés" */}
          {filter === 'paye' && devisPayes.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6 bg-white rounded-xl shadow-sm p-3 border border-gray-100">
              {([
                { key: 'tout', label: '🔍 Tout', count: devisPayes.length },
                { key: 'paye', label: '💰 Payé', count: devisActifs.filter(d => d.statut === 'paye').length },
                { key: 'en_cours', label: '🚧 Travaux en cours', count: devisActifs.filter(d => d.statut === 'en_cours').length },
                { key: 'travaux_termines', label: '⏳ Attente validation', count: devisActifs.filter(d => d.statut === 'travaux_termines').length },
                { key: 'valide', label: '✔️ Validés', count: devisActifs.filter(d => ['termine_valide', 'termine_auto_valide'].includes(d.statut)).length },
                { key: 'litige', label: '⚠️ Litige', count: devisActifs.filter(d => d.statut === 'litige').length },
              ] as { key: string; label: string; count: number }[]).filter(({ key, count }) => key === 'tout' || count > 0).map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setSousFiltrePayes(key as typeof sousFiltrePayes)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    sousFiltrePayes === key
                      ? 'bg-green-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {label} <span className="opacity-75">({count})</span>
                </button>
              ))}
            </div>
          )}

          {devisRemplace.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showRemplace"
                  checked={showRemplace}
                  onChange={(e) => setShowRemplace(e.target.checked)}
                  className="w-4 h-4 text-[#FF6B00] border-gray-300 rounded focus:ring-[#FF6B00]"
                />
                <label htmlFor="showRemplace" className="text-sm text-gray-700 cursor-pointer">
                  {t('quotes.showReplaced')} ({devisRemplace.length})
                </label>
              </div>
              <span className="text-xs text-gray-500 bg-purple-50 px-2 py-1 rounded">
                🔄 {t('quotes.obsoleteQuotes')}
              </span>
            </div>
          )}
          </>
        )}

        {/* Liste des devis */}
        {activeTab === 'devis' && (
          <div className="bg-white rounded-lg shadow-md overflow-x-auto">
            {filteredDevis.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-600 mb-4">
                  {filter === 'tous' ? t('quotes.noQuotesYet') : `${t('quotes.noQuotes')} ${filter === 'genere' ? t('quotes.noGeneratedQuote') : filter === 'envoye' ? t('quotes.noSentQuote') : filter === 'en_attente_paiement' ? t('quotes.noWaitingPaymentQuote') : filter === 'paye' ? t('quotes.noPaidQuote') : filter === 'revision' ? t('quotes.noRevisionQuote') : t('quotes.noRefusedQuote')}`}
                </p>
                {filter === 'tous' ? (
                  <button
                    onClick={() => router.push('/artisan/demandes')}
                    className="bg-[#FF6B00] text-white px-6 py-2 rounded-lg hover:bg-[#E56100]"
                  >
                    {t('quotes.viewRequests')}
                  </button>
                ) : (
                  <button
                    onClick={() => handleFilterChange('tous')}
                    className="bg-[#FF6B00] text-white px-6 py-2 rounded-lg hover:bg-[#E56100]"
                  >
                    {t('quotes.viewAllQuotes')}
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full min-w-[900px] divide-y divide-gray-200 table-auto">
                <colgroup>
                  <col style={{width:'10%'}} />
                  <col style={{width:'14%'}} />
                  <col style={{width:'11%'}} />
                  <col style={{width:'15%'}} />
                  <col style={{width:'9%'}} />
                  <col style={{width:'13%'}} />
                  <col style={{width:'8%'}} />
                  <col style={{width:'20%'}} />
                </colgroup>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('quotes.number')}
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('quotes.associatedRequest')}
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('quotes.client')}
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('quotes.title')}
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('quotes.amount')}
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('quotes.status')}
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('quotes.date')}
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('quotes.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredDevis.map((d) => {
                    const info = demandesInfo[d.demandeId || ''];
                    const isHighlighted = highlightedDevisId === d.id;
                    const hasRecentNotif = aReponseClienteRecente(d);
                    
                    return (
                      <tr 
                        key={d.id} 
                        ref={(el) => { devisRefs.current[d.id] = el; }}
                        className={`
                          border-b border-gray-200 transition-all cursor-pointer
                          ${isHighlighted ? 'devis-highlight' : ''}
                          ${hasRecentNotif ? 'devis-notification-recente' : ''}
                          ${!isHighlighted && !hasRecentNotif ? 'hover:bg-gray-50' : ''}
                        `}
                      >
                        <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-[#2C3E50]">
                          <span className="numero-devis">{d.numeroDevis}</span>
                        </td>
                        <td className="px-2 py-4 text-sm">
                        {d.demandeId && demandesInfo[d.demandeId] ? (
                          <button
                            onClick={() => router.push(`/artisan/demandes?demandeId=${d.demandeId}`)}
                            className="text-left hover:bg-orange-50 p-1 rounded transition-colors group"
                            title={`${demandesInfo[d.demandeId].titre} - ${demandesInfo[d.demandeId].categorie} à ${demandesInfo[d.demandeId].ville}`}
                          >
                            <div className="flex items-center gap-1">
                              <svg className="w-3 h-3 text-[#FF6B00] flex-shrink-0 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                              </svg>
                              <span className="text-xs font-medium text-[#2C3E50] group-hover:text-[#FF6B00] truncate">
                                {demandesInfo[d.demandeId].titre}
                              </span>
                            </div>
                          </button>
                        ) : d.demandeId ? (
                          <div className="text-gray-500 text-xs">
                            <div>{t('common.loading')}</div>
                            <div className="font-mono text-[10px] text-gray-400">{d.demandeId.substring(0, 8)}...</div>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs italic">{t('quotes.manualQuote')}</span>
                        )}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        {d.client.prenom} {d.client.nom}
                      </td>
                      <td className="px-3 py-4 text-sm text-gray-900">
                        {d.titre}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {d.totaux.totalTTC.toFixed(2)} €
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm">
                        {d.statut === 'remplace' && d.devisRevisionId ? (
                          <div className="flex flex-col gap-1">
                            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                              🔄 {t('quotes.replaced')}
                            </span>
                            <button
                              onClick={async () => {
                                if (d.devisRevisionId) {
                                  // Charger le devis de révision pour vérifier s'il a une notification
                                  const revisionDoc = await getDoc(doc(db, 'devis', d.devisRevisionId));
                                  const revisionData = revisionDoc.data() as Devis;
                                  await handleVoirDevis(d.devisRevisionId, aReponseClienteRecente(revisionData));
                                }
                              }}
                              className="text-xs text-[#FF6B00] hover:underline"
                            >
                              → {t('quotes.seeRevision')}
                            </button>
                          </div>
                        ) : d.statut === 'en_revision' ? (
                          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                            🔄 {t('quotes.revisionRequested')}
                          </span>
                        ) : d.statut === 'genere' ? (
                          <button
                            onClick={() => router.push(`/artisan/devis/${d.id}`)}
                            className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 hover:bg-purple-200 transition"
                          >
                            👁️ {t('quotes.consult')}
                          </button>
                        ) : (
                          getStatutBadge(d.statut)
                        )}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                        {d.dateCreation?.toDate().toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-3 py-4 text-sm font-medium">
                        {d.statut === 'en_revision' && d.demandeId ? (
                          <button
                            onClick={() => router.push(`/artisan/devis/nouveau?demandeId=${d.demandeId}&revisionDevisId=${d.id}`)}
                            className="px-3 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 text-xs font-semibold"
                          >
                            📝 {t('quotes.createRevision')}
                          </button>
                        ) : d.statut === 'refuse' ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-gray-500 italic">{t('quotes.definitiveRefusal')}</span>
                            <span className="text-[10px] text-gray-400">{t('quotes.noNewProposal')}</span>
                          </div>
                        ) : d.statut === 'annule' ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-orange-600 italic">{t('quotes.clientWithdrew')}</span>
                            <span className="text-[10px] text-gray-400">{t('quotes.autoDeleteIn24h')}</span>
                          </div>
                        ) : d.statut === 'genere' ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEnvoyerDevis(d.id)}
                              className="px-3 py-1 bg-[#FF6B00] text-white rounded hover:bg-[#E56100] text-xs font-semibold flex items-center gap-1 justify-center"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              {t('quotes.sendToClient')}
                            </button>
                            <button
                              onClick={() => handleSupprimerDevis(d.id, d.numeroDevis)}
                              className="w-8 h-8 flex items-center justify-center bg-red-100 text-red-600 hover:bg-red-600 hover:text-white rounded transition border border-red-300"
                              title={t('quotes.deleteThisQuote')}
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : d.statut === 'paye' ? (
                          // 🔨 ACTION RAPIDE : Déclarer le début des travaux + Lien Voir
                          <div className="flex flex-row flex-wrap gap-2 items-center">
                            <button
                              onClick={() => handleDeclarerDebutRapide(d.id, d.numeroDevis)}
                              disabled={actionEnCours === d.id}
                              className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-xs font-semibold flex items-center gap-1 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Déclarer le début des travaux"
                            >
                              {actionEnCours === d.id ? (
                                <>⏳ {t('common.loading')}...</>
                              ) : (
                                <>🔨 {t('quotes.startWork')}</>
                              )}
                            </button>
                            <button
                              onClick={() => handleVoirDevis(d.id, aReponseClienteRecente(d))}
                              className="px-3 py-1 border border-[#FF6B00] text-[#FF6B00] rounded hover:bg-[#FF6B00] hover:text-white text-xs font-medium transition"
                            >
                              {t('quotes.viewDetails')}
                            </button>
                          </div>
                        ) : d.statut === 'en_cours' ? (
                          // 🏁 ACTION RAPIDE : Déclarer la fin des travaux + Lien Voir
                          <div className="flex flex-row flex-wrap gap-2 items-center">
                            <button
                              onClick={() => handleDeclarerFinRapide(d.id, d.numeroDevis)}
                              disabled={actionEnCours === d.id}
                              className="px-3 py-1 bg-[#FF6B00] text-white rounded hover:bg-[#E56100] text-xs font-semibold flex items-center gap-1 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Déclarer la fin des travaux"
                            >
                              {actionEnCours === d.id ? (
                                <>⏳ {t('common.loading')}...</>
                              ) : (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  🏁 {t('quotes.declareEnd')}
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => handleVoirDevis(d.id, aReponseClienteRecente(d))}
                              className="px-3 py-1 border border-[#FF6B00] text-[#FF6B00] rounded hover:bg-[#FF6B00] hover:text-white text-xs font-medium transition"
                            >
                              {t('quotes.viewDetails')}
                            </button>
                          </div>
                        ) : d.statut === 'travaux_termines' ? (
                          // ⏳ EN ATTENTE VALIDATION CLIENT + Lien Voir
                          <button
                            onClick={() => handleVoirDevis(d.id, aReponseClienteRecente(d))}
                            className="px-3 py-1 border border-[#FF6B00] text-[#FF6B00] rounded hover:bg-[#FF6B00] hover:text-white text-xs font-medium transition"
                          >
                            {t('quotes.viewDetails')}
                          </button>
                        ) : ['termine_valide', 'termine_auto_valide'].includes(d.statut) ? (
                          // ✅ TRAVAUX VALIDÉS - PAIEMENT LIBÉRÉ + Lien Voir
                          <button
                            onClick={() => handleVoirDevis(d.id, aReponseClienteRecente(d))}
                            className="px-3 py-1 border border-[#FF6B00] text-[#FF6B00] rounded hover:bg-[#FF6B00] hover:text-white text-xs font-medium transition"
                          >
                            {t('quotes.viewDetails')}
                          </button>
                        ) : d.statut === 'litige' ? (
                          // ⚠️ LITIGE EN COURS
                          <button
                            onClick={() => handleVoirDevis(d.id, aReponseClienteRecente(d))}
                            className="px-3 py-1 border border-[#FF6B00] text-[#FF6B00] rounded hover:bg-[#FF6B00] hover:text-white text-xs font-medium transition"
                          >
                            {t('quotes.viewDetails')}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleVoirDevis(d.id, aReponseClienteRecente(d))}
                            className="text-[#FF6B00] hover:text-[#E56100]"
                          >
                            {t('quotes.see')}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Section Factures (à venir) */}
        {activeTab === 'factures' && (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-xl font-bold text-gray-800 mb-2">{t('quotes.invoicesSection')}</h3>
            <p className="text-gray-600">{t('quotes.invoicesComingSoon')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
