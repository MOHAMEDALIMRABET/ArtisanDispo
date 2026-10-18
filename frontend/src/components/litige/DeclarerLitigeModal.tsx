'use client';

/**
 * Modal pour déclarer un litige sur un contrat/devis
 * Utilisable par client ou artisan
 */

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { LitigeType, LITIGE_TYPE_LABELS, LitigePieceJointe } from '@/types/litige';
import { createLitige } from '@/lib/firebase/litige-service';
import { authService } from '@/lib/auth-service';
import UploadPiecesJointes from './UploadPiecesJointes';

interface DeclarerLitigeModalProps {
  isOpen: boolean;
  onClose: () => void;
  devisId: string;
  clientId: string;
  artisanId: string;
  declarantRole: 'client' | 'artisan';
  onLitigeCreated?: (litigeId: string) => void;
}

export default function DeclarerLitigeModal({
  isOpen,
  onClose,
  devisId,
  clientId,
  artisanId,
  declarantRole,
  onLitigeCreated
}: DeclarerLitigeModalProps) {
  const { t } = useLanguage();
  const [type, setType] = useState<LitigeType>('non_conformite');
  const [motif, setMotif] = useState('');
  const [description, setDescription] = useState('');
  const [montantConteste, setMontantConteste] = useState<number>(0);
  const [piecesJointes, setPiecesJointes] = useState<LitigePieceJointe[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const user = authService.getCurrentUser();
    if (!user) {
      setError('Vous devez être connecté pour déclarer un litige');
      return;
    }

    if (!motif.trim() || !description.trim()) {
      setError('Veuillez remplir tous les champs obligatoires');
      return;
    }

    try {
      setLoading(true);

      const litigeId = await createLitige({
        devisId,
        clientId,
        artisanId,
        declarantId: user.uid,
        declarantRole,
        type,
        motif: motif.trim(),
        description: description.trim(),
        montantConteste: montantConteste > 0 ? montantConteste : undefined,
        piecesJointes: piecesJointes.length > 0 ? piecesJointes : undefined,
      });

      // Succès
      alert(t('alerts.dispute.declaredSuccess'));
      onLitigeCreated?.(litigeId);
      onClose();
      
      // Reset form
      setMotif('');
      setDescription('');
      setPiecesJointes([]);
      setMontantConteste(0);
    } catch (err: any) {
      console.error('Erreur lors de la déclaration du litige:', err);
      setError(err.message || 'Erreur lors de la déclaration du litige');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-md max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-red-700 text-white px-6 py-4 rounded-t-lg">
          <h2 className="text-xl font-bold">⚠️ Déclarer un litige</h2>
          <p className="text-sm mt-1 opacity-90">
            Votre litige sera examiné par notre équipe de médiation
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Type de litige */}
          <div>
            <label className="block text-sm font-semibold text-navy-800 mb-2">
              Type de litige *
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as LitigeType)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            >
              {Object.entries(LITIGE_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Motif */}
          <div>
            <label className="block text-sm font-semibold text-navy-800 mb-2">
              Motif du litige * (titre court)
            </label>
            <input
              type="text"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              maxLength={100}
              placeholder="Ex: Travaux non conformes au devis"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
            <p className="text-xs text-slate-500 mt-1">{motif.length}/100 caractères</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-navy-800 mb-2">
              Description détaillée *
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="Décrivez en détail le problème rencontré, avec dates et faits précis..."
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              required
            />
            <p className="text-xs text-slate-500 mt-1">{description.length} caractères</p>
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
                min="0"
                step="0.01"
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <span className="text-slate-600">€</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Si le litige concerne un montant financier précis
            </p>
          </div>

          {/* Pièces jointes */}
          <UploadPiecesJointes
            onFilesUploaded={setPiecesJointes}
            maxFiles={5}
            maxSizePerFile={10}
          />

          {/* Info médiation */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-navy-800 mb-2 flex items-center gap-2">
              ℹ️ Processus de médiation
            </h3>
            <ul className="text-sm text-slate-700 space-y-1 ml-4 list-disc">
              <li>Votre litige sera examiné sous 24-48h</li>
              <li>Un médiateur neutre sera assigné</li>
              <li>Les deux parties seront contactées</li>
              <li>Une solution amiable sera recherchée en priorité</li>
              <li>Le paiement sera gelé jusqu'à résolution</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-red-700 text-white font-semibold rounded-lg hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Envoi en cours...' : '⚠️ Déclarer le litige'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
