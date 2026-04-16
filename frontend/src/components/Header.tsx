/**
 * Composant Header global
 * Navigation présente sur toutes les pages avec menu utilisateur
 */

'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/ui';
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

  // Ne pas afficher le header sur certaines routes
  if (shouldHideHeader) {
    return null;
  }

  return (
    <nav className="no-print bg-white shadow-md sticky top-0 z-50">
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Logo 
            size="sm" 
            onClick={handleLogoClick}
          />

          {/* CTAs - Affichage intelligent */}
          {!isLoading && (
            <div className="flex items-center gap-3 ml-4">
              {/* CTA "Être rappelé" - UNIQUEMENT pour visiteurs non connectés */}
              {!user && (
                <Link href="/etre-rappele">
                  <button className="hidden xl:flex items-center gap-2 bg-white border-2 border-[#FF6B00] text-[#FF6B00] hover:bg-[#FF6B00] hover:text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow-md text-sm group">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span className="whitespace-nowrap">{t('nav.callback')}</span>
                  </button>
                </Link>
              )}
              
              {/* CTA "Petits travaux express" - visible pour clients et visiteurs, masqué pour artisans */}
              {user?.role !== 'artisan' && (
              <Link href={getExpressWorksUrl()}>
                <button className="shine-border hidden xl:flex items-center gap-2 bg-white border-2 border-[#2C3E50] text-[#2C3E50] hover:bg-[#2C3E50] hover:text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow-md text-sm group relative overflow-hidden">
                  <svg className="w-4 h-4 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="whitespace-nowrap">
                    {t('nav.expressWorks')}
                  </span>
                </button>
              </Link>
              )}
            </div>
          )}

          {/* Menu navigation */}
          <div className="flex items-center gap-4 ml-auto">
            {/* Navigation principale pour visiteurs non connectés */}
            {!isLoading && !user && (
              <>
                {/* Liens de navigation */}
                <nav className="hidden xl:flex items-center gap-4 mr-4">
                  <Link
                    href="/comment-ca-marche"
                    className="text-gray-700 hover:text-[#FF6B00] font-medium transition-colors"
                  >
                    {t('nav.howItWorks')}
                  </Link>
                </nav>
                
                {/* Bouton Particulier */}
                <Link href="/inscription?role=client">
                  <button className="hidden xl:flex items-center gap-2 bg-gradient-to-r from-[#2C3E50] to-[#3D5A73] hover:from-[#1A3A5C] hover:to-[#2C3E50] text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg text-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="whitespace-nowrap">{t('nav.individual')}</span>
                  </button>
                </Link>
                
                {/* Bouton Artisan */}
                <Link href="/inscription?role=artisan">
                  <button className="hidden xl:flex items-center gap-2 bg-gradient-to-r from-[#FF6B00] to-[#E56100] hover:from-[#E56100] hover:to-[#D55000] text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg text-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span className="whitespace-nowrap">{t('nav.tradesperson')}</span>
                  </button>
                </Link>

                {/* Bouton Menu Hamburger (visible < xl) */}
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="xl:hidden flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-900 hover:text-white"
                  aria-label="Menu"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isMobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
                  </svg>
                </button>
              </>
            )}

            {/* Menu utilisateur ou invité */}
            <div className="flex items-center gap-4">
              {!isLoading && (
                <>
                  {user ? (
                    <>
                      {/* Bouton "Petits travaux express" pour mobile (connectés) */}
                      <Link href={getExpressWorksUrl()} className="xl:hidden">
                        <button className="shine-border flex items-center justify-center w-10 h-10 rounded-lg bg-[#2C3E50] hover:bg-[#1A3A5C] text-white transition-colors relative overflow-hidden" title="Petits Travaux en Urgence">
                          <svg className="w-5 h-5 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </button>
                      </Link>
                      
                      {/* Badge Profil Vérifié pour artisans */}
                      {user.role === 'artisan' && artisan?.verified && (
                        <span className="hidden md:flex items-center gap-1 text-green-600 font-medium text-sm">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          {t('common.verifiedProfile')}
                        </span>
                      )}
                      
                      {/* Sélecteur de langue */}
                      <LanguageSelector />
                      
                      {/* Menu utilisateur connecté */}
                      <UserMenu user={user} isArtisan={user.role === 'artisan'} />
                    </>
                  ) : (
                    <>
                      {/* Sélecteur de langue */}
                      <LanguageSelector />
                      
                      {/* Menu invité (non connecté) */}
                      <GuestMenu />
                    </>
                  )}
                </>
              )}

              {isLoading && (
                <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse"></div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Menu Mobile (< xl) - Visiteurs non connectés */}
      {!isLoading && !user && isMobileMenuOpen && (
        <>
          {/* Overlay sombre */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          
          {/* Panneau menu */}
          <div className="fixed top-16 left-0 right-0 bg-white shadow-2xl z-50 xl:hidden animate-slideDown">
            <nav className="container mx-auto px-4 py-6">
              {/* CTA "Être rappelé" - Visiteurs uniquement */}
              <Link 
                href="/etre-rappele"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 w-full bg-[#FF6B00] hover:bg-[#E56100] text-white px-6 py-4 rounded-lg font-medium transition-colors mb-3 shadow-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Être rappelé
              </Link>

              {/* CTA "Petits travaux express" */}
              <Link 
                href={getExpressWorksUrl()}
                onClick={() => setIsMobileMenuOpen(false)}
                className="shine-border flex items-center gap-3 w-full bg-[#2C3E50] hover:bg-[#1A3A5C] text-white px-6 py-4 rounded-lg font-medium transition-colors mb-4 shadow-md relative overflow-hidden"
              >
                <svg className="w-5 h-5 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Petits Travaux en Urgence
              </Link>

              {/* Liens navigation */}
              <div className="space-y-2 mb-6">
                <Link
                  href="/comment-ca-marche"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t('nav.howItWorks')}
                </Link>
              </div>

              {/* Boutons inscription */}
              <div className="space-y-3 border-t border-gray-200 pt-4">
                <Link
                  href="/inscription?role=client"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 w-full rounded-xl bg-slate-900 px-6 py-3 font-medium text-white transition-all shadow-md hover:bg-slate-800"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {t('common.individual')}
                </Link>

                <Link
                  href="/inscription?role=artisan"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 w-full rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 font-medium text-white transition-all shadow-[0_12px_28px_rgba(249,115,22,0.22)] hover:from-orange-600 hover:to-orange-700"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  {t('common.tradesperson')}
                </Link>
              </div>
            </nav>
          </div>
        </>
      )}

      {/* Animation brillance pour bouton Express */}
      <style jsx>{`
        @keyframes shine-sweep {
          0% {
            left: -150%;
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          50% {
            left: 150%;
            opacity: 1;
          }
          60% {
            opacity: 0;
          }
          100% {
            left: 150%;
            opacity: 0;
          }
        }

        :global(.shine-border) {
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }

        :global(.shine-border::before) {
          content: '';
          position: absolute;
          top: -50%;
          left: -150%;
          width: 80px;
          height: 200%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 107, 0, 0.1) 20%,
            rgba(255, 187, 0, 0.4) 40%,
            rgba(255, 215, 0, 0.8) 50%,
            rgba(255, 187, 0, 0.4) 60%,
            rgba(255, 107, 0, 0.1) 80%,
            transparent 100%
          );
          transform: skewX(-20deg);
          animation: shine-sweep 4s ease-in-out infinite;
          pointer-events: none;
          z-index: 10;
          transition: opacity 0.3s ease;
        }

        /* Disparaît au survol */
        :global(.shine-border:hover::before) {
          opacity: 0 !important;
        }

        /* Assurer que le contenu reste visible AU-DESSUS */
        :global(.shine-border > *) {
          position: relative;
          z-index: 20;
        }
      `}</style>
    </nav>
  );
}
