import ClientSidebar from '@/components/ClientSidebar';

/**
 * Layout de la page "Choisir le type de travaux".
 * Intègre la barre latérale commune client à gauche.
 */
export default function ChoisirTypeTravauxLayout({
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
