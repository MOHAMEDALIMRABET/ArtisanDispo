'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LifeBuoy, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';

const DESKTOP_QUERY = '(min-width: 1024px)';

interface SidebarShellProps {
  title: string;
  children: React.ReactNode;
  helpHref: string;
}

/**
 * Coque visuelle commune aux sidebars des espaces connectés.
 * - Desktop (≥ 1024 px) : colonne fixe repliable.
 * - Mobile : tiroir fermé par défaut, ouvert via le bouton « Menu ».
 */
export function SidebarShell({ title, children, helpHref }: SidebarShellProps) {
  const pathname = usePathname();
  const [isDesktop, setIsDesktop] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const sync = () => {
      setIsDesktop(mq.matches);
      setOpen(mq.matches);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Fermer le tiroir mobile après navigation
  useEffect(() => {
    if (!isDesktop) setOpen(false);
  }, [pathname, isDesktop]);

  // Bloquer le défilement de la page quand le tiroir mobile est ouvert
  useEffect(() => {
    if (isDesktop || !open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, isDesktop]);

  const panel = (
    <div className="flex h-full w-64 flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <span className="text-sm font-semibold uppercase tracking-wider text-slate-500">{title}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fermer le menu"
          title="Réduire la barre latérale"
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy-800"
        >
          {isDesktop ? <PanelLeftClose className="h-[18px] w-[18px]" /> : <X className="h-5 w-5" />}
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">{children}</nav>

      <div className="m-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white text-navy-800 ring-1 ring-slate-200">
            <LifeBuoy className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-navy-800">Besoin d&apos;aide ?</p>
            <p className="mt-0.5 text-xs text-slate-500">Notre équipe est là pour vous accompagner.</p>
          </div>
        </div>
        <Link
          href={helpHref}
          className="mt-3 flex min-h-9 w-full items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-medium text-navy-800 transition-colors hover:border-navy-800 hover:bg-navy-800 hover:text-white"
        >
          Nous contacter
        </Link>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <>
        <aside
          className={`no-print sticky top-16 z-20 h-[calc(100vh-4rem)] flex-shrink-0 overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-200 ${
            open ? 'w-64' : 'w-0 border-r-0'
          }`}
        >
          {panel}
        </aside>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="Afficher la barre latérale"
            aria-label="Afficher la barre latérale"
            className="no-print fixed left-0 top-1/2 z-30 -translate-y-1/2 rounded-r-lg border border-l-0 border-slate-200 bg-white px-1.5 py-3 text-navy-800 shadow-md transition-colors hover:text-brand-700"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le menu de mon espace"
        className="no-print fixed bottom-4 left-4 z-40 inline-flex min-h-11 items-center gap-2 rounded-full bg-navy-800 px-4 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-navy-900"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
        Menu
      </button>
      {open && (
        <div className="no-print fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={title}>
          <div className="absolute inset-0 animate-fade-in bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="animate-fade-in absolute inset-y-0 left-0 shadow-xl">{panel}</aside>
        </div>
      )}
    </>
  );
}

interface SidebarLinkProps {
  href?: string;
  onClick?: () => void;
  active: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  badgeTone?: 'brand' | 'danger' | 'warning';
}

const badgeTones = {
  brand: 'bg-brand-700 text-white',
  danger: 'bg-red-600 text-white',
  warning: 'bg-amber-400 text-amber-950',
};

/** Lien de navigation de sidebar (lien simple ou bouton avec action avant navigation). */
export function SidebarLink({ href, onClick, active, icon, label, badge, badgeTone = 'brand' }: SidebarLinkProps) {
  const className = `group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
    active
      ? 'bg-navy-800 font-semibold text-white'
      : 'font-medium text-slate-700 hover:bg-slate-100 hover:text-navy-900'
  }`;

  const content = (
    <>
      <span className={`flex-shrink-0 ${active ? 'text-white' : 'text-slate-400 group-hover:text-navy-800'}`} aria-hidden="true">
        {icon}
      </span>
      <span className="truncate">{label}</span>
      {!!badge && badge > 0 && (
        <span className={`ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs font-bold ${badgeTones[badgeTone]}`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} aria-current={active ? 'page' : undefined}>
        {content}
      </button>
    );
  }

  return (
    <Link href={href || '#'} className={className} aria-current={active ? 'page' : undefined}>
      {content}
    </Link>
  );
}
