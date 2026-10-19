'use client';

/**
 * Dashboard Admin - Page d'accueil administration
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService } from '@/lib/auth-service';
import { getAllArtisansForAdmin } from '@/lib/firebase/artisan-service';
import { getAllClientsForAdmin } from '@/lib/firebase/account-service';
import type { Artisan } from '@/types/firestore';

interface Client {
  userId: string;
  suspended?: boolean;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    artisansTotal: 0,
    artisansActifs: 0,
    artisansSuspendus: 0,
    artisansEnAttente: 0,
    clientsTotal: 0,
    clientsActifs: 0,
    clientsSuspendus: 0,
  });
  const [emailStats, setEmailStats] = useState<{
    gmailCount: number;
    gmailLimit: number;
    percentage: number;
    alertLevel: 'safe' | 'warning' | 'critical' | 'danger';
  } | null>(null);

  useEffect(() => {
    loadStats();
    loadEmailStats();
  }, []);

  const loadStats = async () => {
    try {
      const user = authService.getCurrentUser();
      if (!user) {
        router.push('/access-x7k9m2p4w8n3');
        return;
      }

      const [artisans, clients] = await Promise.all([
        getAllArtisansForAdmin(),
        getAllClientsForAdmin()
      ]);

      // Artisans en attente de vérification
      const artisansEnAttente = artisans.filter(a => {
        const kbisEnCours = a.verificationDocuments?.kbis?.url && 
                           !a.verificationDocuments?.kbis?.verified && 
                           !a.verificationDocuments?.kbis?.rejected;
        const idEnCours = a.verificationDocuments?.idCard?.url && 
                         !a.verificationDocuments?.idCard?.verified && 
                         !a.verificationDocuments?.idCard?.rejected;
        return kbisEnCours || idEnCours;
      }).length;

      setStats({
        artisansTotal: artisans.length,
        artisansActifs: artisans.filter(a => !(a as any).suspended).length,
        artisansSuspendus: artisans.filter(a => (a as any).suspended).length,
        artisansEnAttente,
        clientsTotal: clients.length,
        clientsActifs: clients.filter(c => !(c as any).suspended).length,
        clientsSuspendus: clients.filter(c => (c as any).suspended).length,
      });
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    } finally {
      setLoading(false);
    }
  };
const loadEmailStats = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
      const response = await fetch(`${API_URL}/admin/email-stats/today`);
      
      if (response.ok) {
        const data = await response.json();
        const gmailCount = data.byProvider?.gmail || 0;
        const gmailLimit = 500;
        const percentage = Math.round((gmailCount / gmailLimit) * 100);

        let alertLevel: 'safe' | 'warning' | 'critical' | 'danger' = 'safe';
        if (gmailCount >= 450) alertLevel = 'danger';
        else if (gmailCount >= 400) alertLevel = 'critical';
        else if (gmailCount >= 300) alertLevel = 'warning';

        setEmailStats({
          gmailCount,
          gmailLimit,
          percentage,
          alertLevel
        });
      }
    } catch {
      // Backend non disponible - silencieux
    }
  };

  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xl text-slate-600">Chargement...</p>
      </div>
    );
  }

  const cards = [
    {
      title: 'Vérifications en attente',
      value: stats.artisansEnAttente,
      icon: '⏳',
      color: 'bg-yellow-500',
      link: '/admin/verifications',
      description: 'Documents à valider'
    },
    {
      title: 'Artisans',
      value: stats.artisansTotal,
      icon: '🔧',
      color: 'bg-brand-700',
      link: '/admin/comptes',
      description: `${stats.artisansActifs} actifs • ${stats.artisansSuspendus} suspendus`
    },
    {
      title: 'Clients',
      value: stats.clientsTotal,
      icon: '👥',
      color: 'bg-navy-800',
      link: '/admin/comptes',
      description: `${stats.clientsActifs} actifs • ${stats.clientsSuspendus} suspendus`
    },
    {
      title: 'Comptes suspendus',
      value: stats.artisansSuspendus + stats.clientsSuspendus,
      icon: '⚠️',
      color: 'bg-red-600',
      link: '/admin/comptes',
      description: 'Nécessitent attention'
    }
  ];

  const quickActions = [
    {
      title: 'Vérifier Documents',
      description: 'Valider les KBIS et pièces d\'identité',
      icon: '✅',
      link: '/admin/verifications',
      color: 'bg-green-600'
    },
    {
      title: 'Litiges & Conversations',
      description: 'Historique complet pour résolution litiges',
      icon: '🛡️',
      link: '/admin/litiges',
      color: 'bg-red-600'
    },
    {
      title: 'Gérer Artisans',
      description: 'Suspendre, réactiver, supprimer',
      icon: '🔧',
      link: '/admin/comptes',
      color: 'bg-brand-700'
    },
    {
      title: 'Gérer Clients',
      description: 'Modération des comptes clients',
      icon: '👤',
      link: '/admin/comptes',
      color: 'bg-navy-800'
    },
    {
      title: 'Demandes de rappel',
      description: 'Gérer les demandes "Être rappelé"',
      icon: '📞',
      link: '/admin/rappels',
      color: 'bg-blue-600'
    },
    {
      title: 'Monitoring Emails',
      description: 'Suivi quota Gmail et notifications',
      icon: '📊',
      link: '/admin/email-monitoring',
      color: 'bg-purple-600'
    }
  ];

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-navy-800 mb-2">
          Tableau de bord administrateur
        </h1>
        <p className="text-slate-600">
          Vue d'ensemble de la plateforme ArtisanDispo
        </p>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {cards.map((card, index) => (
          <Link
            key={index}
            href={card.link}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`${card.color} w-12 h-12 rounded-lg flex items-center justify-center text-2xl`}>
                {card.icon}
              </div>
              <span className="text-3xl font-bold text-slate-800">{card.value}</span>
            </div>
            <h3 className="font-semibold text-slate-700 mb-1">{card.title}</h3>
            <p className="text-sm text-slate-500">{card.description}</p>
          </Link>
        ))}
      </div>

      {/* Actions rapides */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-navy-800 mb-4">Actions rapides</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {quickActions.map((action, index) => (
            <Link
              key={index}
              href={action.link}
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-transparent hover:border-brand-500"
            >
              <div className={`${action.color} w-14 h-14 rounded-full flex items-center justify-center text-3xl mb-4 text-white`}>
                {action.icon}
              </div>
              <h3 className="font-bold text-lg text-slate-800 mb-2">{action.title}</h3>
              <p className="text-sm text-slate-600">{action.description}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Alertes */}
      {/* Alerte quota Gmail */}
      {emailStats && (emailStats.alertLevel === 'critical' || emailStats.alertLevel === 'danger') && (
        <div className={`border-l-4 p-6 rounded-lg mb-4 ${
          emailStats.alertLevel === 'danger' 
            ? 'bg-red-50 border-red-500' 
            : 'bg-orange-50 border-orange-500'
        }`}>
          <div className="flex items-start gap-4">
            <span className="text-3xl">{emailStats.alertLevel === 'danger' ? '🔥' : '🚨'}</span>
            <div className="flex-1">
              <h3 className={`font-bold mb-1 ${
                emailStats.alertLevel === 'danger' ? 'text-red-800' : 'text-orange-800'
              }`}>
                {emailStats.alertLevel === 'danger' 
                  ? 'URGENCE : Quota Gmail critique !' 
                  : 'ALERTE : Quota Gmail élevé'}
              </h3>
              <p className={`mb-3 ${
                emailStats.alertLevel === 'danger' ? 'text-red-700' : 'text-orange-700'
              }`}>
                {emailStats.gmailCount} emails envoyés sur {emailStats.gmailLimit} ({emailStats.percentage}%)
                {emailStats.alertLevel === 'danger' 
                  ? ' - Risque de suspension. Migrer vers Brevo IMMÉDIATEMENT !' 
                  : ' - Planifier migration Brevo dans les 24-48h.'}
              </p>
              <div className="flex gap-2">
                <Link
                  href="/admin/email-monitoring"
                  className={`inline-block text-white px-4 py-2 rounded-lg transition-colors ${
                    emailStats.alertLevel === 'danger'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-orange-600 hover:bg-orange-700'
                  }`}
                >
                  Voir détails
                </Link>
                <a
                  href="https://www.brevo.com/fr/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Migrer vers Brevo →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {stats.artisansEnAttente > 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-6 rounded-lg">
          <div className="flex items-start gap-4">
            <span className="text-3xl">⚠️</span>
            <div>
              <h3 className="font-bold text-yellow-800 mb-1">
                {stats.artisansEnAttente} vérification(s) en attente
              </h3>
              <p className="text-yellow-700 mb-3">
                Des documents artisans sont en attente de validation. Veuillez les vérifier rapidement.
              </p>
              <Link
                href="/admin/verifications"
                className="inline-block bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Voir les vérifications
              </Link>
            </div>
          </div>
        </div>
      )}

      {stats.artisansSuspendus + stats.clientsSuspendus > 0 && (
        <div className="bg-red-50 border-l-4 border-red-400 p-6 rounded-lg mt-4">
          <div className="flex items-start gap-4">
            <span className="text-3xl">🚫</span>
            <div>
              <h3 className="font-bold text-red-800 mb-1">
                {stats.artisansSuspendus + stats.clientsSuspendus} compte(s) suspendu(s)
              </h3>
              <p className="text-red-700 mb-3">
                {stats.artisansSuspendus} artisan(s) et {stats.clientsSuspendus} client(s) sont actuellement suspendus.
              </p>
              <Link
                href="/admin/comptes"
                className="inline-block bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Gérer les comptes
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
