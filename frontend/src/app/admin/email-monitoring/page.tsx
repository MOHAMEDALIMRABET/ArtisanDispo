'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authService } from '@/lib/auth-service';

// Types
interface DailyEmailStats {
  date: string;
  totalSent: number;
  totalFailed: number;
  byProvider: {
    gmail: number;
    firebase: number;
    brevo: number;
  };
  byType: {
    transactional: number;
    notification: number;
    auth: number;
    system: number;
  };
}

interface WeeklyReport {
  totalSent: number;
  totalFailed: number;
  averagePerDay: number;
  peakDay: { date: string; count: number };
  byProvider: { gmail: number; firebase: number; brevo: number };
  trend: 'increasing' | 'decreasing' | 'stable';
}

interface EmailLog {
  id: string;
  timestamp: { _seconds: number };
  recipient: string;
  subject: string;
  type: string;
  provider: string;
  status: string;
  error?: string;
}

interface EmailAlert {
  id: string;
  level: 'warning' | 'critical' | 'danger';
  message: string;
  recommendation: string;
  current: number;
  limit: number;
  percentage: number;
  timestamp: { _seconds: number };
  isRead: boolean;
}

export default function EmailMonitoringPage() {
  const router = useRouter();

  const [todayStats, setTodayStats] = useState<DailyEmailStats | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [recentLogs, setRecentLogs] = useState<EmailLog[]>([]);
  const [alerts, setAlerts] = useState<EmailAlert[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Vérification admin et chargement initial
  useEffect(() => {
    const user = authService.getCurrentUser();
    if (!user) {
      router.push('/access-x7k9m2p4w8n3');
      return;
    }
    loadAllData();
    // Actualiser toutes les minutes
    const interval = setInterval(loadAllData, 60000);
    return () => clearInterval(interval);
  }, [router]);



  const loadAllData = async () => {
    setRefreshing(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

      const [todayRes, weeklyRes, logsRes, alertsRes] = await Promise.all([
        fetch(`${API_URL}/admin/email-stats/today`),
        fetch(`${API_URL}/admin/email-stats/weekly-report`),
        fetch(`${API_URL}/admin/email-logs?limit=50`),
        fetch(`${API_URL}/admin/email-alerts`),
      ]);

      const [todayData, weeklyData, logsData, alertsData] = await Promise.all([
        todayRes.json(),
        weeklyRes.json(),
        logsRes.json(),
        alertsRes.json(),
      ]);

      setTodayStats(todayData);
      setWeeklyReport(weeklyData);
      setRecentLogs(logsData);
      setAlerts(alertsData);
    } catch (error) {
      console.error('❌ Erreur chargement données:', error);
    } finally {
      setLoadingData(false);
      setRefreshing(false);
    }
  };

  const markAlertAsRead = async (alertId: string) => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
      await fetch(`${API_URL}/admin/email-alerts/${alertId}/read`, { method: 'POST' });
      
      // Retirer l'alerte de la liste
      setAlerts(alerts.filter(a => a.id !== alertId));
    } catch (error) {
      console.error('❌ Erreur marquage alerte:', error);
    }
  };

  if (loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-brand-500 mx-auto mb-4"></div>
          <p className="text-slate-600">Chargement des statistiques...</p>
        </div>
      </div>
    );
  }

  const gmailCount = todayStats?.byProvider.gmail || 0;
  const gmailPercentage = Math.round((gmailCount / 500) * 100);
  const gmailLimit = 500;

  // Déterminer le niveau d'alerte
  let alertLevel: 'safe' | 'warning' | 'critical' | 'danger' = 'safe';
  if (gmailCount >= 450) alertLevel = 'danger';
  else if (gmailCount >= 400) alertLevel = 'critical';
  else if (gmailCount >= 300) alertLevel = 'warning';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-navy-800 text-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">📊 Monitoring Emails Gmail</h1>
              <p className="text-slate-300 mt-1">Suivi en temps réel des emails transactionnels</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={loadAllData}
                disabled={refreshing}
                className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
                {refreshing ? 'Actualisation...' : 'Actualiser'}
              </button>
              <Link
                href="/admin/dashboard"
                className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors"
              >
                ← Retour Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Alertes actives */}
        {alerts.length > 0 && (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 rounded-lg border-l-4 ${
                  alert.level === 'danger'
                    ? 'bg-red-50 border-red-500'
                    : alert.level === 'critical'
                    ? 'bg-orange-50 border-orange-500'
                    : 'bg-yellow-50 border-yellow-500'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-bold text-slate-900">{alert.message}</p>
                    <p className="text-slate-700 mt-1">{alert.recommendation}</p>
                    <p className="text-sm text-slate-600 mt-2">
                      {new Date(alert.timestamp._seconds * 1000).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  <button
                    onClick={() => markAlertAsRead(alert.id)}
                    className="ml-4 text-slate-500 hover:text-slate-700"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Jauge Gmail aujourd'hui */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900">📧 Limite Gmail Aujourd'hui</h2>
            <span className="text-sm text-slate-500">
              {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>

          {/* Barre de progression */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-3xl font-bold text-slate-900">{gmailCount} / {gmailLimit}</span>
              <span className={`text-2xl font-bold ${
                alertLevel === 'danger' ? 'text-red-600' :
                alertLevel === 'critical' ? 'text-orange-600' :
                alertLevel === 'warning' ? 'text-yellow-600' :
                'text-green-600'
              }`}>
                {gmailPercentage}%
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-6 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  alertLevel === 'danger' ? 'bg-red-600' :
                  alertLevel === 'critical' ? 'bg-orange-500' :
                  alertLevel === 'warning' ? 'bg-yellow-500' :
                  'bg-green-500'
                }`}
                style={{ width: `${Math.min(gmailPercentage, 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Messages d'avertissement */}
          {alertLevel === 'danger' && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              <p className="font-bold">🔥 URGENCE : Limite atteinte à 90%+</p>
              <p>Risque de suspension compte Gmail. Migrer vers Brevo IMMÉDIATEMENT.</p>
            </div>
          )}
          {alertLevel === 'critical' && (
            <div className="bg-orange-100 border border-orange-400 text-orange-700 px-4 py-3 rounded">
              <p className="font-bold">🚨 ALERTE : Limite atteinte à 80%+</p>
              <p>Planifier migration Brevo dans les 24-48h.</p>
            </div>
          )}
          {alertLevel === 'warning' && (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
              <p className="font-bold">⚠️ ATTENTION : Limite atteinte à 60%+</p>
              <p>Surveiller de près. Migrer vers Brevo si tendance continue.</p>
            </div>
          )}
          {alertLevel === 'safe' && (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
              <p className="font-bold">✅ OK : Volume normal</p>
              <p>Capacité Gmail suffisante pour aujourd'hui.</p>
            </div>
          )}

          {/* Détails par provider */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600">Gmail (SMTP)</p>
              <p className="text-2xl font-bold text-slate-900">{todayStats?.byProvider.gmail || 0}</p>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600">Firebase Auth</p>
              <p className="text-2xl font-bold text-slate-900">{todayStats?.byProvider.firebase || 0}</p>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600">Brevo</p>
              <p className="text-2xl font-bold text-slate-900">{todayStats?.byProvider.brevo || 0}</p>
            </div>
          </div>
        </div>

        {/* Stats aujourd'hui */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Emails par statut */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">📬 Statut Emails</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-700">✅ Envoyés</span>
                <span className="text-2xl font-bold text-green-600">{todayStats?.totalSent || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-700">❌ Échecs</span>
                <span className="text-2xl font-bold text-red-600">{todayStats?.totalFailed || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-700">📊 Taux de succès</span>
                <span className="text-xl font-bold text-blue-600">
                  {todayStats && todayStats.totalSent > 0
                    ? Math.round((todayStats.totalSent / (todayStats.totalSent + todayStats.totalFailed)) * 100)
                    : 0}%
                </span>
              </div>
            </div>
          </div>

          {/* Emails par type */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4">📋 Types d'Emails</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-700">💼 Transactionnels</span>
                <span className="text-xl font-bold text-slate-900">{todayStats?.byType.transactional || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-700">🔔 Notifications</span>
                <span className="text-xl font-bold text-slate-900">{todayStats?.byType.notification || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-700">🔐 Auth</span>
                <span className="text-xl font-bold text-slate-900">{todayStats?.byType.auth || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-700">⚙️ Système</span>
                <span className="text-xl font-bold text-slate-900">{todayStats?.byType.system || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Rapport hebdomadaire */}
        {weeklyReport && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">📈 Rapport Hebdomadaire (7 derniers jours)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-slate-600">Total envoyés</p>
                <p className="text-3xl font-bold text-blue-600">{weeklyReport.totalSent}</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-slate-600">Moyenne/jour</p>
                <p className="text-3xl font-bold text-green-600">{weeklyReport.averagePerDay}</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-sm text-slate-600">Pic journalier</p>
                <p className="text-3xl font-bold text-purple-600">{weeklyReport.peakDay.count}</p>
                <p className="text-xs text-slate-500 mt-1">{weeklyReport.peakDay.date}</p>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <p className="text-sm text-slate-600">Tendance</p>
                <p className={`text-2xl font-bold ${
                  weeklyReport.trend === 'increasing' ? 'text-orange-600' :
                  weeklyReport.trend === 'decreasing' ? 'text-green-600' :
                  'text-slate-600'
                }`}>
                  {weeklyReport.trend === 'increasing' ? '📈 Hausse' :
                   weeklyReport.trend === 'decreasing' ? '📉 Baisse' :
                   '➡️ Stable'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Derniers logs */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-xl font-bold text-slate-900 mb-4">📜 Derniers Emails Envoyés (50 derniers)</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date/Heure</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Destinataire</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Sujet</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Provider</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Statut</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {recentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Aucun email envoyé aujourd'hui
                    </td>
                  </tr>
                ) : (
                  recentLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-900">
                        {new Date(log.timestamp._seconds * 1000).toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-900">{log.recipient}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{log.subject}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                          {log.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          log.provider === 'gmail' ? 'bg-red-100 text-red-800' :
                          log.provider === 'firebase' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {log.provider}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          log.status === 'sent' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {log.status === 'sent' ? '✅ Envoyé' : '❌ Échec'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
