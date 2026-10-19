/**
 * Page Artisan - Mes Litiges
 * Liste et gestion des litiges concernant l'artisan
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStatus } from '@/hooks/useAuthStatus';
import { useLanguage } from '@/contexts/LanguageContext';
import { getLitigesByUser } from '@/lib/firebase/litige-service';
import { Litige, LitigeType } from '@/types/litige';
import { AlertTriangle, Eye, Filter } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';

export default function ArtisanLitigesPage() {
  const router = useRouter();
  const { user, role, loading: authLoading } = useAuthStatus();
  const { t } = useLanguage();
  const [litiges, setLitiges] = useState<Litige[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'tous' | 'ouverts' | 'resolus'>('tous');

  useEffect(() => {
    if (authLoading) return;
    if (!user || role !== 'artisan') {
      router.push('/login');
      return;
    }

    loadLitiges();
  }, [user, role, authLoading]);

  async function loadLitiges() {
    if (!user) return;

    try {
      setLoading(true);
      const data = await getLitigesByUser(user.uid);
      setLitiges(data);
    } catch (error) {
      console.error('Erreur chargement litiges:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredLitiges = litiges.filter((litige) => {
    if (filter === 'ouverts') {
      return litige.statut === 'ouvert' || litige.statut === 'en_mediation' || litige.statut === 'proposition_resolution';
    }
    if (filter === 'resolus') {
      return litige.statut === 'resolu_accord' || litige.statut === 'resolu_admin';
    }
    return true;
  });

  const getStatusBadge = (statut: string) => {
    const styles: Record<string, { bg: string; text: string }> = {
      ouvert: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
      en_mediation: { bg: 'bg-blue-100', text: 'text-blue-800' },
      proposition_resolution: { bg: 'bg-purple-100', text: 'text-purple-800' },
      resolu_accord: { bg: 'bg-green-100', text: 'text-green-800' },
      resolu_admin: { bg: 'bg-green-100', text: 'text-green-800' },
      abandonne: { bg: 'bg-slate-100', text: 'text-slate-800' },
      escalade: { bg: 'bg-orange-100', text: 'text-orange-800' },
    };

    const style = styles[statut] || styles.ouvert;
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
        {t(`artisanDisputes.statuses.${statut}`)}
      </span>
    );
  };

  const getTypeBadge = (type: LitigeType) => {
    return (
      <span className="px-2 py-1 rounded text-xs bg-slate-100 text-slate-700">
        {t(`artisanDisputes.types.${type}`)}
      </span>
    );
  };

  const getPrioriteBadge = (priorite?: string) => {
    if (!priorite) return null;

    const styles: Record<string, { bg: string; text: string }> = {
      basse: { bg: 'bg-slate-100', text: 'text-slate-700' },
      moyenne: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
      haute: { bg: 'bg-orange-100', text: 'text-orange-800' },
      urgente: { bg: 'bg-red-100', text: 'text-red-800' },
    };

    const style = styles[priorite] || styles.moyenne;
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${style.bg} ${style.text}`}>
        🔥 {t(`artisanDisputes.priorities.${priorite}`)}
      </span>
    );
  };

  if (authLoading || loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center">
          <p className="text-slate-600">{t('artisanDisputes.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-navy-800">{t('artisanDisputes.pageTitle')}</h1>
            <p className="text-slate-600 mt-2">{t('artisanDisputes.pageDescription')}</p>
          </div>
        </div>

        {/* Filtres */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('tous')}
            className={`px-4 py-2 rounded-lg transition ${
              filter === 'tous'
                ? 'bg-navy-800 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t('artisanDisputes.filters.all')} ({litiges.length})
          </button>
          <button
            onClick={() => setFilter('ouverts')}
            className={`px-4 py-2 rounded-lg transition ${
              filter === 'ouverts'
                ? 'bg-navy-800 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t('artisanDisputes.filters.inProgress')} (
            {
              litiges.filter(
                (l) =>
                  l.statut === 'ouvert' ||
                  l.statut === 'en_mediation' ||
                  l.statut === 'proposition_resolution'
              ).length
            }
            )
          </button>
          <button
            onClick={() => setFilter('resolus')}
            className={`px-4 py-2 rounded-lg transition ${
              filter === 'resolus'
                ? 'bg-navy-800 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t('artisanDisputes.filters.resolved')} (
            {litiges.filter((l) => l.statut === 'resolu_accord' || l.statut === 'resolu_admin').length}
            )
          </button>
        </div>
      </div>

      {/* Liste des litiges */}
      {filteredLitiges.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <AlertTriangle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600 text-lg">{t('artisanDisputes.empty.title')}</p>
          {filter !== 'tous' && (
            <button
              onClick={() => setFilter('tous')}
              className="mt-4 text-brand-700 hover:underline"
            >
              {t('artisanDisputes.empty.showAll')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredLitiges.map((litige) => (
            <div
              key={litige.id}
              className="bg-white border border-slate-200 rounded-lg p-6 hover:border-brand-500 transition"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {getStatusBadge(litige.statut)}
                    {getTypeBadge(litige.type)}
                    {getPrioriteBadge(litige.priorite)}
                    {litige.adminAssigne && (
                      <span className="px-2 py-1 rounded text-xs bg-purple-100 text-purple-700">
                        {t('artisanDisputes.mediatorAssigned')}
                      </span>
                    )}
                    {litige.declarantRole === 'artisan' && (
                      <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700">
                        {t('artisanDisputes.youDeclared')}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-navy-800 mb-1">{litige.motif}</h3>
                  <p className="text-slate-600 text-sm line-clamp-2">{litige.description}</p>
                </div>
                <Link
                  href={`/artisan/litiges/${litige.id}`}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-700 text-white rounded-lg hover:bg-brand-800 transition whitespace-nowrap"
                >
                  <Eye className="w-4 h-4" />
                  {t('artisanDisputes.viewButton')}
                </Link>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-t pt-4">
                <div>
                  <p className="text-slate-500">{t('artisanDisputes.details.openedOn')}</p>
                  <p className="font-medium text-navy-800">
                    {litige.dateOuverture
                      ? formatDistanceToNow(litige.dateOuverture.toDate(), {
                          addSuffix: true,
                          locale: fr,
                        })
                      : t('artisanDisputes.details.unknownDate')}
                  </p>
                </div>
                {litige.montantConteste && litige.montantConteste > 0 && (
                  <div>
                    <p className="text-slate-500">{t('artisanDisputes.details.contested')}</p>
                    <p className="font-medium text-navy-800">{litige.montantConteste}€</p>
                  </div>
                )}
                <div>
                  <p className="text-slate-500">{t('artisanDisputes.details.actions')}</p>
                  <p className="font-medium text-navy-800">{litige.historique.length}</p>
                </div>
                {litige.dateResolution && (
                  <div>
                    <p className="text-slate-500">{t('artisanDisputes.details.resolvedOn')}</p>
                    <p className="font-medium text-green-600">
                      {formatDistanceToNow(litige.dateResolution.toDate(), {
                        addSuffix: true,
                        locale: fr,
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
