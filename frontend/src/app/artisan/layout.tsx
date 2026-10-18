import ArtisanSidebar from '@/components/ArtisanSidebar';

/**
 * Layout commun à toutes les pages /artisan/*.
 * Injecte automatiquement la barre latérale de navigation artisan
 * sans modifier chaque page individuellement.
 */
export default function ArtisanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] bg-slate-50">
      {/* Barre latérale artisan (s'affiche uniquement si connecté en tant qu'artisan) */}
      <ArtisanSidebar />

      {/* Contenu principal de la page */}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
