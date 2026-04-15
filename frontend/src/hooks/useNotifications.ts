/**
 * Hook personnalisé pour gérer les notifications utilisateur
 * Récupère les notifications en temps réel depuis Firestore
 */

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { markNotificationAsRead, markAllNotificationsAsRead, markNotificationsByTypeAsRead } from '@/lib/firebase/notification-service';
import type { Notification } from '@/types/firestore';

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Écoute en temps réel de TOUTES les notifications de l'utilisateur
    // ⚠️ PAS d'orderBy : combine where+orderBy = index composite requis
    // ⚠️ PAS de limit : avec limit(N) sans orderBy, Firestore retourne les N premiers
    //    par ID (= les plus anciens), donc les nouvelles notifications seraient invisibles
    // → Tri côté client avec .sort()
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notifsList = (snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as Notification[]).sort((a, b) =>
          (b.dateCreation?.toMillis?.() || 0) - (a.dateCreation?.toMillis?.() || 0)
        );

        setNotifications(notifsList);
        setUnreadCount(notifsList.filter(n => !n.lue).length);
        setLoading(false);
      },
      (error) => {
        // Ignorer les erreurs de permission lors de la déconnexion
        if (error.code === 'permission-denied') {
          setNotifications([]);
          setUnreadCount(0);
          setLoading(false);
          return;
        }
        console.error('Erreur écoute notifications:', error);
        setLoading(false);
      }
    );

    // Nettoyage à la désinscription
    return () => unsubscribe();
  }, [userId]);

  const markAsRead = async (notificationId: string) => {
    try {
      await markNotificationAsRead(notificationId);
    } catch (error) {
      console.error('Erreur marquage notification lue:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!userId) return;
    try {
      await markAllNotificationsAsRead(userId);
    } catch (error) {
      console.error('Erreur marquage toutes lues:', error);
    }
  };

  const markTypeAsRead = async (types: string[]) => {
    if (!userId) return;
    try {
      await markNotificationsByTypeAsRead(userId, types);
    } catch (error) {
      console.error('Erreur marquage notifications par type:', error);
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    markTypeAsRead,
  };
}
