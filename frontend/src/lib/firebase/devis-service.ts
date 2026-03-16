/**
 * Service de gestion des devis
 * CRUD operations pour la collection 'devis'
 * Modèle Qonto-style avec prévisualisation temps réel
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  increment,
  arrayUnion,
} from 'firebase/firestore';
import { db } from './config';
import type { 
  Devis, 
  CreateDevis, 
  UpdateDevis,
  DevisStatut,
} from '@/types/devis';
import { notifyClientDevisRecu, createNotification } from './notification-service';
import { trackDevisEnvoye, trackDevisAccepte, trackDevisRefuse } from './artisan-stats-service';

const COLLECTION_NAME = 'devis';

/**
 * Génère le prochain numéro de devis pour l'artisan
 * Supporte les variantes (A, B, C) pour les devis alternatifs
 * NORME BTP : Les variantes d'un même projet partagent le même numéro de base
 * 
 * LOGIQUE PROGRESSIVE :
 * - 1er devis pour une demande : DV-2026-00005 (sans lettre)
 * - 2e devis pour la MÊME demande : DV-2026-00005-A (transforme le 1er) et DV-2026-00005-B (nouveau)
 * - 3e devis : DV-2026-00005-C, etc.
 */
export async function genererProchainNumeroDevis(
  artisanId: string, 
  demandeId?: string,
  varianteLettreReference?: string,
  varianteGroupe?: string
): Promise<string> {
  const anneeEnCours = new Date().getFullYear();
  
  let numeroBase: string;
  
  // PRIORITÉ 1 : Si demandeId fourni, vérifier s'il existe déjà des devis pour cette demande
  if (demandeId) {
    const qDemande = query(
      collection(db, COLLECTION_NAME),
      where('artisanId', '==', artisanId),
      where('demandeId', '==', demandeId)
    );
    
    const demandeSnapshot = await getDocs(qDemande);
    if (!demandeSnapshot.empty) {
      // Il existe déjà un/des devis pour cette demande → réutiliser le numéro de base
      const premierDevisDemande = demandeSnapshot.docs[0].data().numeroDevis as string;
      // Extraire le numéro de base (enlever la lettre de variante si présente)
      numeroBase = premierDevisDemande.split('-').slice(0, 3).join('-');
      console.log('♻️ Réutilisation numéro base de la demande:', numeroBase);
    } else {
      // Premier devis pour cette demande → générer nouveau numéro
      numeroBase = await genererNouveauNumeroBase(artisanId, anneeEnCours);
      console.log('🆕 Nouveau numéro de base pour la demande:', numeroBase);
    }
  }
  // PRIORITÉ 2 : Si varianteGroupe fourni (ancien système), réutiliser le numéro du groupe
  else if (varianteGroupe) {
    const qGroupe = query(
      collection(db, COLLECTION_NAME),
      where('artisanId', '==', artisanId),
      where('varianteGroupe', '==', varianteGroupe)
    );
    
    const groupeSnapshot = await getDocs(qGroupe);
    if (!groupeSnapshot.empty) {
      const premierDevisGroupe = groupeSnapshot.docs[0].data().numeroDevis as string;
      numeroBase = premierDevisGroupe.split('-').slice(0, 3).join('-');
      console.log('♻️ Réutilisation numéro base groupe:', numeroBase);
    } else {
      numeroBase = await genererNouveauNumeroBase(artisanId, anneeEnCours);
    }
  } 
  // PRIORITÉ 3 : Nouveau projet indépendant
  else {
    numeroBase = await genererNouveauNumeroBase(artisanId, anneeEnCours);
    console.log('🆕 Nouveau numéro de base:', numeroBase);
  }
  
  // Si c'est une variante, ajouter la lettre de référence
  if (varianteLettreReference) {
    return `${numeroBase}-${varianteLettreReference}`;
  }
  
  return numeroBase;
}

/**
 * Génère un nouveau numéro de base unique pour l'année en cours
 * Compte uniquement les numéros de base uniques (pas les variantes)
 */
async function genererNouveauNumeroBase(artisanId: string, anneeEnCours: number): Promise<string> {
  const q = query(
    collection(db, COLLECTION_NAME),
    where('artisanId', '==', artisanId)
  );
  
  const querySnapshot = await getDocs(q);
  const devisAnneeEnCours = querySnapshot.docs.filter(doc => {
    const numero = doc.data().numeroDevis as string;
    return numero?.startsWith(`DV-${anneeEnCours}-`);
  });
  
  // Compter uniquement les numéros de base uniques (pas les variantes)
  const numerosBaseUniques = new Set(
    devisAnneeEnCours.map(doc => {
      const numero = doc.data().numeroDevis as string;
      // Extraire le numéro de base (DV-2026-00014)
      return numero.split('-').slice(0, 3).join('-');
    })
  );
  
  const dernierNumero = numerosBaseUniques.size;
  return `DV-${anneeEnCours}-${String(dernierNumero + 1).padStart(5, '0')}`;
}

/**
 * Créer un nouveau devis
 */
