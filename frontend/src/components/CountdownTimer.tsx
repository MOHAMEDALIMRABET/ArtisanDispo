'use client';

import { useState, useEffect } from 'react';
import type { Timestamp } from 'firebase/firestore';

interface CountdownTimerProps {
  expiresAt: Timestamp;
  onExpired?: () => void;
}

/**
 * Composant chrono compte à rebours
 * Affiche le temps restant avant expiration (format MM:SS)
 * Appelle onExpired() quand le délai est dépassé
 */
export function CountdownTimer({ expiresAt, onExpired }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false); // < 5 min = rouge clignotant

  useEffect(() => {
    const tick = () => {
      const diff = expiresAt.toDate().getTime() - Date.now();

      if (diff <= 0) {
        setTimeLeft('Expiré');
        setIsExpired(true);
        if (onExpired) onExpired();
        return;
      }

      const totalSeconds = Math.floor(diff / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      setTimeLeft(`${minutes}:${String(seconds).padStart(2, '0')}`);

      // Passe en rouge clignotant si moins de 5 min
      setIsUrgent(minutes < 5);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  return (
    <span
      className={`font-bold text-lg ${
        isExpired
          ? 'text-red-700'
          : isUrgent
          ? 'text-red-600 animate-pulse'
          : 'text-orange-700'
      }`}
    >
      {timeLeft}
    </span>
  );
}
