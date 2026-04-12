'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authService } from '@/lib/auth-service';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { getDemandeById } from '@/lib/firebase/demande-service';
import { getDemandeExpressById } from '@/lib/firebase/demande-express-service';
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

function extractExpressDemandeIdFromLink(link?: string): string | null {
  if (!link || !link.startsWith('/client/demandes-express')) {
    return null;
  }

  const match = link.match(/\/client\/demandes-express\/([^?/]+)/);
  return match?.[1] ?? null;
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
  const [expressDirectUnreadNotifications, setExpressDirectUnreadNotifications] = useState<Notification[]>([]);
  const [expressPublishedUnreadNotifications, setExpressPublishedUnreadNotifications] = useState<Notification[]>([]);
  const [unresolvedExpressCount, setUnresolvedExpressCount] = useState(0);
  const [unresolvedClassicCount, setUnresolvedClassicCount] = useState(0);

  const nbDemandesDirectes = directUnreadNotifications.length;
  const nbDemandesPubliees = publicUnreadNotifications.length;
  const nbExpressDirectes = expressDirectUnreadNotifications.length;
  const nbExpressPubliees = expressPublishedUnreadNotifications.length;
  const nbExpress = nbExpressDirectes + nbExpressPubliees + unresolvedExpressCount;
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
      const expressTypeMap = new Map<string, 'directe' | 'publiee'>();
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

      const expressDemandeIds = Array.from(new Set(
        expressNotifications
          .map(notification => extractExpressDemandeIdFromLink(notification.lien))
          .filter((demandeId): demandeId is string => Boolean(demandeId))
      ));

      await Promise.all(
        expressDemandeIds.map(async demandeId => {
          try {
            const demandeExpress = await getDemandeExpressById(demandeId);
            if (demandeExpress) {
              expressTypeMap.set(demandeId, demandeExpress.artisanId ? 'directe' : 'publiee');
            }
          } catch (error) {
            console.error('Erreur résolution type demande express hub:', demandeId, error);
          }
        })
      );

      if (isCancelled) {
        return;
      }

      const nextDirectNotifications: Notification[] = [];
      const nextPublicNotifications: Notification[] = [];
      const nextExpressDirectNotifications: Notification[] = [];
      const nextExpressPublishedNotifications: Notification[] = [];
      let nextUnresolvedClassicCount = 0;
      let nextUnresolvedExpressCount = 0;

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

      expressNotifications.forEach(notification => {
        const demandeId = extractExpressDemandeIdFromLink(notification.lien);
        const expressType = demandeId ? expressTypeMap.get(demandeId) : undefined;

        if (expressType === 'directe') {
          nextExpressDirectNotifications.push(notification);
          return;
        }

        if (expressType === 'publiee') {
          nextExpressPublishedNotifications.push(notification);
          return;
        }

        // Si on ne peut pas classifier, on garde côté "publiées" par défaut.
        // Cela couvre les anciennes notifications sans lien détaillé.
        if (!demandeId) {
          nextExpressPublishedNotifications.push(notification);
          return;
        }

        nextUnresolvedExpressCount += 1;
      });

      setDirectUnreadNotifications(nextDirectNotifications);
      setPublicUnreadNotifications(nextPublicNotifications);
      setExpressDirectUnreadNotifications(nextExpressDirectNotifications);
      setExpressPublishedUnreadNotifications(nextExpressPublishedNotifications);
      setUnresolvedExpressCount(nextUnresolvedExpressCount);
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

  async function openDemandesExpressDirectes() {
    const latestNotification = expressDirectUnreadNotifications[0];
    await markNotificationsRead(expressDirectUnreadNotifications);
    router.push(latestNotification?.lien || '/client/demandes-express?source=directes');
  }

  async function openDemandesExpressPubliees() {
    const latestNotification = expressPublishedUnreadNotifications[0];
    await markNotificationsRead(expressPublishedUnreadNotifications);
    router.push(latestNotification?.lien || '/client/demandes-express?source=publiees');
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
    <div className="min-h-screen bg-[#F5F7FA] relative overflow-hidden">
      {/* Vague couche arrière */}
      <svg className="absolute bottom-0 left-0 w-full pointer-events-none z-0" viewBox="0 0 1440 180" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M0,120 C200,160 400,60 600,100 C800,140 1000,80 1200,110 C1320,130 1400,100 1440,90 L1440,180 L0,180 Z" fill="#2C3E50" fillOpacity="0.08"/>
      </svg>
      {/* Vague couche avant */}
      <svg className="absolute bottom-0 left-0 w-full pointer-events-none z-0" viewBox="0 0 1440 140" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M0,80 C180,40 360,120 600,80 C840,40 1100,110 1300,70 C1380,50 1420,65 1440,60 L1440,140 L0,140 Z" fill="#2C3E50" fillOpacity="0.13"/>
      </svg>
      {/* En-tête */}
      <div className="relative z-10 bg-[#2C3E50] text-white py-6 px-4">
        <div className="container mx-auto max-w-5xl">
          <h1 className="text-2xl font-bold">📋 Mes Demandes</h1>
          <p className="text-gray-300 text-sm mt-1">Gérez vos demandes de travaux</p>
        </div>
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-5xl">

        {/* Fil d'Ariane */}
        <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
          <button onClick={() => router.push('/dashboard')} className="hover:text-[#FF6B00] transition flex items-center gap-1">
            ← Retour au tableau de bord
          </button>
        </div>

        {/* Hub : 2 cartes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ── CARTE Demandes Classiques ── */}
          <div className="bg-[#2C3E50] rounded-2xl shadow-lg overflow-hidden flex flex-col">
            {/* Bandeau */}
            <div className="bg-[#2C3E50] px-8 py-8 flex items-center gap-4">
              <span className="text-5xl">🏗️</span>
              <div className="flex-1">
                <div className="text-white font-bold text-2xl">Demandes Classiques</div>
                <div className="text-gray-300 text-base mt-1">Demandes directes et publiées</div>
              </div>
              {nbClassiques > 0 && (
                <span className="bg-white text-[#2C3E50] text-base font-black px-3 py-1 rounded-full animate-bounce shadow">
                  🔔 {nbClassiques}
                </span>
              )}
            </div>
            {/* Corps */}
            <div className="bg-white px-8 py-7 space-y-5 flex-1">
              <button
                onClick={openDemandesDirectes}
                className="w-full flex items-center gap-5 p-5 rounded-xl bg-orange-50 border border-orange-200 hover:border-[#FF6B00] hover:bg-orange-100 transition"
              >
                <span className="text-3xl">🎯</span>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-[#2C3E50] text-base">Mes demandes de devis directes</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {nbDemandesDirectes > 0
                      ? `${nbDemandesDirectes} notification${nbDemandesDirectes > 1 ? 's' : ''} concernent vos demandes directes.`
                      : 'Suivre vos demandes envoyées à un artisan précis.'}
                  </div>
                </div>
                {nbDemandesDirectes > 0 && (
                  <span className="bg-[#FF6B00] text-white text-sm font-bold px-3 py-1.5 rounded-full min-w-[32px] text-center">
                    {nbDemandesDirectes}
                  </span>
                )}
              </button>
              <button
                onClick={openDemandesPubliees}
                className="w-full flex items-center gap-5 p-5 rounded-xl bg-slate-50 border border-slate-200 hover:border-[#2C3E50] hover:bg-slate-100 transition"
              >
                <span className="text-3xl">📢</span>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-[#2C3E50] text-base">Mes demandes de devis publiées</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {nbDemandesPubliees > 0
                      ? `${nbDemandesPubliees} notification${nbDemandesPubliees > 1 ? 's' : ''} concernent vos demandes publiées.`
                      : 'Demandes visibles par tous les artisans qualifiés.'}
                  </div>
                </div>
                {nbDemandesPubliees > 0 && (
                  <span className="bg-[#2C3E50] text-white text-sm font-bold px-3 py-1.5 rounded-full min-w-[32px] text-center">
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
          <div className="text-left bg-[#FF6B00] rounded-2xl shadow-lg overflow-hidden flex flex-col relative">
            {/* Bandeau */}
            <div className="bg-[#FF6B00] px-8 py-8 flex items-center gap-4">
              <span className="text-5xl">⚡</span>
              <div className="flex-1">
                <div className="text-white font-bold text-2xl">Demandes en urgence</div>
                <div className="text-orange-100 text-base mt-1">Petits travaux rapides</div>
              </div>
              {nbExpress > 0 && (
                <span className="bg-white text-[#FF6B00] text-base font-black px-3 py-1 rounded-full animate-bounce shadow">
                  🔔 {nbExpress}
                </span>
              )}
            </div>
            {/* Corps */}
            <div className="bg-white px-8 py-7 space-y-5 flex-1">
              <button
                onClick={openDemandesExpressDirectes}
                className="w-full flex items-center gap-5 p-5 rounded-xl bg-orange-50 border border-orange-200 hover:border-[#FF6B00] hover:bg-orange-100 transition"
              >
                <span className="text-3xl">⚡</span>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-[#2C3E50] text-base">Mes demandes express directes</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {nbExpressDirectes > 0
                      ? `${nbExpressDirectes} notification${nbExpressDirectes > 1 ? 's' : ''} concernent vos demandes express directes.`
                      : 'Demandes envoyées à un artisan précis.'}
                  </div>
                </div>
                {nbExpressDirectes > 0 && (
                  <span className="bg-[#FF6B00] text-white text-sm font-bold px-3 py-1.5 rounded-full min-w-[32px] text-center">
                    {nbExpressDirectes}
                  </span>
                )}
              </button>
              <button
                onClick={openDemandesExpressPubliees}
                className="w-full flex items-center gap-5 p-5 rounded-xl bg-slate-50 border border-slate-200 hover:border-[#2C3E50] hover:bg-slate-100 transition"
              >
                <span className="text-3xl">📢</span>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-[#2C3E50] text-base">Mes demandes express publiées</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {nbExpressPubliees > 0
                      ? `${nbExpressPubliees} notification${nbExpressPubliees > 1 ? 's' : ''} concernent vos demandes express publiées.`
                      : 'Demandes visibles par tous les artisans qualifiés.'}
                  </div>
                </div>
                {nbExpressPubliees > 0 && (
                  <span className="bg-[#2C3E50] text-white text-sm font-bold px-3 py-1.5 rounded-full min-w-[32px] text-center">
                    {nbExpressPubliees}
                  </span>
                )}
              </button>
              {unresolvedExpressCount > 0 && (
                <div className="rounded-xl border border-[#FFC107] bg-amber-50 px-4 py-3 text-xs text-[#2C3E50]">
                  {unresolvedExpressCount} notification{unresolvedExpressCount > 1 ? 's' : ''} express sans rattachement clair sont conservées dans le total.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