export async function createDevis(
  devisData: CreateDevis
): Promise<Devis> {
  // ⛔ VALIDATION : Bloquer la création si un devis a déjà été refusé définitivement pour cette demande
  if (devisData.demandeId) {
    const devisExistants = await getDocs(
      query(
        collection(db, COLLECTION_NAME),
        where('demandeId', '==', devisData.demandeId),
        where('artisanId', '==', devisData.artisanId),
        where('statut', '==', 'refuse'),
        where('typeRefus', '==', 'definitif')
      )
    );

    if (!devisExistants.empty) {
      const refusDevis = devisExistants.docs[0].data();
      throw new Error(
        `⛔ Impossible de créer un nouveau devis.\n\n` +
        `Le client a refusé définitivement votre proposition (${refusDevis.numeroDevis}).\n` +
        `Motif : "${refusDevis.motifRefus || 'Non précisé'}"\n\n` +
        `Cette décision est finale. Vous ne pouvez pas renvoyer de devis pour cette demande.`
      );
    }
  }

  const devisRef = collection(db, COLLECTION_NAME);
  
  // Générer le numéro de devis (avec lettre de variante si applicable)
  // PASSE demandeId en PRIORITÉ pour système de variantes progressif
  const numeroDevis = await genererProchainNumeroDevis(
    devisData.artisanId,
    devisData.demandeId,
    devisData.varianteLettreReference,
    devisData.varianteGroupe
  );
  
  const maintenant = Timestamp.now();
  
  // Nettoyer les champs undefined (Firestore les rejette)
  const cleanDevisData: any = Object.fromEntries(
    Object.entries(devisData).filter(([, v]) => v !== undefined)
  );

  const newDevis = {
    ...cleanDevisData,
    numeroDevis,
    statut: devisData.statut || 'brouillon' as DevisStatut,
    dateCreation: maintenant,
    dateModification: maintenant,
    historiqueStatuts: [
      {
        statut: devisData.statut || 'genere' as DevisStatut,
        date: maintenant,
        commentaire: 'Création du devis',
      }
    ],
  };

  const docRef = await addDoc(devisRef, newDevis);
  
  const devisId = docRef.id;
  
  // Si c'est une révision, marquer l'ancien devis comme remplacé
  if (devisData.devisOriginalId) {
    try {
      const ancienDevisRef = doc(db, COLLECTION_NAME, devisData.devisOriginalId);
      await updateDoc(ancienDevisRef, {
        statut: 'remplace' as DevisStatut,
        devisRevisionId: devisId,
        dateModification: maintenant,
      });
      console.log(`✅ Ancien devis ${devisData.devisOriginalId} marqué comme remplacé par ${devisId}`);
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour de l\'ancien devis:', error);
      // Ne pas bloquer la création si la mise à jour échoue
    }
  }
  
  // Mettre à jour le compteur devisRecus UNIQUEMENT si le devis est envoyé (pas brouillon)
  if (devisData.demandeId && newDevis.statut === 'envoye') {
    try {
      const demandeRef = doc(db, 'demandes', devisData.demandeId);
      await updateDoc(demandeRef, {
        devisRecus: increment(1),
        // Ajouter l'artisan à artisansMatches pour qu'il garde l'accès lecture à la demande
        artisansMatches: arrayUnion(devisData.artisanId),
      });
      // Vérifier si le quota de 5 devis est atteint → passer en quota_atteint
      const demandeSnap = await getDoc(demandeRef);
      const demandeData = demandeSnap.data();
      if (demandeData && (demandeData.devisRecus || 0) >= 5 && demandeData.statut !== 'quota_atteint') {
        await updateDoc(demandeRef, { statut: 'quota_atteint' });
        console.log('🔒 Quota 5 devis atteint pour demande:', devisData.demandeId);
      }
    } catch (error) {
      console.error('Erreur mise à jour compteur devisRecus:', error);
      // Ne pas bloquer la création du devis si la mise à jour échoue
    }
  }
  
  // Notifier le client si le devis est envoyé (pas un brouillon)
  if (newDevis.statut === 'envoye') {
    try {
      console.log('🔔 Tentative d\'envoi notification au client:', devisData.clientId);
      console.log('📋 Données artisan:', devisData.artisan);
      
      // Construire le nom de l'artisan avec fallback
      let artisanNom = 'Un artisan';
      if (devisData.artisan.prenom && devisData.artisan.nom) {
        artisanNom = `${devisData.artisan.prenom} ${devisData.artisan.nom}`;
      } else if (devisData.artisan.raisonSociale) {
        artisanNom = devisData.artisan.raisonSociale;
      }
      
      console.log('👤 Nom artisan utilisé:', artisanNom);
      
      await notifyClientDevisRecu(
        devisData.clientId,
        devisId,
        artisanNom,
        numeroDevis
      );
      console.log('✅ Notification envoyée au client:', devisData.clientId, 'pour devis:', numeroDevis);
      
      // 🆕 TRACKING: Enregistrer l'envoi du devis pour le scoring
      if (devisData.demandeId) {
        try {
          // Récupérer la date de création de la demande pour calculer le délai
          const demandeRef = doc(db, 'demandes', devisData.demandeId);
          const demandeSnap = await getDoc(demandeRef);
          if (demandeSnap.exists()) {
            const demande = demandeSnap.data();
            await trackDevisEnvoye(
              devisData.artisanId,
              demande.dateCreation as Timestamp,
              maintenant
            );
            console.log('📊 Stats artisan mises à jour : devis envoyé');
          }
        } catch (error) {
          console.error('⚠️ Erreur tracking devis envoyé:', error);
          // Ne pas bloquer si le tracking échoue
        }
      }
    } catch (error) {
      console.error('❌ Erreur envoi notification client:', error);
      console.error('Stack:', error instanceof Error ? error.stack : 'Pas de stack');
      // Ne pas bloquer la création si la notification échoue
    }
  }
  
  return {
    ...newDevis,
    id: devisId,
  } as Devis;
}

/**
 * Mettre à jour un devis existant
 */
