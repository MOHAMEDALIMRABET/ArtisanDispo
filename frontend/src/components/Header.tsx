/**
 * Composant Header global
 * Navigation présente sur toutes les pages avec menu utilisateur
 */

'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BadgeCheck, LayoutDashboard, Menu, MessageSquare, Phone, X, Zap } from 'lucide-react';
import { Logo, buttonClasses } from '@/components/ui';
import UserMenu from '@/components/UserMenu';
import GuestMenu from '@/components/GuestMenu';
import LanguageSelector from '@/components/LanguageSelector';
import { useLanguage } from '@/contexts/LanguageContext';
import { authService } from '@/lib/auth-service';
import { getUserById } from '@/lib/firebase/user-service';
import { getArtisanByUserId } from '@/lib/firebase/artisan-service';
import type { User, Artisan } from '@/types/firestore';

export default function Header() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [artisan, setArtisan] = useState<Artisan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Helper : CTA travaux urgents → page d'atterrissage
  const getExpressWorksUrl = () => {
    return '/petits-travaux-express';
  };

  // Helper : Navigation logo - Redirige vers le dashboard selon le rôle connecté
  const handleLogoClick = () => {
    if (user?.role === 'artisan') {
      router.push('/artisan/dashboard');
    } else if (user?.role === 'client') {
      router.push('/dashboard');
    } else {
      router.push('/');
    }
  };

  // Pages où le header ne doit PAS s'afficher
  const hiddenRoutes = ['/admin', '/connexion'];
  const shouldHideHeader = hiddenRoutes.some(route => pathname?.startsWith(route));

  useEffect(() => {
    loadUser();

    // Écouter les changements d'authentification
    const unsubscribe = authService.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        const userData = await getUserById(firebaseUser.uid);
        setUser(userData);
        
        // Charger les données artisan si c'est un artisan
        if (userData?.role === 'artisan') {
          const artisanData = await getArtisanByUserId(firebaseUser.uid);
          setArtisan(artisanData);
        } else {
          setArtisan(null);
        }
      } else {
        setUser(null);
        setArtisan(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  async function loadUser() {
    try {
      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        const userData = await getUserById(currentUser.uid);
        setUser(userData);
        
        // Charger les données artisan si c'est un artisan
        if (userData?.role === 'artisan') {
          const artisanData = await getArtisanByUserId(currentUser.uid);
          setArtisan(artisanData);
        }
      }
    } catch (error) {
      console.error('Erreur chargement utilisateur:', error);
    } finally {
      setIsLoading(false);
    }
  }

  // Fermer le menu mobile à chaque changement de page
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Ne pas afficher le header sur certaines routes
  if (shouldHideHeader) {
    return null;
  }

  const dashboardUrl = user?.role === 'artisan' ? '/artisan/dashboard' : '/dashboard';
  const navLinkClass =
    'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-navy-900';
  const mobileLinkClass =
    'flex min-h-12 items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-slate-800 transition-colors hover:bg-slate-100';

  return (
    <header className="no-print sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Logo size="sm" onClick={handleLogoClick} className="h-9 w-auto sm:h-10" />

        {/* Navigation desktop */}
        {!isLoading && (
          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
            {!user && (
              <Link href="/comment-ca-marche" className={navLinkClass}>
                {t('nav.howItWorks')}
              </Link>
            )}
            {/* Petits travaux express : visiteurs et clients (masqué pour les artisans) */}
            {user?.role !== 'artisan' && (
              <Link href={getExpressWorksUrl()} className={navLinkClass}>
                <Zap className="h-4 w-4 text-brand-600" aria-hidden="true" />
                {t('nav.expressWorks')}
              </Link>
            )}
            {/* Être rappelé : visiteurs uniquement */}
            {!user && (
              <Link href="/etre-rappele" className={navLinkClass}>
                <Phone className="h-4 w-4 text-slate-500" aria-hidden="true" />
                {t('nav.callback')}
              </Link>
            )}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {isLoading && <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />}

          {!isLoading && !user && (
            <>
              <Link href="/inscription?role=client" className={`hidden lg:inline-flex ${buttonClasses('outline', 'sm')}`}>
                {t('nav.individual')}
              </Link>
              <Link href="/inscription?role=artisan" className={`hidden lg:inline-flex ${buttonClasses('primary', 'sm')}`}>
                {t('nav.tradesperson')}
              </Link>
              <LanguageSelector />
              <GuestMenu />
            </>
          )}

          {!isLoading && user && (
            <>
              {/* Badge Profil Vérifié pour artisans */}
              {user.role === 'artisan' && artisan?.verified && (
                <span className="hidden items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-800 ring-1 ring-inset ring-green-200 md:inline-flex">
                  <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                  {t('common.verifiedProfile')}
                </span>
              )}
              <LanguageSelector />
              <UserMenu user={user} isArtisan={user.role === 'artisan'} />
            </>
          )}

          {/* Bouton menu mobile (< lg) */}
          {!isLoading && (
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition-colors hover:bg-slate-100 lg:hidden"
              aria-label={isMobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {/* Menu mobile (< lg) */}
      {!isLoading && isMobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 top-16 z-40 animate-fade-in bg-slate-900/40 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="animate-slideDown absolute inset-x-0 top-16 z-50 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-slate-200 bg-white shadow-lg lg:hidden">
            <nav className="mx-auto max-w-7xl space-y-1 px-4 py-4 sm:px-6" aria-label="Navigation mobile">
              {user && (
                <>
                  <Link href={dashboardUrl} className={mobileLinkClass}>
                    <LayoutDashboard className="h-5 w-5 text-slate-500" aria-hidden="true" />
                    {t('nav.dashboard')}
                  </Link>
                  <Link href="/messages" className={mobileLinkClass}>
                    <MessageSquare className="h-5 w-5 text-slate-500" aria-hidden="true" />
                    {t('nav.messages')}
                  </Link>
                </>
              )}
              {user?.role !== 'artisan' && (
                <Link href={getExpressWorksUrl()} className={mobileLinkClass}>
                  <Zap className="h-5 w-5 text-brand-600" aria-hidden="true" />
                  {t('nav.expressWorks')}
                </Link>
              )}
              {!user && (
                <>
                  <Link href="/comment-ca-marche" className={mobileLinkClass}>
                    <BadgeCheck className="h-5 w-5 text-slate-500" aria-hidden="true" />
                    {t('nav.howItWorks')}
                  </Link>
                  <Link href="/etre-rappele" className={mobileLinkClass}>
                    <Phone className="h-5 w-5 text-slate-500" aria-hidden="true" />
                    {t('nav.callback')}
                  </Link>
                  <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 mt-3">
                    <Link href="/inscription?role=client" className={buttonClasses('outline', 'md')}>
                      {t('common.individual')}
                    </Link>
                    <Link href="/inscription?role=artisan" className={buttonClasses('primary', 'md')}>
                      {t('common.tradesperson')}
                    </Link>
                  </div>
                  <Link href="/connexion" className={`w-full ${buttonClasses('ghost', 'md')}`}>
                    {t('nav.login')}
                  </Link>
                </>
              )}
            </nav>
          </div>
        </>
      )}
    </header>
  );
}
