'use client';

/**
 * Composant : DevisExpressForm
 * 
 * S'affiche automatiquement dans le formulaire de proposition express
 * quand le montantPropose saisi par l'artisan dépasse 150€.
 * 
 * L'artisan doit :
 *  1. Remplir les lignes de prestation (même modèle que le devis classique)
 *  2. Renseigner la main d'œuvre
 *  3. Ajouter éventuellement des matières premières
 *  4. Signer via le canvas de signature
 * 
 * Le bouton "Envoyer la proposition" reste désactivé tant que tous
 * les champs obligatoires ne sont pas remplis ET signés.
 */

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Timestamp } from 'firebase/firestore';
import type { DevisExpressJoint, LigneDevisExpress } from '@/types/firestore';

type TVARate = 0 | 5.5 | 10 | 20;

interface DevisExpressFormProps {
  /** Montant initialement saisi par l'artisan — pré-remplit la première ligne */
  montantInitial?: number;
  /** Callback appelé à chaque changement valide du devis (undefined = devis incomplet) */
  onChange: (devis: DevisExpressJoint | undefined) => void;
}

// ── Constantes ──────────────────────────────────────────────────────────────

const TVA_OPTIONS: TVARate[] = [0, 5.5, 10, 20];
const UNITE_OPTIONS = ['h', 'j', 'm²', 'm', 'unité', 'forfait'];

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Génère un identifiant de ligne unique */
function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

/** Calcule les totaux d'une ligne */
function calculerLigne(ligne: LigneDevisExpress): LigneDevisExpress {
  const totalHT = ligne.quantite * ligne.prixUnitaireHT;
  const totalTVA = totalHT * ligne.tauxTVA / 100;
  return { ...ligne, totalHT, totalTVA, totalTTC: totalHT + totalTVA };
}

/** Calcule les totaux globaux du devis */
function calculerTotaux(
  lignes: LigneDevisExpress[],
  mainOeuvre: { quantite: number; prixHT: number; tauxTVA: TVARate } | undefined,
  matierePremiere?: { quantite: number; prixHT: number; tauxTVA: TVARate }
) {
  const htLignes = lignes.reduce((s, l) => s + l.totalHT, 0);
  const tvaLignes = lignes.reduce((s, l) => s + l.totalTVA, 0);

  let htMO = 0;
  let tvaMO = 0;
  if (mainOeuvre) {
    htMO = mainOeuvre.quantite * mainOeuvre.prixHT;
    tvaMO = htMO * mainOeuvre.tauxTVA / 100;
  }

  let htMP = 0;
  let tvaMP = 0;
  if (matierePremiere) {
    htMP = matierePremiere.quantite * matierePremiere.prixHT;
    tvaMP = htMP * matierePremiere.tauxTVA / 100;
  }

  const totalHT = htLignes + htMO + htMP;
  const totalTVAGlobal = tvaLignes + tvaMO + tvaMP;
  return { totalHT, totalTVAGlobal, totalTTC: totalHT + totalTVAGlobal };
}

// ── Composant principal ──────────────────────────────────────────────────────