export async function updateDevis(
  devisId: string,
  updates: UpdateDevis
): Promise<void> {
  const devisRef = doc(db, COLLECTION_NAME, devisId);
  
  // Récupérer le devis actuel pour vérifier le changement de statut
  const devisDoc = await getDoc(devisRef);
  const devisActuel = devisDoc.data() as Devis;
  
  // Supprimer les champs undefined pour éviter l'erreur Firestore
  const cleanUpdates: any = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );

  const updateData: any = {
    ...cleanUpdates,
    dateModification: Timestamp.now(),
  };
  
  // Si le statut change, ajouter à l'historique
  if (updates.statut) {
    const commentaires: Record<string, string> = {
      envoye: 'Devis envoyé au client',
      accepte: 'Devis accepté par le client',
      refuse: 'Devis refusé par le client',
      expire: 'Devis expiré',
      genere: 'Devis généré',
      brouillon: 'Brouillon sauvegardé',
    };
    const entree: any = {
      statut: updates.statut,
      date: Timestamp.now(),
    };
    const commentaire = commentaires[updates.statut];
    if (commentaire) entree.commentaire = commentaire;

    updateData.historiqueStatuts = [
      ...(devisActuel.historiqueStatuts || []),
      entree,
    ];
    
    // Ajouter la date selon le statut
    if (updates.statut === 'envoye') {
      updateData.dateEnvoi = Timestamp.now();
      
      // Incrémenter devisRecus si le devis passe de brouillon à envoyé
      if (devisActuel.statut === 'genere' && devisActuel.demandeId) {
        try {
          const demandeRef = doc(db, 'demandes', devisActuel.demandeId);
          await updateDoc(demandeRef, {
            devisRecus: increment(1)
          });
          console.log('✅ Compteur devisRecus incrémenté pour demande:', devisActuel.demandeId);
          // Vérifier si le quota de 5 devis est atteint → passer en quota_atteint
          const demandeSnap = await getDoc(demandeRef);
          const demandeData = demandeSnap.data();
          if (demandeData && (demandeData.devisRecus || 0) >= 5 && demandeData.statut !== 'quota_atteint') {
            await updateDoc(demandeRef, { statut: 'quota_atteint' });
            console.log('🔒 Quota 5 devis atteint pour demande:', devisActuel.demandeId);
          }
        } catch (error) {
          console.error('Erreur mise à jour compteur devisRecus:', error);
        }
      }
      
      // Envoyer email au client
      try {
        const { getUserById } = await import('./user-service');
        const { getArtisanById } = await import('./artisan-service');
        const client = await getUserById(devisActuel.clientId);
        const artisan = await getArtisanById(devisActuel.artisanId);
        
        if (client?.email && artisan?.businessName) {
          const { sendDevisReceivedEmail } = await import('./email-notification-service');
          const expirationDate = devisActuel.dateValidite?.toDate().toLocaleDateString('fr-FR') || 'Non définie';
          await sendDevisReceivedEmail(
            client.email,
            `${client.prenom} ${client.nom}`,
            artisan.businessName,
            devisActuel.montantTTC,
            expirationDate
          );
          console.log(`✅ Email devis reçu envoyé à ${client.email}`);
        }
      } catch (emailError) {
        console.error('⚠️ Erreur envoi email devis reçu:', emailError);
      }
    } else if (updates.statut === 'paye') {
      // 🆕 PAIEMENT : Annuler les autres variantes quand une est payée
      updateData.datePaiement = Timestamp.now();
      updateData.dateDerniereNotification = Timestamp.now();
      
      // 🆕 WALLET : Enregistrer le montant en séquestre
      try {
        const { recordPaiementClient } = await import('./wallet-service');
        const { getUserById } = await import('./user-service');
        const client = await getUserById(devisActuel.clientId);
        const clientNom = client ? `${client.prenom} ${client.nom}` : undefined;
        await recordPaiementClient(
          devisActuel.artisanId,
          devisId,   // contratId = devisId en attendant Stripe
          devisId,
          devisActuel.montantTTC,
          `devis_paye_${devisId}`,
          clientNom,
          devisActuel.numeroDevis
        );
        console.log('✅ Wallet séquestre mis à jour pour artisan:', devisActuel.artisanId);
      } catch (walletError) {
        console.error('⚠️ Erreur mise à jour wallet séquestre:', walletError);
      }

      
      // 🆕 ATTRIBUTION ARTISAN : Ajouter l'artisan à artisansMatches si pas déjà présent
      if (devisActuel.demandeId) {
        try {
          const demandeRef = doc(db, 'demandes', devisActuel.demandeId);
          await updateDoc(demandeRef, {
            artisansMatches: arrayUnion(devisActuel.artisanId),
            dateModification: Timestamp.now(),
          });
          console.log('✅ Artisan ajouté à artisansMatches (paiement):', devisActuel.artisanId);
        } catch (error) {
          console.error('⚠️ Erreur mise à jour artisansMatches (paiement):', error);
        }
      }
      
      if (devisActuel.varianteGroupe || devisActuel.demandeId) {
        await annulerAutresVariantes(
          devisId, 
          devisActuel.varianteGroupe, 
          devisActuel.demandeId
        );
      }
      
      // Envoyer emails client et artisan
      try {
        const { getUserById } = await import('./user-service');
        const { getArtisanById } = await import('./artisan-service');
        const client = await getUserById(devisActuel.clientId);
        const artisan = await getArtisanById(devisActuel.artisanId);
        const artisanUser = await getUserById(devisActuel.artisanId);
        
        // Email client
        if (client?.email && artisan?.businessName) {
          const { sendPaymentConfirmedEmail } = await import('./email-notification-service');
          await sendPaymentConfirmedEmail(
            client.email,
            `${client.prenom} ${client.nom}`,
            artisan.businessName,
            devisActuel.montantTTC
          );
          console.log(`✅ Email paiement confirmé envoyé à ${client.email}`);
        }
        
        // Email artisan
        if (artisanUser?.email && client?.prenom) {
          const { sendPaymentReceivedArtisanEmail } = await import('./email-notification-service');
          await sendPaymentReceivedArtisanEmail(
            artisanUser.email,
            `${artisanUser.prenom} ${artisanUser.nom}`,
            `${client.prenom} ${client.nom}`,
            devisActuel.montantTTC
          );
          console.log(`✅ Email paiement reçu envoyé à ${artisanUser.email}`);
        }
      } catch (emailError) {
        console.error('⚠️ Erreur envoi emails paiement:', emailError);
      }
    } else if (updates.statut === 'refuse') {
      updateData.dateRefus = Timestamp.now();
      updateData.dateDerniereNotification = Timestamp.now(); // Notifier l'artisan
      
      // Décrémenter devisRecus si le devis était envoyé (libère une place pour un autre devis)
      if (devisActuel.demandeId && devisActuel.statut === 'envoye') {
        try {
          const demandeRef = doc(db, 'demandes', devisActuel.demandeId);
          await updateDoc(demandeRef, {
            devisRecus: increment(-1)
          });
          // Si la demande était quota_atteint, la remettre en publiee (place libérée)
          const demandeSnap = await getDoc(demandeRef);
          const demandeData = demandeSnap.data();
          if (demandeData?.statut === 'quota_atteint' && (demandeData.devisRecus || 0) < 5) {
            await updateDoc(demandeRef, { statut: 'publiee' });
            console.log('🔓 Quota libéré, demande remise en publiee:', devisActuel.demandeId);
          }
          console.log('✅ Compteur devisRecus décrémenté pour demande:', devisActuel.demandeId);
        } catch (error) {
          console.error('Erreur décrémentation compteur devisRecus:', error);
        }
      }
      
      // 🆕 TRACKING: Enregistrer le refus pour le scoring
      try {
        await trackDevisRefuse(devisActuel.artisanId);
        console.log('📊 Stats artisan mises à jour : devis refusé');
      } catch (error) {
        console.error('⚠️ Erreur tracking devis refusé:', error);
      }
      
      // Le motifRefus doit être passé dans updates si fourni
    }
  }
  
  await updateDoc(devisRef, updateData);
}

/**
 * Marquer un devis avec une notification (pour affichage badge "NOUVEAU")
 * À appeler quand un événement important se produit (acceptation, refus, etc.)
 */
export async function marquerDevisAvecNotification(devisId: string): Promise<void> {
  const devisRef = doc(db, COLLECTION_NAME, devisId);
  await updateDoc(devisRef, {
    dateDerniereNotification: Timestamp.now(),
    dateModification: Timestamp.now(),
  });
}

/**
 * Annuler toutes les autres variantes quand une est acceptée/payée
 * Supporte 2 systèmes : ancien (varianteGroupe) + moderne (demandeId)
 */
