import React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, Inbox } from 'lucide-react';

export type Tone = 'neutral' | 'brand' | 'navy' | 'success' | 'warning' | 'danger' | 'info';

const badgeTones: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  navy: 'bg-navy-50 text-navy-800 ring-navy-200',
  success: 'bg-green-50 text-green-800 ring-green-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-800 ring-red-200',
  info: 'bg-blue-50 text-blue-800 ring-blue-200',
};

interface BadgeProps {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}

export function Badge({ tone = 'neutral', children, className = '', icon }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${badgeTones[tone]} ${className}`}>
      {icon}
      {children}
    </span>
  );
}

/**
 * Couleur d'affichage d'un statut (devis, demande, demande express, litige).
 * Purement visuel : n'altère aucune valeur métier.
 */
export function statutTone(statut?: string): Tone {
  switch (statut) {
    case 'paye':
    case 'payee':
    case 'attribuee':
    case 'terminee':
    case 'termine_valide':
    case 'termine_auto_valide':
    case 'acceptee':
    case 'resolu':
    case 'libere':
    case 'completed':
      return 'success';
    case 'en_attente_paiement':
    case 'en_revision':
    case 'en_negociation':
    case 'proposition_recue':
    case 'travaux_termines':
    case 'quota_atteint':
    case 'en_mediation':
    case 'pending':
      return 'warning';
    case 'refuse':
    case 'refusee':
    case 'refusee_artisan':
    case 'annule':
    case 'annulee':
    case 'litige':
    case 'rejected':
    case 'failed':
      return 'danger';
    case 'expire':
    case 'expiree':
    case 'clos':
    case 'cancelled':
      return 'neutral';
    case 'en_cours':
    case 'matchee':
      return 'info';
    case 'envoye':
    case 'publiee':
    case 'en_attente_proposition':
      return 'navy';
    default:
      return 'neutral';
  }
}

const alertTones = {
  info: { box: 'bg-blue-50 border-blue-200 text-blue-900', icon: Info, iconColor: 'text-blue-700' },
  success: { box: 'bg-green-50 border-green-200 text-green-900', icon: CheckCircle2, iconColor: 'text-green-700' },
  warning: { box: 'bg-amber-50 border-amber-200 text-amber-900', icon: AlertTriangle, iconColor: 'text-amber-700' },
  danger: { box: 'bg-red-50 border-red-200 text-red-900', icon: XCircle, iconColor: 'text-red-700' },
};

interface AlertProps {
  tone?: keyof typeof alertTones;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export function Alert({ tone = 'info', title, children, className = '', action }: AlertProps) {
  const { box, icon: Icon, iconColor } = alertTones[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex gap-3 rounded-xl border p-4 ${box} ${className}`}>
      <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${iconColor}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-1 opacity-90' : ''}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center ${className}`}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        {icon ?? <Inbox className="h-6 w-6" aria-hidden="true" />}
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
