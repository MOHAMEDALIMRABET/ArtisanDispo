'use client';

/**
 * Composant Modal - Créer un Litige
 * Permet au client ou artisan de déclarer un litige sur un devis accepté
 */

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { createLitige } from '@/lib/firebase/litige-service';
import { LitigeType, LITIGE_TYPE_LABELS } from '@/types/litige';

interface CreerLitigeModalProps {
  isOpen: boolean;
  onClose: () => void;
  devisId: string;
  clientId: string;
  artisanId: string;
  declarantId: string;
  declarantRole: 'client' | 'artisan';
  onSuccess?: () => void;
}

export default function CreerLitigeModal({
  isOpen,
  onClose,
  devisId,
  clientId,
  artisanId,
  declarantId,
  declarantRole,
  onSuccess,
}: CreerLitigeModalProps) {
  const { t } = useLanguage();
  const [type, setType] = useState<LitigeType>('non_conformite');
  const [motif, setMotif] = useState('');
  const [description, setDescription] = useState('');
  const [montantConteste, setMontantConteste] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!motif.trim()) {
      setError('Le motif est requis');
      return;
    }

    if (!description.trim()) {
      setError('La description est requise');
      return;
    }

    if (description.length < 50) {
      setError('La description doit contenir au moins 50 caractères pour être précise');
      return;
    }

    try {
      setLoading(true);

      await createLitige({
        devisId,
        clientId,
        artisanId,
        declarantId,
        declarantRole,
        type,
        motif: motif.trim(),
        description: description.trim(),
        montantConteste: montantConteste > 0 ? montantConteste : undefined,
      });

      // Succès
      alert(t('alerts.dispute.createdSuccess'));
      onSuccess?.();
      handleClose();
    } catch (err) {
      console.error('Erreur création litige:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la création du litige');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setType('non_conformite');
    setMotif('');
    setDescription('');
    setMontantConteste(0);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-md max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-navy-800">
              ⚠️ Déclarer un Litige
            </h2>
            <button
              onClick={handleClose}
              className="text-slate-500 hover:text-navy-800"
            >
              ✕
            </button>
          </div>

          <div className="mb-4 p-4 bg-amber-50 border-l-4 border-amber-400 rounded">
            <p className="text-sm text-amber-800">
              <strong>Important :</strong> Un litige doit être justifié par un problème réel (non-conformité, retard, malfaçon, etc.). 
              Notre équipe de médiation examinera votre demande dans les 24 heures.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-600 rounded">
              <p className="text-sm text-red-900">{error}</p>
            </div>
          )}

          {/* Formulaire */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Type de litige */}
            <div>
              <label className="block text-sm font-semibold text-navy-800 mb-2">
                Type de litige *
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as LitigeType)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500"
                required
              >
                {Object.entries(LITIGE_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Motif court */}
            <div>
              <label className="block text-sm font-semibold text-navy-800 mb-2">
                Motif (résumé en une phrase) *
              </label>
              <input
                type="text"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Ex: Travaux non conformes aux normes électriques"
                maxLength={100}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500"
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                {motif.length}/100 caractères
              </p>
            </div>

            {/* Description détaillée */}
            <div>
              <label className="block text-sm font-semibold text-navy-800 mb-2">
                Description détaillée *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Décrivez précisément le problème : dates, détails techniques, échanges, preuves disponibles..."
                rows={6}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500"
                required
                minLength={50}
              />
              <p className="text-xs text-slate-500 mt-1">
                {description.length} caractères (minimum 50)
              </p>
            </div>

            {/* Montant contesté */}
            <div>
              <label className="block text-sm font-semibold text-navy-800 mb-2">
                Montant contesté (optionnel)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={montantConteste}
                  onChange={(e) => setMontantConteste(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  min="0"
                  step="0.01"
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500"
                />
                <span className="text-slate-500">€</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Si applicable, indiquez le montant que vous contestez
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4 pt-4 border-t">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-6 py-3 border-2 border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 font-semibold"
                disabled={loading}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-red-700 text-white rounded-lg hover:bg-red-800 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading}
              >
                {loading ? 'Envoi en cours...' : '⚠️ Déclarer le litige'}
              </button>
            </div>
          </form>

          {/* Info supplémentaire */}
          <div className="mt-6 p-4 bg-blue-50 border-l-4 border-sky-600 rounded">
            <p className="text-sm text-blue-900">
              <strong>Que se passe-t-il ensuite ?</strong>
            </p>
            <ul className="text-sm text-blue-900 mt-2 space-y-1 list-disc list-inside">
              <li>Notre équipe examine votre litige sous 24h</li>
              <li>Un médiateur est assigné à votre dossier</li>
              <li>Les deux parties sont contactées pour discussion</li>
              <li>Une solution amiable est recherchée en priorité</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