async function annulerAutresVariantes(
  devisAccepteId: string, 
  varianteGroupe?: string,
  demandeId?: string
): Promise<void> {
  try {
    let querySnapshot;
    
    // PRIORITÉ 1 : Utiliser demandeId (système moderne)
    if (demandeId) {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('demandeId', '==', demandeId)
      );
      querySnapshot = await getDocs(q);
      console.log(`🔍 Recherche variantes par demandeId: ${demandeId} → ${querySnapshot.docs.length} devis trouvés`);
    }
    // FALLBACK : Utiliser varianteGroupe (ancien système)
    else if (varianteGroupe) {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('varianteGroupe', '==', varianteGroupe)
      );
      querySnapshot = await getDocs(q);
      console.log(`🔍 Recherche variantes par varianteGroupe: ${varianteGroupe} → ${querySnapshot.docs.length} devis trouvés`);
    }
    // Aucun critère fourni
    else {
      console.warn('⚠️ Aucun critère fourni pour annuler variantes (ni demandeId ni varianteGroupe)');
      return;
    }
    
    const maintenant = Timestamp.now();
    
    // Annuler TOUS les autres devis du même groupe (peu importe leur statut)
    const updatePromises = querySnapshot.docs
      .filter(doc => {
        const statut = doc.data().statut;
        // Annuler uniquement si :
        // 1. Ce n'est PAS le devis qui vient d'être payé
        // 2. Le devis n'est PAS déjà annulé (éviter update inutile)
        // 3. Le devis n'est PAS déjà payé (ne jamais annuler un devis payé !)
        return doc.id !== devisAccepteId && statut !== 'annule' && statut !== 'paye';
      })
      .map(doc => {
        const statutActuel = doc.data().statut;
        console.log(`🗑️ Annulation variante ${doc.data().numeroDevis} (statut: ${statutActuel})`);
        
        return updateDoc(doc.ref, {
          statut: 'annule' as DevisStatut,
          dateModification: maintenant,
          historiqueStatuts: [
            ...(doc.data().historiqueStatuts || []),
            {
              statut: 'annule' as DevisStatut,
              date: maintenant,
              commentaire: `Annulé automatiquement (variante ${querySnapshot.docs.find(d => d.id === devisAccepteId)?.data().numeroDevis} payée)`,
            }
          ]
        });
      });
    
    await Promise.all(updatePromises);
    console.log(`✅ ${updatePromises.length} variante(s) alternative(s) annulée(s) automatiquement`);
  } catch (error) {
    console.error('❌ Erreur lors de l\'annulation des autres variantes:', error);
    // Ne pas bloquer l'acceptation du devis si l'annulation échoue
  }
}

/**
 * Mettre à jour uniquement le statut d'un devis
 * Fonction simplifiée pour usage externe (ex: litige-service.ts)
 * ⚠️ Pour changements de statut complexes (accepté, refusé, etc.), utiliser updateDevis()
 */
export async function updateDevisStatus(
  devisId: string,
  statut: DevisStatut
): Promise<void> {
  try {
    const devisRef = doc(db, COLLECTION_NAME, devisId);
    const devisDoc = await getDoc(devisRef);
    
    if (!devisDoc.exists()) {
      throw new Error('Devis introuvable');
    }
    
    const devisActuel = devisDoc.data() as Devis;
    
    await updateDoc(devisRef, {
      statut,
      dateModification: Timestamp.now(),
      historiqueStatuts: [
        ...(devisActuel.historiqueStatuts || []),
        {
          statut,
          date: Timestamp.now(),
          commentaire: statut === 'litige' ? 'Litige déclaré sur ce devis' : undefined,
        }
      ]
    });
    
    console.log(`✅ Statut devis mis à jour : ${devisActuel.statut} → ${statut}`);
  } catch (error) {
    console.error('Erreur updateDevisStatus:', error);
    throw error;
  }
}

/**
 * Récupérer un devis par son ID
 */
export async function getDevisById(devisId: string): Promise<Devis | null> {
  const devisRef = doc(db, COLLECTION_NAME, devisId);
  const devisDoc = await getDoc(devisRef);
  
  if (!devisDoc.exists()) {
    return null;
  }
  
  return {
    id: devisDoc.id,
    ...devisDoc.data(),
  } as Devis;
}

/**
 * Récupérer tous les devis d'un artisan
 */
export async function getDevisByArtisan(
  artisanId: string,
  statut?: DevisStatut
): Promise<Devis[]> {
  let q = query(
    collection(db, COLLECTION_NAME),
    where('artisanId', '==', artisanId)
  );
  
  if (statut) {
    q = query(q, where('statut', '==', statut));
  }
  
  const querySnapshot = await getDocs(q);
  const devis = querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  } as Devis));
  
  // Tri côté client pour éviter index composite
  return devis.sort((a, b) => {
    const dateA = a.dateCreation?.toMillis() || 0;
    const dateB = b.dateCreation?.toMillis() || 0;
    return dateB - dateA; // Plus récent en premier
  });
}

/**
 * Récupérer tous les devis d'un client
 */
export async function getDevisByClient(
  clientId: string,
  statut?: DevisStatut
): Promise<Devis[]> {
  let q = query(
    collection(db, COLLECTION_NAME),
    where('clientId', '==', clientId)
  );
  
  if (statut) {
    q = query(q, where('statut', '==', statut));
  }
  
  const querySnapshot = await getDocs(q);
  const devis = querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  } as Devis));
  
  // Tri côté client
  return devis.sort((a, b) => {
    const dateA = a.dateCreation?.toMillis() || 0;
    const dateB = b.dateCreation?.toMillis() || 0;
    return dateB - dateA;
  });
}

/**
 * Récupérer tous les devis associés à une demande
 */
export async function getDevisByDemande(demandeId: string): Promise<Devis[]> {
  const q = query(
    collection(db, COLLECTION_NAME),
    where('demandeId', '==', demandeId)
  );
  
  const querySnapshot = await getDocs(q);
  const devis = querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  } as Devis));
  
  // Tri côté client
  return devis.sort((a, b) => {
    const dateA = a.dateCreation?.toMillis() || 0;
    const dateB = b.dateCreation?.toMillis() || 0;
    return dateB - dateA;
  });
}

/**
 * Récupérer toutes les variantes d'un groupe de devis alternatifs
 */
export async function getVariantesDevis(varianteGroupe: string): Promise<Devis[]> {
  const q = query(
    collection(db, COLLECTION_NAME),
    where('varianteGroupe', '==', varianteGroupe)
  );
  
  const querySnapshot = await getDocs(q);
  const devis = querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  } as Devis));
  
  // Trier par lettre de référence (A, B, C...)
  return devis.sort((a, b) => {
    const lettreA = a.varianteLettreReference || '';
    const lettreB = b.varianteLettreReference || '';
    return lettreA.localeCompare(lettreB);
  });
}

