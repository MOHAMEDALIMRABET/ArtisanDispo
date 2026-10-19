'use client';

/**
 * Composant - Carte Litige
 * Affiche un résumé d'un litige dans une liste
 */

import Link from 'next/link';
import { Litige, LITIGE_TYPE_LABELS, LITIGE_STATUT_LABELS, LITIGE_STATUT_COLORS } from '@/types/litige';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface LitigeCardProps {
  litige: Litige;
  userRole: 'client' | 'artisan' | 'admin';
}

export default function LitigeCard({ litige, userRole }: LitigeCardProps) {
  const statutColor = LITIGE_STATUT_COLORS[litige.statut];
  const typeLabel = LITIGE_TYPE_LABELS[litige.type];
  const statutLabel = LITIGE_STATUT_LABELS[litige.statut];

  const dateOuverture = litige.dateOuverture || litige.createdAt;
  const tempsEcoule = dateOuverture 
    ? formatDistanceToNow(dateOuverture.toDate(), { addSuffix: true, locale: fr })
    : '';

  const estDeclarantClient = litige.declarantRole === 'client';

  return (
    <Link href={`/litiges/${litige.id}`}>
      <div className="bg-white border border-slate-200 hover:border-brand-500 rounded-lg p-6 shadow-sm hover:shadow-md transition-all cursor-pointer">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statutColor}`}>
                {statutLabel}
              </span>
              <span className="px-3 py-1 bg-slate-50 text-navy-800 rounded-full text-xs font-semibold">
                {typeLabel}
              </span>
            </div>
            <h3 className="text-lg font-bold text-navy-800 mb-1">
              {litige.motif}
            </h3>
            <p className="text-sm text-slate-500">
              Litige #{litige.id.slice(0, 8)} • Ouvert {tempsEcoule}
            </p>
          </div>

          {/* Icône rôle */}
          <div className="ml-4">
            {estDeclarantClient ? (
              <div className="bg-blue-50 text-blue-900 px-3 py-1 rounded-full text-xs font-semibold">
                👤 Client
              </div>
            ) : (
              <div className="bg-amber-50 text-amber-800 px-3 py-1 rounded-full text-xs font-semibold">
                🔧 Artisan
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-slate-500 mb-4 line-clamp-2">
          {litige.description}
        </p>

        {/* Info supplémentaires */}
        <div className="flex items-center gap-4 text-xs text-slate-500">
          {litige.montantConteste && (
            <div className="flex items-center gap-1">
              <span className="font-semibold text-red-700">
                Montant contesté : {litige.montantConteste.toFixed(2)} €
              </span>
            </div>
          )}

          {litige.adminAssigne && (
            <div className="flex items-center gap-1">
              <span className="text-green-700">✓ Médiateur assigné</span>
            </div>
          )}

          {litige.historique && litige.historique.length > 0 && (
            <div className="flex items-center gap-1">
              <span>{litige.historique.length} action(s)</span>
            </div>
          )}
        </div>

        {/* Résolution si litige résolu */}
        {(litige.statut === 'resolu_accord' || litige.statut === 'resolu_admin' || litige.statut === 'resolu') && litige.resolution && (
          <div className="mt-4 p-3 bg-green-50 border-l-4 border-green-600 rounded">
            <p className="text-sm text-green-800 font-semibold mb-1">
              ✅ Résolution
            </p>
            <p className="text-sm text-green-800">
              {litige.resolution}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 pt-4 border-t flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Devis #{litige.devisId.slice(0, 8)}
          </div>
          <div className="text-sm text-brand-700 font-semibold hover:underline">
            Voir les détails →
          </div>
        </div>
      </div>
    </Link>
  );
}
