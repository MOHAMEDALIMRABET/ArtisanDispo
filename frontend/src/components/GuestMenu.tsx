/**
 * Composant GuestMenu
 * Menu pour utilisateurs non connectés (Connexion/Inscription)
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { ChevronDown, LogIn, UserPlus, UserRound } from 'lucide-react';

export default function GuestMenu() {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Fermer le dropdown au clic extérieur
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleNavigation = (path: string) => {
    router.push(path);
    setIsOpen(false);
  };

  const itemClass =
    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 rounded-full p-0.5 transition-colors hover:bg-slate-100"
        aria-label="Menu compte"
        aria-expanded={isOpen}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-white">
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="animate-slideDown absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">{t('userMenu.welcome')}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t('userMenu.connectToAccess')}</p>
          </div>
          <div className="p-1.5">
            <button type="button" onClick={() => handleNavigation('/connexion')} className={itemClass}>
              <LogIn className="h-4 w-4 text-slate-500" aria-hidden="true" />
              {t('nav.login')}
            </button>
            <button type="button" onClick={() => handleNavigation('/inscription')} className={itemClass}>
              <UserPlus className="h-4 w-4 text-slate-500" aria-hidden="true" />
              {t('nav.signup')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
