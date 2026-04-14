import ClientSidebar from '@/components/ClientSidebar';

/**
 * Layout du flux "Petits travaux express" (toutes les sous-pages).
 * Intègre la barre latérale commune client à gauche.
 */
export default function PetitsTravauxExpressLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F5F7FA] flex relative overflow-hidden">
      <ClientSidebar />
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
