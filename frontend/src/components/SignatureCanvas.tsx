'use client';

/**
 * Composant de signature électronique réutilisable
 * Utilise HTML5 Canvas pour capturer la signature du client
 */

import { useRef, useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface SignatureCanvasProps {
  onSave: (signatureDataURL: string) => void;
  onCancel: () => void;
}

export function SignatureCanvas({ onSave, onCancel }: SignatureCanvasProps) {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Configuration du style de dessin
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Fond blanc
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    setHasSignature(true);

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Effacer et réinitialiser le fond blanc
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) {
      alert(t('alerts.signature.required'));
      return;
    }

    // Convertir le canvas en image base64
    const dataURL = canvas.toDataURL('image/png');
    onSave(dataURL);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-navy-800 text-white p-6 rounded-t-lg">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Signature électronique
          </h2>
          <p className="text-sm text-slate-300 mt-2">
            Signez ci-dessous pour accepter le devis
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Instructions */}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">Comment signer :</p>
                <ul className="list-disc list-inside space-y-1 text-blue-700">
                  <li>Utilisez votre souris ou votre doigt (tactile) pour dessiner votre signature</li>
                  <li>Cliquez sur "Effacer" si vous voulez recommencer</li>
                  <li>Cliquez sur "Valider la signature" quand vous êtes satisfait</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Canvas de signature */}
          <div className="border-2 border-dashed border-slate-300 rounded-lg bg-white overflow-hidden">
            <canvas
              ref={canvasRef}
              width={700}
              height={300}
              className="w-full cursor-crosshair touch-none"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>

          {/* Note légale */}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded text-xs text-slate-600">
            <p className="font-semibold text-slate-800 mb-1">📋 Valeur juridique de la signature électronique</p>
            <p>
              Conformément au règlement eIDAS (UE n°910/2014), votre signature électronique a la même valeur 
              juridique qu'une signature manuscrite. Elle engage votre responsabilité contractuelle.
            </p>
          </div>
        </div>

        {/* Footer - Boutons d'action */}
        <div className="bg-slate-50 p-6 rounded-b-lg flex flex-wrap gap-3 justify-end border-t">
          <button
            onClick={onCancel}
            className="px-6 py-3 bg-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-400 transition-colors"
          >
            ❌ Annuler
          </button>
          <button
            onClick={clearSignature}
            className="px-6 py-3 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 transition-colors"
          >
            🔄 Effacer
          </button>
          <button
            onClick={saveSignature}
            disabled={!hasSignature}
            className="px-6 py-3 bg-brand-700 text-white rounded-lg font-semibold hover:bg-brand-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            ✅ Valider la signature
          </button>
        </div>
      </div>
    </div>
  );
}