/**
 * Supprimer un devis (seulement si brouillon)
 */
export async function deleteDevis(devisId: string): Promise<void> {
  const devisRef = doc(db, COLLECTION_NAME, devisId);
  const devisDoc = await getDoc(devisRef);
  
  if (!devisDoc.exists()) {
    throw new Error('Devis introuvable');
  }
  
  const devis = devisDoc.data() as Devis;
  
  if (devis.statut !== 'genere') {
    throw new Error('Seuls les devis générés peuvent être supprimés');
  }
  
  await deleteDoc(devisRef);
}

/**
 * Vérifier si un devis est expiré
 */
export function isDevisExpire(devis: Devis): boolean {
  if (devis.statut === 'en_attente_paiement' || devis.statut === 'paye' || devis.statut === 'refuse') {
    return false; // Devis finalisé
  }
  
  const maintenant = new Date();
  const dateValidite = devis.dateValidite.toDate();
  
  return maintenant > dateValidite;
}

/**
 * Marquer automatiquement les devis expirés
 */
export async function marquerDevisExpires(artisanId: string): Promise<number> {
  const devisEnvoyes = await getDevisByArtisan(artisanId, 'envoye');
  let compteur = 0;
  
  for (const devis of devisEnvoyes) {
    if (isDevisExpire(devis)) {
      await updateDevis(devis.id, { statut: 'expire' });
      compteur++;
    }
  }
  
  return compteur;
}

/**
 * Dupliquer un devis existant en mode brouillon
 * Utile pour créer une nouvelle version après refus
 */
export async function dupliquerDevis(devisId: string): Promise<string> {
  const devisOriginal = await getDevisById(devisId);
  
  if (!devisOriginal) {
    throw new Error('Devis introuvable');
  }
  
  // Créer un nouveau devis basé sur l'original
  const nouveauDevis: CreateDevis = {
    demandeId: devisOriginal.demandeId,
    clientId: devisOriginal.clientId,
    artisanId: devisOriginal.artisanId,
    statut: 'genere',
    dateValidite: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)), // +30 jours
    client: { ...devisOriginal.client },
    artisan: { ...devisOriginal.artisan },
    titre: `${devisOriginal.titre} (Révision)`,
    description: devisOriginal.description,
    lignes: devisOriginal.lignes.map(ligne => ({ ...ligne })),
    totaux: { ...devisOriginal.totaux },
    delaiRealisation: devisOriginal.delaiRealisation,
    ...(devisOriginal.dateDebutPrevue && { dateDebutPrevue: devisOriginal.dateDebutPrevue }),
    conditions: devisOriginal.conditions,
    notes: `Révision du devis ${devisOriginal.numeroDevis}${devisOriginal.motifRefus ? ` - Motif refus précédent: ${devisOriginal.motifRefus}` : ''}`,
    numeroDevis: '', // Sera généré automatiquement
  };
  
  const devis = await createDevis(nouveauDevis);
  
  return devis.id;
}

// ============================================
// GESTION DU CYCLE DE VIE CONTRAT
// (Remplace la collection 'contrats' - Devis signé = Contrat juridique)
// ============================================

/**
 * Artisan déclare le début des travaux
 * Statut: paye → en_cours
 */
export async function declarerDebutTravaux(devisId: string, artisanId: string): Promise<void> {
  const devisRef = doc(db, COLLECTION_NAME, devisId);
  const devisSnap = await getDoc(devisRef);
  
  if (!devisSnap.exists()) {
    throw new Error('Devis introuvable');
  }
  
  const devis = { id: devisSnap.id, ...devisSnap.data() } as Devis;
  
  // Vérifications
  if (devis.artisanId !== artisanId) {
    throw new Error('Non autorisé');
  }
  
  if (devis.statut !== 'paye') {
    throw new Error(`Impossible de démarrer les travaux (statut actuel: ${devis.statut})`);
  }
  
  // Mettre à jour
  await updateDoc(devisRef, {
    statut: 'en_cours',
    'travaux.dateDebut': Timestamp.now(),
    dateModification: Timestamp.now(),
    historiqueStatuts: [
      ...(devis.historiqueStatuts || []),
      {
        statut: 'en_cours' as DevisStatut,
        date: Timestamp.now(),
        commentaire: 'Début des travaux déclaré par l\'artisan',
      },
    ],
  });
  
  // Notification client
  await notifyClientDevisRecu(devis.clientId, devisId, {
    type: 'travaux_demarres',
    title: 'Travaux démarrés',
    message: `${devis.artisan.raisonSociale} a démarré les travaux`,
  });
}

/**
 * Artisan déclare la fin des travaux
 * Statut: en_cours → travaux_termines
 * Déclenche countdown 7 jours pour validation client
 */
export async function declarerFinTravaux(devisId: string, artisanId: string): Promise<void> {
  const devisRef = doc(db, COLLECTION_NAME, devisId);
  const devisSnap = await getDoc(devisRef);
  
  if (!devisSnap.exists()) {
    throw new Error('Devis introuvable');
  }
  
  const devis = { id: devisSnap.id, ...devisSnap.data() } as Devis;
  
  // Vérifications
  if (devis.artisanId !== artisanId) {
    throw new Error('Non autorisé');
  }
  
  if (devis.statut !== 'en_cours') {
    throw new Error(`Impossible de terminer les travaux (statut actuel: ${devis.statut})`);
  }
  
  const dateValidationAuto = Timestamp.fromDate(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // +7 jours
  );
  
  // Mettre à jour
  await updateDoc(devisRef, {
    statut: 'travaux_termines',
    'travaux.dateFin': Timestamp.now(),
    'travaux.dateValidationAuto': dateValidationAuto,
    dateModification: Timestamp.now(),
    historiqueStatuts: [
      ...(devis.historiqueStatuts || []),
      {
        statut: 'travaux_termines' as DevisStatut,
        date: Timestamp.now(),
        commentaire: 'Fin des travaux déclarée par l\'artisan',
      },
    ],
  });
  
  // Notification client
  await notifyClientDevisRecu(devis.clientId, devisId, {
    type: 'travaux_termines',
    title: 'Travaux terminés',
    message: `${devis.artisan.raisonSociale} a terminé les travaux. Vous avez 7 jours pour valider ou signaler un problème.`,
  });
  
  // Envoyer email au client
  try {
    const { getUserById } = await import('./user-service');
    const { getArtisanById } = await import('./artisan-service');
    const client = await getUserById(devis.clientId);
    const artisan = await getArtisanById(devis.artisanId);
    
    if (client?.email && artisan?.businessName) {
      const { sendTravauxTerminesEmail } = await import('./email-notification-service');
      const dateValidation = dateValidationAuto.toDate().toLocaleDateString('fr-FR');
      await sendTravauxTerminesEmail(
        client.email,
        `${client.prenom} ${client.nom}`,
        artisan.businessName,
        dateValidation
      );
      console.log(`✅ Email travaux terminés envoyé à ${client.email}`);
    }
  } catch (emailError) {
    console.error('⚠️ Erreur envoi email travaux terminés:', emailError);
  }
}

