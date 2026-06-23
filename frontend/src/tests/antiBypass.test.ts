/**
 * Tests du système anti-bypass (Vitest)
 * Vérifie la détection de tous les patterns de contournement
 */

import { describe, it, expect } from 'vitest';
import { validateMessage, BLOCKED_EXAMPLES, VALID_EXAMPLES } from '../lib/antiBypassValidator';

// ============================================================
// 1. MESSAGES DE LA LISTE BLOCKED_EXAMPLES — tous doivent être bloqués
// ============================================================
describe('antiBypassValidator — messages bloqués (BLOCKED_EXAMPLES)', () => {
  BLOCKED_EXAMPLES.forEach((msg) => {
    it(`bloque : "${msg}"`, () => {
      const result = validateMessage(msg);
      expect(result.isValid).toBe(false);
      expect(result.blockedPatterns.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================
// 2. MESSAGES DE LA LISTE VALID_EXAMPLES — tous doivent passer
// ============================================================
describe('antiBypassValidator — messages valides (VALID_EXAMPLES)', () => {
  VALID_EXAMPLES.forEach((msg) => {
    it(`autorise : "${msg}"`, () => {
      const result = validateMessage(msg);
      expect(result.isValid).toBe(true);
    });
  });
});

// ============================================================
// 3. CAS LIMITES — contournements sophistiqués
// ============================================================
describe('antiBypassValidator — cas limites (contournements)', () => {
  // --- Doit être BLOQUÉ ---
  it('bloque un numéro avec lettre "o" à la place du 0', () => {
    expect(validateMessage('Appelle au o6 12 34 56 78').isValid).toBe(false);
  });

  it('bloque les chiffres séparés par des espaces (0 6 1 2 3 4 5 6 7 8)', () => {
    expect(validateMessage('Contact: 0 6 1 2 3 4 5 6 7 8').isValid).toBe(false);
  });

  it('bloque "zéro six" en toutes lettres', () => {
    expect(validateMessage("Mon numéro c'est zéro six douze").isValid).toBe(false);
  });

  it('bloque "arobase" à la place de @', () => {
    expect(validateMessage('Mon mail: test arobase gmail point com').isValid).toBe(false);
  });

  it('bloque un code postal 5 chiffres (75001)', () => {
    expect(validateMessage("J'habite 75001 Paris 1er").isValid).toBe(false);
  });

  it('bloque un code postal fragmenté (75 001)', () => {
    expect(validateMessage('Code postal: 75 001').isValid).toBe(false);
  });

  it('bloque un numéro collé aux lettres (NUMEROtelephoine066882710)', () => {
    expect(validateMessage('NUMEROtelephoine066882710').isValid).toBe(false);
  });

  it('bloque "Contacte-moi en dehors de la plateforme"', () => {
    expect(validateMessage('Contacte-moi en dehors de la plateforme').isValid).toBe(false);
  });

  it('bloque "contacte-moi directement" (contournement explicite)', () => {
    expect(validateMessage('Contacte-moi directement pour éviter les frais').isValid).toBe(false);
  });

  // --- Doit être AUTORISÉ ---
  it('autorise une date (Travaux urgents le 12/06)', () => {
    expect(validateMessage('Travaux urgents le 12/06').isValid).toBe(true);
  });

  it('autorise un prix (Devis de 1200 euros)', () => {
    expect(validateMessage('Devis de 1200 euros').isValid).toBe(true);
  });

  it('autorise une heure (Rendez-vous à 12h30)', () => {
    expect(validateMessage('Rendez-vous à 12h30').isValid).toBe(true);
  });
});

// ============================================================
// 4. OPTION isPaid — bypass complet quand devis payé
// ============================================================
describe('antiBypassValidator — option isPaid', () => {
  it('autorise tout message quand isPaid=true', () => {
    const result = validateMessage('Mon téléphone est le 06 12 34 56 78', true);
    expect(result.isValid).toBe(true);
    expect(result.blockedPatterns).toHaveLength(0);
  });

  it('bloque les messages par défaut (isPaid absent)', () => {
    const result = validateMessage('06 12 34 56 78');
    expect(result.isValid).toBe(false);
  });
});
