'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/Button';

interface CheckoutFormProps {
  montant: number;
  demandeId: string;
}

export default function CheckoutForm({ montant, demandeId }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: submitError } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/client/paiement-success?demandeId=${demandeId}`,
        },
      });

      if (submitError) {
        setError(submitError.message || 'Une erreur est survenue lors du paiement');
        setLoading(false);
      }
      // Si pas d'erreur, Stripe redirige automatiquement vers return_url
    } catch (err: any) {
      console.error('Erreur paiement:', err);
      setError(err.message || 'Une erreur est survenue');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-navy-800 mb-2">
          <strong>🔒 Paiement sécurisé Stripe</strong>
        </p>
        <p className="text-xs text-slate-500">
          Vos informations bancaires sont chiffrées et sécurisées. Aucune donnée ne transite par nos serveurs.
        </p>
      </div>

      <PaymentElement />

      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">❌ {error}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
          disabled={loading}
          className="flex-1"
        >
          ← Retour
        </Button>
        <Button
          type="submit"
          disabled={!stripe || loading}
          className="flex-1"
        >
          {loading ? '⏳ Traitement...' : `💳 Payer ${montant}€`}
        </Button>
      </div>

      <div className="bg-green-50 rounded-lg p-4">
        <p className="text-xs text-slate-500 mb-2">
          <strong>💰 Paiement avec séquestre (escrow)</strong>
        </p>
        <ul className="text-xs text-slate-500 space-y-1">
          <li>• Votre argent est sécurisé jusqu'à la fin de l'intervention</li>
          <li>• L'artisan ne reçoit le paiement qu'après confirmation</li>
          <li>• Remboursement possible en cas de litige</li>
        </ul>
      </div>
    </form>
  );
}
