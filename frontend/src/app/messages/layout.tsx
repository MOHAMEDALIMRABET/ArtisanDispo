import ClientSidebar from '@/components/ClientSidebar';
import ArtisanSidebar from '@/components/ArtisanSidebar';

/**
 * Layout de la page messagerie.
 * Intègre la barre latérale du rôle connecté (client ou artisan) à gauche.
 */
export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] bg-slate-50">
      <ClientSidebar />
      <ArtisanSidebar />
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
