'use client';

/**
 * Navigation entre les deux pages de gestion des litiges admin
 * 
 * /admin/litiges → Surveillance conversations (prévention)
 * /admin/gestion-litiges → Gestion litiges formels (médiation)
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function LitigesNavigation() {
  const pathname = usePathname();

  const isLitigesPage = pathname === '/admin/litiges' || pathname === '/admin/litiges-all';
  const isGestionPage = pathname?.startsWith('/admin/gestion-litiges');
  const isDetailPage = pathname?.includes('/admin/litiges/');

  return (
    <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Titre de la section */}
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-navy-800">⚖️ Gestion des Litiges</h1>
          </div>

          {/* Navigation tabs */}
          <div className="flex space-x-2">
            <Link
              href="/admin/litiges"
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isLitigesPage
                  ? 'bg-brand-700 text-white'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-navy-800'
              }`}
            >
              👁️ Surveillance Conversations
            </Link>
            <Link
              href="/admin/gestion-litiges"
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isGestionPage || isDetailPage
                  ? 'bg-brand-700 text-white'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-navy-800'
              }`}
            >
              🔴 Litiges Formels
            </Link>
          </div>
        </div>

        {/* Description de la page active */}
        <div className="mt-3 text-sm text-slate-500">
          {isLitigesPage && (
            <p>
              <strong>Surveillance :</strong> Consultez toutes les conversations client/artisan et marquez celles qui posent problème
            </p>
          )}
          {(isGestionPage || isDetailPage) && (
            <p>
              <strong>Gestion :</strong> Gérez les litiges formels déclarés, médiez et proposez des résolutions
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
