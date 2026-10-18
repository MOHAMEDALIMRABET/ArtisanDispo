'use client';

/**
 * Layout Admin - Navigation commune pour toutes les pages admin
 */

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { authService } from '@/lib/auth-service';
import { isAdmin } from '@/lib/firebase/admin-service';
import Link from 'next/link';
import { BadgeCheck, LayoutDashboard, LogOut, Menu, ScrollText, Scale, Users, X } from 'lucide-react';
import { Spinner } from '@/components/ui';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState('Admin');
  const [menuOpen, setMenuOpen] = useState(false);

  // Fermer le menu mobile à chaque navigation
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

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
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 text-slate-500">
        <Spinner size="lg" />
        <p className="text-sm">Chargement...</p>
      </div>
    );
  }

  // Ne pas afficher la navigation sur la page de login sécurisée
  if (pathname === '/access-x7k9m2p4w8n3') {
    return <>{children}</>;
  }

  const menuItems = [
    { name: 'Tableau de bord', path: '/admin/dashboard', icon: LayoutDashboard, description: 'Vue d\'ensemble' },
    { name: 'Vérifications', path: '/admin/verifications', icon: BadgeCheck, description: 'Documents artisans' },
    { name: 'Gestion Comptes', path: '/admin/comptes', icon: Users, description: 'Artisans & Clients' },
    { name: 'Gestion Litiges', path: '/admin/gestion-litiges', icon: Scale, description: 'Médiation & Résolution' },
    { name: 'Logs d\'accès', path: '/admin/logs', icon: ScrollText, description: 'Sécurité & Logs' },
  ];

  const sidebar = (
    <div className="flex h-full w-64 flex-col bg-navy-900 text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
        <div>
          <p className="text-lg font-bold">
            Artisan<span className="text-brand-400">Dispo</span>
          </p>
          <p className="mt-0.5 text-xs uppercase tracking-wider text-navy-300">Administration</p>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen(false)}
          className="rounded-md p-1.5 text-navy-300 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Fermer le menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-sm font-bold">
          {adminName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{adminName}</p>
          <p className="text-xs text-navy-300">Administrateur</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Navigation administration">
        {menuItems.map((item) => {
          const isActive = pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              href={item.path}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'text-navy-200 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? 'text-brand-400' : ''}`} aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium">{item.name}</span>
                <span className="block text-xs text-navy-300">{item.description}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-red-200 transition-colors hover:bg-red-600 hover:text-white"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Déconnexion
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden lg:block">{sidebar}</aside>

      {/* Barre supérieure + tiroir mobile */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <p className="font-semibold text-navy-900">Administration</p>
      </div>
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu administration">
          <div className="absolute inset-0 animate-fade-in bg-slate-900/50" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 shadow-xl">{sidebar}</aside>
        </div>
      )}

      {/* Contenu principal */}
      <div className="lg:ml-64">
        {children}
      </div>
    </div>
  );
}
