import ClientSidebar from '@/components/ClientSidebar';

/**
 * Layout de la page de recherche d'artisans.
 * Intègre la barre latérale commune client à gauche.
 */
export default function RechercheLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] bg-slate-50">
      <ClientSidebar />
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
