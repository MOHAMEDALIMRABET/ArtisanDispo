/**
 * Hook anti-bypass pour les champs texte libres pré-paiement — ArtisanSafe
 * --------------------------------------------------------------------------
 * Inspiré de BlaBlaCar / Fiverr / Airbnb :
 *   - Aucune intrusion pendant la saisie (pas de validation au keystroke)
 *   - Avertissement orange non-bloquant au blur (l'utilisateur peut continuer d'éditer)
 *   - Blocage dur au submit via validate()
 *   - reset() efface valeur + warning à la fermeture des modales
 *
 * Usage :
 *   const field = useAntiBypassField();
 *   <textarea value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
 *   {field.warning && <AntiBypassWarning message={field.warning} />}
 *   // Dans handleSubmit :
 *   if (!field.validate()) return;
 */

import { useState, useCallback } from 'react';
import { validateMessage } from '@/lib/antiBypassValidator';

export interface AntiBypassFieldState {
  /** Valeur courante du champ */
  value: string;
  /** Setter direct (pour pré-remplissage ou reset externe) */
  setValue: (v: string) => void;
  /** onChange → màj valeur + efface le warning */
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  /** onBlur → validation douce (orange, non-bloquante) */
  onBlur: () => void;
  /** Message d'avertissement (null si champ propre) */
  warning: string | null;
  /**
   * Validation dure (appelée au submit).
   * Affiche le warning SI bloqué et retourne false.
   * Retourne true si le champ est propre.
   */
  validate: () => boolean;
  /** Réinitialise valeur ET warning (fermeture modale / reset formulaire) */
  reset: (newValue?: string) => void;
}

export function useAntiBypassField(initial = ''): AntiBypassFieldState {
  const [value, setValue] = useState(initial);
  const [warning, setWarning] = useState<string | null>(null);

  /* Effacer le warning dès que l'utilisateur recommence à taper */
  const onChange = useCallback((
    e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>
  ) => {
    setValue(e.target.value);
    setWarning(null);
  }, []);

  /* Validation douce au blur : orange non-bloquant */
  const onBlur = useCallback(() => {
    if (!value.trim()) {
      setWarning(null);
      return;
    }
    const result = validateMessage(value);
    setWarning(result.isValid ? null : (result.message ?? 'Contenu non autorisé avant paiement'));
  }, [value]);

  /* Validation dure au submit : bloque la soumission si détecté */
  const validate = useCallback((): boolean => {
    if (!value.trim()) {
      setWarning(null);
      return true;
    }
    const result = validateMessage(value);
    if (!result.isValid) {
      setWarning(result.message ?? 'Coordonnées personnelles détectées. Supprimez-les pour continuer.');
      return false;
    }
    setWarning(null);
    return true;
  }, [value]);

  /* Reset complet (fermeture modale, nouveau formulaire) */
  const reset = useCallback((newValue = '') => {
    setValue(newValue);
    setWarning(null);
  }, []);

  return { value, setValue, onChange, onBlur, warning, validate, reset };
}
