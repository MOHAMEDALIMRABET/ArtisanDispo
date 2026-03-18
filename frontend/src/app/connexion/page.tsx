'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { authService } from '@/lib/auth-service';
import { Button, Input, Card, Logo } from '@/components/ui';
import { getSearchContext } from '@/lib/utils/search-context';

export default function ConnexionPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');

  // Validation email côté client
  const handleEmailChange = (value: string) => {
    setEmail(value);
    setEmailError('');

    if (value && !value.includes('@')) {
      setEmailError(t('auth.invalidEmailFormat'));
    } else if (value && value.includes('@') && !value.split('@')[1]?.includes('.')) {
      setEmailError(t('auth.invalidEmailFormat'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setEmailError('');
    setIsLoading(true);

    try {
      const firebaseUser = await authService.signIn(email, password);
      
      // Récupérer les données utilisateur pour déterminer le rôle
      const { getUserById } = await import('@/lib/firebase/user-service');
      const userData = await getUserById(firebaseUser.uid);
      
      // 🔒 SÉCURITÉ : Bloquer les admins sur cette interface
      if (userData?.role === 'admin') {
        // Déconnecter immédiatement
        await authService.signOut();
        setError(t('auth.adminLoginError'));
        setIsLoading(false);
        
        // Rediriger vers la page de login admin sécurisée après 2 secondes
        setTimeout(() => {
          router.push('/access-x7k9m2p4w8n3');
        }, 2000);
        return;
      }
      
      // Rediriger vers l'URL d'origine ou vers le dashboard selon le rôle
      if (redirectUrl) {
        router.push(redirectUrl);
      } else if (userData?.role === 'artisan') {
        router.push('/artisan/dashboard');
      } else {
        // Client : vérifier si un contexte de recherche existe
        const searchContext = getSearchContext();
        if (searchContext) {
          router.push('/demande/publique/nouvelle');
        } else {
          router.push('/dashboard');
        }
      }
    } catch (err: any) {
      // Affiche toujours le message utilisateur (jamais le message technique Firebase)
      setError(err.message || t('auth.loginError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setIsGoogleLoading(true);

    try {
      const result = await authService.signInWithGoogle();

      if (result.isNewUser) {
        // Nouvel utilisateur → Page de sélection de rôle
        router.push('/choix-role');
      } else {
        // Utilisateur existant → Redirection selon le rôle
        const { getUserById } = await import('@/lib/firebase/user-service');
        const userData = await getUserById(result.user.uid);

        // Rediriger vers l'URL d'origine ou vers le dashboard selon le rôle
        if (redirectUrl) {
          router.push(redirectUrl);
        } else if (userData?.role === 'artisan') {
          router.push('/artisan/dashboard');
        } else {
          // Client : vérifier si un contexte de recherche existe
          const searchContext = getSearchContext();
          if (searchContext) {
            router.push('/demande/publique/nouvelle');
          } else {
            router.push('/dashboard');
          }
        }
      }
    } catch (err: any) {
      console.error('Erreur Google Sign-In:', err);
      setError(err.message || t('auth.googleSignInError'));
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#2C3E50] to-[#1A3A5C] flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size="md" href="/" />
          </div>
          <p className="text-gray-600">{t('auth.loginTitle')}</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(e.target.value)}
              required
              placeholder="votre@email.com"
              autoComplete="email"
            />
            {emailError && (
              <p className="mt-1 text-sm text-red-600">{emailError}</p>
            )}
          </div>

          <Input
            label={t('auth.password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder={t('auth.passwordPlaceholder')}
            autoComplete="current-password"
          />

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center text-gray-600">
              <input type="checkbox" className="mr-2" />
              {t('auth.rememberMe')}
            </label>
            <Link href="/mot-de-passe-oublie" className="text-[#FF6B00] hover:underline">
              {t('auth.forgotPassword')}
            </Link>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            isLoading={isLoading}
          >
            {t('auth.login')}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600">
            {t('auth.noAccount')}{' '}
            <Link href="/inscription" className="text-[#FF6B00] hover:underline font-medium">
              {t('auth.signUp')}
            </Link>
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-center text-sm text-gray-500 mb-4">{t('auth.orContinueWith')}</p>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || isLoading}
              className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGoogleLoading ? (
                <div className="w-5 h-5 mr-2 border-2 border-gray-300 border-t-[#FF6B00] rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              )}
              {isGoogleLoading ? t('auth.signingIn') : 'Google'}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
