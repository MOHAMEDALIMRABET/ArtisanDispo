/**
 * Composant Upload Pièces Jointes pour Litiges
 * Upload vers Firebase Storage avec validation
 */

'use client';

import { useState, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase/config';
import { LitigePieceJointe } from '@/types/litige';
import { Upload, X, FileText, Image as ImageIcon, File } from 'lucide-react';

interface UploadPiecesJointesProps {
  onFilesUploaded: (pieces: LitigePieceJointe[]) => void;
  maxFiles?: number;
  maxSizePerFile?: number; // En Mo
  acceptedTypes?: string[];
}

export default function UploadPiecesJointes({
  onFilesUploaded,
  maxFiles = 5,
  maxSizePerFile = 10,
  acceptedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'],
}: UploadPiecesJointesProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadedPieces, setUploadedPieces] = useState<LitigePieceJointe[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    
    if (files.length === 0) return;

    // Vérifier nombre de fichiers
    if (uploadedPieces.length + files.length > maxFiles) {
      setError(`Maximum ${maxFiles} fichiers autorisés`);
      return;
    }

    // Valider chaque fichier
    for (const file of files) {
      // Vérifier type
      if (!acceptedTypes.includes(file.type)) {
        setError(`Type de fichier non autorisé: ${file.type}`);
        return;
      }

      // Vérifier taille (convertir Mo en octets)
      const maxSizeBytes = maxSizePerFile * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        setError(`Fichier trop volumineux: ${file.name} (max ${maxSizePerFile}Mo)`);
        return;
      }
    }

    // Upload
    try {
      setUploading(true);
      setError(null);

      const uploadedFiles: LitigePieceJointe[] = [];

      for (const file of files) {
        const timestamp = Date.now();
        const fileName = `${timestamp}_${file.name}`;
        const storagePath = `litiges/${fileName}`;
        const storageRef = ref(storage, storagePath);

        // Upload vers Firebase Storage
        await uploadBytes(storageRef, file);
        
        // Récupérer URL de téléchargement
        const downloadURL = await getDownloadURL(storageRef);

        // Déterminer type
        let type: 'photo' | 'document' | 'facture' | 'autre' = 'autre';
        if (file.type.startsWith('image/')) {
          type = 'photo';
        } else if (file.type === 'application/pdf') {
          type = 'document';
          // Heuristique simple pour détecter les factures
          if (file.name.toLowerCase().includes('facture') || file.name.toLowerCase().includes('invoice')) {
            type = 'facture';
          }
        }

        const pieceJointe: LitigePieceJointe = {
          url: downloadURL,
          type,
          nom: file.name,
          taille: file.size,
          uploadedAt: new Date() as any, // Timestamp sera créé lors de l'ajout à Firestore
          uploadedBy: '', // Sera renseigné par le service
        };

        uploadedFiles.push(pieceJointe);
      }

      const newPieces = [...uploadedPieces, ...uploadedFiles];
      setUploadedPieces(newPieces);
      onFilesUploaded(newPieces);
    } catch (err: any) {
      console.error('Erreur upload:', err);
      setError(err.message || 'Erreur lors de l\'upload des fichiers');
    } finally {
      setUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleRemoveFile(index: number) {
    const newPieces = uploadedPieces.filter((_, i) => i !== index);
    setUploadedPieces(newPieces);
    onFilesUploaded(newPieces);
  }

  function getFileIcon(type: string) {
    switch (type) {
      case 'photo':
        return <ImageIcon className="w-5 h-5 text-blue-500" />;
      case 'document':
      case 'facture':
        return <FileText className="w-5 h-5 text-red-500" />;
      default:
        return <File className="w-5 h-5 text-slate-500" />;
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  return (
    <div className="space-y-4">
      {/* Zone d'upload */}
      <div>
        <label className="block text-sm font-semibold text-navy-800 mb-2">
          Pièces jointes (optionnel)
        </label>
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
            uploading ? 'border-slate-300 bg-slate-50 cursor-not-allowed' : 'border-slate-300 hover:border-brand-500 hover:bg-orange-50'
          }`}
        >
          <Upload className={`w-8 h-8 mx-auto mb-2 ${uploading ? 'text-slate-400' : 'text-slate-500'}`} />
          <p className="text-sm text-slate-600">
            {uploading ? 'Upload en cours...' : 'Cliquez pour ajouter des fichiers'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            JPG, PNG, PDF - Max {maxSizePerFile}Mo par fichier - {maxFiles} fichiers max
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedTypes.join(',')}
          onChange={handleFileSelect}
          disabled={uploading || uploadedPieces.length >= maxFiles}
          className="hidden"
        />
      </div>

      {/* Erreur */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Liste des fichiers uploadés */}
      {uploadedPieces.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-navy-800">
            Fichiers ajoutés ({uploadedPieces.length}/{maxFiles})
          </p>
          {uploadedPieces.map((piece, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {getFileIcon(piece.type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy-800 truncate">{piece.nom}</p>
                  <p className="text-xs text-slate-500">
                    {formatFileSize(piece.taille || 0)} • {piece.type}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleRemoveFile(index)}
                className="p-2 text-red-600 hover:bg-red-50 rounded transition"
                title="Supprimer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
