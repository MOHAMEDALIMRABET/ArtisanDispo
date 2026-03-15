'use client';

/**
 * Page de détail d'un devis côté client
 * Affiche le contenu complet avec actions Accepter/Refuser
 */

import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { doc, getDoc, updateDoc, Timestamp, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase/config';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { SignatureCanvas } from '@/components/SignatureCanvas';
import { PaymentForm, PaymentData } from '@/components/PaymentForm';
import { 
  notifyArtisanDevisAccepte, 
  notifyArtisanDevisRefuse, 
  notifyArtisanDevisRevision 
} from '@/lib/firebase/notification-service';
import { 
  validerTravaux, 
  signalerLitige 
} from '@/lib/firebase/devis-service';
import { getAvisByContratId } from '@/lib/firebase/avis-service';
import { Logo } from '@/components/ui';
import type { Devis } from '@/types/devis';
import type { Demande } from '@/types/firestore';

/**
 * Masque un email en ne montrant que les caractères après @
 * Ex: "artisan@gmail.com" → "*******@gmail.com"
 * Si shouldMask = false (devis payé), affiche l'email complet
 */
function masquerEmail(email: string, shouldMask: boolean = true): string {
  if (!email) return '';
  if (!shouldMask) return email; // Démasqué si devis payé
  
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return '*'.repeat(local.length) + '@' + domain;
}

/**
 * Masque un numéro de téléphone en ne montrant que les 2 premiers chiffres
 * Ex: "0612345678" → "06 ** ** ** **"
 * Si shouldMask = false (devis payé), affiche le numéro complet
 */
function masquerTelephoneComplet(telephone: string, shouldMask: boolean = true): string {
  if (!telephone) return '';
  if (!shouldMask) return telephone; // Démasqué si devis payé
  
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
 * Masque l'adresse en ne montrant que le code postal et la ville
 * Ex: "123 rue de la République, 75001 Paris" → "75001 Paris"
 * Ex: "15 avenue Victor Hugo 69003 Lyon" → "69003 Lyon"
 * Si shouldMask = false (devis payé), affiche l'adresse complète
 */
function masquerAdresse(adresse: string, shouldMask: boolean = true): string {
  if (!adresse) return '';
  if (!shouldMask) return adresse; // Démasqué si devis payé
  
  // Chercher un code postal (5 chiffres) n'importe où dans l'adresse
  const match = adresse.match(/(\d{5})/);
  
  if (match) {
    const codePostal = match[1];
    // Extraire tout ce qui suit le code postal (= la ville)
    const indexCodePostal = adresse.indexOf(codePostal);
    const apresCodePostal = adresse.substring(indexCodePostal + 5).trim();
    
    // Si il y a quelque chose après le code postal, c'est la ville
    if (apresCodePostal) {
      return `${codePostal} ${apresCodePostal}`;
    }
    
    // Sinon juste le code postal
    return codePostal;
  }
  
  // Si pas de code postal détecté, masquer complètement
  return '*'.repeat(adresse.length);
}

export default function ClientDevisDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [devis, setDevis] = useState<Devis | null>(null);
  const [demande, setDemande] = useState<Demande | null>(null);
  const [autresVariantes, setAutresVariantes] = useState<Devis[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRefusalModal, setShowRefusalModal] = useState(false);
  const [refusalReason, setRefusalReason] = useState('');
  const [refusalType, setRefusalType] = useState<'artisan' | 'revision'>('artisan');
  const [processing, setProcessing] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [signatureDataURL, setSignatureDataURL] = useState<string | null>(null);
  const [validationEnCours, setValidationEnCours] = useState(false);
  const [showLitigeModal, setShowLitigeModal] = useState(false);
  const [motifLitige, setMotifLitige] = useState('');
  const [litigeEnCours, setLitigeEnCours] = useState(false);
  const [avisExiste, setAvisExiste] = useState(false);
  const [checkingAvis, setCheckingAvis] = useState(false);

  const devisId = params.id as string;
  const action = searchParams.get('action');

  useEffect(() => {
    // Attendre que l'auth soit chargée et que l'utilisateur soit défini
    if (authLoading) return;
    if (!user) {
      router.push('/connexion');
      return;
    }
    loadDevis();
  }, [devisId, user, authLoading]);

  useEffect(() => {
    // Gérer les actions automatiques (accepter/refuser) une seule fois
    if (!devis || action === null) return;
    
    if (action === 'accepter' && devis.statut === 'envoye') {
      // Retirer le paramètre action de l'URL pour éviter la boucle
      const url = new URL(window.location.href);
      url.searchParams.delete('action');
      window.history.replaceState({}, '', url.toString());
      
      handleAccepter();
    } else if (action === 'refuser' && devis.statut === 'envoye') {
      // Retirer le paramètre action de l'URL pour éviter la boucle
      const url = new URL(window.location.href);
      url.searchParams.delete('action');
      window.history.replaceState({}, '', url.toString());
      
      setShowRefusalModal(true);
    } else if (action === 'contester' && (devis.statut === 'paye' || devis.statut === 'en_cours')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('action');
      window.history.replaceState({}, '', url.toString());

      setShowLitigeModal(true);
    } else if (action === 'valider' && devis.statut === 'travaux_termines') {
      // Retirer le paramètre action de l'URL pour éviter la boucle
      const url = new URL(window.location.href);
      url.searchParams.delete('action');
      window.history.replaceState({}, '', url.toString());
      
      handleValiderTravaux();
    } else if (action === 'contester' && devis.statut === 'travaux_termines') {
      // Retirer le paramètre action de l'URL pour éviter la boucle
      const url = new URL(window.location.href);
      url.searchParams.delete('action');
      window.history.replaceState({}, '', url.toString());
      
      setShowLitigeModal(true);
    }
  }, [action, devis?.statut]); // Ne dépend que de action et statut, pas des fonctions

  const loadDevis = async () => {
    try {
      const devisDoc = await getDoc(doc(db, 'devis', devisId));
      if (!devisDoc.exists()) {
        router.push('/client/devis');
        return;
      }

      const devisData = { id: devisDoc.id, ...devisDoc.data() } as Devis;

      console.log('🔍 Devis chargé:', {
        devisId: devisData.id,
        clientIdDevis: devisData.clientId,
        userUid: user?.uid,
        match: devisData.clientId === user?.uid
      });

      // Vérifier que le devis appartient au client
      if (devisData.clientId !== user?.uid) {
        console.error('❌ Devis refusé: clientId ne correspond pas');
        router.push('/client/devis');
        return;
      }

      setDevis(devisData);

      // Auto-expirer si la deadline de paiement est dépassée
      if (
        devisData.statut === 'en_attente_paiement' &&
        devisData.dateLimitePaiement &&
        devisData.dateLimitePaiement.toMillis() < Date.now()
      ) {
        try {
          await updateDoc(doc(db, 'devis', devisId), {
            statut: 'expire',
            dateExpiration: Timestamp.now(),
            motifExpiration: 'Paiement non effectué dans le délai imparti',
          });
          setDevis({ ...devisData, statut: 'expire' } as Devis);
          console.log('⏰ Devis expiré (délai paiement dépassé)');
        } catch (e) {
          console.error('Erreur expiration devis:', e);
        }
        return; // Plus rien à faire
      }

      // Vérifier si un avis a déjà été donné pour ce contrat (si travaux terminés)
      if (['termine_valide', 'termine_auto_valide'].includes(devisData.statut)) {
        setCheckingAvis(true);
        const avisExistant = await getAvisByContratId(devisId);
        setAvisExiste(!!avisExistant);
        setCheckingAvis(false);
      }

      // Charger les autres variantes si ce devis fait partie d'un groupe
      if (devisData.varianteGroupe) {
        await chargerAutresVariantes(devisData.varianteGroupe, devisId);
      }

      // Charger la demande associée
      if (devisData.demandeId) {
        const demandeDoc = await getDoc(doc(db, 'demandes', devisData.demandeId));
        if (demandeDoc.exists()) {
          setDemande({ id: demandeDoc.id, ...demandeDoc.data() } as Demande);
        }
      }
    } catch (error) {
      console.error('Erreur chargement devis:', error);
    } finally {
      setLoading(false);
    }
  };

  const chargerAutresVariantes = async (varianteGroupe: string, devisActuelId: string) => {
    try {
      const q = query(
        collection(db, 'devis'),
        where('varianteGroupe', '==', varianteGroupe)
      );
      
      const snapshot = await getDocs(q);
      const variantes = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Devis))
        .filter(v => v.id !== devisActuelId && v.statut === 'envoye'); // Exclure le devis actuel et ne garder que les envoyés
      
      setAutresVariantes(variantes);
      console.log(`📊 ${variantes.length} autre(s) variante(s) disponible(s)`);
    } catch (error) {
      console.error('Erreur chargement autres variantes:', error);
    }
  };

  const handleAccepter = async () => {
    if (!devis || processing) return;

    // Ouvrir la modale de signature électronique
    setShowSignatureModal(true);
  };

  const handleSignatureValidated = async (dataURL: string) => {
    if (!devis) return;

    // Cas : client revient signer après avoir abandonné le paiement
    // Devis déjà en_attente_paiement → on ne re-notifie pas, on ne re-calcule pas la deadline
    const isResignature = devis.statut === 'en_attente_paiement';

    try {
      setProcessing(true);
      setShowSignatureModal(false);

      // 1. Stocker le dataURL en mémoire UNIQUEMENT (pas d'upload Firebase avant paiement)
      setSignatureDataURL(dataURL);

      if (isResignature) {
        // Re-signature : deadline d'origine conservée (ou recréée si absente pour anciens devis)
        if (!devis.dateLimitePaiement) {
          const dateLimitePaiement = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
          await updateDoc(doc(db, 'devis', devisId), {
            statut: 'en_attente_paiement',
            dateLimitePaiement,
          });
          await loadDevis(); // Recharger pour avoir la deadline dans l'état
        }
        console.log('🔄 Re-signature client (paiement reporté) — ouverture directe du paiement');
        setShowPaymentModal(true);
        return;
      }

      // ─── PREMIÈRE SIGNATURE (devis encore "envoye") ──────────────────────────

      // 2. Mettre à jour le devis → statut "en_attente_paiement" + limite 24h
      //    La signature sera uploadée et persistée UNIQUEMENT après confirmation du paiement
      const dateLimitePaiement = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
      await updateDoc(doc(db, 'devis', devisId), {
        statut: 'en_attente_paiement',
        dateAcceptation: Timestamp.now(),
        dateLimitePaiement,
        dateDerniereNotification: Timestamp.now(),
        vuParArtisan: false,
      });

      console.log('✅ Devis en attente de paiement (signature stockée en mémoire)');

      // 3. Fermer la demande : marquer comme attribuée
      if (devis.demandeId) {
        try {
          await updateDoc(doc(db, 'demandes', devis.demandeId), {
            statut: 'attribuee',
            devisAccepteId: devisId,
            artisanAttributaireId: devis.artisanId,
            dateAttribution: Timestamp.now(),
          });
          console.log('✅ Demande fermée : statut → attribuee');
        } catch (error) {
          console.error('Erreur mise à jour demande:', error);
        }
      }

      // 4. Annuler automatiquement toutes les autres variantes
      if (devis.demandeId) {
        try {
          const { marquerDevisOriginalCommeRemplace } = await import('@/lib/firebase/devis-service');
          await marquerDevisOriginalCommeRemplace(devisId, devis.numeroDevis, devis.demandeId);

          const autresDevisQuery = query(
            collection(db, 'devis'),
            where('demandeId', '==', devis.demandeId)
          );
          const autresDevisSnapshot = await getDocs(autresDevisQuery);
          const batch = writeBatch(db);
          autresDevisSnapshot.docs.forEach(devisDoc => {
            const statut = devisDoc.data().statut;
            if (devisDoc.id !== devisId && !['en_attente_paiement', 'annule', 'refuse', 'remplace'].includes(statut)) {
              batch.update(devisDoc.ref, {
                statut: 'annule',
                typeRefus: 'automatique',
                motifRefus: 'Autre devis de cette demande accepté par le client',
                dateRefus: Timestamp.now(),
              });
            }
          });
          await batch.commit();
          console.log('✅ Autres variantes annulées automatiquement');
        } catch (error) {
          console.error('Erreur annulation variantes:', error);
        }
      }

      // 5. Notifier l'artisan (une seule fois, à la première signature)
      try {
        const clientNom = `${devis.client.prenom} ${devis.client.nom}`;
        await notifyArtisanDevisAccepte(devis.artisanId, devisId, clientNom, devis.numeroDevis);
        console.log('✅ Artisan notifié de l\'acceptation');
      } catch (error) {
        console.error('Erreur notification artisan:', error);
      }

      // 6. Recharger le devis (pour avoir dateLimitePaiement dans l'état) puis ouvrir le paiement
      await loadDevis();
      setShowPaymentModal(true);
    } catch (error) {
      console.error('Erreur après signature:', error);
      alert(t('alerts.signature.saveError'));
      setShowSignatureModal(true);
    } finally {
      setProcessing(false);
    }
  };

  const handlePaymentSuccess = async (paymentData: PaymentData) => {
    if (!devis) return;

    // La signature doit avoir été saisie dans cette session (sinon bloquer)
    if (!signatureDataURL) {
      alert('⚠️ Votre session a expiré. Veuillez re-signer le devis avant de procéder au paiement.');
      setShowSignatureModal(true);
      return;
    }

    try {
      setProcessing(true);
      setShowPaymentModal(false);

      // 1. Uploader la signature maintenant que le paiement est confirmé
      const signatureRef = ref(storage, `signatures/${devisId}_${Date.now()}.png`);
      await uploadString(signatureRef, signatureDataURL, 'data_url');
      const signatureURL = await getDownloadURL(signatureRef);

      console.log('✅ Signature uploadée après confirmation paiement:', signatureURL);

      // 2. Mettre à jour le devis : statut payé + signature + données paiement
      await updateDoc(doc(db, 'devis', devisId), {
        statut: 'paye',
        datePaiement: paymentData.date,
        paiement: paymentData,
        dateDerniereNotification: Timestamp.now(),
        vuParArtisan: false,
        signatureClient: {
          url: signatureURL,
          date: Timestamp.now(),
          ip: '',
        },
      });

      console.log('✅ Paiement enregistré + Signature persistée:', paymentData.referenceTransaction);

      // Nettoyer la signature de la mémoire
      setSignatureDataURL(null);

      // 3. FERMER LA DEMANDE : marquer comme attribuée
      if (devis.demandeId) {
        try {
          await updateDoc(doc(db, 'demandes', devis.demandeId), {
            statut: 'attribuee',
            devisAccepteId: devisId,
            artisanAttributaireId: devis.artisanId,
            dateAttribution: Timestamp.now(),
          });
          console.log('✅ Demande fermée : statut → attribuee');
        } catch (error) {
          console.error('Erreur mise à jour demande:', error);
        }
      }

      // 4. ANNULER AUTOMATIQUEMENT toutes les autres variantes (même demande)
      if (devis.demandeId) {
        try {
          // 🆕 NOUVEAU SYSTÈME : Marquer le devis original comme "remplacé" si une variante est payée
          const { marquerDevisOriginalCommeRemplace } = await import('@/lib/firebase/devis-service');
          await marquerDevisOriginalCommeRemplace(
            devisId, 
            devis.numeroDevis, 
            devis.demandeId
          );
          console.log('✅ Système de marquage devis original exécuté');
          
          // ANCIEN SYSTÈME maintenu pour compatibilité (annule variantes restantes non gérées)
          const autresDevisQuery = query(
            collection(db, 'devis'),
            where('demandeId', '==', devis.demandeId)
          );
          
          const autresDevisSnapshot = await getDocs(autresDevisQuery);
          const batch = writeBatch(db);
          
          // Annuler tous les devis de la même demande SAUF celui qui est payé
          autresDevisSnapshot.docs.forEach(devisDoc => {
            const devisData = devisDoc.data();
            const statut = devisData.statut;
            
            // Ne pas toucher au devis qu'on vient de payer ni aux devis déjà finalisés
            if (devisDoc.id !== devisId && !['paye', 'annule', 'refuse', 'remplace'].includes(statut)) {
              batch.update(devisDoc.ref, {
                statut: 'annule',
                typeRefus: 'automatique',
                motifRefus: 'Autre variante de cette demande acceptée et payée',
                dateRefus: Timestamp.now(),
                dateModification: Timestamp.now(),
              });
            }
          });
          
          await batch.commit();
          const nbAnnules = autresDevisSnapshot.docs.filter(d => 
            d.id !== devisId && !['paye', 'annule', 'refuse', 'remplace'].includes(d.data().statut)
          ).length;
          console.log(`✅ ${nbAnnules} variante(s) alternative(s) annulée(s) automatiquement (ancien système)`);
        } catch (error) {
          console.error('Erreur annulation automatique autres variantes:', error);
        }
      }

      // 5. Notifier l'artisan (devis payé)
      try {
        const clientNom = `${devis.client.prenom} ${devis.client.nom}`;
        await notifyArtisanDevisAccepte(
          devis.artisanId,
          devisId,
          clientNom,
          devis.numeroDevis
        );
        console.log('✅ Artisan notifié du paiement');
      } catch (error) {
        console.error('Erreur notification artisan:', error);
      }

      // 3. Message de succès
      alert(`✅ Paiement effectué avec succès !

Référence : ${paymentData.referenceTransaction}
Montant : ${paymentData.montant.toFixed(2)} €

Votre devis signé et payé a été enregistré.
Les coordonnées complètes de l'artisan sont maintenant visibles.

L'artisan a été notifié et va vous contacter pour planifier les travaux.`);
      
      // 4. Recharger pour afficher les données démasquées
      await loadDevis();
    } catch (error) {
      console.error('Erreur traitement paiement:', error);
      alert(t('alerts.payment.saveError'));
      setShowPaymentModal(true);
    } finally {
      setProcessing(false);
    }
  };

  const handleRefuser = async () => {
    if (!devis || processing) return;

    // Validation : motif obligatoire pour révision
    if (refusalType === 'revision' && !refusalReason.trim()) {
      alert(t('alerts.refusal.reasonRequired'));
      return;
    }

    try {
      setProcessing(true);

      const clientNom = `${devis.client.prenom} ${devis.client.nom}`;

      // CAS 1 : REFUSER CET ARTISAN DÉFINITIVEMENT (toutes variantes + blocage)
      if (refusalType === 'artisan') {
        console.log('🚫 Refus artisan définitif - Blocage de toutes les variantes');
        
        // Récupérer TOUS les devis de cet artisan pour cette demande
        const devisArtisanQuery = query(
          collection(db, 'devis'),
          where('demandeId', '==', devis.demandeId),
          where('artisanId', '==', devis.artisanId)
        );
        
        const devisArtisanSnapshot = await getDocs(devisArtisanQuery);
        
        // Refuser TOUS les devis de cet artisan
        const batch = writeBatch(db);
        
        devisArtisanSnapshot.forEach((docSnap) => {
          batch.update(docSnap.ref, {
            statut: 'refuse',
            dateRefus: Timestamp.now(),
            motifRefus: `Artisan refusé définitivement : ${refusalReason || 'Aucun motif précisé'}`,
            typeRefus: 'artisan',
            dateDerniereNotification: Timestamp.now(),
            vuParArtisan: false,
          });
        });
        
        // Marquer la demande pour bloquer futurs devis de cet artisan
        if (devis.demandeId) {
          const demandeRef = doc(db, 'demandes', devis.demandeId);
          const demandeSnap = await getDoc(demandeRef);
          const artisansBloqués = demandeSnap.data()?.artisansBloqués || [];
          
          batch.update(demandeRef, {
            artisansBloqués: [...artisansBloqués, devis.artisanId]
          });
        }
        
        await batch.commit();
        
        console.log(`✅ ${devisArtisanSnapshot.size} devis refusés + artisan bloqué`);
        
        // Notifier l'artisan une seule fois
        await notifyArtisanDevisRefuse(
          devis.artisanId,
          devisId,
          clientNom,
          devis.numeroDevis,
          `Refus définitif de toutes vos propositions : ${refusalReason}`
        );
        
        alert(`❌ Cet artisan a été refusé définitivement.\n\n${devisArtisanSnapshot.size} devis refusés au total.\nIl ne pourra plus vous contacter pour cette demande.`);
      }
      
      // CAS 2 : DEMANDER UNE RÉVISION
      else if (refusalType === 'revision' && devis.demandeId) {
        console.log('🔄 Demande de révision (nouveau statut dédié)');
        
        await updateDoc(doc(db, 'devis', devisId), {
          statut: 'en_revision',
          motifRevision: refusalReason || 'Aucun motif précisé',
          dateRevision: Timestamp.now(),
          nombreRevisions: (devis.nombreRevisions || 0) + 1,
          dateDerniereNotification: Timestamp.now(),
          vuParArtisan: false,
        });
        
        await notifyArtisanDevisRevision(
          devis.artisanId,
          devis.demandeId,
          clientNom,
          devis.numeroDevis,
          refusalReason
        );
        
        alert(t('alerts.refusal.revisionRecorded'));
      }
      
      router.push('/client/devis');
    } catch (error) {
      console.error('Erreur refus devis:', error);
      alert(t('alerts.refusal.refusalError'));
    } finally {
      setProcessing(false);
      setShowRefusalModal(false);
    }
  };

  const handleValiderTravaux = async () => {
    if (!devis || !user) return;
    
    if (!confirm('Confirmer que les travaux sont conformes et terminés ?\n\nCette action libérera le paiement à l\'artisan.')) return;
    
    try {
      setValidationEnCours(true);
      
      // Valider les travaux
      await validerTravaux(devis.id, user.uid);
      
      // TODO Phase 2: Appeler API backend pour capturer le paiement Stripe
      // const response = await fetch('/api/v1/payments/release-escrow', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ contratId: devis.id, validePar: 'client' })
      // });
      
      alert(t('alerts.work.validatedSuccess'));
      await loadDevis(); // Recharger le devis
    } catch (error: any) {
      console.error('Erreur validation:', error);
      alert(`❌ Erreur : ${error.message || 'Impossible de valider les travaux'}`);
    } finally {
      setValidationEnCours(false);
    }
  };

  const handleSignalerLitige = async () => {
    if (!devis || !user || !motifLitige.trim()) {
      alert(t('alerts.work.declareProblem'));
      return;
    }
    
    try {
      setLitigeEnCours(true);
      
      // Signaler le litige
      await signalerLitige(devis.id, user.uid, motifLitige);
      
      alert('⚠️ Litige signalé.\n\nNotre équipe va examiner votre demande et vous contacter sous 24-48h.\n\nLe paiement reste bloqué jusqu\'à résolution.');
      setShowLitigeModal(false);
      setMotifLitige('');
      await loadDevis(); // Recharger le devis
    } catch (error: any) {
      console.error('Erreur litige:', error);
      alert(`❌ Erreur : ${error.message || 'Impossible de signaler le litige'}`);
    } finally {
      setLitigeEnCours(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00] mx-auto"></div>
          <p className="mt-4 text-[#6C757D]">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!devis) {
    return null;
  }

  const getStatutBadge = (statut: string) => {
    const styles: { [key: string]: string } = {
      envoye: 'bg-purple-100 text-purple-700',
      en_attente_paiement: 'bg-yellow-100 text-yellow-800',
      refuse: 'bg-red-100 text-red-800',
      expire: 'bg-orange-100 text-orange-800',
    };

    const labels: { [key: string]: string } = {
      envoye: '⏳ En attente de votre réponse',
      en_attente_paiement: '💳 Attente paiement',
      refuse: '❌ Refusé',
      expire: '⏰ Expiré',
    };

    return (
      <span className={`px-4 py-2 rounded-full text-sm font-semibold ${styles[statut] || 'bg-gray-100 text-gray-800'}`}>
        {labels[statut] || statut}
      </span>
    );
  };

  // Statuts post-paiement : les coordonnées artisan doivent être visibles
  const STATUTS_DONT_MASQUER = ['paye', 'en_cours', 'travaux_termines', 'termine_valide', 'termine_auto_valide', 'litige'];
  const coordonneesVisibles = STATUTS_DONT_MASQUER.includes(devis?.statut ?? '');

  return (
    <>
      {/* Styles d'impression optimisés pour tenir sur 1 page */}
      <style jsx global>{`
        @media print {
          @page {
            margin: 0.5cm;
            size: A4 portrait;
          }
          
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          /* N'imprimer que la zone du devis */
          body * {
            visibility: hidden;
          }

          .print-area,
          .print-area * {
            visibility: visible;
          }

          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }

          /* IMPORTANT: Masquer les sections no-print MÊME dans print-area (doit être APRÈS .print-area *) */
          .print-area .no-print,
          .print-area .print\\:hidden,
          .no-print,
          .print\\:hidden {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            height: 0 !important;
            overflow: hidden !important;
          }
          
          /* Réduire espacements */
          .print-container {
            padding: 0.5rem !important;
            margin: 0 !important;
          }
          
          .print-container > div {
            margin-bottom: 0.5rem !important;
          }
          
          /* Réduire marges des sections */
          .mb-6 {
            margin-bottom: 0.5rem !important;
          }
          
          .mb-8 {
            margin-bottom: 0.75rem !important;
          }
          
          .pb-6 {
            padding-bottom: 0.5rem !important;
          }
          
          .pt-6 {
            padding-top: 0.5rem !important;
          }
          
          /* Tableaux plus compacts */
          table {
            font-size: 10px !important;
          }
          
          table th,
          table td {
            padding: 0.25rem 0.5rem !important;
          }
          
          /* Logo plus petit - UN SEUL en haut */
          .logo-container img {
            max-height: 40px !important;
          }
          
          /* Titres plus compacts */
          h2 {
            font-size: 1.5rem !important;
            margin-bottom: 0.25rem !important;
          }
          
          h3 {
            font-size: 1rem !important;
            margin-bottom: 0.5rem !important;
          }
          
          /* Signature compacte */
          .signature-section img {
            max-height: 50px !important;
          }
          
          /* Éviter coupure de page dans sections importantes */
          .no-break {
            page-break-inside: avoid;
          }

          /* Forcer Artisan/Client côte à côte à l'impression */
          .print-two-cols {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            column-gap: 2rem !important;
          }
        }
      `}</style>
      <div className="min-h-screen bg-[#F5F7FA] print:bg-white print-area">
        {/* Header - masqué à l'impression */}
        <div className="bg-[#2C3E50] text-white py-6 print:hidden">
          <div className="container mx-auto px-4">
            <button
              onClick={() => {
                const returnFilter = searchParams.get('returnFilter');
                if (returnFilter) {
                  router.push(`/client/devis?returnFilter=${returnFilter}`);
                } else {
                  router.back();
                }
              }}
              className="flex items-center gap-2 text-white hover:text-[#FF6B00] mb-4"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Retour à mes devis
            </button>
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold">Devis N° {devis.numeroDevis}</h1>
                <p className="text-gray-300 mt-1">{devis.titre}</p>
              </div>
              {getStatutBadge(devis.statut)}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8 print:py-0">
          {/* Indicateur de variantes multiples */}
          {autresVariantes.length > 0 && devis.statut === 'envoye' && (
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 border-l-4 border-purple-500 p-4 mb-4 print:hidden">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-purple-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-purple-900 font-bold mb-2">
                    💡 L'artisan vous propose {autresVariantes.length + 1} options différentes
                  </h3>
                  <p className="text-purple-800 text-sm mb-3">
                    Comparez les variantes pour choisir celle qui correspond le mieux à vos besoins et votre budget.
                  </p>
                  <div className="grid gap-2">
                    {autresVariantes.map(v => (
                      <button
                        key={v.id}
                        onClick={() => router.push(`/client/devis/${v.id}`)}
                        className="text-left bg-white border-2 border-purple-200 rounded-lg p-3 hover:border-purple-400 hover:shadow-md transition"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="font-semibold text-[#2C3E50]">
                              {v.numeroDevis}
                            </p>
                          </div>
                          <div className="text-right ml-4">
                            <p className="font-bold text-[#FF6B00] text-lg">
                              {v.totaux?.totalTTC.toFixed(2)} €
                            </p>
                            <p className="text-xs text-purple-600 font-medium">
                              Voir cette option →
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Boutons d'action - masqués à l'impression */}
          {devis.statut === 'envoye' && (
            <div className="bg-orange-50 border-l-4 border-[#FF6B00] p-4 mb-6 print:hidden">
              <div className="flex items-start">
                <svg className="w-6 h-6 text-[#FF6B00] mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-[#2C3E50] font-semibold mb-2">Ce devis nécessite une réponse</h3>
                  <p className="text-gray-700 text-sm mb-4">
                    Vous devez accepter ou refuser ce devis avant le {devis.dateValidite?.toDate().toLocaleDateString('fr-FR')}.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleAccepter}
                      disabled={processing}
                      className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition disabled:bg-gray-400"
                    >
                      {processing ? 'Traitement...' : '✅ Accepter ce devis'}
                    </button>
                    <button
                      onClick={() => setShowRefusalModal(true)}
                      disabled={processing}
                      className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition disabled:bg-gray-400"
                    >
                      ❌ Refuser ce devis
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Contenu du devis */}
          <div className="bg-white rounded-lg shadow-md p-8 print:shadow-none print-container">
            {/* En-tête */}
            <div className="border-b-2 border-[#FF6B00] pb-6 mb-6 no-break">
              <div className="flex justify-between items-start">
                {/* Logo à gauche */}
                <div className="flex-shrink-0 logo-container">
                  <Logo size="sm" variant="full" />
                </div>

                {/* Titre DEVIS au centre */}
                <div className="flex-1 text-center">
                  <h2 className="text-3xl font-bold text-[#2C3E50] mb-2">DEVIS</h2>
                  <p className="text-gray-600">N° {devis.numeroDevis}</p>
                  <p className="text-sm text-gray-500">
                    Date : {devis.dateCreation?.toDate().toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
            </div>

            {/* Informations artisan et client */}
            <div className="grid md:grid-cols-2 gap-8 mb-8 print-two-cols">
              <div>
                <h3 className="font-bold text-[#2C3E50] mb-3">Artisan</h3>
                {devis.artisan.raisonSociale && <p className="font-semibold">{devis.artisan.raisonSociale}</p>}
                {devis.artisan.adresse && (
                  <p className="text-sm text-gray-600 mt-1">
                    📍 {masquerAdresse(
                      `${devis.artisan.adresse.rue}, ${devis.artisan.adresse.codePostal} ${devis.artisan.adresse.ville}`,
                      !coordonneesVisibles
                    )}
                  </p>
                )}
                {devis.artisan.telephone && (
                  <p className="text-sm">
                    📞 {masquerTelephoneComplet(devis.artisan.telephone, !coordonneesVisibles)}
                  </p>
                )}
                {devis.artisan.email && (
                  <p className="text-sm">
                    📧 {masquerEmail(devis.artisan.email, !coordonneesVisibles)}
                  </p>
                )}
              </div>

              <div>
                <h3 className="font-bold text-[#2C3E50] mb-3">Client</h3>
                <p className="font-semibold">{devis.client.prenom} {devis.client.nom}</p>
                {devis.client.email && <p className="text-sm">📧 {devis.client.email}</p>}
                {devis.client.telephone && <p className="text-sm">📞 {devis.client.telephone}</p>}
                {devis.client.adresse && (
                  <p className="text-sm text-gray-600 mt-1">
                    {devis.client.adresse.rue}<br />
                    {devis.client.adresse.codePostal} {devis.client.adresse.ville}
                  </p>
                )}
              </div>
            </div>

            {/* Bannière information masquage/démasquage */}
            {devis.statut === 'envoye' && (
              <div className="bg-orange-50 border-l-4 border-[#FF6B00] p-4 mb-6 rounded">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#FF6B00] flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="text-sm text-orange-800">
                    <p className="font-semibold mb-1">🔒 Coordonnées masquées</p>
                    <p className="text-orange-700">
                      Les coordonnées complètes de l'artisan (téléphone, email, adresse) seront démasquées après <strong>signature ET paiement</strong> du devis.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {devis.statut === 'en_attente_paiement' && devis.dateLimitePaiement && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                  <div className="text-sm text-red-800">
                    <p className="font-semibold mb-1">⏰ Paiement en attente - Coordonnées masquées</p>
                    <p className="text-red-700 mb-2">
                      ⚠️ Ce devis est en attente de paiement.
                      <strong> Il vous reste jusqu'au {devis.dateLimitePaiement.toDate().toLocaleDateString('fr-FR')} à {devis.dateLimitePaiement.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} pour payer.</strong>
                    </p>
                    <p className="text-red-700">
                      Votre signature sera enregistrée au moment du paiement. Les coordonnées de l'artisan seront démasquées ensuite.
                    </p>
                    <button
                      onClick={() => setShowSignatureModal(true)}
                      className="mt-3 bg-red-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-red-700 transition"
                    >
                      ✍️ Signer et payer ({devis.totaux.totalTTC.toFixed(2)} €)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Titre */}
            <div className="mb-6">
              <h3 className="text-xl font-bold text-[#2C3E50] mb-2">{devis.titre}</h3>
            </div>

            {/* Date de début prévue */}
            {devis.dateDebutPrevue && (
              <div className="mb-8 bg-gray-50 border-l-4 border-[#2C3E50] p-4 rounded">
                <p className="text-[#2C3E50] font-semibold">
                  📅 Date de début des travaux prévue : {devis.dateDebutPrevue.toDate().toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            )}

            {/* Date de fin des travaux prévue */}
            {devis.dateDebutPrevue && (
              <div className="mb-8 bg-gray-50 border-l-4 border-[#FF6B00] p-4 rounded">
                <p className="text-[#2C3E50] font-semibold">
                  📅 Date de fin des travaux prévue :{' '}
                  {devis.delaiRealisation && Number(devis.delaiRealisation) > 0 ? (() => {
                    const debut = devis.dateDebutPrevue.toDate();
                    debut.setDate(debut.getDate() + Number(devis.delaiRealisation));
                    return debut.toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    });
                  })() : <span className="text-gray-400 font-normal italic">Non précisée par l&apos;artisan</span>}
                </p>
              </div>
            )}

            {/* Détail des prestations */}
            <div className="mb-8">
              <h3 className="font-bold text-[#2C3E50] mb-4">Détail des prestations</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse table-fixed">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="border border-gray-300 px-4 py-2 text-left w-[40%]">Désignation</th>
                      <th className="border border-gray-300 px-4 py-2 text-center w-[12%]">Quantité</th>
                      <th className="border border-gray-300 px-4 py-2 text-right w-[15%]">Prix unitaire HT</th>
                      <th className="border border-gray-300 px-4 py-2 text-center w-[13%]">TVA</th>
                      <th className="border border-gray-300 px-4 py-2 text-right w-[20%]">Total HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Main d'œuvre (si présente) */}
                    {devis.mainOeuvre && (
                      <tr className="bg-orange-50">
                        <td className="border border-gray-300 px-4 py-2 break-words">
                          <span className="font-semibold text-[#FF6B00]">⚡ Main d'œuvre</span>
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {devis.mainOeuvre.quantite} {devis.mainOeuvre.unite || 'j'}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {devis.mainOeuvre.prixHT.toFixed(2)} €
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {devis.mainOeuvre.tauxTVA}%
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                          {(devis.mainOeuvre.quantite * devis.mainOeuvre.prixHT).toFixed(2)} €
                        </td>
                      </tr>
                    )}

                    {/* Matière première (si présente) */}
                    {devis.matierePremiere && (
                      <tr className="bg-gray-50">
                        <td className="border border-gray-300 px-4 py-2 break-words">
                          <span className="font-semibold text-blue-600">🛠️ Matière première</span>
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {devis.matierePremiere.quantite} {devis.matierePremiere.unite || 'unité'}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {devis.matierePremiere.prixHT.toFixed(2)} €
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {devis.matierePremiere.tauxTVA}%
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                          {(devis.matierePremiere.quantite * devis.matierePremiere.prixHT).toFixed(2)} €
                        </td>
                      </tr>
                    )}

                    {/* Autres lignes */}
                    {devis.lignes.filter(ligne => ligne.description?.trim() || ligne.prixUnitaireHT > 0).map((ligne, index) => (
                      <tr key={index}>
                        <td className="border border-gray-300 px-4 py-2 break-words">
                          {ligne.description}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {ligne.quantite} {ligne.unite}
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {ligne.prixUnitaireHT.toFixed(2)} €
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-center">
                          {ligne.tauxTVA}%
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                          {ligne.totalHT.toFixed(2)} €
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totaux */}
            <div className="flex justify-end mb-8">
              <div className="w-full md:w-1/2">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-700">Total HT:</span>
                    <span className="font-semibold">{devis.totaux.totalHT.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-700">TVA:</span>
                    <span className="font-semibold">{devis.totaux.totalTVAGlobal.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between text-xl font-bold text-[#FF6B00] pt-2 border-t-2 border-[#FF6B00]">
                    <span>Total TTC:</span>
                    <span>{devis.totaux.totalTTC.toFixed(2)} €</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Informations complémentaires */}
            {(devis.conditions || devis.notes) && (
              <div className="pt-6">
                {devis.conditions && (
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-gray-700">Conditions :</p>
                    <p className="text-gray-600 whitespace-pre-wrap">{devis.conditions}</p>
                  </div>
                )}

                {devis.notes && (
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-gray-700">Notes :</p>
                    <p className="text-gray-600 whitespace-pre-wrap">{devis.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Mentions légales - uniquement pré-paiement */}
            {!coordonneesVisibles && (
              <div className="pt-6 mt-6">
                <p className="text-xs text-gray-500">
                  Ce devis est valable jusqu'au {devis.dateValidite?.toDate().toLocaleDateString('fr-FR')} et ne constitue pas une facture.
                  Une fois accepté, ce devis engage les deux parties selon les conditions décrites.
                </p>
              </div>
            )}

            {/* ═══════════════════════════════════════════════
                SECTION SIGNATURES — visible dès l'envoi
                Artisan signe toujours avant d'envoyer.
                Client signe au moment du paiement.
            ═══════════════════════════════════════════════ */}
            {!['genere', 'brouillon', 'refuse', 'expire', 'annule', 'remplace'].includes(devis.statut) && (
              <div className={`mt-8 pt-6 border-t-2 signature-section no-break ${coordonneesVisibles ? 'border-green-500' : 'border-gray-300'}`}>
                {/* Titre de la zone signatures */}
                <div className="text-center mb-4">
                  {coordonneesVisibles ? (
                    <>
                      <p className="text-sm font-semibold text-green-800">✅ Devis signé et payé</p>
                      {devis.paiement?.date && (
                        <p className="text-xs text-green-700">
                          Paiement effectué le {devis.paiement.date.toDate().toLocaleDateString('fr-FR')}
                          {devis.paiement?.stripe?.paymentIntentId && (
                            <> - Réf : {devis.paiement.stripe.paymentIntentId.substring(0, 20)}...</>
                          )}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-gray-500 italic">
                      🖊️ Zone de signatures — votre signature sera apposée lors du paiement
                    </p>
                  )}
                </div>

                <div className="flex justify-between items-end gap-4">
                  {/* ── GAUCHE : Signature CLIENT ── */}
                  <div className="flex-1 text-left">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Signature du client :</p>
                    {devis.signatureClient?.url ? (
                      <>
                        <div className="border-2 border-green-400 rounded p-2 inline-block bg-white">
                          <img
                            src={devis.signatureClient.url}
                            alt="Signature client"
                            className="h-16 w-auto"
                          />
                        </div>
                        <p className="text-xs text-gray-600 mt-1 font-medium">
                          {devis.client.prenom} {devis.client.nom}
                        </p>
                        <p className="text-xs text-gray-500">
                          Signée le {devis.signatureClient.date?.toDate().toLocaleDateString('fr-FR')} à{' '}
                          {devis.signatureClient.date?.toDate().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </>
                    ) : (
                      <div className="border-2 border-dashed border-gray-300 rounded p-4 w-48 h-24 flex flex-col items-center justify-center bg-gray-50">
                        {devis.statut === 'en_attente_paiement' ? (
                          <p className="text-xs text-orange-500 text-center font-medium">⏰ En attente<br/>de paiement</p>
                        ) : (
                          <p className="text-xs text-gray-400 text-center">En attente<br/>de votre signature</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── DROITE : Signature ARTISAN ── */}
                  <div className="flex-1 text-right">
                    <p className="text-xs font-semibold text-gray-700 mb-2">Signature de l&apos;artisan :</p>
                    {devis.signatureArtisan?.url ? (
                      <>
                        <div className="border-2 border-[#FF6B00] rounded-lg bg-white p-2 inline-block">
                          <img
                            src={devis.signatureArtisan.url}
                            alt="Signature artisan"
                            className="h-16 w-auto"
                          />
                        </div>
                        <p className="text-xs text-gray-600 mt-1 font-medium">
                          {devis.artisan.raisonSociale}
                        </p>
                        <p className="text-xs text-gray-500">
                          Signée le {devis.signatureArtisan.date?.toDate().toLocaleDateString('fr-FR')}
                        </p>
                      </>
                    ) : (
                      <div className="border-2 border-dashed border-gray-300 rounded p-4 w-48 h-24 flex items-center justify-center bg-gray-50 ml-auto">
                        <p className="text-xs text-gray-400 text-center">Espace réservé<br/>au cachet</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ========================================= */}
          {/* SECTION SUIVI TRAVAUX (selon statut)     */}
          {/* ========================================= */}

          {/* Statut: paye - En attente démarrage */}
          {devis.statut === 'paye' && (
            <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6 mb-6 print:hidden">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">⏳</span>
                <div>
                  <h3 className="text-lg font-bold text-yellow-800">En attente du démarrage des travaux</h3>
                  <p className="text-sm text-yellow-700">
                    L'artisan doit déclarer le début des travaux. Vous serez notifié.
                  </p>
                </div>
              </div>
              
              <div className="bg-white rounded-lg p-4 border border-yellow-200 mb-4">
                <p className="text-sm text-gray-700">
                  💰 <strong>Paiement sécurisé</strong> : Votre paiement de <strong>{devis.totaux.totalTTC.toFixed(2)}€</strong> est bloqué en sécurité.
                  <br />
                  <span className="text-xs text-gray-600">Il sera libéré à l'artisan uniquement après validation des travaux.</span>
                </p>
              </div>

              <button
                onClick={() => setShowLitigeModal(true)}
                className="w-full bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold transition"
              >
                ⚠️ Signaler un problème
              </button>
            </div>
          )}

          {/* Statut: en_cours - Travaux en cours */}
          {devis.statut === 'en_cours' && (
            <div className="bg-blue-50 border-2 border-blue-400 rounded-lg p-6 mb-6 print:hidden">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">⚙️</span>
                <div>
                  <h3 className="text-lg font-bold text-blue-800">Travaux en cours</h3>
                  <p className="text-sm text-blue-700">
                    Démarré le : {devis.travaux?.dateDebut?.toDate().toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              </div>
              
              <div className="bg-white rounded-lg p-4 border border-blue-200 mb-4">
                <p className="text-sm text-gray-700">
                  L'artisan <strong>{devis.artisan.raisonSociale}</strong> réalise actuellement les travaux.
                  <br />
                  Vous pourrez valider une fois qu'il aura déclaré avoir terminé.
                </p>
              </div>

              <button
                onClick={() => setShowLitigeModal(true)}
                className="w-full bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold transition"
              >
                ⚠️ Signaler un problème
              </button>
            </div>
          )}

          {/* Statut: travaux_termines - VALIDATION REQUISE */}
          {devis.statut === 'travaux_termines' && (
            <div className="bg-orange-50 border-2 border-orange-500 rounded-lg p-6 mb-6 print:hidden">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">✅</span>
                <div>
                  <h3 className="text-lg font-bold text-orange-800">Travaux terminés - Validation requise</h3>
                  <p className="text-sm text-orange-700">
                    L'artisan a déclaré avoir terminé les travaux le {devis.travaux?.dateFin?.toDate().toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}.
                  </p>
                </div>
              </div>
              
              <div className="bg-white rounded-lg p-4 border border-orange-300 mb-4">
                <p className="text-sm text-gray-700 mb-3">
                  Vous avez <strong>7 jours</strong> pour valider les travaux ou signaler un problème.
                  <br />
                  Validation automatique le : <strong>{devis.travaux?.dateValidationAuto?.toDate().toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</strong>
                </p>
                
                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <p className="text-sm text-blue-800">
                    💡 <strong>Que se passe-t-il ensuite ?</strong>
                    <br />
                    • Si vous validez : l'artisan reçoit le paiement sous 24-48h
                    <br />
                    • Si vous signalez un problème : notre équipe intervient comme médiateur
                    <br />
                    • Si aucune action : validation automatique après 7 jours
                  </p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={handleValiderTravaux}
                  disabled={validationEnCours}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {validationEnCours ? 'Validation...' : '✅ Valider les travaux'}
                </button>
                
                <button
                  onClick={() => setShowLitigeModal(true)}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold transition"
                >
                  ⚠️ Signaler un problème
                </button>
              </div>
            </div>
          )}

          {/* Statut: termine_valide ou termine_auto_valide - Travaux validés */}
          {['termine_valide', 'termine_auto_valide'].includes(devis.statut) && (
            <div className="bg-green-50 border-2 border-green-500 rounded-lg p-6 mb-6 print:hidden">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">🎉</span>
                <div>
                  <h3 className="text-lg font-bold text-green-800">Travaux validés</h3>
                  <p className="text-sm text-green-700">
                    {devis.statut === 'termine_valide' 
                      ? `Validé par vous le ${devis.travaux?.dateValidationClient?.toDate().toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })}`
                      : `Validé automatiquement le ${devis.travaux?.dateValidationClient?.toDate().toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })}`
                    }
                  </p>
                </div>
              </div>
              
              <div className="bg-white rounded-lg p-4 border border-green-200">
                <p className="text-sm text-gray-700 mb-3">
                  ✅ Le paiement a été transféré à l'artisan.
                  <br />
                  💰 Montant : <strong>{devis.totaux.totalTTC.toFixed(2)}€</strong>
                </p>
                
                <div className="p-3 bg-blue-50 rounded border border-blue-200 mb-3">
                  <p className="text-sm text-blue-800">
                    💡 <strong>Merci d'avoir utilisé ArtisanDispo !</strong>
                    <br />
                    Vous pouvez laisser un avis sur l'artisan pour aider d'autres clients.
                  </p>
                </div>

                {/* Bouton donner un avis */}
                {!checkingAvis && !avisExiste && (
                  <Link href={`/client/avis/nouveau/${devis.id}`}>
                    <button className="w-full bg-[#FF6B00] hover:bg-[#E56100] text-white px-6 py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2">
                      <span className="text-xl">⭐</span>
                      Donner mon avis maintenant
                    </button>
                  </Link>
                )}

                {/* Message si avis déjà donné */}
                {!checkingAvis && avisExiste && (
                  <div className="p-3 bg-green-100 rounded border border-green-300">
                    <p className="text-sm text-green-800 text-center">
                      ✅ Vous avez déjà donné votre avis pour cette intervention
                    </p>
                  </div>
                )}

                {/* Loading pendant vérification */}
                {checkingAvis && (
                  <div className="text-center text-gray-500 text-sm">
                    Vérification...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Statut: litige - Problème signalé */}
          {devis.statut === 'litige' && (
            <div className="bg-red-50 border-2 border-red-500 rounded-lg p-6 mb-6 print:hidden">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">⚠️</span>
                <div>
                  <h3 className="text-lg font-bold text-red-800">Litige en cours</h3>
                  <p className="text-sm text-red-700">
                    Vous avez signalé un problème le {devis.travaux?.litige?.date?.toDate().toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              </div>
              
              <div className="bg-white rounded-lg p-4 border border-red-200">
                <h4 className="font-semibold text-gray-800 mb-2">Votre signalement :</h4>
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded border border-gray-200 mb-4">
                  {devis.travaux?.litige?.motif || 'Non spécifié'}
                </p>
                
                <div className="p-3 bg-yellow-50 rounded border border-yellow-200">
                  <p className="text-sm text-yellow-800">
                    ⏳ <strong>En cours de traitement</strong>
                    <br />
                    Un médiateur va examiner votre demande et contacter les deux parties sous 24-48h.
                    <br />
                    Le paiement reste bloqué jusqu'à résolution du litige.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Boutons bas de page - masqués à l'impression */}
          <div className="mt-6 flex gap-4 print:hidden">
            <button
              onClick={handlePrint}
              className="bg-[#2C3E50] text-white px-6 py-2 rounded-lg hover:bg-[#1A3A5C] transition"
            >
              🖨️ Imprimer
            </button>

            {['en_attente_paiement', 'paye', 'en_cours', 'travaux_termines'].includes(devis.statut) && (
              <button
                onClick={() => router.push(`/messages?userId=${devis.artisanId}&devisId=${devis.id}&demandeId=${devis.demandeId || ''}`)}
                className="bg-[#FF6B00] text-white px-6 py-2 rounded-lg hover:bg-[#E56100] transition"
              >
                💬 Contacter l'artisan
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal de signature électronique */}
      {showSignatureModal && (
        <SignatureCanvas
          onSave={handleSignatureValidated}
          onCancel={() => setShowSignatureModal(false)}
        />
      )}

      {/* Modal de paiement (après signature) */}
      {showPaymentModal && devis && devis.dateLimitePaiement && (
        <PaymentForm
          devisId={devisId}
          montantTTC={devis.totaux.totalTTC}
          numeroDevis={devis.numeroDevis}
          dateLimitePaiement={devis.dateLimitePaiement}
          onSuccess={handlePaymentSuccess}
          onCancel={() => {
            // Le client peut payer plus tard — devis reste à l'état 'en_attente_paiement' 24h
            setShowPaymentModal(false);
          }}
        />
      )}

      {/* Modal de refus */}
      {showRefusalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 print:hidden">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-[#2C3E50] mb-4">Refuser ce devis</h3>
            
            {/* Alerte si d'autres variantes existent */}
            {autresVariantes.length > 0 && (
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <p className="font-semibold text-blue-800 mb-2">
                      💡 L'artisan a proposé {autresVariantes.length + 1} option{autresVariantes.length > 0 ? 's' : ''} différente{autresVariantes.length > 0 ? 's' : ''}
                    </p>
                    <p className="text-sm text-blue-700 mb-3">
                      Avant de refuser, consultez les autres variantes qui pourraient mieux vous convenir :
                    </p>
                    <div className="space-y-2">
                      {autresVariantes.map(v => (
                        <button
                          key={v.id}
                          onClick={() => router.push(`/client/devis/${v.id}`)}
                          className="w-full text-left bg-white border border-blue-200 rounded p-3 hover:border-blue-400 hover:bg-blue-50 transition"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-[#2C3E50]">
                                {v.numeroDevis}
                              </p>
                              <p className="text-sm text-gray-600">{v.titre}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-[#FF6B00] text-lg">
                                {v.totaux?.totalTTC.toFixed(2)} €
                              </p>
                              <p className="text-xs text-gray-500">
                                Cliquez pour voir →
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <p className="text-gray-600 mb-3">
              Motif du refus {refusalType === 'revision' && <span className="text-red-600 font-semibold">(obligatoire pour nouvelle option)</span>} {refusalType !== 'revision' && '(optionnel)'} :
            </p>
            <textarea
              value={refusalReason}
              onChange={(e) => setRefusalReason(e.target.value)}
              className={`w-full border rounded-lg p-3 mb-4 focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent ${
                refusalType === 'revision' && !refusalReason.trim()
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-300'
              }`}
              rows={3}
              placeholder={refusalType === 'revision' 
                ? "Ex: Le prix est trop élevé, je souhaite une option moins chère avec des matériaux standards..."
                : "Ex: Tarif trop élevé, délai trop long, prestation non adaptée..."
              }
              required={refusalType === 'revision'}
            />

            <p className="text-gray-700 font-semibold mb-3">
              Que souhaitez-vous faire ?
            </p>

            <div className="space-y-3 mb-6">
              {/* Option 1 : Bloquer cet artisan définitivement */}
              <label className="flex items-start gap-3 p-3 border-2 border-red-300 rounded-lg cursor-pointer hover:border-red-500 transition bg-red-50">
                <input
                  type="radio"
                  name="refusalType"
                  value="artisan"
                  checked={refusalType === 'artisan'}
                  onChange={(e) => setRefusalType(e.target.value as 'artisan' | 'revision')}
                  className="mt-1 w-4 h-4 text-red-600 focus:ring-red-600"
                />
                <div className="flex-1">
                  <p className="font-semibold text-gray-800 flex items-center gap-2">
                    ⚠️ Refuser cet artisan définitivement
                  </p>
                  <p className="text-sm text-red-700 font-medium mt-1">
                    Attention : Toutes ses propositions (variantes incluses) seront refusées. Il ne pourra plus vous contacter pour cette demande.
                  </p>
                </div>
              </label>

              {/* Option 3 : Demander une révision */}
              <label className="flex items-start gap-3 p-3 border-2 border-blue-300 rounded-lg cursor-pointer hover:border-blue-500 transition bg-blue-50">
                <input
                  type="radio"
                  name="refusalType"
                  value="revision"
                  checked={refusalType === 'revision'}
                  onChange={(e) => setRefusalType(e.target.value as 'artisan' | 'revision')}
                  className="mt-1 w-4 h-4 text-blue-600 focus:ring-blue-600"
                />
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">
                    🔄 Refuser et demander une nouvelle option
                  </p>
                  <p className="text-sm text-gray-600">
                    {autresVariantes.length > 0 
                      ? "L'artisan pourra créer une variante supplémentaire adaptée à vos besoins"
                      : "L'artisan pourra vous proposer une option alternative améliorée"
                    }
                  </p>
                  {refusalType === 'revision' && (
                    <p className="text-sm text-blue-700 font-medium mt-2">
                      ⚠️ Vous devez préciser le motif du refus pour que l'artisan comprenne vos attentes
                    </p>
                  )}
                </div>
              </label>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRefusalModal(false);
                  setRefusalType('artisan');
                }}
                disabled={processing}
                className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition"
              >
                Annuler
              </button>
              <button
                onClick={handleRefuser}
                disabled={processing}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition disabled:bg-gray-400"
              >
                {processing ? 'Traitement...' : 'Confirmer le refus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Signaler Litige */}
      {showLitigeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-800">⚠️ Signaler un problème</h3>
              <button
                onClick={() => {
                  setShowLitigeModal(false);
                  setMotifLitige('');
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            <p className="text-sm text-gray-600 mb-4">
              Décrivez précisément le problème rencontré avec les travaux. Notre équipe de médiation interviendra sous 24-48h pour résoudre le litige.
            </p>
            
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
              <p className="text-sm text-yellow-800">
                <strong>⚠️ Important :</strong> Le signalement d'un litige bloquera le paiement jusqu'à résolution.
                Un médiateur contactera les deux parties pour trouver une solution équitable.
              </p>
            </div>
            
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Description du problème :
            </label>
            <textarea
              placeholder="Exemple : Les joints de la salle de bain ne sont pas étanches, il y a des fuites d'eau. Les carreaux présentent des fissures..."
              value={motifLitige}
              onChange={(e) => setMotifLitige(e.target.value)}
              className="w-full border-2 border-gray-300 rounded-lg p-3 text-gray-800 mb-4 focus:border-[#FF6B00] focus:outline-none"
              rows={6}
            />
            
            <p className="text-xs text-gray-500 mb-4">
              💡 Plus votre description est précise, plus notre équipe pourra intervenir rapidement et efficacement.
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowLitigeModal(false);
                  setMotifLitige('');
                }}
                disabled={litigeEnCours}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-3 rounded-lg font-semibold transition"
              >
                Annuler
              </button>
              
              <button
                onClick={handleSignalerLitige}
                disabled={litigeEnCours || !motifLitige.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {litigeEnCours ? 'Envoi...' : 'Envoyer le signalement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
