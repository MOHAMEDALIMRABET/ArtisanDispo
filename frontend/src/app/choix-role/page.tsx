'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Button, Logo } from '@/components/ui';
import { completeGoogleSignUp, signOut } from '@/lib/auth-service';
import { useAuth } from '@/hooks/useAuth';

export default function ChoixRolePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [selectedRole, setSelectedRole] = useState<'client' | 'artisan' | null>(null);
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Vérifier que l'utilisateur est connecté
  useEffect(() => {
    if (!user) {
      router.push('/connexion');
    }
  }, [user, router]);

  const handleRoleSelection = async () => {
    if (!selectedRole) {
      setError('Veuillez sélectionner un rôle');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await completeGoogleSignUp(selectedRole, phone);

      // Redirection selon le rôle
      if (selectedRole === 'artisan') {
        router.push('/artisan/dashboard');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      console.error('Erreur lors de la finalisation:', err);
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    await signOut();
    router.push('/connexion');
  };

  if (!user) {
    return null; // Évite le flash avant la redirection
  }

  return (
    <div className="min-h-screen bg-navy-800 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size="md" href="/" />
          </div>
          <h1 className="text-2xl font-bold text-navy-800 mb-2">
            Bienvenue sur ArtisanSafe !
          </h1>
          <p className="text-slate-600">
            Connecté en tant que <span className="font-medium">{user.email}</span>
          </p>
          <p className="text-slate-600 mt-2">
            Pour finaliser votre inscription, veuillez sélectionner votre profil
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Option Client */}
          <button
            onClick={() => setSelectedRole('client')}
            className={`p-6 border-2 rounded-lg transition-all ${
              selectedRole === 'client'
                ? 'border-brand-500 bg-orange-50'
                : 'border-slate-200 hover:border-brand-500 hover:bg-orange-50/50'
            }`}
          >
            <div className="text-center">
              <div className="text-4xl mb-3">👤</div>
              <h3 className="text-lg font-semibold text-navy-800 mb-2">
                Je suis un Client
              </h3>
              <p className="text-sm text-slate-600">
                Je recherche des artisans qualifiés pour mes projets
              </p>
              {selectedRole === 'client' && (
                <div className="mt-3 text-brand-700 font-medium text-sm">
                  ✓ Sélectionné
                </div>
              )}
            </div>
          </button>

          {/* Option Artisan */}
          <button
            onClick={() => setSelectedRole('artisan')}
            className={`p-6 border-2 rounded-lg transition-all ${
              selectedRole === 'artisan'
                ? 'border-brand-500 bg-orange-50'
                : 'border-slate-200 hover:border-brand-500 hover:bg-orange-50/50'
            }`}
          >
            <div className="text-center">
              <div className="text-4xl mb-3">🔧</div>
              <h3 className="text-lg font-semibold text-navy-800 mb-2">
                Je suis un Artisan
              </h3>
              <p className="text-sm text-slate-600">
                Je propose mes services et trouve de nouveaux clients
              </p>
              {selectedRole === 'artisan' && (
                <div className="mt-3 text-brand-700 font-medium text-sm">
                  ✓ Sélectionné
                </div>
              )}
            </div>
          </button>
        </div>

        {/* Champ téléphone (optionnel mais recommandé) */}
        {selectedRole && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Numéro de téléphone (optionnel)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+33 6 12 34 56 78"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-slate-500">
              Recommandé pour recevoir des notifications importantes
            </p>
          </div>
        )}

        {/* Informations selon le rôle */}
        {selectedRole === 'artisan' && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="text-sm font-semibold text-blue-900 mb-2">
              📋 Prochaines étapes pour les artisans :
            </h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>✓ Compléter votre profil professionnel</li>
              <li>✓ Ajouter vos métiers et zones d'intervention</li>
              <li>✓ Uploader vos documents (KBIS, assurances)</li>
              <li>✓ Attendre la validation de votre compte</li>
            </ul>
          </div>
        )}

        {selectedRole === 'client' && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h4 className="text-sm font-semibold text-green-900 mb-2">
              🎉 Profil client activé !
            </h4>
            <p className="text-sm text-green-800">
              Vous pouvez immédiatement publier vos demandes et recevoir des devis d'artisans qualifiés.
            </p>
          </div>
        )}

        {/* Boutons d'action */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={handleCancel}
            disabled={isLoading}
            className="flex-1"
          >
            Annuler
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={handleRoleSelection}
            isLoading={isLoading}
            disabled={!selectedRole}
            className="flex-1"
          >
            Continuer
          </Button>
        </div>
      </Card>
    </div>
  );
}
