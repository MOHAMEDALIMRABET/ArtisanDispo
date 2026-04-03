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
import { Button } from '@/components/ui/Button';
import CheckoutForm from './CheckoutForm';

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

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
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  async function handleSimulatePay() {
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
      setTimeout(() => router.push(`/client/paiement-success?demandeId=${demandeId}`), 1500);
    } catch (e: any) {
      alert(e.message || 'Erreur simulation');
    } finally {
      setPaying(false);
    }
  }

  if (paid) {
    return (
      <div className="text-center py-8">
        <p className="text-5xl mb-3">✅</p>
        <p className="font-bold text-green-700 text-lg">Paiement simulé confirmé !</p>
        <p className="text-sm text-[#6C757D] mt-1">Redirection en cours...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4">
        <p className="text-sm font-bold text-yellow-800 mb-1">🎭 Mode simulation activé</p>
        <p className="text-xs text-yellow-700">
          Stripe n&apos;est pas configuré. Ce paiement est simulé et ne débite aucune carte réelle.
          Les données Firestore sont réellement mises à jour.
        </p>
      </div>
      <div className="bg-gray-50 rounded-xl p-4 flex justify-between items-center">
        <span className="text-[#6C757D] font-medium">Montant simulé</span>
        <span className="text-2xl font-black text-[#FF6B00]">{montant}€</span>
      </div>
      <button
        onClick={handleSimulatePay}
        disabled={paying}
        className="w-full py-4 bg-[#FF6B00] hover:bg-[#E56100] text-white rounded-xl font-bold text-lg transition-all disabled:opacity-50 shadow-md"
      >
        {paying ? '⏳ Traitement...' : `💳 Simuler le paiement de ${montant}€`}
      </button>
    </div>
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
                    <li>✅ Commission plateforme : {commission}€ (10%)</li>
                    <li>✅ Montant reçu par l'artisan : {montantArtisan.toFixed(2)}€</li>
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
