'use client';

import { LanguageProvider } from '@/contexts/LanguageContext';
import { Toaster } from '@/components/ui/Toaster';
import { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      {children}
      <Toaster />
    </LanguageProvider>
  );
}
