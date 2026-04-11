'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { useLanguage } from '@/contexts/LanguageContext';
import { getPropositionExpressById, getDemandeExpressById } from '@/lib/firebase/demande-express-service';
import { getArtisanByUserId } from '@/lib/firebase/artisan-service';
import { useAuth } from '@/hooks/useAuth';
import type { PropositionExpress, DemandeExpress, Artisan } from '@/types/firestore';
import CheckoutForm from './CheckoutForm';

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

/**
 * SimulationPayForm — Formulaire de paiement de test (mode simulation).
 * Affiche les champs de saisie de carte bancaire et simule la confirmation côté serveur.
 * Activé automatiquement quand STRIPE_SECRET_KEY est absent ou PAYMENT_SIMULATION_MODE=true.
 */
function SimulationPayForm({
  montant,
  demandeId,
  propositionId,
  simulationToken,
}: {
  montant: number;
  demandeId: string;
  propositionId: string;
  simulationToken: string;
}) {
  const router = useRouter();

  // ── États du formulaire de saisie carte ──────────────────────────────────────
  const [paying, setPaying] = useState(false);   // Vrai pendant l'appel API
  const [paid, setPaid] = useState(false);        // Vrai après confirmation serveur
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Formate le numéro de carte en groupes de 4 chiffres (ex: 1234 5678 9012 3456) ──
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\s/g, '').replace(/\D/g, '').substring(0, 16);
    setCardNumber(value.match(/.{1,4}/g)?.join(' ') || value);
  };

  // ── Formate la date d'expiration automatiquement au format MM/AA ─────────────
  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '').substring(0, 4);
    if (value.length >= 2) value = value.substring(0, 2) + '/' + value.substring(2);
    setExpiryDate(value);
  };

  // ── Valide tous les champs — retourne vrai si le formulaire est complet et valide ──
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    const num = cardNumber.replace(/\s/g, '');
    if (!num) errs.cardNumber = 'Numéro de carte requis';
    else if (num.length !== 16) errs.cardNumber = 'Numéro de carte invalide (16 chiffres)';
    if (!cardName.trim()) errs.cardName = 'Nom du titulaire requis';
    if (!expiryDate) {
      errs.expiryDate = "Date d'expiration requise";
    } else {
      const [m, y] = expiryDate.split('/');
      const month = parseInt(m);
      const year = parseInt('20' + y);
      const now = new Date();
      if (month < 1 || month > 12) errs.expiryDate = 'Mois invalide';
      else if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1))
        errs.expiryDate = 'Carte expirée';
    }
    if (!cvv) errs.cvv = 'CVV requis';
    else if (cvv.length < 3) errs.cvv = 'CVV invalide';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Soumission : valide → appelle l'API de simulation → redirige vers la page succès ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setPaying(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/stripe-express/simulate-confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ simulationToken, propositionId }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur simulation');
      }
      setPaid(true);
      // Affiche brièvement la confirmation avant de rediriger vers la page succès
      setTimeout(() => router.push(`/client/paiement-success?demandeId=${demandeId}`), 1500);
    } catch (err: any) {
      alert(err.message || 'Erreur lors du paiement');
    } finally {
      setPaying(false);
    }
  }

  if (paid) {
    return (
      <div className="text-center py-8">
        <p className="text-5xl mb-3">✅</p>
        <p className="font-bold text-green-700 text-lg">Paiement confirmé !</p>
        <p className="text-sm text-[#6C757D] mt-1">Redirection en cours...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 flex items-start gap-2">
        <span className="text-lg flex-shrink-0">🧪</span>
        <div>
          <p className="font-bold text-yellow-800 text-sm">Mode test — Paiement non réel</p>
          <p className="text-yellow-700 text-xs mt-0.5">
            Aucun débit ne sera effectué. Saisissez n&apos;importe quelle carte valide pour tester.
          </p>
        </div>
      </div>

      <div className="bg-[#FF6B00] bg-opacity-10 border-2 border-[#FF6B00] rounded-xl p-4 flex justify-between items-center">
        <span className="text-[#2C3E50] font-semibold">Montant à payer</span>
        <span className="text-3xl font-black text-[#FF6B00]">{montant}€</span>
      </div>

      <div>
        <label className="block text-sm font-semibold text-[#2C3E50] mb-1.5">
          Numéro de carte <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input
            type="text"
            value={cardNumber}
            onChange={handleCardNumberChange}
            placeholder="1234 5678 9012 3456"
            disabled={paying}
            className={"w-full border-2 rounded-lg px-4 py-3 pr-12 focus:ring-2 focus:ring-[#FF6B00] focus:border-[#FF6B00] outline-none transition " + (errors.cardNumber ? 'border-red-500' : 'border-[#E9ECEF]')}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="w-8 h-6 text-gray-400" fill="currentColor" viewBox="0 0 48 32">
              <rect width="48" height="32" rx="4" fill="#1A1F71"/>
              <circle cx="18" cy="16" r="8" fill="#EB001B"/>
              <circle cx="30" cy="16" r="8" fill="#F79E1B"/>
            </svg>
          </div>
        </div>
        {errors.cardNumber && <p className="text-red-500 text-xs mt-1">{errors.cardNumber}</p>}
      </div>

      <div>
        <label className="block text-sm font-semibold text-[#2C3E50] mb-1.5">
          Nom du titulaire <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={cardName}
          onChange={(e) => setCardName(e.target.value.toUpperCase())}
          placeholder="JEAN DUPONT"
          disabled={paying}
          className={"w-full border-2 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#FF6B00] focus:border-[#FF6B00] outline-none transition " + (errors.cardName ? 'border-red-500' : 'border-[#E9ECEF]')}
        />
        {errors.cardName && <p className="text-red-500 text-xs mt-1">{errors.cardName}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-[#2C3E50] mb-1.5">
            Date d&apos;expiration <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={expiryDate}
            onChange={handleExpiryChange}
            placeholder="MM/AA"
            disabled={paying}
            className={"w-full border-2 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#FF6B00] focus:border-[#FF6B00] outline-none transition " + (errors.expiryDate ? 'border-red-500' : 'border-[#E9ECEF]')}
          />
          {errors.expiryDate && <p className="text-red-500 text-xs mt-1">{errors.expiryDate}</p>}
        </div>
        <div>
          <label className="block text-sm font-semibold text-[#2C3E50] mb-1.5">
            CVV <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={cvv}
            onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').substring(0, 4))}
            placeholder="123"
            disabled={paying}
            className={"w-full border-2 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#FF6B00] focus:border-[#FF6B00] outline-none transition " + (errors.cvv ? 'border-red-500' : 'border-[#E9ECEF]')}
          />
          {errors.cvv && <p className="text-red-500 text-xs mt-1">{errors.cvv}</p>}
        </div>
      </div>

      <button
        type="submit"
        disabled={paying}
        className="w-full py-4 bg-[#FF6B00] hover:bg-[#E56100] text-white rounded-xl font-bold text-lg transition-all disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
      >
        {paying ? (
          <>
            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white inline-block" />
            Traitement en cours...
          </>
        ) : (
          <>💳 Payer {montant}€ en toute sécurité</>
        )}
      </button>

      <p className="text-xs text-center text-[#6C757D]">
        🔒 Paiement sécurisé avec séquestre — L&apos;artisan ne reçoit le montant qu&apos;après la fin de l&apos;intervention.
      </p>
    </form>
  );
}

export default function PaiementExpressPage() {
  const router = useRouter();
  const params = useParams();
  const propositionId = params.id as string;
  const { user: firebaseUser, loading: authLoading } = useAuth();
  const { t } = useLanguage();

  const [proposition, setProposition] = useState<PropositionExpress | null>(null);
  const [demande, setDemande] = useState<DemandeExpress | null>(null);
  const [artisan, setArtisan] = useState<Artisan | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [simulationToken, setSimulationToken] = useState<string | null>(null);
  const [simulationPropositionId, setSimulationPropositionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser) {
      router.push('/connexion');
      return;
    }
    loadData();
  }, [firebaseUser, authLoading, propositionId]);

  async function loadData() {
    if (!firebaseUser) return;

    try {
      const propositionData = await getPropositionExpressById(propositionId);
      if (!propositionData) {
        alert(t('alerts.express.notFound'));
        router.push('/client/dashboard');
        return;
      }

      if (propositionData.clientId !== firebaseUser.uid) {
        alert(t('alerts.express.accessDenied'));
        router.push('/client/dashboard');
        return;
      }

      setProposition(propositionData);

      const demandeData = await getDemandeExpressById(propositionData.demandeId);
      setDemande(demandeData);

      const artisanData = await getArtisanByUserId(propositionData.artisanId);
      setArtisan(artisanData);
    } catch (error) {
      console.error('Erreur chargement:', error);
      alert(t('alerts.demande.loadError'));
    } finally {
      setLoading(false);
    }

    // Créer le PaymentIntent séparément — les erreurs s'affichent inline
    await createPaymentIntent(propositionId);
  }

  async function createPaymentIntent(propositionId: string) {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/stripe-express/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propositionId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur création paiement');
      }

      const data = await response.json();
      if (data.simulationMode) {
        setSimulationToken(data.simulationToken);
        setSimulationPropositionId(data.propositionId);
        console.log('🎭 Mode simulation activé — token:', data.simulationToken);
      } else {
        setClientSecret(data.clientSecret);
        console.log('✅ PaymentIntent créé:', data.paymentIntentId);
      }
    } catch (error: any) {
      console.error('Erreur création PaymentIntent:', error);
      setError(error.message || 'Erreur lors de la préparation du paiement');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00] mx-auto mb-4"></div>
          <p className="text-[#6C757D]">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!proposition || !demande) {
    return null;
  }

  const commission = Math.round(proposition.montantPropose * 0.1 * 100) / 100;
  const montantArtisan = proposition.montantPropose - commission;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F8F9FA] to-white">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-[#E9ECEF]">
        <div className="container mx-auto px-4 py-6">
          <nav className="flex items-center gap-2 text-sm mb-4">
            <Link href="/client/dashboard" className="text-[#2C3E50] hover:text-[#FF6B00]">
              Dashboard
            </Link>
            <span className="text-[#6C757D]">&gt;</span>
            <Link href={`/client/demandes-express/${demande.id}`} className="text-[#2C3E50] hover:text-[#FF6B00]">
              Ma demande
            </Link>
            <span className="text-[#6C757D]">&gt;</span>
            <span className="text-[#2C3E50] font-semibold">Paiement</span>
          </nav>

          <h1 className="text-2xl md:text-3xl font-bold text-[#2C3E50]">
            💳 Paiement sécurisé
          </h1>
        </div>
      </div>

      {/* Contenu */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

          {/* ── GAUCHE : Récapitulatif ── */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-[#2C3E50] mb-6">
                📋 Récapitulatif
              </h2>

              <div className="space-y-4">
                <div className="flex justify-between items-start pb-4 border-b border-[#E9ECEF]">
                  <div>
                    <p className="text-sm text-[#6C757D]">Prestation</p>
                    <p className="font-semibold text-[#2C3E50]">
                      {demande.categorie.charAt(0).toUpperCase() + demande.categorie.slice(1)}
                      {demande.sousCategorie && ` • ${demande.sousCategorie}`}
                    </p>
                  </div>
                </div>

                {artisan && (
                  <div className="flex justify-between items-start pb-4 border-b border-[#E9ECEF]">
                    <div>
                      <p className="text-sm text-[#6C757D]">Artisan</p>
                      <p className="font-semibold text-[#2C3E50]">{artisan.raisonSociale}</p>
                      {artisan.adresse && (
                        <p className="text-sm text-[#6C757D]">{artisan.adresse}</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-start pb-4 border-b border-[#E9ECEF]">
                  <div className="flex-1">
                    <p className="text-sm text-[#6C757D] mb-1">Détails de la prestation</p>
                    <p className="text-[#2C3E50]">{proposition.description}</p>
                  </div>
                </div>

                {proposition.delaiIntervention && (
                  <div className="flex justify-between items-center pb-4 border-b border-[#E9ECEF]">
                    <p className="text-sm text-[#6C757D]">Délai d'intervention</p>
                    <p className="font-semibold text-[#2C3E50]">{proposition.delaiIntervention}</p>
                  </div>
                )}

                <div className="flex justify-between items-center pb-4 border-b border-[#E9ECEF]">
                  <p className="text-sm text-[#6C757D]">Montant de la prestation</p>
                  <p className="text-2xl font-bold text-[#2C3E50]">{proposition.montantPropose}€</p>
                </div>

                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-[#2C3E50] mb-2">
                    <strong>🔒 Paiement sécurisé avec séquestre</strong>
                  </p>
                  <ul className="text-sm text-[#6C757D] space-y-1">
                    <li>✅ Votre argent est bloqué sur un compte séquestre</li>
                    <li>✅ L'artisan ne le reçoit qu'après la fin de l'intervention</li>
                    <li>✅ Vous pouvez demander un remboursement en cas de litige</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Garanties */}
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
              <h3 className="font-bold text-[#2C3E50] mb-3">✅ Vos garanties</h3>
              <ul className="space-y-2 text-sm text-[#6C757D]">
                <li>🔐 Paiement 100% sécurisé par Stripe</li>
                <li>💰 Argent bloqué jusqu'à la fin des travaux</li>
                <li>🛡️ Protection acheteur incluse</li>
                <li>📞 Service client disponible 7j/7</li>
                <li>⚖️ Médiation en cas de litige</li>
              </ul>
            </div>
          </div>

          {/* ── DROITE : Mode de paiement ── */}
          <div className="bg-white rounded-xl shadow-lg p-6 lg:sticky lg:top-8">
            <h2 className="text-xl font-bold text-[#2C3E50] mb-6">
              💳 Mode de paiement
            </h2>

            {error ? (
              <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5 text-center">
                <p className="text-3xl mb-3">⚠️</p>
                <p className="text-red-800 font-semibold mb-1">Paiement indisponible</p>
                <p className="text-sm text-red-700 mb-4">{error}</p>
                <button
                  onClick={() => { setError(null); createPaymentIntent(propositionId); }}
                  className="px-4 py-2 bg-[#FF6B00] text-white rounded-lg hover:bg-[#E56100] text-sm font-semibold"
                >
                  Réessayer
                </button>
              </div>
            ) : simulationToken ? (
              <SimulationPayForm
                montant={proposition.montantPropose}
                demandeId={demande.id}
                propositionId={simulationPropositionId!}
                simulationToken={simulationToken}
              />
            ) : clientSecret ? (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <CheckoutForm
                  montant={proposition.montantPropose}
                  demandeId={demande.id}
                />
              </Elements>
            ) : (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF6B00] mx-auto mb-4"></div>
                <p className="text-[#6C757D]">Préparation du paiement sécurisé...</p>
              </div>
            )}

            <p className="text-xs text-center text-[#6C757D] mt-6">
              En cliquant sur "Payer", vous acceptez nos{' '}
              <Link href="/conditions-generales" className="text-[#FF6B00] hover:underline">
                conditions générales
              </Link>{' '}
              et autorisez le débit de votre carte.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
