'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarDays, Clock, Zap } from 'lucide-react';
import { PageHeader, Container } from '@/components/ui';

// ─────────────────────────────────────────────────────────────────────────────
// Page intermédiaire : choix du type de recherche
//
// Accessible depuis le dashboard client via "Rechercher un artisan".
// Propose deux options :
//   - Travaux standard  → /recherche?from=dashboard
//   - Travaux en urgence → /petits-travaux-express
// ─────────────────────────────────────────────────────────────────────────────

const options = [
  {
    href: '/recherche?from=dashboard',
    icon: CalendarDays,
    title: 'Travaux standard',
    description:
      "Planifiez vos travaux à votre rythme. Comparez les devis d'artisans qualifiés et choisissez le meilleur professionnel pour votre projet.",
    badge: 'Sous quelques jours',
    cta: 'Rechercher un artisan',
    // Accent orange (marque)
    iconBox: 'bg-brand-50 text-brand-700 ring-brand-100 group-hover:bg-brand-700 group-hover:text-white',
    badgeClass: 'bg-brand-50 text-brand-800 ring-brand-200',
    ctaClass: 'text-brand-700',
    hoverBorder: 'hover:border-brand-300',
  },
  {
    href: '/petits-travaux-express',
    icon: Zap,
    title: 'Travaux en urgence',
    description:
      "Besoin d'une intervention rapide ? Trouvez un artisan disponible immédiatement pour vos urgences : fuite, panne électrique, serrurerie...",
    badge: 'Intervention rapide',
    cta: 'Trouver un artisan en urgence',
    // Accent rouge (urgence), cohérent avec la page Petits travaux express
    iconBox: 'bg-red-50 text-red-700 ring-red-100 group-hover:bg-red-700 group-hover:text-white',
    badgeClass: 'bg-red-50 text-red-800 ring-red-200',
    ctaClass: 'text-red-700',
    hoverBorder: 'hover:border-red-300',
  },
];

export default function ChoisirTypeTravauxPage() {
  const router = useRouter();

  return (
    <div className="min-h-full">
      <PageHeader
        title="Trouver un artisan"
        subtitle="Quel type de travaux souhaitez-vous réaliser ?"
        backLabel="Retour au tableau de bord"
        onBack={() => router.push('/dashboard')}
      />

      <Container className="py-8 sm:py-12">
        {/* ── Cartes de choix (même hauteur, actions alignées en bas) ── */}
        <div className="grid gap-6 md:grid-cols-2">
          {options.map(({ href, icon: Icon, title, description, badge, cta, iconBox, badgeClass, ctaClass, hoverBorder }) => (
            <Link
              key={href}
              href={href}
              className={`group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-8 ${hoverBorder}`}
            >
              <span className={`flex h-14 w-14 items-center justify-center rounded-xl ring-1 transition-colors ${iconBox}`}>
                <Icon className="h-7 w-7" aria-hidden="true" />
              </span>

              <h2 className="mt-5 text-xl font-semibold text-navy-900">{title}</h2>
              <p className="mt-2 flex-1 text-[15px] leading-relaxed text-slate-600">{description}</p>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${badgeClass}`}>
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {badge}
                </span>
                <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${ctaClass}`}>
                  {cta}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Container>
    </div>
  );
}
