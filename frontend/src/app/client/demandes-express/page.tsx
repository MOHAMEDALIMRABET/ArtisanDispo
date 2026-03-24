'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNotifications } from '@/hooks/useNotifications';
import {
  getDemandesExpressByClient,
  getPropositionsByDemande,
  acceptPropositionExpress,
  refusePropositionExpress,
  sendContrePropositionExpress,
  updateDemandeExpressStatut,
  deleteDemandeExpress,
  markTravauxValides,
} from '@/lib/firebase/demande-express-service';
import { getUserById } from '@/lib/firebase/user-service';
import { getArtisanByUserId } from '@/lib/firebase/artisan-service';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { DemandeExpress, PropositionExpress, User, DemandeExpressStatut } from '@/types/firestore';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function MesDemandesExpressPage() {
  const router = useRouter();
  const { user: firebaseUser, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [userData, setUserData] = useState<User | null>(null);
  const [demandes, setDemandes] = useState<DemandeExpress[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState<'toutes' | DemandeExpressStatut>('toutes');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  // Propositions chargées à la volée à l'ouverture d'une carte
  const [propositionsMap, setPropositionsMap] = useState<Map<string, PropositionExpress | null>>(new Map());
  const [loadingPropsIds, setLoadingPropsIds] = useState<Set<string>>(new Set());

  // Modales inline refus / contre-proposition
  const [refusModal, setRefusModal] = useState<{ id: string; propId: string } | null>(null);
  const [contreModal, setContreModal] = useState<{ id: string; propId: string; currentMontant: number } | null>(null);
  const [motifRefus, setMotifRefus] = useState('');
  const [contreMontant, setContreMontant] = useState('');
  const [contreMessage, setContreMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [artisanNomMap, setArtisanNomMap] = useState<Map<string, string>>(new Map());

  // Cloches temporaires (nouvelles propositions non lues)
  const { notifications, markAsRead } = useNotifications(firebaseUser?.uid);
  const [bellDemandeIds, setBellDemandeIds] = useState<Set<string>>(new Set());
  const [showToutsBell, setShowToutsBell] = useState(false);
  const bellsInitialized = useRef(false);

  // Initialiser les cloches une fois (notifications de nouvelles propositions non lues)
  useEffect(() => {
    if (bellsInitialized.current) return;
    if (loading && notifications.length === 0) return;
    bellsInitialized.current = true;
    const expressNotifs = notifications.filter(
      n => !n.lue && n.type === 'proposition_express_recue' && n.lien
    );
    if (expressNotifs.length === 0) return;
    const ids = new Set<string>(
      expressNotifs.map(n => n.lien!.split('/').pop() ?? '').filter(Boolean)
    );
    setBellDemandeIds(ids);
    setShowToutsBell(true);
    const timer = setTimeout(() => {
      setBellDemandeIds(new Set());
      setShowToutsBell(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, [loading, notifications]);

  const toggleExpand = async (id: string, statut: DemandeExpressStatut) => {
    const next = new Set(expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      // Effacer la cloche pour cette demande et marquer la notif comme lue
      if (bellDemandeIds.has(id)) {
        setBellDemandeIds(prev => { const s = new Set(prev); s.delete(id); return s; });
        const notif = notifications.find(n => !n.lue && n.type === 'proposition_express_recue' && n.lien?.endsWith(`/${id}`));
        if (notif) markAsRead(notif.id);
      }
      // Charger la proposition si statut pertinent et pas encore chargée
      if (
        ['proposition_recue', 'acceptee', 'payee', 'en_cours', 'travaux_termines', 'terminee'].includes(statut) &&
        !propositionsMap.has(id) &&
        !loadingPropsIds.has(id)
      ) {
        setLoadingPropsIds(prev => new Set(prev).add(id));
        try {
          const props = await getPropositionsByDemande(id);
          const active = props.find(p => p.statut === 'en_attente_acceptation') || props[0] || null;
          setPropositionsMap(prev => new Map(prev).set(id, active));
          // Charger le nom de l'artisan depuis la proposition
          if (active?.artisanId) {
            loadArtisanNom(id, active.artisanId);
          }
        } catch {
          setPropositionsMap(prev => new Map(prev).set(id, null));
        } finally {
          setLoadingPropsIds(prev => { const s = new Set(prev); s.delete(id); return s; });
        }
      }
    }
    setExpandedIds(next);
  };

  async function handleAccepterInline(demandeId: string, propositionId: string) {
    if (!confirm('Confirmer l\'acceptation de cette proposition ?')) return;
    setSubmitting(true);
    try {
      await acceptPropositionExpress(propositionId);
      router.push(`/client/paiement-express/${propositionId}`);
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l\'acceptation');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRefuserInline() {
    if (!refusModal || !motifRefus.trim()) { alert('Veuillez indiquer le motif'); return; }
    setSubmitting(true);
    try {
      await refusePropositionExpress(refusModal.propId, motifRefus.trim());
      // Mettre à jour la demande localement
      setDemandes(prev => prev.map(d => d.id === refusModal.id ? { ...d, statut: 'en_attente_proposition' as DemandeExpressStatut } : d));
      setPropositionsMap(prev => { const m = new Map(prev); m.delete(refusModal.id); return m; });
      setRefusModal(null); setMotifRefus('');
    } catch (err: any) {
      alert(err.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleContreInline() {
    if (!contreModal) return;
    const montant = parseFloat(contreMontant);
    if (isNaN(montant) || montant <= 0 || montant > 150) { alert('Montant invalide (1–150€)'); return; }
    if (!contreMessage.trim()) { alert('Veuillez ajouter un message'); return; }
    setSubmitting(true);
    try {
      await sendContrePropositionExpress(contreModal.propId, montant, contreMessage.trim());
      setDemandes(prev => prev.map(d => d.id === contreModal.id ? { ...d, statut: 'en_attente_proposition' as DemandeExpressStatut } : d));
      setPropositionsMap(prev => { const m = new Map(prev); m.delete(contreModal.id); return m; });
      setContreModal(null); setContreMontant(''); setContreMessage('');
      alert('✅ Contre-proposition envoyée !');
    } catch (err: any) {
      alert(err.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }
  async function loadArtisanNom(demandeId: string, artisanUserId: string) {
    try {
      const artisan = await getArtisanByUserId(artisanUserId);
      if (artisan) {
        const nom = (artisan as any).businessName || (artisan as any).raisonSociale || 'Artisan';
        setArtisanNomMap(prev => {
          if (prev.has(demandeId)) return prev;
          return new Map(prev).set(demandeId, nom);
        });
      }
    } catch {}
  }

  async function handleValiderTravaux(demandeId: string) {
    if (!confirm("Confirmez-vous la bonne exécution des travaux ? Cela libèrera le paiement à l'artisan.")) return;
    setValidatingId(demandeId);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/stripe-express/capture-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demandeId }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erreur lors de la libération du paiement');
      }
      await markTravauxValides(demandeId);
      setDemandes(prev => prev.map(d => d.id === demandeId ? { ...d, statut: 'terminee' as DemandeExpressStatut } : d));
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la validation des travaux');
    } finally {
      setValidatingId(null);
    }
  }
  useEffect(() => {
    if (authLoading) return;

    if (!firebaseUser) {
      router.push('/connexion');
      return;
    }

    loadDemandes();
  }, [firebaseUser, authLoading, router]);

  async function loadDemandes() {
    if (!firebaseUser) return;

    try {
      const user = await getUserById(firebaseUser.uid);
      setUserData(user);

      if (user?.role !== 'client') {
        alert(t('alerts.express.clientOnly'));
        router.push('/');
        return;
      }

      const demandesList = await getDemandesExpressByClient(firebaseUser.uid);

      const nowMs = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      // Demandes expirées ou refusées depuis > 24h → suppression définitive
      const toDelete = demandesList.filter((d) => {
        if (d.statut === 'expiree' && d.expiresAt && d.expiresAt.toDate().getTime() < nowMs - oneDayMs) return true;
        if (d.statut === 'refusee_artisan' && d.updatedAt && d.updatedAt.toDate().getTime() < nowMs - oneDayMs) return true;
        return false;
      });
      await Promise.all(toDelete.map((d) => deleteDemandeExpress(d.id)));

      // Demandes expirées : en attente sans réponse OU proposition reçue sans réponse client
      const toExpire = demandesList.filter(
        (d) =>
          (d.statut === 'en_attente_proposition' || d.statut === 'proposition_recue') &&
          d.expiresAt &&
          d.expiresAt.toDate().getTime() < nowMs
      );
      await Promise.all(toExpire.map((d) => updateDemandeExpressStatut(d.id, 'expiree')));

      // Auto-libération : travaux_termines > 24h → libérer le paiement automatiquement
      const toAutoRelease = demandesList.filter(
        (d) =>
          d.statut === 'travaux_termines' &&
          d.travauxTerminesAt &&
          d.travauxTerminesAt.toDate().getTime() < nowMs - oneDayMs
      );
      const autoReleasedIds = new Set<string>();
      for (const d of toAutoRelease) {
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL;
          if (apiUrl) {
            const resp = await fetch(`${apiUrl}/stripe-express/capture-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ demandeId: d.id }),
            });
            if (resp.ok) {
              await markTravauxValides(d.id);
              autoReleasedIds.add(d.id);
            }
          }
        } catch (e) {
          console.error('Auto-libération échouée pour', d.id, e);
        }
      }

      const updatedList = demandesList
        .filter((d) => !toDelete.some((td) => td.id === d.id))
        .map((d) => {
          if (toExpire.some((te) => te.id === d.id)) return { ...d, statut: 'expiree' as DemandeExpressStatut };
          if (autoReleasedIds.has(d.id)) return { ...d, statut: 'terminee' as DemandeExpressStatut };
          return d;
        });

      setDemandes(updatedList);

      // Charger les noms des artisans pour les demandes qui en ont
      const demandesAvecArtisan = updatedList.filter(d => d.artisanId);
      if (demandesAvecArtisan.length > 0) {
        const nomMap = new Map<string, string>();
        await Promise.all(
          demandesAvecArtisan.map(async (d) => {
            try {
              const artisan = await getArtisanByUserId(d.artisanId!);
              if (artisan) {
                const nom = (artisan as any).businessName || (artisan as any).raisonSociale || 'Artisan';
                nomMap.set(d.id, nom);
              }
            } catch {}
          })
        );
        setArtisanNomMap(nomMap);
      }
    } catch (error) {
      console.error('Erreur chargement demandes:', error);
    } finally {
      setLoading(false);
    }
  }

  const isExpireeOuRefusee = (statut: DemandeExpressStatut) => statut === 'expiree' || statut === 'refusee_artisan';
  const demandesExpirees = demandes.filter((d) => isExpireeOuRefusee(d.statut));
  const demandesActives = demandes.filter((d) => !isExpireeOuRefusee(d.statut));

  const demandesFiltrees = demandes.filter((d) => {
    if (filtreStatut === 'toutes') return !isExpireeOuRefusee(d.statut);
    if (filtreStatut === 'expiree') return isExpireeOuRefusee(d.statut);
    if (filtreStatut === 'en_cours') return ['payee', 'en_cours', 'travaux_termines'].includes(d.statut);
    return d.statut === filtreStatut;
  });

  const getStatutBadge = (statut: DemandeExpressStatut) => {
    const classes: Record<DemandeExpressStatut, string> = {
      en_attente_proposition: 'bg-yellow-100 text-yellow-800',
      proposition_recue: 'bg-blue-100 text-blue-800',
      acceptee: 'bg-green-100 text-green-800',
      payee: 'bg-purple-100 text-purple-800',
      en_cours: 'bg-indigo-100 text-indigo-800',
      travaux_termines: 'bg-amber-100 text-amber-800',
      terminee: 'bg-green-200 text-green-900',
      annulee: 'bg-red-100 text-red-800',
      expiree: 'bg-gray-200 text-gray-700',
      refusee_artisan: 'bg-orange-100 text-orange-800',
    };
    const className = classes[statut] || 'bg-gray-100 text-gray-800';
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${className}`}>
        {t(`clientExpressRequests.statuses.${statut}`)}
      </span>
    );
  };

  const getUrgenceBadge = (urgence: 'immediat' | 'urgent') => {
    const config: Record<string, { cls: string; label: string }> = {
      immediat: { cls: 'bg-orange-100 text-orange-700', label: '⚡ Immédiat (2h)' },
      urgent:   { cls: 'bg-red-100 text-red-700',       label: '🚨 Urgent (24h)' },
    };
    const { cls, label } = config[urgence] ?? config.urgent;
    return (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${cls}`}>{label}</span>
    );
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#F8F9FA] to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#FF6B00] mx-auto mb-4"></div>
          <p className="text-lg text-[#6C757D]">{t('clientExpressRequests.loading')}</p>
        </div>
      </div>
    );
  }

  return (<>
    <div className="min-h-screen bg-gradient-to-b from-[#F8F9FA] to-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <nav className="text-sm mb-4">
            <Link href="/client/demandes-hub" className="text-[#2C3E50] hover:text-[#FF6B00]">
              Mes demandes
            </Link>
            <span className="mx-2 text-[#6C757D]">/</span>
            <span className="text-[#6C757D]">{t('clientExpressRequests.breadcrumb.current')}</span>
          </nav>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-[#2C3E50] mb-2">
                {t('clientExpressRequests.pageTitle')}
              </h1>
              <p className="text-[#6C757D]">
                {t('clientExpressRequests.pageSubtitle')}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowHowItWorks(v => !v)}
                className="flex items-center gap-2 px-4 py-2 bg-[#2C3E50] text-white rounded-lg hover:bg-[#1A3A5C] transition-colors text-sm font-semibold whitespace-nowrap"
              >
                <span>ℹ️</span> Comment ça marche ?
              </button>
              <Button
                onClick={() => router.push('/petits-travaux-express/recherche')}
                className="whitespace-nowrap"
              >
                {t('clientExpressRequests.newRequest')}
              </Button>
            </div>
          </div>

          {/* Panneau comment ça marche */}
          {showHowItWorks && (
            <div className="mt-4 bg-blue-50 border-2 border-blue-200 rounded-xl p-5 text-sm text-[#6C757D]">
              <ul className="space-y-2">
                <li><strong>1.</strong> {t('clientExpressRequests.howItWorks.step1')}</li>
                <li><strong>2.</strong> {t('clientExpressRequests.howItWorks.step2')}</li>
                <li><strong>3.</strong> {t('clientExpressRequests.howItWorks.step3')}</li>
                <li><strong>4.</strong> {t('clientExpressRequests.howItWorks.step4')}</li>
                <li><strong>5.</strong> {t('clientExpressRequests.howItWorks.step5')}</li>
              </ul>
            </div>
          )}
        </div>

        {/* Filtres */}
        <div className="mb-6 flex flex-wrap gap-3">
          <button
            onClick={() => setFiltreStatut('toutes')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filtreStatut === 'toutes'
                ? 'bg-[#FF6B00] text-white'
                : 'bg-white text-[#2C3E50] hover:bg-[#F5F7FA]'
            }`}
          >
            {t('clientExpressRequests.filters.all')} ({demandesActives.length})
            {showToutsBell && <span className="ml-1.5 animate-bounce">🔔</span>}
          </button>
          <button
            onClick={() => setFiltreStatut('en_attente_proposition')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filtreStatut === 'en_attente_proposition'
                ? 'bg-[#FF6B00] text-white'
                : 'bg-white text-[#2C3E50] hover:bg-[#F5F7FA]'
            }`}
          >
            <span className="mr-2">⏳</span>{t('clientExpressRequests.filters.waiting')} ({demandes.filter(d => d.statut === 'en_attente_proposition').length})
          </button>
          <button
            onClick={() => setFiltreStatut('proposition_recue')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filtreStatut === 'proposition_recue'
                ? 'bg-[#FF6B00] text-white'
                : 'bg-white text-[#2C3E50] hover:bg-[#F5F7FA]'
            }`}
          >
            <span className="mr-2">📋</span>{t('clientExpressRequests.filters.proposals')} ({demandes.filter(d => d.statut === 'proposition_recue').length})
          </button>
          <button
            onClick={() => setFiltreStatut('en_cours')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filtreStatut === 'en_cours'
                ? 'bg-[#FF6B00] text-white'
                : 'bg-white text-[#2C3E50] hover:bg-[#F5F7FA]'
            }`}
          >
            <span className="mr-2">🔧</span>{t('clientExpressRequests.filters.inProgress')} ({demandes.filter(d => ['payee', 'en_cours', 'travaux_termines'].includes(d.statut)).length})
          </button>
          <button
            onClick={() => setFiltreStatut('terminee')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filtreStatut === 'terminee'
                ? 'bg-[#FF6B00] text-white'
                : 'bg-white text-[#2C3E50] hover:bg-[#F5F7FA]'
            }`}
          >
            <span className="mr-2">✅</span>{t('clientExpressRequests.filters.completed')} ({demandes.filter(d => d.statut === 'terminee').length})
          </button>
          <button
            onClick={() => setFiltreStatut('expiree')}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              filtreStatut === 'expiree'
                ? 'bg-gray-600 text-white'
                : 'bg-white text-gray-500 hover:bg-[#F5F7FA]'
            }`}
          >
            🚫 Refusées/Expirées ({demandesExpirees.length})
          </button>
        </div>

        {/* Liste des demandes */}
        {demandesFiltrees.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-xl text-[#6C757D] mb-6">
              {filtreStatut === 'toutes'
                ? t('clientExpressRequests.empty.all')
                : `${t('clientExpressRequests.empty.filtered')} "${filtreStatut}"`}
            </p>
            <Button onClick={() => router.push('/petits-travaux-express/recherche')}>
              {t('clientExpressRequests.empty.createFirst')}
            </Button>
          </Card>
        ) : (
          <div className="grid gap-6">
            {demandesFiltrees.map((demande) => {
              const isExpanded = expandedIds.has(demande.id);
              const canExpand = true;
              return (
              <div
                key={demande.id}
                className={`bg-white rounded-2xl shadow-md transition-all duration-300 relative border-2 overflow-hidden ${
                  canExpand && isExpanded ? 'border-[#FF6B00] ring-1 ring-[#FF6B00] ring-opacity-30' : 'border-transparent hover:border-gray-200 hover:shadow-xl'
                }`}
              >
                {/* Barre latérale orange */}
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#FF6B00] to-[#E56100]" />

                {/* Cloche nouvelle proposition */}
                {bellDemandeIds.has(demande.id) && (
                  <div className="absolute top-4 left-5 z-10">
                    <span className="animate-bounce text-xl" title="Nouvelle proposition !">🔔</span>
                  </div>
                )}

                {/* Bouton expand/collapse */}
                {canExpand && (
                <button
                  onClick={() => toggleExpand(demande.id, demande.statut)}
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
                )}

                {/* Contenu principal - toujours visible */}
                <div
                  className={`p-6 pl-8 ${canExpand ? 'pr-14 cursor-pointer' : 'pr-6'}`}
                  onClick={canExpand ? () => toggleExpand(demande.id, demande.statut) : undefined}
                >
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    {getStatutBadge(demande.statut)}
                    {getUrgenceBadge(demande.urgence)}
                    {demande.expiresAt && demande.statut === 'en_attente_proposition' && (
                      <span className="px-3 py-1 bg-orange-50 border border-orange-200 text-orange-600 rounded-full text-xs font-semibold">
                        ⏱️ Expire le {format(demande.expiresAt.toDate(), 'dd MMMM à HH:mm', { locale: fr })} ({demande.urgence === 'immediat' ? '2h' : '6h'})
                      </span>
                    )}
                    {demande.budgetPropose && (
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                        {t('clientExpressRequests.card.budgetProposed').replace('{amount}', String(demande.budgetPropose))}
                      </span>
                    )}
                  </div>

                  <h3 className="text-xl font-bold text-[#2C3E50] mb-2">
                    {artisanNomMap.has(demande.id) && (
                      <span className="text-[#2C3E50]">{artisanNomMap.get(demande.id)} - </span>
                    )}
                    {demande.categorie.charAt(0).toUpperCase() + demande.categorie.slice(1)}
                    {demande.sousCategorie && ` - ${demande.sousCategorie}`}
                  </h3>

                  <p className="text-[#6C757D] mb-3 line-clamp-3 break-all whitespace-pre-wrap overflow-hidden">
                    {demande.description}
                  </p>

                  <div className="flex flex-wrap gap-4 text-sm text-[#6C757D]">
                    <span>📍 {demande.ville} ({demande.codePostal})</span>
                    <span>{t('clientExpressRequests.card.createdOn')} {format(demande.createdAt.toDate(), 'dd MMMM yyyy à HH:mm', { locale: fr })}</span>
                    {(() => {
                      // Calculer la date de fin basée sur la date d'intervention et le mode urgence
                      const dateIntervention = new Date(demande.date);
                      // Si travaux terminés, afficher la date réelle
                      if (demande.travauxTerminesAt) {
                        return (
                          <span className="text-green-700 font-semibold">
                            📅 Fin: {format(demande.travauxTerminesAt.toDate(), 'dd MMMM yyyy à HH:mm', { locale: fr })}
                          </span>
                        );
                      }
                      // Sinon, afficher la date d'intervention prévue
                      if (['payee', 'en_cours', 'travaux_termines'].includes(demande.statut)) {
                        return (
                          <span className="text-blue-700 font-semibold">
                            📅 Fin prévue: {format(dateIntervention, 'dd MMMM yyyy à HH:mm', { locale: fr })}
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {demande.statut === 'en_attente_proposition' && !demande.artisanId && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-lg">⏳</span>
                      <p className="text-sm text-yellow-800 font-medium">Votre demande est en ligne. Un artisan va bientôt vous faire une proposition.</p>
                    </div>
                  )}
                </div>

                {/* Zone dépliée */}
                {isExpanded && (() => {
                  const prop = propositionsMap.get(demande.id);
                  const loadingProp = loadingPropsIds.has(demande.id);
                  return (
                    <div className="border-t border-gray-100">
                      {/* Adresse si disponible */}
                      {demande.adresse && (
                        <div className="px-8 py-3 bg-[#F8F9FA] border-b border-gray-100">
                          <p className="text-xs text-[#6C757D] font-semibold uppercase tracking-wide mb-0.5">📍 Adresse complète</p>
                          <p className="text-sm font-medium text-[#2C3E50]">{demande.adresse}</p>
                        </div>
                      )}

                      {/* Photos du chantier */}
                      {demande.photos && demande.photos.length > 0 && (
                        <div className="px-8 py-4 border-b border-gray-100">
                          <p className="text-xs text-[#6C757D] font-semibold uppercase tracking-wide mb-2">
                            📷 Photos ({demande.photos.length})
                          </p>
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {demande.photos.map((url: string, i: number) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={url}
                                  alt={`Photo ${i + 1}`}
                                  className="w-full h-24 object-cover rounded-lg border-2 border-[#E9ECEF] hover:border-[#FF6B00] transition-colors cursor-pointer"
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="px-8 py-5 space-y-4">

                        {/* En attente sans artisan assigné - désormais affiché dans la zone principale */}

                        {/* Proposition reçue — chargement */}
                        {demande.statut === 'proposition_recue' && loadingProp && (
                          <div className="flex items-center gap-3 py-4">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#FF6B00]" />
                            <p className="text-sm text-[#6C757D]">Chargement de la proposition…</p>
                          </div>
                        )}

                        {/* Proposition reçue — affichage */}
                        {demande.statut === 'proposition_recue' && !loadingProp && prop && (
                          <div className="space-y-4">
                            {/* Header proposition */}
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className="text-base font-bold text-[#2C3E50]">💬 Proposition de l&apos;artisan</span>
                              <span className="text-xs text-[#6C757D]">
                                Reçue le {prop.createdAt ? format(prop.createdAt.toDate(), 'dd MMM yyyy à HH:mm', { locale: fr }) : ''}
                              </span>
                            </div>

                            {/* Montant + comparaison budget */}
                            <div className="flex items-center gap-4 p-4 bg-[#FFF5EB] rounded-xl">
                              <div>
                                <p className="text-xs text-[#6C757D] font-semibold uppercase tracking-wide mb-0.5">Montant proposé TTC</p>
                                <p className="text-4xl font-extrabold text-[#FF6B00]">{prop.montantPropose}€</p>
                              </div>
                              {demande.budgetPropose && (
                                <div className="ml-auto text-right">
                                  <p className="text-xs text-[#6C757D] mb-0.5">Votre budget</p>
                                  <p className="text-xl font-bold text-[#6C757D]">{demande.budgetPropose}€</p>
                                  {prop.montantPropose <= demande.budgetPropose
                                    ? <p className="text-xs text-green-600 font-semibold mt-0.5">✅ Dans votre budget</p>
                                    : <p className="text-xs text-orange-600 font-semibold mt-0.5">⚠️ Au-dessus de votre budget</p>
                                  }
                                </div>
                              )}
                            </div>

                            {/* Description */}
                            <div>
                              <p className="text-xs text-[#6C757D] font-semibold uppercase tracking-wide mb-1">📝 Ce qui est inclus</p>
                              <div className="bg-[#F8F9FA] rounded-xl p-3">
                                <p className="text-sm text-[#2C3E50] whitespace-pre-wrap break-words leading-relaxed">{prop.description}</p>
                              </div>
                            </div>

                            {/* Délai */}
                            {prop.delaiIntervention && (
                              <div>
                                <p className="text-xs text-[#6C757D] font-semibold uppercase tracking-wide mb-1">⏱️ Délai d&apos;intervention</p>
                                <span className="bg-purple-100 text-purple-800 px-3 py-1.5 rounded-lg text-sm font-semibold">
                                  {prop.delaiIntervention}
                                </span>
                              </div>
                            )}

                            {/* Boutons d'action */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-gray-100">
                              <button
                                onClick={(e) => { e.stopPropagation(); setMotifRefus(''); setRefusModal({ id: demande.id, propId: prop.id }); }}
                                disabled={submitting}
                                className="px-4 py-2.5 border-2 border-red-400 text-red-600 rounded-xl hover:bg-red-50 font-semibold text-sm transition-all disabled:opacity-50"
                              >
                                ❌ Refuser
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setContreMontant(String(demande.budgetPropose || '')); setContreMessage(''); setContreModal({ id: demande.id, propId: prop.id, currentMontant: prop.montantPropose }); }}
                                disabled={submitting}
                                className="px-4 py-2.5 border-2 border-[#FF6B00] text-[#FF6B00] rounded-xl hover:bg-[#FFF5EB] font-semibold text-sm transition-all disabled:opacity-50"
                              >
                                💬 Contre-proposer
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleAccepterInline(demande.id, prop.id); }}
                                disabled={submitting}
                                className="px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 font-bold text-sm transition-all disabled:opacity-50 shadow"
                              >
                                {submitting ? '⏳…' : '✅ Accepter et payer'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Proposition reçue mais absente en base */}
                        {demande.statut === 'proposition_recue' && !loadingProp && !prop && (
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 font-medium">
                            💬 Une proposition a été reçue. Cliquez sur &quot;Voir détails&quot; pour la consulter.
                          </div>
                        )}

                        {/* En cours */}
                        {demande.statut === 'en_cours' && (
                          <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                            <span className="text-2xl">🔧</span>
                            <p className="text-sm text-indigo-800 font-medium">L&apos;artisan est en cours d&apos;intervention. Vous serez notifié à la fin.</p>
                          </div>
                        )}

                        {/* Payée */}
                        {demande.statut === 'payee' && (
                          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
                            <span className="text-2xl">💳</span>
                            <div>
                              <p className="text-sm text-green-800 font-medium">Paiement confirmé.</p>
                              {prop && <p className="text-sm text-green-700">Montant sécurisé : <strong>{prop.montantPropose}€</strong></p>}
                            </div>
                          </div>
                        )}

                        {/* Travaux terminés - validation client requise */}
                        {demande.statut === 'travaux_termines' && (
                          <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4">
                            <div className="flex items-start gap-3">
                              <span className="text-2xl">⏳</span>
                              <div className="flex-1">
                                <p className="font-bold text-[#2C3E50] mb-1">L&apos;artisan a terminé les travaux</p>
                                <p className="text-sm text-amber-800 mb-1">Validez pour libérer le paiement à l&apos;artisan.</p>
                                <p className="text-xs text-[#6C757D] mb-3">
                                  Si vous ne validez pas dans 24h, le paiement sera libéré automatiquement.
                                  {demande.travauxTerminesAt && (() => {
                                    const autoAt = demande.travauxTerminesAt!.toDate().getTime() + 24 * 60 * 60 * 1000;
                                    const rem = autoAt - Date.now();
                                    if (rem > 0) {
                                      const h = Math.floor(rem / 3600000);
                                      const m = Math.floor((rem % 3600000) / 60000);
                                      return ` (auto-libération dans ${h}h${m > 0 ? ` ${m}min` : ''})`;
                                    }
                                    return null;
                                  })()}
                                </p>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleValiderTravaux(demande.id); }}
                                  disabled={validatingId === demande.id}
                                  className="w-full px-4 py-3 bg-[#28A745] text-white rounded-xl hover:bg-green-700 font-bold text-sm transition-all disabled:opacity-50"
                                >
                                  {validatingId === demande.id ? '⏳ Libération du paiement...' : '\u2705 Valider les travaux et libérer le paiement'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Terminée */}
                        {demande.statut === 'terminee' && (
                          <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
                            <span className="text-2xl">🎉</span>
                            <p className="text-sm text-gray-700 font-medium">Intervention terminée. Merci d&apos;avoir utilisé ArtisanSafe !</p>
                          </div>
                        )}

                      </div>
                    </div>
                  );
                })()}
              </div>
              );
            })}
          </div>
        )}

      </div>
    </div>

    {/* ── Modale Refus ─────────────────────────────── */}
    {refusModal && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
          <h3 className="text-xl font-bold text-[#2C3E50] mb-2">❌ Refuser la proposition</h3>
          <p className="text-[#6C757D] text-sm mb-4">Indiquez pourquoi vous refusez (l&apos;artisan sera notifié). La demande reviendra en attente.</p>
          <textarea
            value={motifRefus}
            onChange={(e) => setMotifRefus(e.target.value)}
            rows={4}
            className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-xl focus:outline-none focus:border-red-400 mb-4 text-sm"
            placeholder="Ex : Le tarif est trop élevé pour ce travail…"
          />
          <div className="flex gap-3">
            <button
              onClick={() => { setRefusModal(null); setMotifRefus(''); }}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 border-2 border-[#E9ECEF] text-[#6C757D] rounded-xl hover:border-[#2C3E50] font-medium text-sm"
            >
              Annuler
            </button>
            <button
              onClick={handleRefuserInline}
              disabled={submitting || !motifRefus.trim()}
              className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 font-semibold text-sm disabled:opacity-50"
            >
              {submitting ? '⏳ Envoi…' : 'Confirmer le refus'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Modale Contre-proposition ─────────────────── */}
    {contreModal && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
          <h3 className="text-xl font-bold text-[#2C3E50] mb-2">💬 Contre-proposition</h3>
          <p className="bg-[#FFF5EB] text-[#FF6B00] text-sm font-semibold px-4 py-2 rounded-lg mb-4">
            Proposition actuelle : {contreModal?.currentMontant ?? 0}€
          </p>
          <div className="mb-4">
            <label className="text-sm font-semibold text-[#2C3E50] mb-1 block">💰 Votre budget souhaité (max 150€)</label>
            <div className="relative">
              <input
                type="number" min="1" max="150"
                value={contreMontant}
                onChange={(e) => setContreMontant(e.target.value)}
                className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-xl focus:outline-none focus:border-[#FF6B00] pr-10"
                placeholder="Ex : 80"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6C757D] font-bold">€</span>
            </div>
          </div>
          <div className="mb-4">
            <label className="text-sm font-semibold text-[#2C3E50] mb-1 block">📝 Message à l&apos;artisan</label>
            <textarea
              value={contreMessage}
              onChange={(e) => setContreMessage(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border-2 border-[#E9ECEF] rounded-xl focus:outline-none focus:border-[#FF6B00] text-sm"
              placeholder="Ex : Je peux aller jusqu'à 80€ car le travail est limité au robinet uniquement."
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setContreModal(null); setContreMontant(''); setContreMessage(''); }}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 border-2 border-[#E9ECEF] text-[#6C757D] rounded-xl hover:border-[#2C3E50] font-medium text-sm"
            >
              Annuler
            </button>
            <button
              onClick={handleContreInline}
              disabled={submitting || !contreMontant || !contreMessage.trim()}
              className="flex-1 px-4 py-2.5 bg-[#FF6B00] text-white rounded-xl hover:bg-[#E56100] font-semibold text-sm disabled:opacity-50"
            >
              {submitting ? '⏳ Envoi…' : 'Envoyer'}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
}
