'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authService } from '@/lib/auth-service';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { getDemandeById } from '@/lib/firebase/demande-service';
import { getUserById } from '@/lib/firebase/user-service';
import type { DemandeType, Notification } from '@/types/firestore';

const CLASSIC_NOTIFICATION_TYPES = new Set([
  'nouvelle_demande',
  'demande_refusee',
  'travaux_demarres_demande',
  'travaux_termines_demande',
]);

function extractDemandeIdFromLink(link?: string): string | null {
  if (!link || !link.startsWith('/client/demandes')) {
    return null;
  }

  if (link.startsWith('/client/demandes?')) {
    const [, queryString = ''] = link.split('?');
    const params = new URLSearchParams(queryString);
    return params.get('demandeId');
  }

  const match = link.match(/\/client\/demandes\/([^?/]+)/);
  return match?.[1] ?? null;
}

function isExpressNotification(notification: Notification): boolean {
  return notification.type === 'proposition_express_recue' ||
    notification.lien?.startsWith('/client/demandes-express') === true;
}

function isClassicNotification(notification: Notification): boolean {
  return CLASSIC_NOTIFICATION_TYPES.has(notification.type) && !isExpressNotification(notification);
}

export default function ClientDemandesHubPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const { user: firebaseUser } = useAuth();
  const { notifications, markAsRead } = useNotifications(firebaseUser?.uid);
  const [directUnreadNotifications, setDirectUnreadNotifications] = useState<Notification[]>([]);
  const [publicUnreadNotifications, setPublicUnreadNotifications] = useState<Notification[]>([]);
  const [expressUnreadNotifications, setExpressUnreadNotifications] = useState<Notification[]>([]);
  const [unresolvedClassicCount, setUnresolvedClassicCount] = useState(0);

  const nbDemandesDirectes = directUnreadNotifications.length;
  const nbDemandesPubliees = publicUnreadNotifications.length;
  const nbExpress = expressUnreadNotifications.length;
  const nbClassiques = nbDemandesDirectes + nbDemandesPubliees + unresolvedClassicCount;

  useEffect(() => {
    let isCancelled = false;

    async function resolveNotificationCategories() {
      const unreadNotifications = notifications.filter(n => !n.lue);
      const expressNotifications = unreadNotifications.filter(isExpressNotification);
      const classicNotifications = unreadNotifications.filter(isClassicNotification);
      const demandeIds = Array.from(new Set(
        classicNotifications
          .map(notification => extractDemandeIdFromLink(notification.lien))
          .filter((demandeId): demandeId is string => Boolean(demandeId))
      ));

      const typeMap = new Map<string, DemandeType>();
      await Promise.all(
        demandeIds.map(async demandeId => {
          try {
            const demande = await getDemandeById(demandeId);
            if (demande) {
              typeMap.set(demandeId, demande.type || 'directe');
            }
          } catch (error) {
            console.error('Erreur résolution type demande hub:', demandeId, error);
          }
        })
      );

      if (isCancelled) {
        return;
      }

      const nextDirectNotifications: Notification[] = [];
      const nextPublicNotifications: Notification[] = [];
      let nextUnresolvedClassicCount = 0;

      classicNotifications.forEach(notification => {
        const demandeId = extractDemandeIdFromLink(notification.lien);
        const demandeType = demandeId ? typeMap.get(demandeId) : undefined;

        if (demandeType === 'publique') {
          nextPublicNotifications.push(notification);
          return;
        }

        if (demandeType === 'directe') {
          nextDirectNotifications.push(notification);
          return;
        }

        nextUnresolvedClassicCount += 1;
      });

      setDirectUnreadNotifications(nextDirectNotifications);
      setPublicUnreadNotifications(nextPublicNotifications);
      setExpressUnreadNotifications(expressNotifications);
      setUnresolvedClassicCount(nextUnresolvedClassicCount);
    }

    resolveNotificationCategories();

    return () => {
      isCancelled = true;
    };
  }, [notifications]);

  async function markNotificationsRead(targetNotifications: Notification[]) {
    if (targetNotifications.length === 0) {
      return;
    }

    await Promise.all(targetNotifications.map(notification => markAsRead(notification.id)));
  }

  async function openDemandesDirectes() {
    const latestNotification = directUnreadNotifications[0];
    await markNotificationsRead(directUnreadNotifications);
    router.push(latestNotification?.lien || '/client/demandes?section=envoyes');
  }

  async function openDemandesPubliees() {
    const latestNotification = publicUnreadNotifications[0];
    await markNotificationsRead(publicUnreadNotifications);
    router.push(latestNotification?.lien || '/client/demandes?section=publiees');
  }

  async function openDemandesExpress() {
    const latestNotification = expressUnreadNotifications[0];
    await markNotificationsRead(expressUnreadNotifications);
    router.push(latestNotification?.lien || '/client/demandes-express');
  }

  useEffect(() => {
    async function checkAuth() {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        router.push('/connexion');
        return;
      }
      const userData = await getUserById(currentUser.uid);
      if (!userData || userData.role !== 'client') {
        router.push('/connexion');
        return;
      }
      setIsLoading(false);
    }
    checkAuth();
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF6B00]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      {/* En-tête */}
      <div className="bg-[#2C3E50] text-white py-6 px-4">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-2xl font-bold">📋 Mes Demandes</h1>
          <p className="text-gray-300 text-sm mt-1">Gérez vos demandes de travaux</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">

        {/* Fil d'Ariane */}
        <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
          <button onClick={() => router.push('/dashboard')} className="hover:text-[#FF6B00] transition flex items-center gap-1">
            ← Retour au tableau de bord
          </button>
        </div>

        {/* Hub : 2 cartes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ── CARTE Demandes Classiques ── */}
          <div className="bg-[#2C3E50] rounded-2xl shadow-md overflow-hidden flex flex-col">
            {/* Bandeau */}
            <div className="bg-[#2C3E50] px-6 py-4 flex items-center gap-3">
              <span className="text-3xl">🏗️</span>
              <div className="flex-1">
                <div className="text-white font-bold text-xl">Demandes Classiques</div>
                <div className="text-gray-300 text-sm">Demandes directes et publiées</div>
              </div>
              {nbClassiques > 0 && (
                <span className="bg-white text-[#2C3E50] text-sm font-black px-2.5 py-0.5 rounded-full animate-bounce shadow">
                  🔔 {nbClassiques}
                </span>
              )}
            </div>
            {/* Corps */}
            <div className="bg-white px-6 py-5 space-y-4 flex-1">
              <button
                onClick={openDemandesDirectes}
                className="w-full flex items-center gap-4 p-3 rounded-xl bg-orange-50 border border-orange-200 hover:border-[#FF6B00] hover:bg-orange-100 transition"
              >
                <span className="text-2xl">🎯</span>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-[#2C3E50] text-sm">Mes demandes de devis directes</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {nbDemandesDirectes > 0
                      ? `${nbDemandesDirectes} notification${nbDemandesDirectes > 1 ? 's' : ''} concernent vos demandes directes.`
                      : 'Suivre vos demandes envoyées à un artisan précis.'}
                  </div>
                </div>
                {nbDemandesDirectes > 0 && (
                  <span className="bg-[#FF6B00] text-white text-xs font-bold px-2.5 py-1 rounded-full min-w-[28px] text-center">
                    {nbDemandesDirectes}
                  </span>
                )}
              </button>
              <button
                onClick={openDemandesPubliees}
                className="w-full flex items-center gap-4 p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-[#2C3E50] hover:bg-slate-100 transition"
              >
                <span className="text-2xl">📢</span>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-[#2C3E50] text-sm">Mes demandes de devis publiées</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {nbDemandesPubliees > 0
                      ? `${nbDemandesPubliees} notification${nbDemandesPubliees > 1 ? 's' : ''} concernent vos demandes publiées.`
                      : 'Demandes visibles par tous les artisans qualifiés.'}
                  </div>
                </div>
                {nbDemandesPubliees > 0 && (
                  <span className="bg-[#2C3E50] text-white text-xs font-bold px-2.5 py-1 rounded-full min-w-[28px] text-center">
                    {nbDemandesPubliees}
                  </span>
                )}
              </button>
              {unresolvedClassicCount > 0 && (
                <div className="rounded-xl border border-[#FFC107] bg-amber-50 px-4 py-3 text-xs text-[#2C3E50]">
                  {unresolvedClassicCount} notification{unresolvedClassicCount > 1 ? 's' : ''} classique{unresolvedClassicCount > 1 ? 's restent' : ' reste'} visible{unresolvedClassicCount > 1 ? 's' : ''} dans vos demandes, sans rattachement automatique direct/publiée.
                </div>
              )}
            </div>
          </div>

          {/* ── CARTE Demandes Express ── */}
          <div className="text-left bg-[#FF6B00] rounded-2xl shadow-md overflow-hidden flex flex-col relative">
            {/* Bandeau */}
            <div className="bg-[#FF6B00] px-6 py-4 flex items-center gap-3">
              <span className="text-3xl">⚡</span>
              <div className="flex-1">
                <div className="text-white font-bold text-xl">Demandes Express</div>
                <div className="text-orange-100 text-sm">Petits travaux rapides</div>
              </div>
              {nbExpress > 0 && (
                <span className="bg-white text-[#FF6B00] text-sm font-black px-2.5 py-0.5 rounded-full animate-bounce shadow">
                  🔔 {nbExpress}
                </span>
              )}
            </div>
            {/* Corps */}
            <div className="bg-white px-6 py-5 space-y-4 flex-1">
              <button
                onClick={openDemandesExpress}
                className="w-full flex items-center gap-4 p-3 rounded-xl bg-orange-50 border border-orange-200 hover:border-[#FF6B00] hover:bg-orange-100 transition"
              >
                <span className="text-2xl">⚡</span>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-[#2C3E50] text-sm">Demandes express</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {nbExpress > 0
                      ? `${nbExpress} notification${nbExpress > 1 ? 's' : ''} concernent vos demandes express.`
                      : 'Petits travaux &lt; 150€.'}
                  </div>
                </div>
                {nbExpress > 0 && (
                  <span className="bg-[#FF6B00] text-white text-xs font-bold px-2.5 py-1 rounded-full min-w-[28px] text-center">
                    {nbExpress}
                  </span>
                )}
              </button>
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                <div className="text-xs text-gray-500 leading-relaxed">Interventions rapides à prix fixe, artisans disponibles immédiatement.</div>
              </div>
              <div className="flex items-center justify-end pt-1 text-sm font-semibold text-[#FF6B00]">
                <span>Accéder →</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
