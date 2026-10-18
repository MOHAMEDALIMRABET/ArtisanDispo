'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { auth, db } from '@/lib/firebase/config';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { Logo } from '@/components/ui';
import Link from 'next/link';

export default function EmailVerifiedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'expired'>('loading');
  const [message, setMessage] = useState('Vérification de votre email en cours...');

  useEffect(() => {
    const checkEmailVerification = async () => {
      try {
        const token = searchParams.get('token');
        const uid = searchParams.get('uid');

        // Validation du token personnalisé (si présent)
        if (token && uid) {
          const userRef = doc(db, 'users', uid);
          const userDoc = await getDoc(userRef);

          if (!userDoc.exists()) {
            setStatus('error');
            setMessage('Utilisateur introuvable.');
            return;
          }

          const userData = userDoc.data();
          
          // Vérifier si le token correspond
          if (userData.verificationToken !== token) {
            setStatus('error');
            setMessage('Lien de vérification invalide.');
            return;
          }

          // Vérifier l'expiration (1 heure)
          const expiresAt = userData.verificationTokenExpires?.toDate();
          if (!expiresAt || expiresAt < new Date()) {
            setStatus('expired');
            setMessage('Ce lien de vérification a expiré (validité : 1 heure). Veuillez demander un nouveau lien.');
            return;
          }

          // Token valide → Supprimer le token et marquer comme vérifié
          await updateDoc(userRef, {
            verificationToken: null,
            verificationTokenExpires: null,
            emailVerified: true,
            emailVerifiedDate: Timestamp.now()
          });

          setStatus('success');
          setMessage('✅ Votre email a été vérifié avec succès ! Redirection dans 3 secondes...');
          
          setTimeout(() => {
            router.push('/connexion');
          }, 3000);
          return;
        }

        // Ancienne méthode (Firebase standard)
        const user = auth.currentUser;

        if (!user) {
          setStatus('success');
          setMessage('Votre email a été vérifié avec succès ! Veuillez vous reconnecter pour accéder à votre compte.');
          return;
        }

        await user.reload();

        if (user.emailVerified) {
          setStatus('success');
          setMessage('Votre email a été vérifié avec succès !');

          setTimeout(() => {
            router.push('/dashboard');
          }, 3000);
        } else {
          setStatus('error');
          setMessage('Email non encore vérifié. Veuillez cliquer sur le lien dans votre email.');
        }
      } catch (error) {
        console.error('Erreur vérification email:', error);
        setStatus('error');
        setMessage('Une erreur est survenue. Veuillez réessayer.');
      }
    };

    checkEmailVerification();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-navy-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>

        {/* Icône de statut */}
        <div className="mb-6">
          {status === 'loading' && (
            <div className="w-20 h-20 mx-auto border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
          )}
          {status === 'success' && (
            <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
          {(status === 'error' || status === 'expired') && (
            <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${
              status === 'expired' ? 'bg-yellow-100' : 'bg-red-100'
            }`}>
              <svg className={`w-12 h-12 ${status === 'expired' ? 'text-yellow-600' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {status === 'expired' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                )}
              </svg>
            </div>
          )}
        </div>

        {/* Message */}
        <h1 className={`text-2xl font-bold mb-3 ${
          status === 'success' ? 'text-green-600' : 
          status === 'expired' ? 'text-yellow-600' :
          status === 'error' ? 'text-red-600' : 
          'text-navy-800'
        }`}>
          {status === 'loading' && 'Vérification en cours'}
          {status === 'success' && '✅ Email vérifié !'}
          {status === 'expired' && '⏱️ Lien expiré'}
          {status === 'error' && '❌ Échec de vérification'}
        </h1>

        <p className="text-slate-600 mb-6">
          {message}
        </p>

        {/* Actions */}
        <div className="space-y-3">
          {status === 'success' && (
            <p className="text-sm text-slate-500">
              Redirection automatique vers votre dashboard dans 3 secondes...
            </p>
          )}

          {status === 'expired' && (
            <>
              <p className="text-sm text-yellow-700 bg-yellow-50 p-3 rounded-lg mb-4">
                ⏱️ Votre lien de vérification a expiré après 1 heure. Pour des raisons de sécurité, les liens d'activation ont une durée de validité limitée.
              </p>
              <Link href="/connexion">
                <button className="w-full bg-brand-700 text-white px-6 py-3 rounded-lg font-medium hover:bg-brand-800 transition">
                  Se connecter pour renvoyer un email
                </button>
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <Link href="/dashboard">
                <button className="w-full bg-brand-700 text-white px-6 py-3 rounded-lg font-medium hover:bg-brand-800 transition">
                  Retour au dashboard
                </button>
              </Link>
              <Link href="/connexion">
                <button className="w-full border-2 border-navy-800 text-navy-800 px-6 py-3 rounded-lg font-medium hover:bg-navy-800 hover:text-white transition">
                  Se reconnecter
                </button>
              </Link>
            </>
          )}

          {status === 'success' && !auth.currentUser && (
            <Link href="/connexion">
              <button className="w-full bg-brand-700 text-white px-6 py-3 rounded-lg font-medium hover:bg-brand-800 transition">
                Se connecter
              </button>
            </Link>
          )}

          {status === 'loading' && (
            <Link href="/dashboard">
              <button className="w-full border-2 border-slate-300 text-slate-700 px-6 py-3 rounded-lg font-medium hover:bg-slate-100 transition">
                Retour au dashboard
              </button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