/**
 * Client valide les travaux
 * Statut: travaux_termines → termine_valide
 * Libère l'escrow (capture Stripe)
 */
export async function validerTravaux(devisId: string, clientId: string): Promise<void> {
  const devisRef = doc(db, COLLECTION_NAME, devisId);
  const devisSnap = await getDoc(devisRef);
  
  if (!devisSnap.exists()) {
    throw new Error('Devis introuvable');
  }
  
  const devis = { id: devisSnap.id, ...devisSnap.data() } as Devis;
  
  // Vérifications
  if (devis.clientId !== clientId) {
    throw new Error('Non autorisé');
  }
  
  if (devis.statut !== 'travaux_termines') {
    throw new Error(`Impossible de valider (statut actuel: ${devis.statut})`);
  }
  
  // Mettre à jour
  await updateDoc(devisRef, {
    statut: 'termine_valide',
    'travaux.dateValidationClient': Timestamp.now(),
    'paiement.statut': 'libere',
    'paiement.stripe.captureDate': Timestamp.now(),
    dateModification: Timestamp.now(),
    historiqueStatuts: [
      ...(devis.historiqueStatuts || []),
      {
        statut: 'termine_valide' as DevisStatut,
        date: Timestamp.now(),
        commentaire: 'Travaux validés par le client',
      },
    ],
  });
  
  // TODO: Appeler API backend pour capturer le paiement Stripe
  // await fetch('/api/v1/payments/capture', { ... })
  
  // Notification artisan
  await notifyClientDevisRecu(devis.artisanId, devisId, {
    type: 'travaux_valides',
    title: 'Travaux validés !',
    message: `${devis.client.prenom} ${devis.client.nom} a validé les travaux. Le paiement sera transféré sous 24-48h.`,
  });

  // Notification client pour l'inviter à donner un avis
  await notifyClientDevisRecu(devis.clientId, devisId, {
    type: 'demande_avis_express',
    title: '⭐ Donnez votre avis !',
    message: `Aidez la communauté en partageant votre expérience avec ${devis.artisan?.businessName || 'cet artisan'}.`,
  });
  
  // Envoyer emails
  try {
    const { getUserById } = await import('./user-service');
    const { getArtisanById } = await import('./artisan-service');
    const client = await getUserById(devis.clientId);
    const artisan = await getArtisanById(devis.artisanId);
    const artisanUser = await getUserById(devis.artisanId);
    
    // Email artisan
    if (artisanUser?.email && artisan?.businessName) {
      const { sendPaiementTransfereEmail } = await import('./email-notification-service');
      await sendPaiementTransfereEmail(
        artisanUser.email,
        `${artisanUser.prenom} ${artisanUser.nom}`,
        devis.montantTTC
      );
      console.log(`✅ Email paiement transféré envoyé à ${artisanUser.email}`);
    }
    
    // Email client (validation manuelle)
    if (client?.email && artisan?.businessName) {
      const { sendValidationAutomatiqueClientEmail } = await import('./email-notification-service');
      await sendValidationAutomatiqueClientEmail(
        client.email,
        `${client.prenom} ${client.nom}`,
        artisan.businessName
      );
      console.log(`✅ Email validation envoyé au client ${client.email}`);
    }
  } catch (emailError) {
    console.error('⚠️ Erreur envoi emails validation:', emailError);
  }
}

/**
 * Client signale un litige
 * Statut: travaux_termines → litige
 * Bloque l'escrow en attente de médiation
 */
export async function signalerLitige(
  devisId: string,
  clientId: string,
  motif: string
): Promise<void> {
  const devisRef = doc(db, COLLECTION_NAME, devisId);
  const devisSnap = await getDoc(devisRef);
  
  if (!devisSnap.exists()) {
    throw new Error('Devis introuvable');
  }
  
  const devis = { id: devisSnap.id, ...devisSnap.data() } as Devis;
  
  // Vérifications
  if (devis.clientId !== clientId) {
    throw new Error('Non autorisé');
  }
  
  const statutsAutorisesLitige: DevisStatut[] = ['paye', 'en_cours', 'travaux_termines'];
  if (!statutsAutorisesLitige.includes(devis.statut)) {
    throw new Error(`Impossible de signaler un litige (statut actuel: ${devis.statut}). Le litige est possible uniquement après paiement.`);
  }
  
  // Mettre à jour
  await updateDoc(devisRef, {
    statut: 'litige',
    statutAvantLitige: devis.statut,  // Mémoriser pour restauration si litige abandonné
    'travaux.litige': {
      declarePar: 'client',
      motif,
      date: Timestamp.now(),
      statut: 'ouvert',
    },
    dateModification: Timestamp.now(),
    historiqueStatuts: [
      ...(devis.historiqueStatuts || []),
      {
        statut: 'litige' as DevisStatut,
        date: Timestamp.now(),
        commentaire: `Litige signalé par le client: ${motif}`,
      },
    ],
  });
  
  // Notification artisan + admin
  await notifyClientDevisRecu(devis.artisanId, devisId, {
    type: 'litige_ouvert',
    title: '⚠️ Litige signalé',
    message: `${devis.client.prenom} ${devis.client.nom} a signalé un problème. Un médiateur va être contacté.`,
  });
  
  // Envoyer emails client et artisan
  try {
    const { getUserById } = await import('./user-service');
    const { getArtisanById } = await import('./artisan-service');
    const client = await getUserById(devis.clientId);
    const artisan = await getArtisanById(devis.artisanId);
    const artisanUser = await getUserById(devis.artisanId);
    
    // Email client
    if (client?.email && artisan?.businessName) {
      const { sendLitigeEnregistreClientEmail } = await import('./email-notification-service');
      await sendLitigeEnregistreClientEmail(
        client.email,
        `${client.prenom} ${client.nom}`,
        artisan.businessName
      );
      console.log(`✅ Email litige enregistré envoyé au client ${client.email}`);
    }
    
    // Email artisan
    if (artisanUser?.email && client?.prenom) {
      const { sendLitigeSignaleArtisanEmail } = await import('./email-notification-service');
      await sendLitigeSignaleArtisanEmail(
        artisanUser.email,
        `${artisanUser.prenom} ${artisanUser.nom}`,
        `${client.prenom} ${client.nom}`
      );
      console.log(`✅ Email litige signalé envoyé à l'artisan ${artisanUser.email}`);
    }
  } catch (emailError) {
    console.error('⚠️ Erreur envoi emails litige:', emailError);
  }
  
  // TODO: Notifier admin pour médiation
}

