'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { getUserById, updateUser } from '@/lib/firebase/user-service';
import type { User } from '@/types/firestore';

/**
 * Page de profil /profil
 * - Artisans : redirection vers /artisan/profil
 * - Clients : formulaire d'édition directement sur cette page
 */
export default function ProfilPage() {
  const router = useRouter();
  const { user: authUser, loading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [userData, setUserData] = useState<User | null>(null);

  // Formulaire client
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');

  useEffect(() => {
    if (authLoading) return;

    if (!authUser) {
      router.push('/connexion');
      return;
    }

    // Charger le profil utilisateur
    loadUserProfile();
  }, [authUser, authLoading, router]);

  async function loadUserProfile() {
    if (!authUser) return;

    try {
      setIsLoading(true);
      setError('');

      const user = await getUserById(authUser.uid);
      if (!user) {
        setError('Profil introuvable');
        return;
      }

      setUserData(user);

      // Artisan : redirection vers leur page de profil
      if (user.role === 'artisan') {
        router.replace('/artisan/profil');
        return;
      }

      // Admin : redirection vers admin
      if (user.role === 'admin') {
        router.replace('/admin');
        return;
      }

      // Client : charger les données du formulaire
      setNom(user.nom || '');
      setPrenom(user.prenom || '');
      setEmail(user.email || '');
      setTelephone(user.telephone || '');
    } catch (err: any) {
      console.error('Erreur chargement profil:', err);
      setError(err.message || 'Erreur lors du chargement du profil');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!authUser || !userData) return;

    // Validation
    if (!nom.trim() || !prenom.trim()) {
      setError('Le nom et le prénom sont obligatoires');
      return;
    }

    if (!telephone.trim()) {
      setError('Le téléphone est obligatoire');
      return;
    }

    // Validation téléphone (format français)
    const phoneRegex = /^(?:(?:\+|00)33|0)[1-9](?:[0-9]{8})$/;
    if (!phoneRegex.test(telephone.replace(/[\s.-]/g, ''))) {
      setError('Format de téléphone invalide (ex: 06 12 34 56 78)');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      setSuccess('');

      await updateUser(authUser.uid, {
        id: authUser.uid,
        nom: nom.trim(),
        prenom: prenom.trim(),
        telephone: telephone.trim(),
      });

      setSuccess('✅ Profil mis à jour avec succès !');
      
      // Recharger le profil
      await loadUserProfile();

      // Auto-masquer le message de succès après 3 secondes
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Erreur mise à jour profil:', err);
      setError(err.message || 'Erreur lors de la mise à jour du profil');
    } finally {
      setIsSaving(false);
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-500 mx-auto mb-4"></div>
          <p className="text-slate-500">Chargement de votre profil...</p>
        </div>
      </div>
    );
  }

  // Si c'est un artisan, le useEffect redirige automatiquement
  // Cette partie ne s'affiche que pour les clients
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Contenu principal */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Titre */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-navy-800 mb-2">Mon profil</h1>
          <p className="text-slate-500">Gérez vos informations personnelles</p>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border-l-4 border-green-500 p-4 rounded">
            <p className="text-green-700">{success}</p>
          </div>
        )}

        {/* Formulaire */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Nom */}
            <div>
              <label htmlFor="nom" className="block text-sm font-medium text-navy-800 mb-2">
                Nom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="nom"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                required
              />
            </div>

            {/* Prénom */}
            <div>
              <label htmlFor="prenom" className="block text-sm font-medium text-navy-800 mb-2">
                Prénom <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="prenom"
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                required
              />
            </div>

            {/* Email (non modifiable) */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-navy-800 mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                disabled
                className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-600 cursor-not-allowed"
              />
              <p className="mt-1 text-xs text-slate-500">
                L'email ne peut pas être modifié
              </p>
            </div>

            {/* Téléphone */}
            <div>
              <label htmlFor="telephone" className="block text-sm font-medium text-navy-800 mb-2">
                Téléphone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                id="telephone"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="06 12 34 56 78"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                required
              />
            </div>

            {/* Informations compte */}
            <div className="pt-6 border-t border-slate-200">
              <h3 className="text-lg font-semibold text-navy-800 mb-4">Informations du compte</h3>
              <div className="space-y-2 text-sm">
                <p className="text-slate-500">
                  <span className="font-medium">Type de compte :</span> Client
                </p>
                <p className="text-slate-500">
                  <span className="font-medium">Statut :</span>{' '}
                  {userData?.statut === 'verifie' ? (
                    <span className="text-green-600">✓ Vérifié</span>
                  ) : (
                    <span className="text-orange-600">En attente de vérification</span>
                  )}
                </p>
                <p className="text-slate-500">
                  <span className="font-medium">Membre depuis :</span>{' '}
                  {userData?.dateCreation?.toDate?.().toLocaleDateString('fr-FR') || 'N/A'}
                </p>
              </div>
            </div>

            {/* Boutons */}
            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 bg-brand-700 text-white px-6 py-3 rounded-lg font-semibold hover:bg-brand-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Enregistrement...' : 'Enregistrer les modifications'}
              </button>
              <Link
                href="/client/demandes"
                className="flex-1 bg-slate-200 text-navy-800 px-6 py-3 rounded-lg font-semibold hover:bg-slate-300 transition text-center"
              >
                Annuler
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
