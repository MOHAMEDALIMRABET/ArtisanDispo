'use client';

/**
 * Layout Admin - Navigation commune pour toutes les pages admin
 */

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { authService } from '@/lib/auth-service';
import { isAdmin } from '@/lib/firebase/admin-service';
import Link from 'next/link';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState('Admin');

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const user = authService.getCurrentUser();
      if (!user) {
        router.push('/access-x7k9m2p4w8n3');
        return;
      }

      // 🔒 SÉCURITÉ : Vérifier que l'utilisateur est bien admin
      const adminStatus = await isAdmin(user.uid);
      if (!adminStatus) {
        // Déconnecter et rediriger vers page utilisateur
        await authService.signOut();
        router.push('/connexion');
        return;
      }

      setAdminName(user.displayName || 'Admin');
    } catch (error) {
      console.error('Erreur auth:', error);
      router.push('/access-x7k9m2p4w8n3');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await authService.signOut();
    router.push('/admin/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-xl text-slate-600">Chargement...</p>
      </div>
    );
  }

  // Ne pas afficher la navigation sur la page de login sécurisée
  if (pathname === '/access-x7k9m2p4w8n3') {
    return <>{children}</>;
  }

  const menuItems = [
    {
      name: 'Tableau de bord',
      path: '/admin/dashboard',
      icon: '📊',
      description: 'Vue d\'ensemble'
    },
    {
      name: 'Vérifications',
      path: '/admin/verifications',
      icon: '✅',
      description: 'Documents artisans'
    },
    {
      name: 'Gestion Comptes',
      path: '/admin/comptes',
      icon: '👥',
      description: 'Artisans & Clients'
    },
    {
      name: 'Gestion Litiges',
      path: '/admin/gestion-litiges',
      icon: '⚖️',
      description: 'Médiation & Résolution'
    },
    {
      name: 'Logs d\'accès',
      path: '/admin/logs',
      icon: '📋',
      description: 'Sécurité & Logs'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-navy-800 text-white">
        {/* Header */}
        <div className="p-6 border-b border-slate-700">
          <h1 className="text-2xl font-bold text-brand-700">ArtisanDispo</h1>
          <p className="text-sm text-slate-300 mt-1">Administration</p>
        </div>

        {/* Admin info */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-700 rounded-full flex items-center justify-center font-bold">
              {adminName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium">{adminName}</p>
              <p className="text-xs text-slate-400">Administrateur</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`block px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-brand-700 text-white'
                    : 'hover:bg-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{item.icon}</span>
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs opacity-75">{item.description}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <span>🚪</span>
            <span>Déconnexion</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="ml-64">
        {children}
      </div>
    </div>
  );
}