/**
 * Validation automatique après 7 jours (Cloud Function)
 * Statut: travaux_termines → termine_auto_valide
 * Libère l'escrow automatiquement
 */
export async function validerAutomatiquementTravaux(devisId: string): Promise<void> {
  const devisRef = doc(db, COLLECTION_NAME, devisId);
  const devisSnap = await getDoc(devisRef);
  
  if (!devisSnap.exists()) {
    throw new Error('Devis introuvable');
  }
  
  const devis = { id: devisSnap.id, ...devisSnap.data() } as Devis;
  
  if (devis.statut !== 'travaux_termines') {
    throw new Error(`Validation auto impossible (statut: ${devis.statut})`);
  }
  
  // Mettre à jour
  await updateDoc(devisRef, {
    statut: 'termine_auto_valide',
    'travaux.dateValidationAuto': Timestamp.now(),
    'paiement.statut': 'libere',
    'paiement.stripe.captureDate': Timestamp.now(),
    dateModification: Timestamp.now(),
    historiqueStatuts: [
      ...(devis.historiqueStatuts || []),
      {
        statut: 'termine_auto_valide' as DevisStatut,
        date: Timestamp.now(),
        commentaire: 'Travaux validés automatiquement (7 jours sans réclamation)',
      },
    ],
  });
  
  // TODO: Appeler API backend pour capturer le paiement Stripe
  
  // Notifications
  await notifyClientDevisRecu(devis.artisanId, devisId, {
    type: 'travaux_valides',
    title: 'Travaux validés automatiquement',
    message: `Le client n'a pas signalé de problème. Le paiement sera transféré sous 24-48h.`,
  });
  
  await notifyClientDevisRecu(devis.clientId, devisId, {
    type: 'validation_auto',
    title: 'Validation automatique',
    message: `Les travaux ont été validés automatiquement (délai de 7 jours écoulé).`,
  });
  
  // Envoyer emails client et artisan
  try {
    const { getUserById } = await import('./user-service');
    const { getArtisanById } = await import('./artisan-service');
    const client = await getUserById(devis.clientId);
    const artisan = await getArtisanById(devis.artisanId);
    const artisanUser = await getUserById(devis.artisanId);
    
    // Email client
    if (client?.email && artisan?.businessName) {
      const { sendValidationAutomatiqueClientEmail } = await import('./email-notification-service');
      await sendValidationAutomatiqueClientEmail(
        client.email,
        `${client.prenom} ${client.nom}`,
        artisan.businessName
      );
      console.log(`✅ Email validation auto envoyé au client ${client.email}`);
    }
    
    // Email artisan
    if (artisanUser?.email) {
      const { sendValidationAutomatiqueArtisanEmail } = await import('./email-notification-service');
      await sendValidationAutomatiqueArtisanEmail(
        artisanUser.email,
        `${artisanUser.prenom} ${artisanUser.nom}`,
        devis.montantTTC
      );
      console.log(`✅ Email validation auto envoyé à l'artisan ${artisanUser.email}`);
    }
  } catch (emailError) {
    console.error('⚠️ Erreur envoi emails validation auto:', emailError);
  }
}

/**
 * 🆕 SYSTÈME AUTOMATIQUE : Marquer les devis originaux comme "remplacés" 
 * quand une variante est payée
 * 
 * WORKFLOW :
 * 1. Identifier si le devis payé est une variante (-A, -B, -C)
 * 2. Trouver le devis original (sans lettre) de la même demande
 * 3. Marquer le devis original avec statut "remplace"
 * 4. Annuler toutes les autres variantes non payées
 * 
 * @param devisPayeId ID du devis qui vient d'être payé
 * @param numeroDevisPaye Numéro du devis payé (ex: DV-2026-00004-A)
 * @param demandeId ID de la demande concernée
 */
export async function marquerDevisOriginalCommeRemplace(
  devisPayeId: string,
  numeroDevisPaye: string,
  demandeId: string
): Promise<void> {
  try {
    console.log('🔄 Recherche devis original à remplacer pour:', numeroDevisPaye);

    // 1. Vérifier si le devis payé est une variante (contient une lettre -A, -B, etc.)
    const isVariante = /-(A|B|C|D|E|F|G|H|I|J)$/.test(numeroDevisPaye);
    
    if (!isVariante) {
      console.log('ℹ️ Devis payé est l\'original (pas de lettre de variante), aucune action nécessaire');
      return;
    }

    // 2. Extraire le numéro de base (DV-2026-00004-A → DV-2026-00004)
    const numeroBase = numeroDevisPaye.split('-').slice(0, 3).join('-');
    console.log('📋 Numéro de base extrait:', numeroBase);

    // 3. Rechercher le devis original (sans lettre) de la même demande
    const devisQuery = query(
      collection(db, COLLECTION_NAME),
      where('demandeId', '==', demandeId)
    );
    
    const devisSnapshot = await getDocs(devisQuery);
    
    // Filtrer pour trouver le devis original exact (pas de lettre de variante)
    let devisOriginalDoc = null;
    const autresVariantes: any[] = [];
    
    devisSnapshot.docs.forEach(devisDoc => {
      const devisData = devisDoc.data();
      const numDevis = devisData.numeroDevis;
      
      // Le devis qu'on vient de payer → ignorer
      if (devisDoc.id === devisPayeId) return;
      
      // Le devis original = numéro de base exact SANS lettre
      if (numDevis === numeroBase) {
        devisOriginalDoc = devisDoc;
      }
      // Autres variantes de la même demande
      else if (numDevis.startsWith(numeroBase + '-')) {
        autresVariantes.push(devisDoc);
      }
    });

    // 4. SI devis original trouvé → le marquer comme "remplacé"
    if (devisOriginalDoc) {
      const devisOriginalData = devisOriginalDoc.data();
      const devisOriginalId = devisOriginalDoc.id;
      
      console.log(`✅ Devis original trouvé: ${devisOriginalData.numeroDevis} (${devisOriginalId})`);
      
      await updateDoc(doc(db, COLLECTION_NAME, devisOriginalId), {
        statut: 'remplace',
        remplacePar: {
          devisId: devisPayeId,
          numeroDevis: numeroDevisPaye,
          date: Timestamp.now(),
        },
        dateModification: Timestamp.now(),
        historiqueStatuts: [
          ...(devisOriginalData.historiqueStatuts || []),
          {
            statut: 'remplace' as DevisStatut,
            date: Timestamp.now(),
            commentaire: `Remplacé par la variante ${numeroDevisPaye} qui a été acceptée et payée`,
          },
        ],
      });
      
      console.log(`✅ Devis original ${devisOriginalData.numeroDevis} marqué comme REMPLACÉ par ${numeroDevisPaye}`);
    } else {
      console.log('ℹ️ Aucun devis original trouvé (peut-être déjà supprimé ou n\'existe pas)');
    }

    // 5. Annuler toutes les autres variantes non finalisées
    if (autresVariantes.length > 0) {
      const batch = writeBatch(db);
      
      autresVariantes.forEach(varianteDoc => {
        const varianteData = varianteDoc.data();
        const statut = varianteData.statut;
        
        // Ne toucher que les devis non finalisés
        if (!['paye', 'annule', 'refuse', 'remplace'].includes(statut)) {
          batch.update(varianteDoc.ref, {
            statut: 'annule',
            typeRefus: 'automatique',
            motifRefus: `Variante ${numeroDevisPaye} acceptée et payée`,
            dateRefus: Timestamp.now(),
            dateModification: Timestamp.now(),
          });
        }
      });
      
      await batch.commit();
      console.log(`✅ ${autresVariantes.length} autre(s) variante(s) annulée(s) automatiquement`);
    }

  } catch (error) {
    console.error('❌ Erreur lors du marquage du devis original comme remplacé:', error);
    // Ne pas bloquer le paiement si cette opération échoue
  }
}

