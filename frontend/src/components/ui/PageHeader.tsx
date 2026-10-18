import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * En-tête de page des espaces connectés : bande marine, titre, sous-titre,
 * lien retour optionnel et zone d'actions.
 */
export function PageHeader({ title, subtitle, backHref, backLabel = 'Retour', onBack, actions, className = '' }: PageHeaderProps) {
  const backContent = (
    <>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {backLabel}
    </>
  );
  const backClass = 'mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-navy-200 transition-colors hover:text-white';

  return (
    <header className={`bg-navy-800 text-white ${className}`}>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {backHref && <Link href={backHref} className={backClass}>{backContent}</Link>}
        {!backHref && onBack && <button type="button" onClick={onBack} className={backClass}>{backContent}</button>}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-navy-200 sm:text-base">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </header>
  );
}

/** Conteneur de contenu standard (largeur et marges latérales du design system). */
export function Container({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}
