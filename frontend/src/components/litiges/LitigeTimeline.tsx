/**
 * Composant Timeline d'un litige
 * Affiche l'historique complet des actions
 */

'use client';

import { HistoriqueAction } from '@/types/litige';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  MessageSquare,
  UserCheck,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  ArrowUpCircle,
  Plus,
} from 'lucide-react';

interface LitigeTimelineProps {
  historique: HistoriqueAction[];
  currentUserId: string;
}

export default function LitigeTimeline({ historique, currentUserId }: LitigeTimelineProps) {
  // Trier par date décroissante (plus récent en haut)
  const sortedHistorique = [...historique].sort((a, b) => {
    const dateA = a.timestamp?.toMillis() || 0;
    const dateB = b.timestamp?.toMillis() || 0;
    return dateB - dateA;
  });

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'creation':
        return <Plus className="w-5 h-5 text-brand-700" />;
      case 'commentaire':
        return <MessageSquare className="w-5 h-5 text-blue-500" />;
      case 'assignation':
        return <UserCheck className="w-5 h-5 text-purple-500" />;
      case 'proposition_resolution':
        return <FileText className="w-5 h-5 text-green-500" />;
      case 'acceptation_resolution':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'refus_resolution':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'escalade':
        return <ArrowUpCircle className="w-5 h-5 text-orange-500" />;
      case 'resolution':
        return <CheckCircle className="w-5 h-5 text-green-700" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-slate-500" />;
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'client':
        return 'Client';
      case 'artisan':
        return 'Artisan';
      case 'admin':
        return 'Médiateur';
      default:
        return 'Système';
    }
  };

  const getActionColor = (type: string) => {
    switch (type) {
      case 'creation':
        return 'bg-orange-50 border-orange-200';
      case 'commentaire':
        return 'bg-blue-50 border-blue-200';
      case 'assignation':
        return 'bg-purple-50 border-purple-200';
      case 'proposition_resolution':
        return 'bg-green-50 border-green-200';
      case 'acceptation_resolution':
        return 'bg-green-100 border-green-300';
      case 'refus_resolution':
        return 'bg-red-50 border-red-200';
      case 'escalade':
        return 'bg-orange-50 border-orange-300';
      case 'resolution':
        return 'bg-green-100 border-green-400';
      default:
        return 'bg-slate-50 border-slate-200';
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-navy-800">Historique du litige</h3>

      <div className="relative">
        {/* Ligne verticale */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-300" />

        {/* Actions */}
        <div className="space-y-6">
          {sortedHistorique.map((action, index) => (
            <div key={index} className="relative flex gap-4">
              {/* Icône */}
              <div className="relative z-10 flex-shrink-0 w-12 h-12 bg-white border-2 border-slate-300 rounded-full flex items-center justify-center">
                {getActionIcon(action.type)}
              </div>

              {/* Contenu */}
              <div className={`flex-1 p-4 rounded-lg border-2 ${getActionColor(action.type)}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    {/* Auteur et rôle */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-navy-800">
                        {getRoleLabel(action.acteurRole)}
                      </span>
                      {action.acteur === currentUserId && (
                        <span className="px-2 py-0.5 text-xs bg-brand-700 text-white rounded">
                          Vous
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p className="text-slate-700 mb-2">{action.description}</p>

                    {/* Détails supplémentaires */}
                    {action.metadata && Object.keys(action.metadata).length > 0 && (
                      <div className="mt-2 p-3 bg-white/50 rounded border border-slate-200">
                        <p className="text-sm text-slate-600 font-medium mb-1">Détails :</p>
                        {action.metadata.montantClient !== undefined && (
                          <p className="text-sm text-slate-700">
                            • Remboursement client : {action.metadata.montantClient}€
                          </p>
                        )}
                        {action.metadata.montantArtisan !== undefined && (
                          <p className="text-sm text-slate-700">
                            • Paiement artisan : {action.metadata.montantArtisan}€
                          </p>
                        )}
                        {action.metadata.motif && (
                          <p className="text-sm text-slate-700">• Motif : {action.metadata.motif}</p>
                        )}
                        {action.metadata.raison && (
                          <p className="text-sm text-slate-700">• Raison : {action.metadata.raison}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Date */}
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {action.timestamp
                      ? formatDistanceToNow(action.timestamp.toDate(), {
                          addSuffix: true,
                          locale: fr,
                        })
                      : 'Date inconnue'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {sortedHistorique.length === 0 && (
        <p className="text-center text-slate-500 py-8">Aucune action enregistrée</p>
      )}
    </div>
  );
}
