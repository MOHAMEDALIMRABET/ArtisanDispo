'use client';

import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const handleLanguageChange = (lang: 'fr' | 'en') => {
    setLanguage(lang);
    setIsOpen(false);
  };

  // Drapeau France SVG - rond, même taille que l'avatar connexion
  const FranceFlag = () => (
    <svg viewBox="0 0 900 600" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
      <rect fill="#ED2939" width="900" height="600"/>
      <rect fill="#fff" width="600" height="600"/>
      <rect fill="#002395" width="300" height="600"/>
    </svg>
  );

  // Drapeau Royaume-Uni SVG - rond, même taille que l'avatar connexion
  const UKFlag = () => (
    <svg viewBox="0 0 60 30" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
      <clipPath id="s">
        <path d="M0,0 v30 h60 v-30 z"/>
      </clipPath>
      <clipPath id="t">
        <path d="M30,15 h30 v15 z v-15 h-30 z h-30 v15 z v-15 h30 z"/>
      </clipPath>
      <g clipPath="url(#s)">
        <path d="M0,0 v30 h60 v-30 z" fill="#012169"/>
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6"/>
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#t)" stroke="#C8102E" strokeWidth="4"/>
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10"/>
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6"/>
      </g>
    </svg>
  );

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bouton sélecteur de langue — cercle identique au bouton connexion */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 w-8 rounded-full overflow-hidden ring-1 ring-slate-200 hover:ring-2 hover:ring-brand-500 transition-shadow flex items-center justify-center p-0"
        aria-label="Changer la langue"
        title={language === 'fr' ? 'Français' : 'English'}
      >
        <div className="w-full h-full">
          {language === 'fr' ? <FranceFlag /> : <UKFlag />}
        </div>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="animate-slideDown absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden p-1.5">
          {/* Option Français */}
          <button
            onClick={() => handleLanguageChange('fr')}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-100 transition-colors ${
              language === 'fr' ? 'bg-slate-100' : ''
            }`}
          >
            <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 shadow-sm"><FranceFlag /></div>
            <span className="text-sm font-medium text-slate-800">Français</span>
            {language === 'fr' && (
              <svg className="w-5 h-5 text-brand-700 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          {/* Option English */}
          <button
            onClick={() => handleLanguageChange('en')}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-100 transition-colors ${
              language === 'en' ? 'bg-slate-100' : ''
            }`}
          >
            <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 shadow-sm"><UKFlag /></div>
            <span className="text-sm font-medium text-slate-800">English</span>
            {language === 'en' && (
              <svg className="w-5 h-5 text-brand-700 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          {/* Note en bas */}
          <div className="mt-1 px-3 py-2 border-t border-slate-100">
            <p className="text-xs text-slate-500 text-center">
              {language === 'fr' ? 'Choisissez votre langue' : 'Select your language'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
