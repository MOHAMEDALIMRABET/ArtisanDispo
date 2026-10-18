'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BadgeCheck, Lock, Scale } from 'lucide-react';

// Pages sans footer (back-office, connexion, documents imprimables)
const HIDDEN_ROUTES = ['/admin', '/access-', '/connexion', '/devis-express-print'];

// Espaces connectés : footer réduit (une ligne)
const COMPACT_ROUTES = ['/artisan/', '/client/', '/dashboard', '/messages'];

const columns = [
  {
    title: 'Plateforme',
    links: [
      { href: '/comment-ca-marche', label: 'Comment ça marche' },
      { href: '/choisir-type-travaux', label: 'Trouver un artisan' },
      { href: '/petits-travaux-express', label: 'Petits travaux en urgence' },
      { href: '/guides-prix', label: 'Guides des prix' },
    ],
  },
  {
    title: 'Confiance',
    links: [
      { href: '/confiance/paiement-securise', label: 'Paiement sécurisé' },
      { href: '/confiance/verification-artisans', label: 'Artisans vérifiés' },
      { href: '/confiance/avis-certifies', label: 'Avis certifiés' },
      { href: '/confiance/protection-mediation', label: 'Protection & médiation' },
    ],
  },
  {
    title: 'Artisans',
    links: [
      { href: '/inscription?role=artisan', label: 'Devenir artisan partenaire' },
      { href: '/confiance/devis-gratuits', label: 'Devis gratuits' },
      { href: '/confiance/planning-flexibilite', label: 'Planning flexible' },
    ],
  },
  {
    title: 'Aide',
    links: [
      { href: '/etre-rappele', label: 'Être rappelé' },
      { href: '/conditions-generales', label: 'Conditions générales' },
    ],
  },
];

const guarantees = [
  { icon: Lock, label: 'Paiement sécurisé par séquestre' },
  { icon: BadgeCheck, label: 'Artisans vérifiés (SIRET, KBIS, assurances)' },
  { icon: Scale, label: 'Médiation en cas de litige' },
];

export default function Footer() {
  const pathname = usePathname() || '';

  if (HIDDEN_ROUTES.some((r) => pathname.startsWith(r))) return null;

  const year = new Date().getFullYear();

  if (COMPACT_ROUTES.some((r) => pathname.startsWith(r))) {
    return (
      <footer className="no-print border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 pb-20 text-xs text-slate-500 sm:flex-row sm:px-6 lg:px-8 lg:pb-4">
          <p>© {year} ArtisanDispo</p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link href="/conditions-generales" className="hover:text-navy-800">Conditions générales</Link>
            <Link href="/confiance/paiement-securise" className="hover:text-navy-800">Paiement sécurisé</Link>
            <Link href="/etre-rappele" className="hover:text-navy-800">Aide</Link>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="no-print bg-navy-900 text-navy-200">
      {/* Bande de réassurance */}
      <div className="border-b border-white/10">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 sm:grid-cols-3 sm:px-6 lg:px-8">
          {guarantees.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 text-sm text-white">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/10">
                <Icon className="h-[18px] w-[18px] text-brand-400" aria-hidden="true" />
              </span>
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_2fr] lg:px-8">
        <div>
          <p className="text-lg font-bold text-white">
            Artisan<span className="text-brand-400">Dispo</span>
          </p>
          <p className="mt-3 max-w-xs text-sm leading-6">
            La plateforme de mise en relation entre particuliers et artisans vérifiés, avec un paiement protégé
            jusqu&apos;à la fin des travaux.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-semibold text-white">{col.title}</p>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm transition-colors hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {year} ArtisanDispo. Tous droits réservés.</p>
          <p>Paiements traités par Stripe</p>
        </div>
      </div>
    </footer>
  );
}
