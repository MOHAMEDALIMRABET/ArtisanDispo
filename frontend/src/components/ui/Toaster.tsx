'use client';

import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react';

type ToastTone = 'info' | 'success' | 'warning' | 'danger';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const toneStyles: Record<ToastTone, { icon: typeof Info; color: string; bar: string }> = {
  info: { icon: Info, color: 'text-blue-700', bar: 'bg-blue-600' },
  success: { icon: CheckCircle2, color: 'text-green-700', bar: 'bg-green-600' },
  warning: { icon: AlertTriangle, color: 'text-amber-700', bar: 'bg-amber-500' },
  danger: { icon: XCircle, color: 'text-red-700', bar: 'bg-red-600' },
};

/** Devine le ton d'un message existant à partir de son contenu (emojis / mots-clés déjà présents). */
function guessTone(message: string): ToastTone {
  const m = message.toLowerCase();
  if (/❌|⛔|🚫|erreur|impossible|échec|echec|invalide|refus/.test(m)) return 'danger';
  if (/⚠️|⚠|attention|veuillez|requis|obligatoire|manquant/.test(m)) return 'warning';
  if (/✅|✓|succès|succes|enregistr|envoy|confirm|mis à jour|réussi/.test(m)) return 'success';
  return 'info';
}

/** Retire l'emoji de tête : l'icône du toast le remplace. */
function cleanMessage(message: string) {
  return message.replace(/^[\s\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}✓]+/u, '').trim() || message;
}

let nextId = 1;

/**
 * Affiche les messages de `window.alert()` sous forme de notifications
 * non bloquantes, cohérentes avec le design system.
 * Les appels `alert(...)` existants ne sont pas modifiés.
 */
export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const originalAlert = window.alert;
    const STORAGE_KEY = 'ad_pending_toasts';

    const show = (text: string) => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-3), { id, message: cleanMessage(text), tone: guessTone(text) }]);
      // Durée proportionnelle à la longueur du message
      const duration = Math.min(12000, 4000 + text.length * 40);
      window.setTimeout(() => dismiss(id), duration);
    };

    // Messages émis juste avant un rechargement de page : on les réaffiche
    try {
      const pending: { text: string; at: number }[] = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
      sessionStorage.removeItem(STORAGE_KEY);
      pending.filter((p) => Date.now() - p.at < 5000).forEach((p) => show(p.text));
    } catch {}

    window.alert = (message?: unknown) => {
      const text = String(message ?? '');
      show(text);
      try {
        const pending = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
        pending.push({ text, at: Date.now() });
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending.slice(-4)));
        // Nettoyage si aucun rechargement ne suit
        window.setTimeout(() => {
          try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
        }, 5000);
      } catch {}
    };

    return () => {
      window.alert = originalAlert;
    };
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:bottom-4 sm:right-4 sm:left-auto sm:items-end"
    >
      {toasts.map((toast) => {
        const { icon: Icon, color, bar } = toneStyles[toast.tone];
        return (
          <div
            key={toast.id}
            role={toast.tone === 'danger' ? 'alert' : 'status'}
            className="animate-toast-in pointer-events-auto relative flex w-full max-w-sm gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 pl-5 shadow-lg"
          >
            <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} aria-hidden="true" />
            <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${color}`} aria-hidden="true" />
            <p className="flex-1 whitespace-pre-line text-sm text-slate-800">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="-m-1 h-7 w-7 flex-shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Fermer la notification"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