export default function DevisExpressForm({ onChange, montantInitial }: DevisExpressFormProps) {
  // ── État des lignes de prestation ──
  const [lignes, setLignes] = useState<LigneDevisExpress[]>(() => {
    // Pré-remplir la première ligne avec le montant proposé (TVA 20% par défaut)
    const prixHT = montantInitial && montantInitial > 0 ? montantInitial : 0;
    const totalHT = prixHT;
    const totalTVA = totalHT * 20 / 100;
    return [{
      id: uid(),
      description: '',
      quantite: 1,
      unite: 'forfait',
      prixUnitaireHT: prixHT,
      tauxTVA: 20,
      totalHT,
      totalTVA,
      totalTTC: totalHT + totalTVA,
    }];
  });

  // ── Main d'œuvre (optionnelle — l'artisan peut l'avoir incluse dans les lignes) ──
  const [ajouterMO, setAjouterMO] = useState(false);
  const [mainOeuvre, setMainOeuvre] = useState({
    quantite: 1,
    prixHT: 0,
    tauxTVA: 20 as TVARate,
    unite: 'h',
  });

  // ── Matières premières (optionnel) ──
  const [ajouterMP, setAjouterMP] = useState(false);
  const [matierePremiere, setMatierePremiere] = useState({
    quantite: 1,
    prixHT: 0,
    tauxTVA: 20 as TVARate,
    unite: 'unité',
  });

  // ── Conditions d'exécution ──
  const [delaiRealisation, setDelaiRealisation] = useState('');
  const [dateDebutPrevue, setDateDebutPrevue] = useState('');
  const [conditions, setConditions] = useState('');

  // ── Signature artisan ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureDataURL, setSignatureDataURL] = useState<string | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  // ── Totaux calculés (mémoisé — recalculé uniquement quand les dépendances changent) ──
  const totaux = useMemo(
    () => calculerTotaux(
      lignes,
      ajouterMO ? mainOeuvre : undefined,
      ajouterMP ? matierePremiere : undefined,
    ),
    [lignes, ajouterMO, mainOeuvre, ajouterMP, matierePremiere],
  );

  // ── Validation et remontée du devis ──────────────────────────────────────
  useEffect(() => {
    // Chaque ligne doit avoir une description et un prix HT non nul
    const lignesValides = lignes.every(l => l.description.trim() && l.prixUnitaireHT > 0);
    // Si la MO est activée, son prix doit être > 0
    const moValide = !ajouterMO || mainOeuvre.prixHT > 0;
    const signatureValide = !!signatureDataURL;

    if (!lignesValides || !moValide || !signatureValide) {
      onChange(undefined);
      return;
    }

    // Recalcul local (ne pas référencer totaux mémoisé pour éviter une dépendance circulaire)
    const t = calculerTotaux(
      lignes,
      ajouterMO ? mainOeuvre : undefined,
      ajouterMP ? matierePremiere : undefined,
    );

    const devis: DevisExpressJoint = {
      lignes,
      mainOeuvre: ajouterMO ? { ...mainOeuvre } : { quantite: 0, prixHT: 0, tauxTVA: 0 as TVARate, unite: 'h' },
      matierePremiere: ajouterMP ? { ...matierePremiere } : undefined,
      totaux: t,
      delaiRealisation: delaiRealisation || undefined,
      dateDebutPrevue: dateDebutPrevue || undefined,
      conditions: conditions || undefined,
      signatureArtisan: {
        dataURL: signatureDataURL,
        date: Timestamp.now(),
      },
    };
    onChange(devis);
    // totaux exclu des dépendances : recalculé localement dans l'effet
  }, [lignes, mainOeuvre, ajouterMO, matierePremiere, ajouterMP, delaiRealisation, dateDebutPrevue, conditions, signatureDataURL]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Gestion des lignes ───────────────────────────────────────────────────

  const ajouterLigne = () => {
    setLignes(prev => [...prev, {
      id: uid(),
      description: '',
      quantite: 1,
      unite: 'h',
      prixUnitaireHT: 0,
      tauxTVA: 20,
      totalHT: 0,
      totalTVA: 0,
      totalTTC: 0,
    }]);
  };

  const supprimerLigne = (id: string) => {
    setLignes(prev => prev.filter(l => l.id !== id));
  };

  const modifierLigne = (id: string, champ: keyof LigneDevisExpress, valeur: string | number) => {
    setLignes(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [champ]: valeur };
      return calculerLigne(updated);
    }));
  };

  // ── Canvas de signature ──────────────────────────────────────────────────

  const getCanvasPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const pos = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
    setHasDrawn(true);
  }, [getCanvasPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const pos = getCanvasPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, [isDrawing, getCanvasPos]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current!;
    setSignatureDataURL(canvas.toDataURL('image/png'));
  }, [isDrawing]);

  const effacerSignature = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataURL(null);
    setHasDrawn(false);
  };

  // ── Rendu ────────────────────────────────────────────────────────────────

  return (
    <div className="mt-4 border-2 border-[#FF6B00] rounded-xl p-5 bg-orange-50 space-y-6">

      {/* En-tête */}
      <div className="flex items-center gap-2">
        <span className="text-lg">📋</span>
        <div>
          <h3 className="font-bold text-[#2C3E50] text-base">
            Devis obligatoire — Montant supérieur à 150€
          </h3>
          <p className="text-xs text-gray-500">
            Remplissez et signez ce devis. Le client devra le contre-signer pour accepter votre proposition.
          </p>
        </div>
      </div>

      {/* ── Section 1 : Lignes de prestation ── */}
      <div>
        <h4 className="text-sm font-semibold text-[#2C3E50] mb-2">
          Prestations <span className="text-red-500">*</span>
        </h4>
        <div className="space-y-3">
          {lignes.map((ligne, idx) => (
            <div key={ligne.id} className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-gray-400 w-5">{idx + 1}</span>
                <input
                  type="text"
                  placeholder="Description de la prestation"
                  value={ligne.description}
                  onChange={e => modifierLigne(ligne.id, 'description', e.target.value)}
                  className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#FF6B00]"
                />
                {lignes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => supprimerLigne(ligne.id)}
                    className="text-red-400 hover:text-red-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div>
                  <label className="text-gray-500 block mb-0.5">Qté</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={ligne.quantite}
                    onChange={e => modifierLigne(ligne.id, 'quantite', parseFloat(e.target.value) || 0)}
                    className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#FF6B00]"
                  />
                </div>
                <div>
                  <label className="text-gray-500 block mb-0.5">Unité</label>
                  <select
                    value={ligne.unite}
                    onChange={e => modifierLigne(ligne.id, 'unite', e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#FF6B00]"
                  >
                    {UNITE_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-gray-500 block mb-0.5">Prix HT (€)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={ligne.prixUnitaireHT}
                    onChange={e => modifierLigne(ligne.id, 'prixUnitaireHT', parseFloat(e.target.value) || 0)}
                    className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#FF6B00]"
                  />
                </div>
                <div>
                  <label className="text-gray-500 block mb-0.5">TVA (%)</label>
                  <select
                    value={ligne.tauxTVA}
                    onChange={e => modifierLigne(ligne.id, 'tauxTVA', parseFloat(e.target.value) as TVARate)}
                    className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#FF6B00]"
                  >
                    {TVA_OPTIONS.map(t => <option key={t} value={t}>{t}%</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-1 text-right text-xs text-gray-400">
                Total TTC : <span className="font-semibold text-[#2C3E50]">{ligne.totalTTC.toFixed(2)}€</span>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={ajouterLigne}
          className="mt-2 text-[#FF6B00] text-xs font-medium hover:underline"
        >
          + Ajouter une prestation
        </button>
      </div>

      {/* ── Section 2 : Main d'œuvre (optionnelle) ── */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#2C3E50] cursor-pointer">
          <input
            type="checkbox"
            checked={ajouterMO}
            onChange={e => setAjouterMO(e.target.checked)}
            className="accent-[#FF6B00]"
          />
          Ajouter la main d&apos;œuvre séparément (optionnel)
        </label>
        <p className="text-xs text-gray-400 mt-0.5 ml-5">
          Si elle est déjà incluse dans vos prestations, laissez décoché.
        </p>
        {ajouterMO && (
          <div className="mt-2 bg-white rounded-lg border border-gray-200 p-3 grid grid-cols-4 gap-2 text-xs">
            <div>
              <label className="text-gray-500 block mb-0.5">Qté</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={mainOeuvre.quantite}
                onChange={e => setMainOeuvre(prev => ({ ...prev, quantite: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#FF6B00]"
              />
            </div>
            <div>
              <label className="text-gray-500 block mb-0.5">Unité</label>
              <select
                value={mainOeuvre.unite}
                onChange={e => setMainOeuvre(prev => ({ ...prev, unite: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#FF6B00]"
              >
                {UNITE_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-gray-500 block mb-0.5">Prix HT (€)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={mainOeuvre.prixHT}
                onChange={e => setMainOeuvre(prev => ({ ...prev, prixHT: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#FF6B00]"
              />
            </div>
            <div>
              <label className="text-gray-500 block mb-0.5">TVA (%)</label>
              <select
                value={mainOeuvre.tauxTVA}
                onChange={e => setMainOeuvre(prev => ({ ...prev, tauxTVA: parseFloat(e.target.value) as TVARate }))}
                className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#FF6B00]"
              >
                {TVA_OPTIONS.map(t => <option key={t} value={t}>{t}%</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 3 : Matières premières ── */}
      <div>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#2C3E50] cursor-pointer">
          <input
            type="checkbox"
            checked={ajouterMP}
            onChange={e => setAjouterMP(e.target.checked)}
            className="accent-[#FF6B00]"
          />
          Ajouter des matières premières (optionnel)
        </label>
        {ajouterMP && (
          <div className="mt-2 bg-white rounded-lg border border-gray-200 p-3 grid grid-cols-4 gap-2 text-xs">
            <div>
              <label className="text-gray-500 block mb-0.5">Qté</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={matierePremiere.quantite}
                onChange={e => setMatierePremiere(prev => ({ ...prev, quantite: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#FF6B00]"
              />
            </div>
            <div>
              <label className="text-gray-500 block mb-0.5">Unité</label>
              <select
                value={matierePremiere.unite}
                onChange={e => setMatierePremiere(prev => ({ ...prev, unite: e.target.value }))}
                className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#FF6B00]"
              >
                {UNITE_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="text-gray-500 block mb-0.5">Prix HT (€)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={matierePremiere.prixHT}
                onChange={e => setMatierePremiere(prev => ({ ...prev, prixHT: parseFloat(e.target.value) || 0 }))}
                className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#FF6B00]"
              />
            </div>
            <div>
              <label className="text-gray-500 block mb-0.5">TVA (%)</label>
              <select
                value={matierePremiere.tauxTVA}
                onChange={e => setMatierePremiere(prev => ({ ...prev, tauxTVA: parseFloat(e.target.value) as TVARate }))}
                className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-[#FF6B00]"
              >
                {TVA_OPTIONS.map(t => <option key={t} value={t}>{t}%</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 4 : Conditions ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Délai de réalisation
          </label>
          <input
            type="text"
            placeholder="ex : 2 jours, 4h"
            value={delaiRealisation}
            onChange={e => setDelaiRealisation(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#FF6B00]"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Date de début prévue
          </label>
          <input
            type="date"
            value={dateDebutPrevue}
            onChange={e => setDateDebutPrevue(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#FF6B00]"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Conditions particulières
          </label>
          <textarea
            placeholder="Conditions de paiement, matériaux fournis par le client..."
            value={conditions}
            onChange={e => setConditions(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#FF6B00] resize-none"
          />
        </div>
      </div>

      {/* ── Section 5 : Récapitulatif TTC ── */}
      <div className="bg-white rounded-lg border border-[#FF6B00] p-3">
        <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
          Récapitulatif
        </h4>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Total HT</span>
            <span>{totaux.totalHT.toFixed(2)} €</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Total TVA</span>
            <span>{totaux.totalTVAGlobal.toFixed(2)} €</span>
          </div>
          <div className="flex justify-between font-bold text-[#2C3E50] text-base border-t pt-1">
            <span>Total TTC</span>
            <span>{totaux.totalTTC.toFixed(2)} €</span>
          </div>
        </div>
      </div>

      {/* ── Section 6 : Signature artisan ── */}
      <div>
        <h4 className="text-sm font-semibold text-[#2C3E50] mb-1">
          Signature artisan <span className="text-red-500">*</span>
        </h4>
        <p className="text-xs text-gray-500 mb-2">
          Signez dans le cadre ci-dessous pour valider ce devis.
        </p>
        <div className="relative bg-white border-2 border-dashed border-gray-300 rounded-lg overflow-hidden"
          style={{ height: 120 }}>
          <canvas
            ref={canvasRef}
            width={600}
            height={120}
            className="w-full h-full cursor-crosshair touch-none"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
          {!hasDrawn && (
            <span className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm pointer-events-none select-none">
              ✍️ Signez ici
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-1">
          <button
            type="button"
            onClick={effacerSignature}
            className="text-xs text-gray-400 hover:text-red-500 transition"
          >
            Effacer la signature
          </button>
          {signatureDataURL ? (
            <span className="text-xs text-green-600 font-medium">✓ Devis signé</span>
          ) : (
            <span className="text-xs text-orange-500">Signature requise</span>
          )}
        </div>
      </div>
    </div>
  );
}
