'use client';

/**
 * Composant de paiement par carte bancaire
 * Affiche un formulaire sécurisé pour le paiement après signature
 * 
 * TODO Phase 2: Intégrer Stripe Elements pour paiement réel
 * Actuellement: Formulaire simulé pour validation UX
 */

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Timestamp } from 'firebase/firestore';

interface PaymentFormProps {
  devisId: string;
  montantTTC: number;
  numeroDevis: string;
  onSuccess: (paymentData: PaymentData) => void;
  onCancel: () => void;
  dateLimitePaiement: Timestamp;
}

export interface PaymentData {
  montant: number;
  date: Timestamp;
  methode: 'carte_bancaire';
  referenceTransaction: string;
  statut: 'valide';
}

export function PaymentForm({ 
  devisId, 
  montantTTC, 
  numeroDevis, 
  onSuccess, 
  onCancel,
  dateLimitePaiement 
}: PaymentFormProps) {
  const { t } = useLanguage();
  const [processing, setProcessing] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Calculer temps restant
  const now = new Date();
  const limite = dateLimitePaiement.toDate();
  const heuresRestantes = Math.max(0, Math.floor((limite.getTime() - now.getTime()) / (1000 * 60 * 60)));
  const minutesRestantes = Math.max(0, Math.floor(((limite.getTime() - now.getTime()) % (1000 * 60 * 60)) / (1000 * 60)));

  // process.env.NODE_ENV est remplacé à la compilation par Next.js :
  // → 'development' en local (`next dev`), 'production' lors du build (`next build`).
  // Le bloc ci-dessous est donc éliminé du bundle de production par tree-shaking.
  const isDev = process.env.NODE_ENV === 'development';

  // Remplir automatiquement avec la carte de test Stripe (mode dev uniquement)
  const fillTestCard = () => {
    setCardNumber('4242 4242 4242 4242');
    setCardName('TEST CARD');
    setExpiryDate('12/34');
    setCvv('123');
    setErrors({});
  };

  // Formatage automatique numéro de carte (XXXX XXXX XXXX XXXX)
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\s/g, ''); // Enlever espaces
    value = value.replace(/\D/g, ''); // Garder seulement chiffres
    value = value.substring(0, 16); // Max 16 chiffres
    
    // Ajouter espaces tous les 4 chiffres
    const formatted = value.match(/.{1,4}/g)?.join(' ') || value;
    setCardNumber(formatted);
  };

  // Formatage date expiration (MM/YY)
  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, ''); // Garder seulement chiffres
    value = value.substring(0, 4); // Max 4 chiffres (MMYY)
    
    if (value.length >= 2) {
      value = value.substring(0, 2) + '/' + value.substring(2);
    }
    
    setExpiryDate(value);
  };

  // Validation formulaire
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    // Numéro de carte (16 chiffres)
    const cardNumberClean = cardNumber.replace(/\s/g, '');
    if (!cardNumberClean) {
      newErrors.cardNumber = 'Numéro de carte requis';
    } else if (cardNumberClean.length !== 16) {
      newErrors.cardNumber = 'Numéro de carte invalide (16 chiffres requis)';
    }

    // Titulaire
    if (!cardName.trim()) {
      newErrors.cardName = 'Nom du titulaire requis';
    } else if (cardName.trim().length < 3) {
      newErrors.cardName = 'Nom du titulaire trop court';
    }

    // Date expiration
    if (!expiryDate) {
      newErrors.expiryDate = 'Date d\'expiration requise';
    } else {
      const [month, year] = expiryDate.split('/');
      const monthNum = parseInt(month);
      const yearNum = parseInt('20' + year);
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;

      if (monthNum < 1 || monthNum > 12) {
        newErrors.expiryDate = 'Mois invalide (01-12)';
      } else if (yearNum < currentYear || (yearNum === currentYear && monthNum < currentMonth)) {
        newErrors.expiryDate = 'Carte expirée';
      }
    }

    // CVV (3 ou 4 chiffres)
    if (!cvv) {
      newErrors.cvv = 'CVV requis';
    } else if (cvv.length < 3 || cvv.length > 4) {
      newErrors.cvv = 'CVV invalide (3-4 chiffres)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setProcessing(true);

    try {
      // TODO Phase 2: Intégrer Stripe Payment Intent
      // const { paymentIntent } = await stripe.confirmCardPayment(clientSecret, { ... });

      // Simulation paiement (2 secondes)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Simuler succès paiement
      const paymentData: PaymentData = {
        montant: montantTTC,
        date: Timestamp.now(),
        methode: 'carte_bancaire',
        referenceTransaction: `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`, // ID simulé
        statut: 'valide',
      };

      onSuccess(paymentData);
    } catch (error) {
      console.error('Erreur paiement:', error);
      alert(t('alerts.payment.saveError'));
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-[#2C3E50] text-white p-6 rounded-t-lg">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            Paiement sécurisé
          </h2>
          <p className="text-sm text-gray-300 mt-2">
            Devis {numeroDevis}
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Carte virtuelle de test (mode dev uniquement) */}
          {isDev && (
            <div className="bg-[#FFF8E1] border-2 border-dashed border-[#FFC107] rounded-lg p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-bold text-[#2C3E50] flex items-center gap-1">
                    🛠️ MODE DÉVELOPPEMENT — Carte de test
                  </p>
                  <p className="text-xs text-[#6C757D] mt-1">
                    Numéro : <code className="bg-[#FFC107] bg-opacity-20 px-1 rounded">4242 4242 4242 4242</code>
                    &nbsp;|&nbsp;Expiration : <code className="bg-[#FFC107] bg-opacity-20 px-1 rounded">12/34</code>
                    &nbsp;|&nbsp;CVV : <code className="bg-[#FFC107] bg-opacity-20 px-1 rounded">123</code>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fillTestCard}
                  disabled={processing}
                  className="px-4 py-2 bg-[#FFC107] text-[#2C3E50] rounded-lg text-sm font-semibold hover:bg-[#E5AB00] transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  ⚡ Utiliser la carte test
                </button>
              </div>
            </div>
          )}

          {/* Alerte délai 24h */}
          <div className={`border-l-4 p-4 rounded ${
            heuresRestantes < 2 
              ? 'bg-red-50 border-red-500' 
              : 'bg-blue-50 border-blue-500'
          }`}>
            <div className="flex items-start gap-3">
              <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                heuresRestantes < 2 ? 'text-red-600' : 'text-blue-600'
              }`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              <div className={`text-sm ${heuresRestantes < 2 ? 'text-red-800' : 'text-blue-800'}`}>
                <p className="font-semibold mb-1">
                  {heuresRestantes < 2 ? '⚠️ Attention - Délai bientôt expiré' : '⏰ Délai de paiement : 24h'}
                </p>
                <p className={heuresRestantes < 2 ? 'text-red-700' : 'text-blue-700'}>
                  Temps restant : <strong>{heuresRestantes}h {minutesRestantes}min</strong>
                </p>
                <p className="text-xs mt-1">
                  {heuresRestantes < 2 
                    ? 'Si le paiement n\'est pas effectué, le devis sera automatiquement annulé.'
                    : 'Après ce délai, le devis sera automatiquement annulé et vous devrez redemander un devis.'
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Montant */}
          <div className="bg-[#FF6B00] bg-opacity-10 border-2 border-[#FF6B00] rounded-lg p-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-700 font-semibold">Montant à payer :</span>
              <span className="text-3xl font-bold text-[#FF6B00]">
                {montantTTC.toFixed(2)} €
              </span>
            </div>
          </div>

          {/* Formulaire */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Numéro de carte */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Numéro de carte <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={cardNumber}
                  onChange={handleCardNumberChange}
                  placeholder="1234 5678 9012 3456"
                  className={`w-full border-2 rounded-lg px-4 py-3 pr-12 focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent ${
                    errors.cardNumber ? 'border-red-500' : 'border-gray-300'
                  }`}
                  disabled={processing}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="w-8 h-6 text-gray-400" fill="currentColor" viewBox="0 0 48 32">
                    <rect width="48" height="32" rx="4" fill="#1A1F71"/>
                    <circle cx="18" cy="16" r="8" fill="#EB001B"/>
                    <circle cx="30" cy="16" r="8" fill="#F79E1B"/>
                  </svg>
                </div>
              </div>
              {errors.cardNumber && (
                <p className="text-red-600 text-sm mt-1">{errors.cardNumber}</p>
              )}
            </div>

            {/* Titulaire */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Nom du titulaire <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={cardName}
                onChange={(e) => setCardName(e.target.value.toUpperCase())}
                placeholder="JEAN DUPONT"
                className={`w-full border-2 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent uppercase ${
                  errors.cardName ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={processing}
              />
              {errors.cardName && (
                <p className="text-red-600 text-sm mt-1">{errors.cardName}</p>
              )}
            </div>

            {/* Date + CVV */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Date d'expiration <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={expiryDate}
                  onChange={handleExpiryChange}
                  placeholder="MM/YY"
                  className={`w-full border-2 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent ${
                    errors.expiryDate ? 'border-red-500' : 'border-gray-300'
                  }`}
                  disabled={processing}
                />
                {errors.expiryDate && (
                  <p className="text-red-600 text-sm mt-1">{errors.expiryDate}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  CVV <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').substring(0, 4))}
                  placeholder="123"
                  className={`w-full border-2 rounded-lg px-4 py-3 focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent ${
                    errors.cvv ? 'border-red-500' : 'border-gray-300'
                  }`}
                  disabled={processing}
                />
                {errors.cvv && (
                  <p className="text-red-600 text-sm mt-1">{errors.cvv}</p>
                )}
              </div>
            </div>

            {/* Sécurité */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <div className="text-green-800">
                  <p className="font-semibold mb-1">🔒 Paiement 100% sécurisé</p>
                  <ul className="text-xs text-green-700 space-y-1">
                    <li>• Vos données bancaires sont chiffrées (SSL/TLS)</li>
                    <li>• Conforme PCI-DSS (norme bancaire internationale)</li>
                    <li>• Aucune donnée stockée sur nos serveurs</li>
                  </ul>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-6 rounded-b-lg flex flex-wrap gap-3 justify-end border-t">
          <button
            onClick={onCancel}
            disabled={processing}
            className="px-6 py-3 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400 transition-colors disabled:opacity-50"
          >
            ❌ Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={processing}
            className="px-8 py-3 bg-[#FF6B00] text-white rounded-lg font-semibold hover:bg-[#E56100] disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {processing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                Paiement en cours...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Payer {montantTTC.toFixed(2)} €
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
