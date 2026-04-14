import ClientSidebar from '@/components/ClientSidebar';

/**
 * Layout commun à toutes les pages /client/*.
 * Intègre la barre latérale de navigation (ClientSidebar) à gauche
 * et affiche le contenu de la page à droite dans un conteneur flexible.
 */
export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F5F7FA] flex relative overflow-hidden">
      {/* Barre latérale gauche — partagée entre toutes les pages client */}
      <ClientSidebar />

      {/* Zone de contenu principal — occupe tout l'espace restant */}
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