/**
 * Annuler un devis en attente de paiement
 * Permet au client de se désister avant le paiement
 * IMPORTANT : Ferme définitivement la demande associée (logique BTP)
 */
export async function annulerDevisParClient(
  devisId: string,
  clientId: string,
  motifAnnulation?: string
): Promise<void> {
  try {
    const devisRef = doc(db, COLLECTION_NAME, devisId);
    const devisDoc = await getDoc(devisRef);

    if (!devisDoc.exists()) {
      throw new Error('Devis introuvable');
    }

    const devis = { id: devisDoc.id, ...devisDoc.data() } as Devis;

    // Vérifier que c'est bien le client du devis
    if (devis.clientId !== clientId) {
      throw new Error('Non autorisé : ce devis ne vous appartient pas');
    }

    // Vérifier que le devis est en attente de paiement ou accepté
    if (devis.statut !== 'en_attente_paiement') {
      throw new Error(`Impossible d'annuler un devis avec le statut : ${devis.statut}`);
    }

    // Mettre à jour le devis
    await updateDoc(devisRef, {
      statut: 'annule',
      dateModification: Timestamp.now(),
      dateDerniereNotification: Timestamp.now(),
      motifAnnulation: motifAnnulation || 'Client désisté avant paiement',
      dateAnnulation: Timestamp.now(),
      historiqueStatuts: [
        ...(devis.historiqueStatuts || []),
        {
          statut: 'annule',
          date: Timestamp.now(),
          commentaire: motifAnnulation || 'Devis annulé par le client avant paiement',
        }
      ],
    });

    // 🆕 Fermer la demande associée (OPTION 1 : DEMANDE CLOSE)
    if (devis.demandeId) {
      try {
        const demandeRef = doc(db, 'demandes', devis.demandeId);
        const demandeDoc = await getDoc(demandeRef);
        
        if (demandeDoc.exists()) {
          await updateDoc(demandeRef, {
            statut: 'annulee',
            dateModification: Timestamp.now(),
            motifAnnulation: `Client s'est désisté après acceptation du devis ${devis.numeroDevis}`,
            dateAnnulation: Timestamp.now(),
          });
          console.log(`📋 Demande ${devis.demandeId} fermée suite à annulation devis`);
        }
      } catch (error) {
        console.error('⚠️ Erreur fermeture demande:', error);
        // Ne pas bloquer l'annulation du devis si la demande ne peut être fermée
      }
    }

    // Notifier l'artisan avec message détaillé
    await createNotification(devis.artisanId, {
      type: 'devis_annule',
      title: '❌ Devis annulé par le client',
      message: `Le client s'est désisté avant paiement pour le devis ${devis.numeroDevis} (${devis.totaux?.totalTTC || 0}€ TTC). La demande est close définitivement.`,
      relatedId: devisId,
      isRead: false,
    });

    console.log(`✅ Devis ${devis.numeroDevis} annulé par le client - Demande fermée`);
  } catch (error) {
    console.error('❌ Erreur lors de l\'annulation du devis:', error);
    throw error;
  }
}

/**
 * Supprime automatiquement les devis annulés de plus de 24h
 * Notifie l'artisan avant la suppression
 * @param artisanId - ID de l'artisan
 * @returns Nombre de devis supprimés
 */
export async function supprimerDevisAnulesExpires(artisanId: string): Promise<number> {
  try {
    const maintenant = Date.now();
    const VINGT_QUATRE_HEURES = 24 * 60 * 60 * 1000;
    
    // Récupérer tous les devis annulés de l'artisan
    const q = query(
      collection(db, 'devis'),
      where('artisanId', '==', artisanId),
      where('statut', '==', 'annule')
    );

    const querySnapshot = await getDocs(q);
    let compteurSuppression = 0;

    for (const docSnapshot of querySnapshot.docs) {
      const devis = docSnapshot.data() as Devis;
      const dateAnnulation = devis.dateAnnulation?.toMillis() || 0;
      const deltaTemps = maintenant - dateAnnulation;

      // Si annulé depuis plus de 24h
      if (deltaTemps > VINGT_QUATRE_HEURES) {
        console.log(`🗑️ Suppression devis annulé expiré: ${devis.numeroDevis} (${Math.floor(deltaTemps / (60 * 60 * 1000))}h)`);

        // Notifier l'artisan de la suppression
        await createNotification(artisanId, {
          type: 'devis_supprime',
          title: '🗑️ Devis annulé supprimé',
          message: `Le devis ${devis.numeroDevis} (annulé il y a plus de 24h) a été automatiquement supprimé pour optimiser votre espace.`,
          relatedId: docSnapshot.id,
          isRead: false,
        });

        // Supprimer le devis
        await deleteDoc(doc(db, 'devis', docSnapshot.id));
        compteurSuppression++;
      }
    }

    if (compteurSuppression > 0) {
      console.log(`✅ ${compteurSuppression} devis annulé(s) supprimé(s) automatiquement`);
    }

    return compteurSuppression;
  } catch (error) {
    console.error('❌ Erreur suppression devis annulés expirés:', error);
    return 0;
  }
}
